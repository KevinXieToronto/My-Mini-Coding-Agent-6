import { homedir } from "node:os";
import { join } from "node:path";
import { createNodeJsExecutionEnv, type ExecutionEnv } from "@earendil-works/pi-agent-core";
import { AuthStorage } from "./auth-storage.ts";
import { createModelRegistry, type ModelRegistry } from "./model-registry.ts";
import { ResourceLoader } from "./resource-loader.ts";
import { SettingsManager } from "./settings-manager.ts";
import { TrustManager } from "./trust-manager.ts";

/** Non-fatal startup problem, surfaced to the user instead of thrown. */
export interface AgentSessionRuntimeDiagnostic {
	severity: "warning" | "error";
	source: string;
	message: string;
}

/**
 * Construction is deliberately two-phase:
 *
 * 1. `createAgentSessionServices` builds the environment-shaped pieces —
 *    directories, credentials, settings, model catalog, resource loading.
 *    It never throws; anything broken becomes a diagnostic.
 * 2. `createAgentSession` (agent-session.ts) takes these services and makes
 *    the session-shaped decisions: which model, which session file, which
 *    tools — the parts a caller (interactive, print, rpc) may want to override.
 */
export interface AgentSessionServices {
	cwd: string;
	agentDir: string;
	authStorage: AuthStorage;
	settingsManager: SettingsManager;
	modelRegistry: ModelRegistry;
	resourceLoader: ResourceLoader;
	diagnostics: AgentSessionRuntimeDiagnostic[];
}

export interface CreateAgentSessionServicesOptions {
	cwd?: string;
	/** Defaults to `~/.pi/agent`. */
	agentDir?: string;
	env?: ExecutionEnv;
}

export function createAgentSessionServices(options?: CreateAgentSessionServicesOptions): AgentSessionServices {
	const cwd = options?.cwd ?? process.cwd();
	const agentDir = options?.agentDir ?? join(homedir(), ".pi", "agent");
	const env = options?.env ?? createNodeJsExecutionEnv({ cwd });
	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];

	const trustManager = new TrustManager(join(agentDir, "trusted-projects.json"));
	const projectTrusted = trustManager.isTrusted(cwd);

	const settingsManager = new SettingsManager({
		globalPath: join(agentDir, "settings.json"),
		projectPath: join(cwd, ".pi", "settings.json"),
		projectTrusted,
	});
	for (const error of settingsManager.errors) {
		diagnostics.push({ severity: "warning", source: "settings", message: error });
	}

	return {
		cwd,
		agentDir,
		authStorage: new AuthStorage(join(agentDir, "auth.json")),
		settingsManager,
		modelRegistry: createModelRegistry(),
		resourceLoader: new ResourceLoader({ env, agentDir, cwd, projectTrusted }),
		diagnostics,
	};
}
