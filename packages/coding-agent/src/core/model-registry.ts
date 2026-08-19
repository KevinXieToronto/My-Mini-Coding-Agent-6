import {
	type Api,
	builtinModels,
	type CreateModelsOptions,
	type Model,
	type MutableModels,
} from "@earendil-works/pi-ai";

/**
 * The session's model catalog: every built-in provider registered, with room
 * for the application to add custom providers via `setProvider`.
 */
export type ModelRegistry = MutableModels;

export function createModelRegistry(options?: CreateModelsOptions): ModelRegistry {
	return builtinModels(options);
}

/** Parse a `provider/model-id` spec (model ids may themselves contain `/`). */
export function parseModelSpec(spec: string): { provider: string; modelId: string } | undefined {
	const slash = spec.indexOf("/");
	if (slash <= 0 || slash === spec.length - 1) return undefined;
	return { provider: spec.slice(0, slash), modelId: spec.slice(slash + 1) };
}

export function findModel(registry: ModelRegistry, provider: string, modelId: string): Model<Api> | undefined {
	return registry.getModel(provider, modelId);
}
