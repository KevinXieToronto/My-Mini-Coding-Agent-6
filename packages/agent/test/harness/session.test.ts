import { describe, expect, it } from "vitest";
import { defaultContextEntryTransform, sessionEntriesToMessages } from "../../src/harness/session/context.ts";
import { Session } from "../../src/harness/session/session.ts";
import { inMemorySessionStore } from "../../src/harness/session/store.ts";

describe("harness/session", () => {
	it("append, branch, path", () => {
		const session = Session.create({ title: "test" });
		const a = session.appendMessage({ role: "user", content: "a", timestamp: 1 });
		const b = session.appendMessage({ role: "user", content: "b", timestamp: 2 });
		// Branch off the first message
		session.setLeaf(a.id);
		const c = session.appendMessage({ role: "user", content: "c", timestamp: 3 });

		const path = session.getPathEntries();
		expect(path.map((e) => e.type)).toEqual(["session-info", "message", "message"]);
		expect(path.at(-1)?.id).toBe(c.id);
		expect(path.some((e) => e.id === b.id)).toBe(false);
		// The abandoned branch is still in the log
		expect(session.getEntries().some((e) => e.id === b.id)).toBe(true);
	});

	it("labels bookmark entries", () => {
		const session = Session.create();
		const entry = session.appendMessage({ role: "user", content: "milestone", timestamp: 1 });
		session.label(entry.id, "before-refactor");
		expect(session.getLabel(entry.id)).toBe("before-refactor");
		// Labels are log-only: the leaf is still the message
		expect(session.getLeafId()).toBe(entry.id);
	});

	it("survives a store round-trip", async () => {
		const store = inMemorySessionStore();
		const session = Session.create({ store });
		session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		const leaf = session.getLeafId();

		const reopened = await Session.open(store);
		expect(reopened.id).toBe(session.id);
		expect(reopened.getLeafId()).toBe(leaf);
		expect(reopened.getPathEntries().map((e) => e.type)).toEqual(["session-info", "message"]);
	});

	it("defaultContextEntryTransform replaces pre-compaction history with the summary", () => {
		const session = Session.create();
		session.appendMessage({ role: "user", content: "old-1", timestamp: 1 });
		session.appendMessage({ role: "user", content: "old-2", timestamp: 2 });
		const kept = session.appendMessage({ role: "user", content: "recent", timestamp: 3 });
		session.append({ type: "compaction", summary: "earlier stuff happened", firstKeptEntryId: kept.id });
		session.appendMessage({ role: "user", content: "after", timestamp: 4 });

		const context = defaultContextEntryTransform(session.getPathEntries());
		expect(context.map((e) => e.type)).toEqual(["compaction", "message", "message"]);

		const messages = sessionEntriesToMessages(context);
		expect(messages).toHaveLength(3);
		expect(String(messages[0]!.content)).toContain("earlier stuff happened");
		expect(messages[1]!.content).toBe("recent");
		expect(messages[2]!.content).toBe("after");
	});

	it("defaultContextEntryTransform with firstKeptEntryId null keeps only post-compaction entries", () => {
		const session = Session.create();
		session.appendMessage({ role: "user", content: "old", timestamp: 1 });
		session.append({ type: "compaction", summary: "all of it", firstKeptEntryId: null });
		session.appendMessage({ role: "user", content: "after", timestamp: 2 });

		const context = defaultContextEntryTransform(session.getPathEntries());
		expect(context.map((e) => e.type)).toEqual(["compaction", "message"]);
		expect(context[1]!.type === "message" && context[1]!.message.content).toBe("after");
	});
});
