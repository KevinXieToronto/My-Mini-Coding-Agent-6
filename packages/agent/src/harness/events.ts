import type { Api, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import type { AgentEvent, AgentMessage, AgentToolResult } from "../types.ts";
import type { CompactionSettings } from "./compaction/types.ts";
import type { SessionTreeEntry } from "./session/types.ts";

// ---- Hook event payloads (what the application receives) ----

export interface BeforeAgentStartEvent {
	type: "before_agent_start";
	prompt: AgentMessage;
	systemPrompt?: string;
}

export interface ContextEvent {
	type: "context";
	messages: AgentMessage[];
}

export interface BeforeProviderRequestEvent {
	type: "before_provider_request";
	model: Model<Api>;
	streamOptions: SimpleStreamOptions;
}

export interface BeforeProviderPayloadEvent {
	type: "before_provider_payload";
	model: Model<Api>;
	/** Raw wire payload, shape depends on the provider API. */
	payload: unknown;
}

export interface ToolCallEvent {
	type: "tool_call";
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface ToolResultEvent {
	type: "tool_result";
	toolCallId: string;
	toolName: string;
	result: AgentToolResult<unknown>;
	isError: boolean;
}

export interface SessionBeforeCompactEvent {
	type: "session_before_compact";
	contextEntries: readonly SessionTreeEntry[];
	settings: CompactionSettings;
}

export interface SessionBeforeTreeEvent {
	type: "session_before_tree";
	/** Entry the navigation wants to make the new leaf. */
	targetEntryId: string;
}

/** Pure notification: every underlying agent-loop event, forwarded. */
export interface AgentEventNotification {
	type: "agent_event";
	event: AgentEvent;
}

export type AgentHarnessEvent =
	| BeforeAgentStartEvent
	| ContextEvent
	| BeforeProviderRequestEvent
	| BeforeProviderPayloadEvent
	| ToolCallEvent
	| ToolResultEvent
	| SessionBeforeCompactEvent
	| SessionBeforeTreeEvent
	| AgentEventNotification;

// ---- Hook results (what a handler may return to intervene) ----

/** 改写 prompt/systemPrompt。 */
export interface BeforeAgentStartResult {
	prompt?: AgentMessage;
	systemPrompt?: string;
}

/** 每轮改写消息列表。 */
export interface ContextResult {
	messages: AgentMessage[];
}

/** 补丁流选项/请求头。 */
export interface BeforeProviderRequestResult {
	streamOptions?: Partial<SimpleStreamOptions>;
	headers?: Record<string, string>;
}

/** 改写原始线上载荷。 */
export interface BeforeProviderPayloadResult {
	payload: unknown;
}

/** 阻止工具调用。 */
export interface ToolCallResult {
	block: boolean;
	reason?: string;
}

/** 改写工具结果。 */
export interface ToolResultPatch {
	result: AgentToolResult<unknown>;
}

/** 取消或替换 compaction。 */
export interface SessionBeforeCompactResult {
	cancel?: boolean;
	/** Skip the LLM summarization and use this compaction instead. */
	replacement?: { summary: string; firstKeptEntryId: string | null };
}

/** 拦截分支导航。 */
export interface SessionBeforeTreeResult {
	cancel?: boolean;
	/** Redirect the navigation to a different entry. */
	targetEntryId?: string;
}

export type AgentHarnessEventResultMap = {
	before_agent_start: BeforeAgentStartResult | undefined; // 改写 prompt/systemPrompt
	context: ContextResult | undefined; // 每轮改写消息列表
	before_provider_request: BeforeProviderRequestResult | undefined; // 补丁流选项/请求头
	before_provider_payload: BeforeProviderPayloadResult | undefined; // 改写原始线上载荷
	tool_call: ToolCallResult | undefined; // 阻止工具调用
	tool_result: ToolResultPatch | undefined; // 改写工具结果
	session_before_compact: SessionBeforeCompactResult | undefined; // 取消或替换 compaction
	session_before_tree: SessionBeforeTreeResult | undefined; // 拦截分支导航
	agent_event: undefined; // 纯通知
};

/** One handler per event type; return undefined (or nothing) to not intervene. */
export type AgentHarnessHooks = {
	[K in AgentHarnessEvent["type"]]?: (
		event: Extract<AgentHarnessEvent, { type: K }>,
	) => AgentHarnessEventResultMap[K] | undefined | Promise<AgentHarnessEventResultMap[K] | undefined>;
};
