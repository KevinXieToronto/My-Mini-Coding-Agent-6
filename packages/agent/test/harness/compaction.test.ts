import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { estimateEntryTokens, planCompaction, shouldCompact } from "../../src/harness/compaction/compaction.ts";
import { DEFAULT_COMPACTION_SETTINGS } from "../../src/harness/compaction/types.ts";
import { Session } from "../../src/harness/session/session.ts";

const model = { contextWindow: 100000 } as Model<Api>;

describe("harness/compaction", () => {
	it("shouldCompact triggers when usage exceeds contextWindow - reserveTokens", () => {
		expect(shouldCompact(50000, model, DEFAULT_COMPACTION_SETTINGS)).toBe(false);
		expect(shouldCompact(90000, model, DEFAULT_COMPACTION_SETTINGS)).toBe(true);
		expect(shouldCompact(90000, model, { ...DEFAULT_COMPACTION_SETTINGS, enabled: false })).toBe(false);
	});

	it("planCompaction cuts at a user-message turn boundary, keeping ~keepRecentTokens", () => {
		const session = Session.create();
		const big = "x".repeat(4000); // ~1000 estimated tokens per message
		const entries = [];
		for (let i = 0; i < 10; i++) {
			entries.push(session.appendMessage({ role: "user", content: `${i}:${big}`, timestamp: i }));
		}
		const contextEntries = session.getPathEntries().filter((e) => e.type === "message");

		const plan = planCompaction(contextEntries, {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 2500,
		});

		expect(plan.firstKeptEntryId).not.toBeNull();
		const keptIndex = contextEntries.findIndex((e) => e.id === plan.firstKeptEntryId);
		// Everything before the cut is summarized, everything from the cut on is kept
		expect(plan.summarizedEntryIds).toEqual(contextEntries.slice(0, keptIndex).map((e) => e.id));
		// The kept tail is roughly keepRecentTokens
		const keptTokens = contextEntries.slice(keptIndex).reduce((sum, e) => sum + estimateEntryTokens(e), 0);
		expect(keptTokens).toBeGreaterThanOrEqual(2500);
		expect(plan.tokensBefore).toBeGreaterThan(keptTokens);
	});
});
