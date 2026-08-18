import type { Api, AssistantMessage, Context, Model, ProviderStreams } from "./types.ts";
import type { AssistantMessageEventStream } from "./utils/event-stream.ts";

export interface Provider<TApi extends Api = Api> {
    readonly id: string;
    readonly name: string;
    readonly baseUrl?: string;
    readonly headers?: ProviderHeaders;
    readonly auth: ProviderAuth;

    getModels(): readonly Model<TApi>[];
    refreshModels?(): Promise<void>; // dynamic providers only

    stream<T extends TApi>(model: Model<T>, context: Context, options?: ApiStreamOptions<T>): AssistantMessageEventStream;
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

export interface Models {
    getProviders(): readonly Provider[];
    getProvider(id: string): Provider | undefined;
    getModels(provider?: string): readonly Model<Api>[];
    getModel(provider: string, id: string): Model<Api> | undefined;
    refresh(provider?: string): Promise<void>;
    getAuth(model: Model<Api>): Promise<AuthResult | undefined>;

    stream<TApi extends Api>(model: Model<TApi>, context: Context, options?: ApiStreamOptions<TApi>): AssistantMessageEventStream;
    complete<TApi extends Api>(model: Model<TApi>, context: Context, options?: ApiStreamOptions<TApi>): Promise<AssistantMessage>;
    streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
    completeSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
}

// NOTE: enclosing class incomplete — awaiting the rest of the Models implementation
// (constructor, requireProvider, applyAuth, streamSimple, completeSimple, etc.)
class ModelsImpl implements Models {
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
}
