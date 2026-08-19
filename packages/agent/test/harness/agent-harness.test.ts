import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { AgentHarness } from "../../src/harness/agent-harness.ts";
import { expandPromptTemplate, parsePromptTemplate } from "../../src/harness/prompt-templates.ts";
import { Session } from "../../src/harness/session/session.ts";
import { parseSkill } from "../../src/harness/skills.ts";
import type { ExecutionEnv } from "../../src/harness/types.ts";
import type { AgentTool } from "../../src/types.ts";

const fakeEnv: ExecutionEnv = {
	cwd: () => "/fake",
	readFile: async () => ({ ok: false, error: "not implemented" }),
	writeFile: async () => ({ ok: true, value: undefined }),
	listDir: async () => ({ ok: true, value: [] }),
	exists: async () => false,
	exec: async () => ({ ok: true, value: { stdout: "", stderr: "", exitCode: 0 } }),
};

const add: AgentTool<any> = {
	name: "add",
	label: "Add",
	description: "Add two numbers",
	parameters: Type.Object({ a: Type.Number(), b: Type.Number() }),
	execute: async (_id, params: { a: number; b: number }) => ({
		content: [{ type: "text", text: String(params.a + params.b) }],
		details: {},
	}),
};

function setup() {
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	return { faux, models };
}

describe("harness/agent-harness", () => {
	it("parses skills and prompt templates from frontmatter markdown", () => {
		const skill = parseSkill(
			"---\nname: release\ndescription: Cut a release of this project\n---\n\nTo cut a release, first run ./test.sh, then ...",
			"/skills/release.md",
		);
		expect(skill.ok && skill.value.name).toBe("release");
		expect(skill.ok && skill.value.content.startsWith("To cut a release")).toBe(true);

		const broken = parseSkill("no frontmatter here", "/skills/broken.md");
		expect(broken.ok).toBe(false);

		const template = parsePromptTemplate(
			"---\nname: fix\ndescription: Fix an issue\n---\nFix issue $1 with priority $2. Full input: $ARGUMENTS",
			"/prompts/fix.md",
		);
		expect(template.ok).toBe(true);
		if (template.ok) {
			expect(expandPromptTemplate(template.value, "123 high")).toBe(
				"Fix issue 123 with priority high. Full input: 123 high",
			);
		}
	});

	it("runs a turn, persists entries, and sees history on the next prompt", async () => {
		const { faux, models } = setup();
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("add", { a: 2, b: 3 }), { stopReason: "toolUse" }),
			fauxAssistantMessage("The sum is 5."),
		]);

		const toolCallsSeen: string[] = [];
		const session = Session.create();
		const harness = new AgentHarness({
			env: fakeEnv,
			session,
			models,
			model: faux.getModel(),
			tools: [add],
			systemPrompt: "You are a calculator.",
			resources: {
				skills: [{ name: "release", description: "Cut a release", content: "...", filePath: "/skills/release.md" }],
			},
			hooks: {
				tool_call: (event) => {
					toolCallsSeen.push(event.toolName);
					return undefined;
				},
			},
		});

		await harness.prompt("What is 2 + 3?");

		expect(toolCallsSeen).toEqual(["add"]);
		const roles = session
			.getPathEntries()
			.filter((e) => e.type === "message")
			.map((e) => (e.type === "message" ? e.message.role : ""));
		expect(roles).toEqual(["user", "assistant", "toolResult", "assistant"]);

		// A second prompt sees the persisted history
		faux.setResponses([fauxAssistantMessage("You asked what 2 + 3 is.")]);
		await harness.prompt("What did I ask before?");
		const messages = harness.getContextMessages();
		expect(messages.filter((m) => m.role === "user")).toHaveLength(2);
	});

	it("tool_call hook can block a tool; the model sees an error result", async () => {
		const { faux, models } = setup();
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("add", { a: 1, b: 1 }), { stopReason: "toolUse" }),
			fauxAssistantMessage("Understood, I cannot add."),
		]);

		const session = Session.create();
		const harness = new AgentHarness({
			env: fakeEnv,
			session,
			models,
			model: faux.getModel(),
			tools: [add],
			hooks: {
				tool_call: () => ({ block: true, reason: "arithmetic is forbidden" }),
			},
		});

		await harness.prompt("What is 1 + 1?");

		const toolResult = session.getPathEntries().find((e) => e.type === "message" && e.message.role === "toolResult");
		expect(
			toolResult?.type === "message" && toolResult.message.role === "toolResult" && toolResult.message.isError,
		).toBe(true);
	});

	it("state changes are recorded as tree entries", () => {
		const { faux, models } = setup();
		const session = Session.create();
		const harness = new AgentHarness({
			env: fakeEnv,
			session,
			models,
			model: faux.getModel(),
			tools: [add],
		});

		harness.setThinkingLevel("high");
		harness.setActiveTools([]);

		const types = session.getPathEntries().map((e) => e.type);
		expect(types).toEqual(["session-info", "thinking-level-change", "active-tools-change"]);
		expect(harness.getActiveTools()).toEqual([]);
	});
});
