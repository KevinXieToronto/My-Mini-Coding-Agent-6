import { parseFrontmatter } from "./frontmatter.ts";
import { err, type FileSystem, ok, type Result } from "./types.ts";

/**
 * A prompt template is a Markdown file with YAML frontmatter, invoked by the
 * user (e.g. `/release 1.2.0`), never by the model. `$ARGUMENTS` expands to the
 * raw argument string, `$1`..`$9` to whitespace-split positional arguments.
 */
export interface PromptTemplate {
	name: string;
	description?: string;
	content: string;
	filePath: string;
}

export function parsePromptTemplate(markdown: string, filePath: string): Result<PromptTemplate, string> {
	const parsed = parseFrontmatter(markdown);
	if (!parsed.ok) return parsed;
	const { attributes, body } = parsed.value;
	const name = typeof attributes.name === "string" ? attributes.name : "";
	if (!name) return err(`${filePath}: prompt template frontmatter requires a \`name\``);
	return ok({
		name,
		...(typeof attributes.description === "string" && attributes.description
			? { description: attributes.description }
			: {}),
		content: body.trim(),
		filePath,
	});
}

/** Load `<dir>/*.md` prompt templates; broken files become errors, not throws. */
export async function loadPromptTemplates(
	env: FileSystem,
	dir: string,
): Promise<{ templates: PromptTemplate[]; errors: string[] }> {
	const templates: PromptTemplate[] = [];
	const errors: string[] = [];
	const listing = await env.listDir(dir);
	if (!listing.ok) return { templates, errors };

	const sep = dir.includes("\\") ? "\\" : "/";
	for (const entry of listing.value) {
		if (entry.isDirectory || !entry.name.endsWith(".md")) continue;
		const filePath = `${dir}${sep}${entry.name}`;
		const content = await env.readFile(filePath);
		if (!content.ok) {
			errors.push(`${filePath}: ${content.error}`);
			continue;
		}
		const template = parsePromptTemplate(content.value, filePath);
		if (template.ok) templates.push(template.value);
		else errors.push(template.error);
	}
	return { templates, errors };
}

/** Substitute `$ARGUMENTS` and `$1`..`$9` in a template body. */
export function expandPromptTemplate(template: PromptTemplate, args: string): string {
	const positional = args.trim() === "" ? [] : args.trim().split(/\s+/);
	return template.content
		.replaceAll("$ARGUMENTS", args.trim())
		.replace(/\$([1-9])/g, (_, digit: string) => positional[Number(digit) - 1] ?? "");
}
