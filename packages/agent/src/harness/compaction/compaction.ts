import type { Api, Model, Models } from "@earendil-works/pi-ai";
import type { AgentMessage } from "../../types.ts";
import { sessionEntriesToMessages } from "../session/context.ts";
import type { CompactionEntry, SessionTreeEntry } from "../session/types.ts";
import type { CompactionPlan, CompactionSettings } from "./types.ts";

export const COMPACTION_SYSTEM_PROMPT =
	"You summarize agent conversations. Produce a dense summary that preserves: the user's goals, " +
	"decisions made and why, file paths and code identifiers touched, tool results that still matter, " +
	"and any unresolved tasks. Omit pleasantries and dead ends unless they inform future work.";

/** Rough token estimate when no provider-reported usage is available (~4 chars per token). */
export function estimateTokens(message: AgentMessage): number {
	return Math.ceil(JSON.stringify(message).length / 4);
}

export function estimateEntryTokens(entry: SessionTreeEntry): number {
	return sessionEntriesToMessages([entry]).reduce((sum, message) => sum + estimateTokens(message), 0);
}

/** True when the projected context no longer fits the window minus the reserve. */
export function shouldCompact(usedTokens: number, model: Model<Api>, settings: CompactionSettings): boolean {
	return settings.enabled && usedTokens > model.contextWindow - settings.reserveTokens;
}

/**
 * Pick the cut point: walk the projected context backwards accumulating estimated
 * tokens until ~keepRecentTokens are kept; everything earlier gets summarized.
 * The cut never lands between a toolCall and its toolResult because we only cut
 * in front of user messages (a turn boundary).
 */
export function planCompaction(
	contextEntries: readonly SessionTreeEntry[],
	settings: CompactionSettings,
): CompactionPlan {
	const tokensBefore = contextEntries.reduce((sum, entry) => sum + estimateEntryTokens(entry), 0);

	let kept = 0;
	let firstKeptIndex = contextEntries.length;
	for (let i = contextEntries.length - 1; i >= 0; i--) {
		const entry = contextEntries[i]!;
		kept += estimateEntryTokens(entry);
		const isTurnBoundary = entry.type === "message" && entry.message.role === "user";
		if (isTurnBoundary) firstKeptIndex = i;
		if (kept >= settings.keepRecentTokens && firstKeptIndex < contextEntries.length) break;
	}

	return {
		summarizedEntryIds: contextEntries.slice(0, firstKeptIndex).map((entry) => entry.id),
		firstKeptEntryId: contextEntries[firstKeptIndex]?.id ?? null,
		tokensBefore,
	};
}

/** Summarize the entries being cut and return the fields for a CompactionEntry. */
export async function summarizeForCompaction(
	contextEntries: readonly SessionTreeEntry[],
	plan: CompactionPlan,
	models: Models,
	model: Model<Api>,
	signal?: AbortSignal,
): Promise<Omit<CompactionEntry, "id" | "parentId" | "timestamp">> {
	const summarized = new Set(plan.summarizedEntryIds);
	const messages = sessionEntriesToMessages(contextEntries.filter((entry) => summarized.has(entry.id)));
	const transcript = messages.map(renderForSummary).join("\n\n");

	const response = await models.completeSimple(
		model,
		{
			systemPrompt: COMPACTION_SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: `Summarize the following conversation transcript:\n\n${transcript}`,
					timestamp: Date.now(),
				},
			],
		},
		{ signal },
	);
	if (response.stopReason === "error" || response.stopReason === "aborted") {
		throw new Error(response.errorMessage ?? `Compaction summarization failed (${response.stopReason})`);
	}

	const summary = response.content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("\n");

	return { type: "compaction", summary, firstKeptEntryId: plan.firstKeptEntryId, tokensBefore: plan.tokensBefore };
}

function renderForSummary(message: AgentMessage): string {
	if (message.role === "user" && typeof message.content === "string") return `[user]\n${message.content}`;
	const blocks = Array.isArray((message as { content?: unknown }).content)
		? ((message as { content: unknown[] }).content as Record<string, unknown>[])
		: [];
	const text = blocks
		.map((block) => {
			if (block.type === "text") return String(block.text);
			if (block.type === "toolCall") return `<tool call: ${String(block.name)}(${JSON.stringify(block.arguments)})>`;
			if (block.type === "image") return "<image>";
			return "";
		})
		.filter(Boolean)
		.join("\n");
	return `[${message.role}]\n${text}`;
}
