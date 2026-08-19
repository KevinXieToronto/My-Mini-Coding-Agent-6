import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createReadTool, type ReadOperations } from "./read.ts";
import { type ToolDefinition, wrapToolDefinition } from "./tool-definition.ts";

export { createReadTool, type ReadOperations, type ReadToolInput } from "./read.ts";
export { type ToolDefinition, wrapToolDefinition } from "./tool-definition.ts";

export type ToolName = "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls";
export const allToolNames: Set<ToolName> = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);

/** Per-tool operation overrides (e.g. delegate filesystem access to SSH). */
export interface ToolsOptions {
	readOperations?: ReadOperations;
}

export function createToolDefinition(toolName: ToolName, cwd: string, options?: ToolsOptions): ToolDefinition<any> {
	switch (toolName) {
		case "read":
			return createReadTool(cwd, options?.readOperations);
		default:
			throw new Error(`Tool "${toolName}" is not implemented yet`);
	}
}

export function createTool(toolName: ToolName, cwd: string, options?: ToolsOptions): AgentTool<any> {
	return wrapToolDefinition(createToolDefinition(toolName, cwd, options));
}
