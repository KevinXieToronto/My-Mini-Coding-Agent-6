import { type CreateModelsOptions, createModels, type MutableModels, type Provider } from "../models.ts";
import type { Api, Model } from "../types.ts";
import { ANTHROPIC_MODELS } from "./anthropic.models.ts";
import { anthropicProvider } from "./anthropic.ts";
import { GROQ_MODELS } from "./groq.models.ts";
import { groqProvider } from "./groq.ts";
import { OPENAI_MODELS } from "./openai.models.ts";
import { openaiProvider } from "./openai.ts";

/** The generated built-in catalog, keyed by provider then model id. */
export const MODELS = {
	anthropic: ANTHROPIC_MODELS,
	groq: GROQ_MODELS,
	openai: OPENAI_MODELS,
} as const;

export type BuiltinModelApi<
	TProvider extends keyof typeof MODELS,
	TModelId extends keyof (typeof MODELS)[TProvider],
> = (typeof MODELS)[TProvider][TModelId] extends { api: infer TApi extends Api } ? TApi : never;

/** All built-in providers, freshly constructed. */
export function builtinProviders(): Provider[] {
	return [
		anthropicProvider(),
		groqProvider(),
		openaiProvider(),
		// ...真实文件中有 35 个工厂调用
	];
}

/** A `Models` collection with every built-in provider registered. */
export function builtinModels(options?: CreateModelsOptions): MutableModels {
	const models = createModels(options);
	for (const provider of builtinProviders()) {
		models.setProvider(provider);
	}
	return models;
}

/** Typed read of the generated built-in catalog. */
export function getBuiltinModel<
	TProvider extends keyof typeof MODELS,
	TModelId extends keyof (typeof MODELS)[TProvider],
>(provider: TProvider, modelId: TModelId): Model<BuiltinModelApi<TProvider, TModelId>> {
	const models = MODELS[provider] as unknown as Record<string, Model<Api>> | undefined;
	return models?.[modelId as string] as Model<BuiltinModelApi<TProvider, TModelId>>;
}
