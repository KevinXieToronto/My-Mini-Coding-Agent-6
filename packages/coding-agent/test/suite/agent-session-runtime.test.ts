import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { type CoreSessionFixture, createCoreSessionFixture } from "./agent-session-fixture.ts";

describe("AgentSession runtime", () => {
	const fixtures: CoreSessionFixture[] = [];

	afterEach(() => {
		while (fixtures.length > 0) fixtures.pop()?.cleanup();
	});

	async function fixture(): Promise<CoreSessionFixture> {
		const f = await createCoreSessionFixture();
		fixtures.push(f);
		return f;
	}

	it("persists model and thinking-level changes as the user's defaults", async () => {
		const { session, faux, agentDir, services } = await fixture();

		session.setModel(faux.getModel());
		session.setThinkingLevel("xhigh");

		expect(session.thinkingLevel).toBe("xhigh");
		const stored = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));
		expect(stored).toMatchObject({ defaultProvider: "faux", defaultModel: "faux-1", thinkingLevel: "xhigh" });
		expect(services.settingsManager.get().defaultModel).toBe("faux-1");
	});

	it("executes bash commands", async () => {
		const { session } = await fixture();
		const result = await session.executeBash("echo core-runtime");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.exitCode).toBe(0);
			expect(result.value.stdout).toContain("core-runtime");
		}
	});

	it("switches to a new session while keeping subscribers and the old store intact", async () => {
		const { session, faux, agentDir } = await fixture();
		const seen: string[] = [];
		session.subscribe((event) => {
			seen.push(event.type);
		});

		faux.setResponses([fauxAssistantMessage("in old session")]);
		await session.prompt("hello old");
		const oldSessionId = session.session.id;
		const eventsBeforeSwitch = seen.length;

		session.newSession("fresh start");
		expect(session.session.id).not.toBe(oldSessionId);
		expect(session.messages).toHaveLength(0);

		faux.setResponses([fauxAssistantMessage("in new session")]);
		await session.prompt("hello new");
		expect(seen.length).toBeGreaterThan(eventsBeforeSwitch); // subscriber survived the switch
		expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

		expect(existsSync(join(agentDir, "sessions", `${oldSessionId}.jsonl`))).toBe(true);
		expect(existsSync(join(agentDir, "sessions", `${session.session.id}.jsonl`))).toBe(true);
	});

	it("branches when navigating to an older entry", async () => {
		const { session, faux } = await fixture();
		faux.setResponses([fauxAssistantMessage("first answer")]);
		await session.prompt("first question");
		expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

		const userEntry = session.session
			.getPathEntries()
			.find((entry) => entry.type === "message" && entry.message.role === "user");
		expect(userEntry).toBeDefined();

		await session.navigateTo(userEntry!.id);
		expect(session.messages.map((m) => m.role)).toEqual(["user"]);

		faux.setResponses([fauxAssistantMessage("branched answer")]);
		await session.prompt("second question, new branch");
		expect(session.messages.map((m) => m.role)).toEqual(["user", "user", "assistant"]);
	});

	it("manual compaction reports nothing to cut on a short context", async () => {
		const { session, faux } = await fixture();
		faux.setResponses([fauxAssistantMessage("short")]);
		await session.prompt("short conversation");
		expect(await session.compact()).toBe(false);
	});
});
