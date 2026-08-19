import { parseFrontmatter } from "./frontmatter.ts";
import { err, type FileSystem, ok, type Result } from "./types.ts";

/**
 * A skill is a Markdown file with YAML frontmatter:
 *
 * ---
 * name: release
 * description: Cut a release of this project
 * ---
 *
 * To cut a release, first run ./test.sh, then ...
 */
export interface Skill {
	name: string;
	description: string;
	content: string;
	filePath: string;
	/** Exclude from model-visible skill lists while still allowing explicit application invocation. */
	disableModelInvocation?: boolean;
}

export function parseSkill(markdown: string, filePath: string): Result<Skill, string> {
	const parsed = parseFrontmatter(markdown);
	if (!parsed.ok) return parsed;
	const { attributes, body } = parsed.value;
	const name = typeof attributes.name === "string" ? attributes.name : "";
	const description = typeof attributes.description === "string" ? attributes.description : "";
	if (!name) return err(`${filePath}: skill frontmatter requires a \`name\``);
	if (!description) return err(`${filePath}: skill frontmatter requires a \`description\``);
	return ok({
		name,
		description,
		content: body.trim(),
		filePath,
		...(attributes.disableModelInvocation === true ? { disableModelInvocation: true } : {}),
	});
}

/**
 * Load skills from a directory. Both layouts are supported:
 * `<dir>/<name>.md` and `<dir>/<name>/SKILL.md`. Unparseable files are
 * returned as errors, not thrown — a broken skill must not break startup.
 */
export async function loadSkills(env: FileSystem, dir: string): Promise<{ skills: Skill[]; errors: string[] }> {
	const skills: Skill[] = [];
	const errors: string[] = [];
	const listing = await env.listDir(dir);
	if (!listing.ok) return { skills, errors };

	const sep = dir.includes("\\") ? "\\" : "/";
	for (const entry of listing.value) {
		const filePath = entry.isDirectory
			? `${dir}${sep}${entry.name}${sep}SKILL.md`
			: entry.name.endsWith(".md")
				? `${dir}${sep}${entry.name}`
				: null;
		if (!filePath || (entry.isDirectory && !(await env.exists(filePath)))) continue;
		const content = await env.readFile(filePath);
		if (!content.ok) {
			errors.push(`${filePath}: ${content.error}`);
			continue;
		}
		const skill = parseSkill(content.value, filePath);
		if (skill.ok) skills.push(skill.value);
		else errors.push(skill.error);
	}
	return { skills, errors };
}

/** System-prompt section listing model-invocable skills; empty string when there are none. */
export function formatSkillsForPrompt(skills: readonly Skill[]): string {
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	if (visible.length === 0) return "";
	const lines = visible.map((skill) => `- ${skill.name}: ${skill.description} (file: ${skill.filePath})`);
	return `The following skills are available. To use one, read its file for the full instructions:\n${lines.join("\n")}`;
}
