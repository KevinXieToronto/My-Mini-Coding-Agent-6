import type { ThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentMessage } from "../../types.ts";

export interface SessionTreeEntryBase {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
}

/** 一条 AgentMessage（user/assistant/toolResult 或应用扩展消息）。 */
export interface MessageEntry extends SessionTreeEntryBase {
	type: "message";
	message: AgentMessage;
}

/** 用户改变了推理等级。 */
export interface ThinkingLevelChangeEntry extends SessionTreeEntryBase {
	type: "thinking-level-change";
	thinkingLevel: ThinkingLevel;
}

/** 用户切换了模型。 */
export interface ModelChangeEntry extends SessionTreeEntryBase {
	type: "model-change";
	provider: string;
	modelId: string;
}

export interface ActiveToolsChangeEntry extends SessionTreeEntryBase {
	type: "active-tools-change";
	activeTools: string[];
}

/** 替换更早历史的摘要。`firstKeptEntryId` 之前的条目被摘要取代。 */
export interface CompactionEntry extends SessionTreeEntryBase {
	type: "compaction";
	summary: string;
	/** First path entry still projected verbatim into context; null keeps only entries after the compaction itself. */
	firstKeptEntryId: string | null;
	/** Approximate context size before compacting, for diagnostics. */
	tokensBefore?: number;
}

/** 被放弃分支的摘要，挂在分叉点之后，让模型仍然知道那条路发生过什么。 */
export interface BranchSummaryEntry extends SessionTreeEntryBase {
	type: "branch-summary";
	summary: string;
	/** Leaf of the abandoned branch this summary stands in for. */
	abandonedLeafId: string;
}

/** 应用自定义，默认对模型不可见。 */
export interface CustomEntry extends SessionTreeEntryBase {
	type: "custom";
	customType: string;
	data?: unknown;
}

/** 应用自定义，投影进模型上下文。 */
export interface CustomMessageEntry extends SessionTreeEntryBase {
	type: "custom-message";
	customType: string;
	message: AgentMessage;
	data?: unknown;
}

/** 给条目命名（书签）。 */
export interface LabelEntry extends SessionTreeEntryBase {
	type: "label";
	targetId: string;
	label: string;
}

export interface SessionInfoEntry extends SessionTreeEntryBase {
	type: "session-info";
	sessionId: string;
	title?: string;
	cwd?: string;
}

/** 记录哪个叶子是“当前”的。追加到日志但不参与树的路径。 */
export interface LeafEntry extends SessionTreeEntryBase {
	type: "leaf";
	leafId: string;
}

export type SessionTreeEntry =
	| MessageEntry
	| ThinkingLevelChangeEntry
	| ModelChangeEntry
	| ActiveToolsChangeEntry
	| CompactionEntry
	| BranchSummaryEntry
	| CustomEntry
	| CustomMessageEntry
	| LabelEntry
	| SessionInfoEntry
	| LeafEntry;

/** Fields the caller provides when appending; id/parentId/timestamp are assigned by the session. */
export type NewSessionTreeEntry = {
	[K in SessionTreeEntry["type"]]: Omit<Extract<SessionTreeEntry, { type: K }>, "id" | "parentId" | "timestamp">;
}[SessionTreeEntry["type"]];
