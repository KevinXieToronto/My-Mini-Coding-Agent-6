import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-ai";

export interface Settings {
	defaultProvider?: string;
	defaultModel?: string;
	thinkingLevel?: ThinkingLevel;
}

export interface SettingsManagerOptions {
	/** Global settings file, e.g. `<agentDir>/settings.json`. Writes go here. */
	globalPath: string;
	/** Project settings file, e.g. `<cwd>/.pi/settings.json`. Read-only overlay. */
	projectPath?: string;
	/** Project settings are only applied when the project is trusted. */
	projectTrusted?: boolean;
}

/**
 * Layered settings: project (trusted only) over global over nothing.
 * Setters persist to the global file; project settings are never written.
 * Unreadable files degrade to empty settings and surface via `errors`.
 */
export class SettingsManager {
	readonly errors: string[] = [];
	private globalPath: string;
	private global: Settings;
	private project: Settings;

	constructor(options: SettingsManagerOptions) {
		this.globalPath = options.globalPath;
		this.global = this.loadFile(options.globalPath);
		this.project = options.projectPath && options.projectTrusted === true ? this.loadFile(options.projectPath) : {};
	}

	/** Merged view; project wins over global. */
	get(): Settings {
		return { ...this.global, ...this.project };
	}

	setDefaultModel(provider: string, modelId: string): void {
		this.global.defaultProvider = provider;
		this.global.defaultModel = modelId;
		this.save();
	}

	setThinkingLevel(thinkingLevel: ThinkingLevel): void {
		this.global.thinkingLevel = thinkingLevel;
		this.save();
	}

	private loadFile(path: string): Settings {
		if (!existsSync(path)) return {};
		try {
			return JSON.parse(readFileSync(path, "utf8")) as Settings;
		} catch (error) {
			this.errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
			return {};
		}
	}

	private save(): void {
		mkdirSync(dirname(this.globalPath), { recursive: true });
		writeFileSync(this.globalPath, `${JSON.stringify(this.global, null, "\t")}\n`, "utf8");
	}
}
