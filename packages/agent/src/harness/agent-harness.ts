import {
	type Api,
	type AssistantMessage,
	lazyStream,
	type Model,
	type Models,
	type SimpleStreamOptions,
	type ThinkingLevel,
} from "@earendil-works/pi-ai";
import { agentLoop } from "../agent-loop.ts";
import type { AgentEvent, AgentMessage, AgentTool } from "../types.ts";
import { planCompaction, shouldCompact, summarizeForCompaction } from "./compaction/compaction.ts";
import type { CompactionSettings } from "./compaction/types.ts";
import { DEFAULT_COMPACTION_SETTINGS } from "./compaction/types.ts";
import type { AgentHarnessEvent, AgentHarnessEventResultMap, AgentHarnessHooks } from "./events.ts";
import type { PromptTemplate } from "./prompt-templates.ts";
import { defaultContextEntryTransform, sessionEntriesToMessages } from "./session/context.ts";
import type { Session } from "./session/session.ts";
import type { SessionTreeEntry } from "./session/types.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";
import type { ExecutionEnv } from "./types.ts";

export interface AgentHarnessResources<
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
> {
	skills?: TSkill[];
	promptTemplates?: TPromptTemplate[];
}

export interface SystemPromptContext {
	env: ExecutionEnv;
	session: Session;
	model: Model<Api>;
	thinkingLevel: ThinkingLevel;
	activeTools: readonly AgentTool<any, any>[];
	resources: AgentHarnessResources;
}

export type AgentHarnessStreamOptions = Omit<SimpleStreamOptions, "signal">;

export interface AgentHarnessOptions<
	TTool extends AgentTool<any, any> = AgentTool<any, any>,
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
> {
	env: ExecutionEnv;
	session: Session;
	/** Provider collection used for all model requests (turn streaming, compaction, branch summarization). */
	models: Models;
	tools?: TTool[];
	resources?: AgentHarnessResources<TSkill, TPromptTemplate>;
	systemPrompt?: string | ((context: SystemPromptContext) => string | Promise<string>);
	streamOptions?: AgentHarnessStreamOptions;
	model: Model<any>;
	thinkingLevel?: ThinkingLevel;
	hooks?: AgentHarnessHooks;
	compaction?: Partial<CompactionSettings>;
	/** Override the path→context projection; defaults to `defaultContextEntryTransform`. */
	contextEntryTransform?: (pathEntries: readonly SessionTreeEntry[]) => SessionTreeEntry[];
}

export type AgentHarnessSubscriber = (event: AgentEvent) => void | Promise<void>;

/**
 * Ties the pieces together: the session tree is the source of truth, each prompt
 * projects the current path into agent-loop messages, new messages are persisted
 * back as entries, and compaction runs when the projected context outgrows the
 * model's window. Hooks let the application observe and intervene.
 */
