import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createTool } from "../../src/core/tools/index.ts";
import { createHarness, getMessageText, type Harness } from "./harness.ts";

describe("tutorial 07 — read tool through the session", () => {
	const harnesses: Harness[] = [];
	const tempDirs: string[] = [];

	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
		while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
	});

	it("executes a read tool call and feeds the file back to the model", async () => {
		const projectDir = join(tmpdir(), `verify-07-${Date.now()}`);
		mkdirSync(projectDir, { recursive: true });
		tempDirs.push(projectDir);
		writeFileSync(join(projectDir, "hello.txt"), "line one\nline two\n");

		const readTool = createTool("read", projectDir);
		const harness = await createHarness({ tools: [readTool] });
		harnesses.push(harness);

		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("read", { path: "hello.txt" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("The file has two lines."),
		]);

		await harness.session.prompt("What's in hello.txt?");

		const roles = harness.session.messages.map((m) => m.role);
		expect(roles).toEqual(["user", "assistant", "toolResult", "assistant"]);
		const toolResult = harness.session.messages[2]!;
		expect(getMessageText(toolResult)).toContain("line one");
	});
});
