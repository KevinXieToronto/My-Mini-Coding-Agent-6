import { createModels, type CreateModelsOptions, type MutableModels, type Provider } from "../models.ts";
import type { Api, KnownProvider, Model } from "../types.ts";
import { anthropicProvider } from "./anthropic.ts";
import { groqProvider } from "./groq.ts";
import { openaiProvider } from "./openai.ts";

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
export function getBuiltinModel<TProvider extends KnownProvider, TModelId extends keyof (typeof MODELS)[TProvider]>(
    provider: TProvider,
    modelId: TModelId,
): Model<BuiltinModelApi<TProvider, TModelId>> {
    const models = MODELS[provider] as Record<string, Model<Api>> | undefined;
    return models?.[modelId as string] as Model<BuiltinModelApi<TProvider, TModelId>>;
}
