import { join } from "node:path";
import {
	type AgentEvent,
	AgentHarness,
	type AgentMessage,
	type AgentTool,
	createNodeJsExecutionEnv,
	DEFAULT_COMPACTION_SETTINGS,
	type ExecResult,
	type ExecutionEnv,
	jsonlSessionStore,
	planCompaction,
	type Result,
	Session,
	summarizeForCompaction,
} from "@earendil-works/pi-agent-core";
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentSessionServices } from "./agent-session-services.ts";
import { resolveModel } from "./model-resolver.ts";
import type { LoadedResources } from "./resource-loader.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import { createTool } from "./tools/index.ts";

export type AgentSessionSubscriber = (event: AgentEvent) => void | Promise<void>;

export interface CreateAgentSessionOptions {
	services: AgentSessionServices;
	/** Resolved via model-resolver when omitted. */
	model?: Model<Api>;
	thinkingLevel?: ThinkingLevel;
	tools?: AgentTool<any, any>[];
	/** Open an existing session by id; a fresh session is created when omitted. */
	sessionId?: string;
	env?: ExecutionEnv;
}

/**
 * AgentSession - Core abstraction for agent lifecycle and session management.
 *
 * This class is shared between all run modes (interactive, print, rpc).
 * It encapsulates:
 * - Agent state access
 * - Event subscription with automatic session persistence
 * - Model and thinking level management
 * - Compaction (manual and auto)
 * - Bash execution
 * - Session switching and branching
 *
 * Modes use this class and add their own I/O layer on top.
 */
export class AgentSession {
	readonly services: AgentSessionServices;
	readonly resources: LoadedResources;

	private env: ExecutionEnv;
	private tools: AgentTool<any, any>[];
	private harness: AgentHarness;
	private subscribers: AgentSessionSubscriber[] = [];
	private unsubscribeFromHarness: () => void;

	constructor(options: {
		services: AgentSessionServices;
		resources: LoadedResources;
		env: ExecutionEnv;
		tools: AgentTool<any, any>[];
		session: Session;
		model: Model<Api>;
		thinkingLevel: ThinkingLevel;
	}) {
		this.services = options.services;
		this.resources = options.resources;
		this.env = options.env;
		this.tools = options.tools;
		this.harness = this.buildHarness(options.session, options.model, options.thinkingLevel);
		this.unsubscribeFromHarness = this.forwardHarnessEvents();
	}

	// ---- State access ----

	get session(): Session {
		return this.harness.session;
	}

	get model(): Model<Api> {
		return this.harness.model;
	}

	get thinkingLevel(): ThinkingLevel {
		return this.harness.thinkingLevel;
	}

	/** Messages the model would see right now (current path, projected). */
	get messages(): AgentMessage[] {
		return this.harness.getContextMessages();
	}

	// ---- Events ----

	/** Subscribers survive session switches; message persistence is automatic (harness → store). */
	subscribe(subscriber: AgentSessionSubscriber): () => void {
		this.subscribers.push(subscriber);
		return () => {
			this.subscribers = this.subscribers.filter((s) => s !== subscriber);
		};
	}

	// ---- Prompting ----

	prompt(input: string | AgentMessage): Promise<void> {
		return this.harness.prompt(input);
	}

	abort(): void {
		this.harness.abort();
	}

	// ---- Model and thinking level management ----

	/** Switches the model for this session and persists it as the user's default. */
	setModel(model: Model<Api>): void {
		this.harness.setModel(model);
		this.services.settingsManager.setDefaultModel(model.provider, model.id);
	}

	setThinkingLevel(thinkingLevel: ThinkingLevel): void {
		this.harness.setThinkingLevel(thinkingLevel);
		this.services.settingsManager.setThinkingLevel(thinkingLevel);
	}

	// ---- Compaction (auto-compaction runs inside the harness after each prompt) ----

