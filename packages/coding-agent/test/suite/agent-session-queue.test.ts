import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { type CoreSessionFixture, createCoreSessionFixture } from "./agent-session-fixture.ts";

describe("AgentSession prompt queue", () => {
	const fixtures: CoreSessionFixture[] = [];

	afterEach(() => {
		while (fixtures.length > 0) fixtures.pop()?.cleanup();
	});

	async function fixture(): Promise<CoreSessionFixture> {
		const f = await createCoreSessionFixture();
		fixtures.push(f);
		return f;
	}

	it("queues a prompt submitted while a run is active and processes it afterwards", async () => {
		const { session, faux } = await fixture();
		faux.setResponses([fauxAssistantMessage("first answer"), fauxAssistantMessage("second answer")]);

		const first = session.prompt("first question");
		expect(session.isRunning).toBe(true);

		const second = session.prompt("second question");
		expect(session.queuedPrompts).toHaveLength(1);
		expect(session.queuedPrompts[0]?.content).toBe("second question");

		await Promise.all([first, second]);
		expect(session.isRunning).toBe(false);
		expect(session.queuedPrompts).toHaveLength(0);
		expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
	});

	it("preserves submission order when several prompts queue up", async () => {
		const { session, faux } = await fixture();
		faux.setResponses([
			fauxAssistantMessage("answer a"),
			fauxAssistantMessage("answer b"),
			fauxAssistantMessage("answer c"),
		]);

		const runs = [session.prompt("a"), session.prompt("b"), session.prompt("c")];
		expect(session.queuedPrompts.map((m) => m.content)).toEqual(["b", "c"]);

		await Promise.all(runs);
		const userMessages = session.messages.filter((m) => m.role === "user").map((m) => m.content);
		expect(userMessages).toEqual(["a", "b", "c"]);
	});

	it("clearQueue drops prompts that have not started, resolving their promises", async () => {
		const { session, faux } = await fixture();
		faux.setResponses([fauxAssistantMessage("only answer")]);

		const first = session.prompt("runs");
		const second = session.prompt("never runs");
		session.clearQueue();
		expect(session.queuedPrompts).toHaveLength(0);

		await Promise.all([first, second]);
		expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
	});
});