export class AgentHarness<
	TTool extends AgentTool<any, any> = AgentTool<any, any>,
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
> {
	readonly env: ExecutionEnv;
	readonly session: Session;
	readonly models: Models;
	readonly resources: AgentHarnessResources<TSkill, TPromptTemplate>;

	private tools: TTool[];
	private activeToolNames: Set<string> | null = null; // null = all tools active
	private hooks: AgentHarnessHooks;
	private compaction: CompactionSettings;
	private contextEntryTransform: (pathEntries: readonly SessionTreeEntry[]) => SessionTreeEntry[];
	private systemPromptOption?: AgentHarnessOptions<TTool, TSkill, TPromptTemplate>["systemPrompt"];
	private streamOptions?: AgentHarnessStreamOptions;
	private subscribers: AgentHarnessSubscriber[] = [];
	private abortController?: AbortController;

	model: Model<any>;
	thinkingLevel: ThinkingLevel;

	constructor(options: AgentHarnessOptions<TTool, TSkill, TPromptTemplate>) {
		this.env = options.env;
		this.session = options.session;
		this.models = options.models;
		this.tools = options.tools ?? [];
		this.resources = options.resources ?? {};
		this.systemPromptOption = options.systemPrompt;
		this.streamOptions = options.streamOptions;
		this.model = options.model;
		this.thinkingLevel = options.thinkingLevel ?? "off";
		this.hooks = options.hooks ?? {};
		this.compaction = { ...DEFAULT_COMPACTION_SETTINGS, ...options.compaction };
		this.contextEntryTransform = options.contextEntryTransform ?? defaultContextEntryTransform;
	}

	subscribe(subscriber: AgentHarnessSubscriber): () => void {
		this.subscribers.push(subscriber);
		return () => {
			this.subscribers = this.subscribers.filter((s) => s !== subscriber);
		};
	}

	abort(): void {
		this.abortController?.abort();
	}

	getActiveTools(): TTool[] {
		if (this.activeToolNames === null) return [...this.tools];
		return this.tools.filter((tool) => this.activeToolNames!.has(tool.name));
	}

	// ---- Session-mutating state changes: each is recorded as a tree entry ----

	setModel(model: Model<any>): void {
		this.model = model;
		this.session.append({ type: "model-change", provider: model.provider, modelId: model.id });
	}

	setThinkingLevel(thinkingLevel: ThinkingLevel): void {
		this.thinkingLevel = thinkingLevel;
		this.session.append({ type: "thinking-level-change", thinkingLevel });
	}

	setActiveTools(toolNames: string[] | null): void {
		this.activeToolNames = toolNames === null ? null : new Set(toolNames);
		this.session.append({
			type: "active-tools-change",
			activeTools: this.getActiveTools().map((tool) => tool.name),
		});
	}

	/** Move the session leaf (branch navigation); interceptable via `session_before_tree`. */
	async navigateTo(entryId: string): Promise<boolean> {
		const verdict = await this.dispatch({ type: "session_before_tree", targetEntryId: entryId });
		if (verdict?.cancel) return false;
		this.session.setLeaf(verdict?.targetEntryId ?? entryId);
		return true;
	}

	/** Messages the model would see right now: current path, projected. */
	getContextMessages(): AgentMessage[] {
		return sessionEntriesToMessages(this.contextEntryTransform(this.session.getPathEntries()));
	}

	getPromptTemplate(name: string): TPromptTemplate | undefined {
		return this.resources.promptTemplates?.find((template) => template.name === name);
	}

	/** Run one prompt through the agent loop; resolves when the loop stops. */
	async prompt(input: string | AgentMessage): Promise<void> {
		let message: AgentMessage =
			typeof input === "string" ? { role: "user", content: input, timestamp: Date.now() } : input;

		let systemPromptOverride: string | undefined;
		const startResult = await this.dispatch({ type: "before_agent_start", prompt: message });
		if (startResult?.prompt) message = startResult.prompt;
		if (startResult?.systemPrompt !== undefined) systemPromptOverride = startResult.systemPrompt;

		// The session is the source of truth: persist the prompt, then project the
		// path (minus the prompt itself, which the loop injects) into messages.
		const promptEntry = this.session.appendMessage(message);
		const pathEntries = this.session.getPathEntries().filter((entry) => entry.id !== promptEntry.id);
		const messages = sessionEntriesToMessages(this.contextEntryTransform(pathEntries));

		const persisted = new Set<AgentMessage>([message, ...messages]);
		const activeTools = this.getActiveTools().map((tool) => this.wrapTool(tool));
		const systemPrompt = systemPromptOverride ?? (await this.resolveSystemPrompt());

		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		const loop = agentLoop(
			[message],
			{ systemPrompt, messages, tools: activeTools },
			{
				...this.streamOptions,
				model: this.model,
				reasoning: this.thinkingLevel === "off" ? undefined : this.thinkingLevel,
				convertToLlm: (agentMessages) =>
					agentMessages.filter(
						(m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult",
					) as any,
				transformContext: async (agentMessages) => {
					const result = await this.dispatch({ type: "context", messages: [...agentMessages] });
					return result?.messages ?? agentMessages;
				},
			},
			signal,
			(model, context, options) =>
				lazyStream(model, async () => {
					const patch = await this.dispatch({
						type: "before_provider_request",
						model,
						streamOptions: { ...options },
					});
					const merged: SimpleStreamOptions = {
						...options,
						...patch?.streamOptions,
						headers: { ...options?.headers, ...patch?.headers },
					};
					return this.models.streamSimple(model, context, merged);
				}),
		);

		for await (const event of loop) {
			if (event.type === "message_end" && !persisted.has(event.message)) {
				persisted.add(event.message);
				this.session.appendMessage(event.message);
			}
			for (const subscriber of this.subscribers) await subscriber(event);
			await this.dispatch({ type: "agent_event", event });
		}

		await this.maybeCompact(signal);
	}

	// ---- Internals ----

	private dispatch<TEvent extends AgentHarnessEvent>(
		event: TEvent,
	): Promise<AgentHarnessEventResultMap[TEvent["type"]] | undefined> {
		const handler = this.hooks[event.type] as
			| ((
					e: TEvent,
			  ) =>
					| AgentHarnessEventResultMap[TEvent["type"]]
					| undefined
					| Promise<AgentHarnessEventResultMap[TEvent["type"]] | undefined>)
			| undefined;
		return Promise.resolve(handler ? handler(event) : undefined);
	}

	private async resolveSystemPrompt(): Promise<string | undefined> {
		let base: string | undefined;
		if (typeof this.systemPromptOption === "function") {
			base = await this.systemPromptOption({
				env: this.env,
				session: this.session,
				model: this.model,
				thinkingLevel: this.thinkingLevel,
				activeTools: this.getActiveTools(),
				resources: this.resources,
			});
		} else {
			base = this.systemPromptOption;
		}
		const skillsSection = formatSkillsForPrompt(this.resources.skills ?? []);
		if (!skillsSection) return base;
		return base ? `${base}\n\n${skillsSection}` : skillsSection;
	}

	private wrapTool(tool: TTool): TTool {
		return {
			...tool,
			execute: async (toolCallId, params, signal, onUpdate) => {
				const verdict = await this.dispatch({ type: "tool_call", toolCallId, toolName: tool.name, args: params });
				if (verdict?.block) {
					throw new Error(verdict.reason ?? `Tool call blocked by application: ${tool.name}`);
				}
				const result = await tool.execute(toolCallId, params, signal, onUpdate);
				const patch = await this.dispatch({
					type: "tool_result",
					toolCallId,
					toolName: tool.name,
					result,
					isError: false,
				});
				return patch?.result ?? result;
			},
		};
	}

	private async maybeCompact(signal?: AbortSignal): Promise<void> {
		if (!this.compaction.enabled) return;
		const contextEntries = this.contextEntryTransform(this.session.getPathEntries());
		const usedTokens = this.currentContextTokens(contextEntries);
		if (!shouldCompact(usedTokens, this.model, this.compaction)) return;

		const verdict = await this.dispatch({
			type: "session_before_compact",
			contextEntries,
			settings: this.compaction,
		});
		if (verdict?.cancel) return;

		const plan = planCompaction(contextEntries, this.compaction);
		if (plan.summarizedEntryIds.length === 0) return;

		const fields = verdict?.replacement
			? {
					type: "compaction" as const,
					summary: verdict.replacement.summary,
					firstKeptEntryId: verdict.replacement.firstKeptEntryId,
					tokensBefore: plan.tokensBefore,
				}
			: await summarizeForCompaction(contextEntries, plan, this.models, this.model, signal);
		this.session.append(fields);
	}

	/** Prefer provider-reported usage from the last assistant turn; fall back to estimation. */
	private currentContextTokens(contextEntries: readonly SessionTreeEntry[]): number {
		for (let i = contextEntries.length - 1; i >= 0; i--) {
			const entry = contextEntries[i]!;
			if (entry.type === "message" && entry.message.role === "assistant") {
				const usage = (entry.message as AssistantMessage).usage;
				if (usage && usage.totalTokens > 0) return usage.totalTokens;
			}
		}
		return sessionEntriesToMessages(contextEntries).reduce(
			(sum, m) => sum + Math.ceil(JSON.stringify(m).length / 4),
			0,
		);
	}
}
