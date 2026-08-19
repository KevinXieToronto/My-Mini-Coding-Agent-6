import { lazyStream } from "./api/lazy.ts";
import type { AuthContext, AuthResult, ProviderAuth } from "./auth/types.ts";
import type {
	Api,
	ApiStreamOptions,
	AssistantMessage,
	Context,
	Model,
	ProviderStreams,
	SimpleStreamOptions,
	StreamOptions,
} from "./types.ts";
import type { AssistantMessageEventStream } from "./utils/event-stream.ts";

export type ProviderHeaders = Record<string, string>;

export class ModelsError extends Error {
	readonly kind: string;

	constructor(kind: string, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ModelsError";
		this.kind = kind;
	}
}

export interface Provider<TApi extends Api = Api> {
	readonly id: string;
	readonly name: string;
	readonly baseUrl?: string;
	readonly headers?: ProviderHeaders;
	readonly auth: ProviderAuth;

	getModels(): readonly Model<TApi>[];
	refreshModels?(): Promise<void>; // dynamic providers only

	stream<T extends TApi>(
		model: Model<T>,
		context: Context,
		options?: ApiStreamOptions<T>,
	): AssistantMessageEventStream;
	streamSimple(model: Model<TApi>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
}

export interface CreateProviderOptions<TApi extends Api = Api> {
	id: string;
	name?: string;
	baseUrl?: string;
	headers?: ProviderHeaders;
	auth: ProviderAuth;
	models: readonly Model<TApi>[];
	refreshModels?: () => Promise<readonly Model<TApi>[]>;
	/** Single implementation, or map keyed by `model.api` for mixed-API providers. */
	api: ProviderStreams | Partial<Record<TApi, ProviderStreams>>;
}

function isProviderStreams(api: ProviderStreams | Partial<Record<string, ProviderStreams>>): api is ProviderStreams {
	const candidate = api as ProviderStreams;
	return typeof candidate.stream === "function" && typeof candidate.streamSimple === "function";
}

export function createProvider<TApi extends Api = Api>(options: CreateProviderOptions<TApi>): Provider<TApi> {
	let models: readonly Model<TApi>[] = [...options.models];

	const resolveApi = (model: Model<Api>): ProviderStreams => {
		if (isProviderStreams(options.api)) return options.api;
		const impl = (options.api as Partial<Record<string, ProviderStreams>>)[model.api];
		if (!impl) throw new ModelsError("api", `Provider ${options.id} has no implementation for api ${model.api}`);
		return impl;
	};

	return {
		id: options.id,
		name: options.name ?? options.id,
		baseUrl: options.baseUrl,
		headers: options.headers,
		auth: options.auth,
		getModels: () => models,
		refreshModels: options.refreshModels
			? async () => {
					models = [...(await options.refreshModels!())];
				}
			: undefined,
		stream: (model, context, opts) => resolveApi(model).stream(model, context, opts),
		streamSimple: (model, context, opts) => resolveApi(model).streamSimple(model, context, opts),
	};
}

export interface Models {
	getProviders(): readonly Provider[];
	getProvider(id: string): Provider | undefined;
	getModels(provider?: string): readonly Model<Api>[];
	getModel(provider: string, id: string): Model<Api> | undefined;
	refresh(provider?: string): Promise<void>;
	getAuth(model: Model<Api>): Promise<AuthResult | undefined>;

	stream<TApi extends Api>(
		model: Model<TApi>,
		context: Context,
		options?: ApiStreamOptions<TApi>,
	): AssistantMessageEventStream;
	complete<TApi extends Api>(
		model: Model<TApi>,
		context: Context,
		options?: ApiStreamOptions<TApi>,
	): Promise<AssistantMessage>;
	streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
	completeSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
}

export interface MutableModels extends Models {
	setProvider(provider: Provider): void;
}

export interface CreateModelsOptions {
	/** Env lookup override; defaults to process.env. */
	getEnv?: (name: string) => string | undefined;
}

class ModelsImpl implements MutableModels {
	private providers = new Map<string, Provider>();
	private options: CreateModelsOptions;

	constructor(options?: CreateModelsOptions) {
		this.options = options ?? {};
	}

	setProvider(provider: Provider): void {
		this.providers.set(provider.id, provider);
	}

	getProviders(): readonly Provider[] {
		return [...this.providers.values()];
	}

	getProvider(id: string): Provider | undefined {
		return this.providers.get(id);
	}

	getModels(provider?: string): readonly Model<Api>[] {
		if (provider) return this.providers.get(provider)?.getModels() ?? [];
		return [...this.providers.values()].flatMap((p) => [...p.getModels()]);
	}

	getModel(provider: string, id: string): Model<Api> | undefined {
		return this.providers
			.get(provider)
			?.getModels()
			.find((m) => m.id === id);
	}

	async refresh(provider?: string): Promise<void> {
		const targets = provider
			? [this.providers.get(provider)].filter((p): p is Provider => p !== undefined)
			: [...this.providers.values()];
		for (const target of targets) {
			await target.refreshModels?.();
		}
	}

	private authContext(): AuthContext {
		return {
			env: async (name) => (this.options.getEnv ? this.options.getEnv(name) : process.env[name]),
		};
	}

	async getAuth(model: Model<Api>): Promise<AuthResult | undefined> {
		const provider = this.providers.get(model.provider);
		if (!provider) return undefined;
		const ctx = this.authContext();
		if (provider.auth.oauth) {
			const result = await provider.auth.oauth.resolve({ ctx, credential: undefined });
			if (result) return result;
		}
		if (provider.auth.apiKey) {
			const result = await provider.auth.apiKey.resolve({ ctx, credential: undefined });
			if (result) return result;
		}
		return undefined;
	}

	private requireProvider(model: Model<Api>): Provider {
		const provider = this.providers.get(model.provider);
		if (!provider) throw new ModelsError("provider", `No provider registered for ${model.provider}`);
		return provider;
	}

	private async applyAuth(
		model: Model<Api>,
		options?: StreamOptions,
	): Promise<{ requestModel: Model<Api>; requestOptions: StreamOptions }> {
		const requestOptions: StreamOptions = { ...options };
		if (!requestOptions.apiKey) {
			const auth = await this.getAuth(model);
			if (auth?.auth.apiKey) requestOptions.apiKey = auth.auth.apiKey;
			else if (auth?.auth.oauthToken) requestOptions.apiKey = auth.auth.oauthToken;
		}
		return { requestModel: model, requestOptions };
	}

	stream<TApi extends Api>(
		model: Model<TApi>,
		context: Context,
		options?: ApiStreamOptions<TApi>,
	): AssistantMessageEventStream {
		return lazyStream(model, async () => {
			const provider = this.requireProvider(model);
			const { requestModel, requestOptions } = await this.applyAuth(model, options as StreamOptions | undefined);
			return provider.stream(requestModel as Model<TApi>, context, requestOptions as ApiStreamOptions<TApi>);
		});
	}

	async complete<TApi extends Api>(
		model: Model<TApi>,
		context: Context,
		options?: ApiStreamOptions<TApi>,
	): Promise<AssistantMessage> {
		return this.stream(model, context, options).result();
	}

	streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
		return lazyStream(model, async () => {
			const provider = this.requireProvider(model);
			const { requestModel, requestOptions } = await this.applyAuth(model, options);
			return provider.streamSimple(requestModel, context, requestOptions as SimpleStreamOptions);
		});
	}

	async completeSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
		return this.streamSimple(model, context, options).result();
	}
}

export function createModels(options?: CreateModelsOptions): MutableModels {
	return new ModelsImpl(options);
}
