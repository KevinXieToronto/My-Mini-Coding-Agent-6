import type { AgentMessage } from "../../types.ts";
import type { CompactionEntry, SessionTreeEntry } from "./types.ts";

/**
 * Default projection from a root→leaf path to the entries the model sees:
 * the most recent compaction replaces everything before its `firstKeptEntryId`.
 */
export function defaultContextEntryTransform(pathEntries: readonly SessionTreeEntry[]): SessionTreeEntry[] {
	let compaction: CompactionEntry | null = null;
	for (const entry of pathEntries) {
		if (entry.type === "compaction") {
			compaction = entry;
		}
	}
	if (!compaction) {
		return [...pathEntries];
	}

	const entries: SessionTreeEntry[] = [compaction];
	// ...然后是从 firstKeptEntryId 开始（含）的每个条目；没有保留点时只保留 compaction 之后的条目。
	let keeping = false;
	for (const entry of pathEntries) {
		if (!keeping) {
			if (compaction.firstKeptEntryId !== null) keeping = entry.id === compaction.firstKeptEntryId;
			else keeping = entry === compaction;
			if (!keeping) continue;
		}
		if (entry !== compaction) entries.push(entry);
	}
	return entries;
}

/** Project context entries into the messages handed to the agent loop. */
export function sessionEntriesToMessages(entries: readonly SessionTreeEntry[]): AgentMessage[] {
	const messages: AgentMessage[] = [];
	for (const entry of entries) {
		switch (entry.type) {
			case "message":
			case "custom-message":
				messages.push(entry.message);
				break;
			case "compaction":
				messages.push(summaryMessage("previous conversation", entry.summary, entry.timestamp));
				break;
			case "branch-summary":
				messages.push(summaryMessage("an abandoned branch of this conversation", entry.summary, entry.timestamp));
				break;
			default:
				// thinking-level/model/tool changes, custom, labels, leaves, session info: not model-visible
				break;
		}
	}
	return messages;
}

function summaryMessage(subject: string, summary: string, timestamp: string): AgentMessage {
	return {
		role: "user",
		content: `<summary>The following is a summary of ${subject}:\n\n${summary}</summary>`,
		timestamp: Date.parse(timestamp),
	};
}
