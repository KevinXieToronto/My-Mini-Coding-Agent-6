import { err, ok, type Result } from "./types.ts";

export interface FrontmatterFile {
	/** Flat string/boolean fields from the YAML block. */
	attributes: Record<string, string | boolean>;
	/** Markdown body after the closing `---`. */
	body: string;
}

/**
 * Minimal frontmatter parser: a leading `---` block of flat `key: value` pairs.
 * Deliberately not full YAML — skills and prompt templates only need scalars.
 */
export function parseFrontmatter(markdown: string): Result<FrontmatterFile, string> {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
	if (!match) return err("Missing frontmatter: file must start with a `---` YAML block");

	const attributes: Record<string, string | boolean> = {};
	for (const line of match[1]!.split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const colon = line.indexOf(":");
		if (colon === -1) return err(`Invalid frontmatter line: ${line}`);
		const key = line.slice(0, colon).trim();
		let value = line.slice(colon + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
			(value.startsWith("'") && value.endsWith("'") && value.length >= 2)
		) {
			value = value.slice(1, -1);
		}
		attributes[key] = value === "true" ? true : value === "false" ? false : value;
	}
	return ok({ attributes, body: markdown.slice(match[0].length) });
}