	/** Manual compaction: summarize the older part of the context now. Returns false when there is nothing to cut. */
	async compact(signal?: AbortSignal): Promise<boolean> {
		const contextEntries = this.session.getPathEntries();
		const plan = planCompaction(contextEntries, DEFAULT_COMPACTION_SETTINGS);
		if (plan.summarizedEntryIds.length === 0) return false;
		const fields = await summarizeForCompaction(
			contextEntries,
			plan,
			this.services.modelRegistry,
			this.model,
			signal,
		);
		this.session.append(fields);
		return true;
	}

	// ---- Bash execution ----

	executeBash(command: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<Result<ExecResult, string>> {
		return this.env.exec(command, { cwd: this.services.cwd, ...options });
	}

	// ---- Session switching and branching ----

	/** Start a fresh session (same model, tools, and subscribers). */
	newSession(title?: string): Session {
		const id = crypto.randomUUID();
		const session = Session.create({
			id,
			title,
			cwd: this.services.cwd,
			store: jsonlSessionStore(sessionFilePath(this.services.agentDir, id)),
		});
		this.switchTo(session);
		return session;
	}

	/** Replay a previously stored session by id. */
	async openSession(sessionId: string): Promise<Session> {
		const session = await Session.open(jsonlSessionStore(sessionFilePath(this.services.agentDir, sessionId)));
		this.switchTo(session);
		return session;
	}

	/** Move the leaf to an older entry; the next prompt branches from there. */
	navigateTo(entryId: string): Promise<boolean> {
		return this.harness.navigateTo(entryId);
	}

	// ---- Internals ----

	private switchTo(session: Session): void {
		this.unsubscribeFromHarness();
		this.harness = this.buildHarness(session, this.harness.model, this.harness.thinkingLevel);
		this.unsubscribeFromHarness = this.forwardHarnessEvents();
	}

	private buildHarness(session: Session, model: Model<Api>, thinkingLevel: ThinkingLevel): AgentHarness {
		return new AgentHarness({
			env: this.env,
			session,
			models: this.services.modelRegistry,
			tools: this.tools,
			resources: { skills: this.resources.skills, promptTemplates: this.resources.promptTemplates },
			systemPrompt: (context) =>
				buildSystemPrompt({
					cwd: this.services.cwd,
					modelName: context.model.name,
					toolNames: context.activeTools.map((tool) => tool.name),
					systemMd: this.resources.systemMd,
					appendSystemMd: this.resources.appendSystemMd,
				}),
			model,
			thinkingLevel,
		});
	}

	private forwardHarnessEvents(): () => void {
		return this.harness.subscribe(async (event) => {
			for (const subscriber of this.subscribers) await subscriber(event);
		});
	}
}

/**
 * Phase 2 of construction (see agent-session-services.ts): make the
 * session-shaped decisions on top of ready services. Resource and model
 * problems degrade to diagnostics where possible; only "no model at all"
 * is fatal.
 */
export async function createAgentSession(options: CreateAgentSessionOptions): Promise<AgentSession> {
	const { services } = options;
	const env = options.env ?? createNodeJsExecutionEnv({ cwd: services.cwd });

	const resources = await services.resourceLoader.load();
	for (const error of resources.errors) {
		services.diagnostics.push({ severity: "warning", source: "resources", message: error });
	}

	let model = options.model;
	if (!model) {
		const resolution = await resolveModel(services);
		services.diagnostics.push(...resolution.diagnostics);
		model = resolution.model;
	}
	if (!model) {
		throw new Error("No model available. Log in or set an API key for a supported provider.");
	}

	let session: Session;
	if (options.sessionId) {
		session = await Session.open(jsonlSessionStore(sessionFilePath(services.agentDir, options.sessionId)));
	} else {
		const id = crypto.randomUUID();
		session = Session.create({
			id,
			cwd: services.cwd,
			store: jsonlSessionStore(sessionFilePath(services.agentDir, id)),
		});
	}

	return new AgentSession({
		services,
		resources,
		env,
		tools: options.tools ?? [createTool("read", services.cwd)],
		session,
		model,
		thinkingLevel: options.thinkingLevel ?? services.settingsManager.get().thinkingLevel ?? "off",
	});
}

function sessionFilePath(agentDir: string, sessionId: string): string {
	return join(agentDir, "sessions", `${sessionId}.jsonl`);
}
