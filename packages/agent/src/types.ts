import type {
	AssistantMessageEvent,
	AssistantMessageEventStream,
	Context,
	ImageContent,
	Message,
	Model,
	SimpleStreamOptions,
	TextContent,
	Tool,
	ToolResultMessage,
} from "@earendil-works/pi-ai";
import type { Static, TSchema } from "typebox";

export type ToolExecutionMode = "sequential" | "parallel";

/** Static<any> is unknown in typebox; map it back to any so `AgentTool<any>` stays ergonomic. */
export type ToolParams<TParameters extends TSchema> = unknown extends Static<TParameters> ? any : Static<TParameters>;

/** Streams partial results while a tool executes. */
export type AgentToolUpdateCallback<TDetails = any> = (partialResult: AgentToolResult<TDetails>) => void;

/** Tool definition used by the agent runtime. */
export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
	/** Human-readable label for UI display. */
	label: string;
	/**
	 * Optional compatibility shim for raw tool-call arguments before schema validation.
	 * Must return an object that matches `TParameters`.
	 */
	prepareArguments?: (args: unknown) => ToolParams<TParameters>;
	/** Execute the tool call. Throw on failure instead of encoding errors in `content`. */
	execute: (
		toolCallId: string,
		params: ToolParams<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
	/** Per-tool execution mode override ("sequential" | "parallel"). */
	executionMode?: ToolExecutionMode;
}

/** Final or partial result produced by a tool. */
export interface AgentToolResult<T> {
	/** Text or image content returned to the model. */
	content: (TextContent | ImageContent)[];
	/** Arbitrary structured details for logs or UI rendering. */
	details: T;
	/** Hint that the agent should stop after the current tool batch. */
	terminate?: boolean;
}

export interface CustomAgentMessages {
	// Empty by default - apps extend via declaration merging
}

export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

/** The agent's working state: system prompt, full message history, and available tools. */
export interface AgentContext {
	systemPrompt?: string;
	messages: AgentMessage[];
	tools?: AgentTool<any, any>[];
}

/** Pluggable transport: how the loop turns a context into a streamed assistant response. */
export type StreamFn = (
	model: Model<any>,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export interface AgentLoopConfig extends SimpleStreamOptions {
	model: Model<any>;
	/** Converts AgentMessage[] to LLM-compatible Message[] before each LLM call. */
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	/** Optional transform applied to the context before `convertToLlm` (pruning, injection). */
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	/** Messages queued while a turn is running; injected before the next LLM call. */
	getSteeringMessages?: () => AgentMessage[] | Promise<AgentMessage[]>;
	/** Messages queued for after the agent would stop; restart the loop when present. */
	getFollowUpMessages?: () => AgentMessage[] | Promise<AgentMessage[]>;
	/** Hook consulted before the next turn starts. */
	prepareNextTurn?: (messages: AgentMessage[]) => void | Promise<void>;
	/** Return true to stop the loop after the current turn even if tools were called. */
	shouldStopAfterTurn?: (messages: AgentMessage[]) => boolean | Promise<boolean>;
}

export type AgentEvent =
	// Agent lifecycle
	| { type: "agent_start" }
	| { type: "agent_end"; messages: AgentMessage[] }
	// Turn lifecycle - a turn is one assistant response + any tool calls/results
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
	// Message lifecycle - emitted for user, assistant, and toolResult messages
	| { type: "message_start"; message: AgentMessage }
	| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
	| { type: "message_end"; message: AgentMessage }
	// Tool execution lifecycle
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
