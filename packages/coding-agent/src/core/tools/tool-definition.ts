import type {
	AgentTool,
	AgentToolResult,
	AgentToolUpdateCallback,
	ToolExecutionMode,
	ToolParams,
} from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";

/**
 * Runtime-agnostic tool definition. Same shape as AgentTool today; kept separate
 * so definitions stay decoupled from the agent runtime (extensions, remoting).
 */
export interface ToolDefinition<TParameters extends TSchema = TSchema, TDetails = unknown> {
	name: string;
	label: string;
	description: string;
	parameters: TParameters;
	prepareArguments?: (args: unknown) => ToolParams<TParameters>;
	executionMode?: ToolExecutionMode;
	execute: (
		toolCallId: string,
		params: ToolParams<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
}

/** Wrap a ToolDefinition into an AgentTool for the core runtime. */
export function wrapToolDefinition<TDetails = unknown>(
	definition: ToolDefinition<any, TDetails>,
): AgentTool<any, TDetails> {
	return {
		name: definition.name,
		label: definition.label,
		description: definition.description,
		parameters: definition.parameters,
		prepareArguments: definition.prepareArguments,
		executionMode: definition.executionMode,
		execute: (toolCallId, params, signal, onUpdate) => definition.execute(toolCallId, params, signal, onUpdate),
	};
}
