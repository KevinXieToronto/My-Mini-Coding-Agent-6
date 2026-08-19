import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import {
	AuthStorage,
	createAgentSession,
	createAgentSessionServices,
	createModelRegistry,
	resolveModel,
	SettingsManager,
	TrustManager,
} from "../../src/core/index.ts";

describe("tutorial 08 — core session layer", () => {
	const tempDirs: string[] = [];

	function makeDir(name: string): string {
		const dir = join(tmpdir(), `verify-08-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(dir, { recursive: true });
		tempDirs.push(dir);
		return dir;
	}

	afterEach(() => {
		while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
	});

	it("runs a prompt through AgentSession and persists it to the session store", async () => {
		const cwd = makeDir("project");
		const agentDir = makeDir("agent");
		writeFileSync(join(agentDir, "APPEND_SYSTEM.md"), "Always answer in haiku.");

		const services = createAgentSessionServices({ cwd, agentDir });
		const faux = fauxProvider();
		services.modelRegistry.setProvider(faux.provider);

		const session = await createAgentSession({ services, model: faux.getModel() });
		expect(session.resources.appendSystemMd).toBe("Always answer in haiku.");

		const seen: string[] = [];
		session.subscribe((event) => {
			seen.push(event.type);
		});

		faux.setResponses([fauxAssistantMessage("Hello from the core layer.")]);
		await session.prompt("Say hello.");

		expect(seen).toContain("message_end");
		expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

		// The store is the source of truth: a second AgentSession can replay it.
		const storePath = join(agentDir, "sessions", `${session.session.id}.jsonl`);
		expect(existsSync(storePath)).toBe(true);
		const reopened = await createAgentSession({
			services,
			model: faux.getModel(),
			sessionId: session.session.id,
		});
		expect(reopened.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
	});

	it("resolves a model from stored credentials via the per-provider default table", async () => {
		const agentDir = makeDir("agent");
		const authStorage = new AuthStorage(join(agentDir, "auth.json"));
		const settingsManager = new SettingsManager({ globalPath: join(agentDir, "settings.json") });
		const modelRegistry = createModelRegistry({ getEnv: () => undefined });

		const empty = await resolveModel({ modelRegistry, settingsManager, authStorage });
		expect(empty.model).toBeUndefined();
		expect(empty.diagnostics.some((d) => d.severity === "error")).toBe(true);

		await authStorage.set("anthropic", { type: "api_key", key: "sk-test" });
		const resolved = await resolveModel({ modelRegistry, settingsManager, authStorage });
		expect(resolved.model?.provider).toBe("anthropic");
		expect(resolved.model?.id).toBe("claude-fable-5");

		// An explicit override beats the credential-derived default.
		const overridden = await resolveModel({ modelRegistry, settingsManager, authStorage }, "openai/gpt-5.6");
		expect(overridden.model?.id).toBe("gpt-5.6");
	});

	it("auth storage modify runs the double-check under the lock", async () => {
		const agentDir = makeDir("agent");
		const authStorage = new AuthStorage(join(agentDir, "auth.json"));
		await authStorage.set("anthropic", { type: "oauth", access: "old", refresh: "r", expires: 1000 });

		// Updater returning undefined keeps the stored credential (someone else refreshed).
		const kept = await authStorage.modify("anthropic", async () => undefined);
		expect(kept).toMatchObject({ access: "old" });

		const refreshed = await authStorage.modify("anthropic", async (current) => {
			expect(current).toMatchObject({ access: "old" });
			return { type: "oauth", access: "new", refresh: "r", expires: 9999999999999 };
		});
		expect(refreshed).toMatchObject({ access: "new" });
		expect(await authStorage.get("anthropic")).toMatchObject({ access: "new" });
	});

	it("only applies project config from trusted projects", () => {
		const cwd = makeDir("project");
		const agentDir = makeDir("agent");
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ thinkingLevel: "xhigh" }));

		const untrusted = createAgentSessionServices({ cwd, agentDir });
		expect(untrusted.settingsManager.get().thinkingLevel).toBeUndefined();

		new TrustManager(join(agentDir, "trusted-projects.json")).setTrusted(cwd, true);
		const trusted = createAgentSessionServices({ cwd, agentDir });
		expect(trusted.settingsManager.get().thinkingLevel).toBe("xhigh");
	});
});
