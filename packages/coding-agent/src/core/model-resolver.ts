import type { Api, MODELS, Model } from "@earendil-works/pi-ai";
import type { AgentSessionRuntimeDiagnostic, AgentSessionServices } from "./agent-session-services.ts";
import { parseModelSpec } from "./model-registry.ts";

export type KnownProvider = keyof typeof MODELS;

/**
 * Default model per provider — a table so that a user with only (say) an
 * Anthropic key gets the right model without configuring anything.
 */
export const defaultModelPerProvider: Record<KnownProvider, string> = {
	anthropic: "claude-fable-5",
	groq: "llama-3.3-70b-versatile",
	openai: "gpt-5.6",
	// ...one entry per known provider
};

export interface ModelResolution {
	/** Undefined when nothing usable was found; diagnostics explain why. */
	model?: Model<Api>;
	diagnostics: AgentSessionRuntimeDiagnostic[];
}

/**
 * Turn user intent into a concrete model, in priority order:
 *
 * 1. explicit override (`--model provider/id` or `provider/id` spec)
 * 2. the settings default (project over global)
 * 3. the first known provider with a usable credential, via its default model
 *
 * A bad override or setting degrades to the next rule with a diagnostic
 * rather than failing startup.
 */
export async function resolveModel(
	services: Pick<AgentSessionServices, "modelRegistry" | "settingsManager" | "authStorage">,
	override?: string,
): Promise<ModelResolution> {
	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	const { modelRegistry, settingsManager, authStorage } = services;

	const lookup = (spec: string, source: string): Model<Api> | undefined => {
		const parsed = parseModelSpec(spec);
		const model = parsed ? modelRegistry.getModel(parsed.provider, parsed.modelId) : undefined;
		if (!model) diagnostics.push({ severity: "warning", source, message: `Unknown model: ${spec}` });
		return model;
	};

	if (override) {
		const model = lookup(override, "model-override");
		if (model) return { model, diagnostics };
	}

	const settings = settingsManager.get();
	if (settings.defaultProvider && settings.defaultModel) {
		const model = lookup(`${settings.defaultProvider}/${settings.defaultModel}`, "settings");
		if (model) return { model, diagnostics };
	}

	for (const provider of Object.keys(defaultModelPerProvider) as KnownProvider[]) {
		const modelId = defaultModelPerProvider[provider];
		const model = modelRegistry.getModel(provider, modelId);
		if (!model) continue;
		const hasCredential =
			(await authStorage.get(provider)) !== undefined || (await modelRegistry.getAuth(model)) !== undefined;
		if (hasCredential) return { model, diagnostics };
	}

	diagnostics.push({
		severity: "error",
		source: "model-resolver",
		message: "No model available: no credentials found for any known provider. Log in or set an API key.",
	});
	return { diagnostics };
}
