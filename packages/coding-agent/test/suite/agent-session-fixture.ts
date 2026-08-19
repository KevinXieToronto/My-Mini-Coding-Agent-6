import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FauxProvider, fauxProvider } from "@earendil-works/pi-ai";
import {
	type AgentSession,
	type AgentSessionServices,
	createAgentSession,
	createAgentSessionServices,
} from "../../src/core/index.ts";

export interface CoreSessionFixture {
	cwd: string;
	agentDir: string;
	services: AgentSessionServices;
	faux: FauxProvider;
	session: AgentSession;
	cleanup(): void;
}

/** A full AgentSession over temp directories and the faux provider. */
export async function createCoreSessionFixture(): Promise<CoreSessionFixture> {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const cwd = join(tmpdir(), `core-fixture-project-${stamp}`);
	const agentDir = join(tmpdir(), `core-fixture-agent-${stamp}`);
	mkdirSync(cwd, { recursive: true });
	mkdirSync(agentDir, { recursive: true });

	const services = createAgentSessionServices({ cwd, agentDir });
	const faux = fauxProvider();
	services.modelRegistry.setProvider(faux.provider);
	const session = await createAgentSession({ services, model: faux.getModel() });

	return {
		cwd,
		agentDir,
		services,
		faux,
		session,
		cleanup: () => {
			rmSync(cwd, { recursive: true, force: true });
			rmSync(agentDir, { recursive: true, force: true });
		},
	};
}
