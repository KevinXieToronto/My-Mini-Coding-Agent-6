import { join } from "node:path";
import {
	type ExecutionEnv,
	loadPromptTemplates,
	loadSkills,
	type PromptTemplate,
	type Skill,
} from "@earendil-works/pi-agent-core";

export interface LoadedResources {
	skills: Skill[];
	promptTemplates: PromptTemplate[];
	/** Replaces the default system prompt when present. */
	systemMd?: string;
	/** Appended to whatever system prompt is in effect. */
	appendSystemMd?: string;
	errors: string[];
}

export interface ResourceLoaderOptions {
	env: ExecutionEnv;
	/** Global resources live here (skills/, prompts/, SYSTEM.md, APPEND_SYSTEM.md). */
	agentDir: string;
	/** Project resources live in `<cwd>/.pi`; only loaded when the project is trusted. */
	cwd: string;
	projectTrusted: boolean;
}

/**
 * Loads skills, prompt templates, and system-prompt overrides from the agent
 * directory and — for trusted projects only — from the project's `.pi` directory.
 * Project resources shadow global ones of the same name; broken files become
 * errors, never throws.
 */
export class ResourceLoader {
	private options: ResourceLoaderOptions;

	constructor(options: ResourceLoaderOptions) {
		this.options = options;
	}

	async load(): Promise<LoadedResources> {
		const { env, agentDir, cwd, projectTrusted } = this.options;
		const dirs = [agentDir, ...(projectTrusted ? [join(cwd, ".pi")] : [])];

		const skills = new Map<string, Skill>();
		const promptTemplates = new Map<string, PromptTemplate>();
		const errors: string[] = [];
		let systemMd: string | undefined;
		let appendSystemMd: string | undefined;

		for (const dir of dirs) {
			const skillResult = await loadSkills(env, join(dir, "skills"));
			for (const skill of skillResult.skills) skills.set(skill.name, skill);
			errors.push(...skillResult.errors);

			const templateResult = await loadPromptTemplates(env, join(dir, "prompts"));
			for (const template of templateResult.templates) promptTemplates.set(template.name, template);
			errors.push(...templateResult.errors);

			const system = await env.readFile(join(dir, "SYSTEM.md"));
			if (system.ok) systemMd = system.value.trim();
			const append = await env.readFile(join(dir, "APPEND_SYSTEM.md"));
			if (append.ok) {
				appendSystemMd = appendSystemMd ? `${appendSystemMd}\n\n${append.value.trim()}` : append.value.trim();
			}
		}

		return {
			skills: [...skills.values()],
			promptTemplates: [...promptTemplates.values()],
			...(systemMd !== undefined ? { systemMd } : {}),
			...(appendSystemMd !== undefined ? { appendSystemMd } : {}),
			errors,
		};
	}
}
