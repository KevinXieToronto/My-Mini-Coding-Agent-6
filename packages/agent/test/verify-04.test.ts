import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.ts";
import type { AgentTool } from "../src/types.ts";

describe("tutorial 04 — agent loop", () => {
	it("streams, calls a tool, feeds back the result, and stops", async () => {
		const faux = fauxProvider();
		const models = createModels();
		models.setProvider(faux.provider);
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("add", { a: 2, b: 3 }), { stopReason: "toolUse" }),
			fauxAssistantMessage("The sum is 5."),
		]);

		const add: AgentTool<any> = {
			name: "add",
			label: "Add",
			description: "Add two numbers",
			parameters: Type.Object({ a: Type.Number(), b: Type.Number() }),
			execute: async (_toolCallId, params: { a: number; b: number }) => ({
				content: [{ type: "text", text: String(params.a + params.b) }],
				details: {},
			}),
		};

		const agent = new Agent({
			initialState: { model: faux.getModel(), tools: [add], systemPrompt: "You are a calculator." },
			streamFn: (model, context, options) => models.streamSimple(model, context, options),
		});

		const events: string[] = [];
		agent.subscribe((event) => {
			events.push(event.type);
		});

		await agent.prompt("What is 2 + 3?");

		expect(events).toContain("tool_execution_start");
		expect(events).toContain("tool_execution_end");
		const roles = agent.state.messages.map((m) => m.role);
		expect(roles).toEqual(["user", "assistant", "toolResult", "assistant"]);
		const final = agent.state.messages.at(-1);
		expect(final?.role === "assistant" && final.content[0].type === "text" && final.content[0].text).toBe(
			"The sum is 5.",
		);
	});
});
