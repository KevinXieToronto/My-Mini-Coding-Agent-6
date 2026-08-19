import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { type Static, Type } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "./tool-definition.ts";

const readSchema = Type.Object({
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

export type ReadToolInput = Static<typeof readSchema>;

/**
 * Pluggable operations for the read tool.
 * Override these to delegate file reading to remote systems (for example SSH).
 */
export interface ReadOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Check if file is readable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
	/** Detect image MIME type, return null or undefined for non-images */
	detectImageMimeType?: (absolutePath: string) => Promise<string | null | undefined>;
}

const defaultOperations: ReadOperations = {
	readFile: (absolutePath) => readFile(absolutePath),
	access: async (absolutePath) => {
		await access(absolutePath, constants.R_OK);
	},
};

export function createReadTool(cwd: string, operations?: ReadOperations): ToolDefinition<typeof readSchema> {
	const ops = operations ?? defaultOperations;
	return {
		name: "read",
		label: "Read",
		description:
			"Read a file from the filesystem. Returns the full contents by default; " +
			"use offset (1-indexed line) and limit to read a slice of large files. Images are returned as attachments.",
		parameters: readSchema,
		execute: async (_toolCallId, params: ReadToolInput) => {
			const absolutePath = isAbsolute(params.path) ? params.path : resolve(cwd, params.path);
			await ops.access(absolutePath);

			const mimeType = await ops.detectImageMimeType?.(absolutePath);
			const buffer = await ops.readFile(absolutePath);
			if (mimeType) {
				return {
					content: [{ type: "image" as const, data: buffer.toString("base64"), mimeType }],
					details: undefined,
				};
			}

			const lines = buffer.toString("utf8").split("\n");
			const offset = params.offset ?? 1;
			if (offset < 1) throw new Error(`Invalid offset ${offset}: line numbers are 1-indexed`);
			const start = offset - 1;
			if (start >= lines.length) {
				throw new Error(`Offset ${offset} is past the end of the file (${lines.length} lines)`);
			}
			const end = params.limit !== undefined ? start + params.limit : lines.length;
			const selected = lines.slice(start, end);

			let text = selected.join("\n");
			if (end < lines.length) {
				text += `\n[Truncated: showing lines ${offset}-${end} of ${lines.length}]`;
			}
			return {
				content: [{ type: "text" as const, text }],
				details: undefined,
			};
		},
	};
}
