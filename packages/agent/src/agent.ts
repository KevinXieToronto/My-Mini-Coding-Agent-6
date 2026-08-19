import type { Message, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { agentLoop } from "./agent-loop.ts";
import type { AgentContext, AgentEvent, AgentMessage, AgentTool, StreamFn } from "./types.ts";

export interface AgentState {
	systemPrompt?: string;
	model: Model<any>;
	tools: AgentTool<any, any>[];
	messages: AgentMessage[];
}

export interface AgentOptions {
	initialState: {
		systemPrompt?: string;
		model: Model<any>;
		tools?: AgentTool<any, any>[];
		messages?: AgentMessage[];
	};
	streamFn: StreamFn;
	streamOptions?: SimpleStreamOptions;
}

export type AgentSubscriber = (event: AgentEvent, signal?: AbortSignal) => void | Promise<void>;

export class Agent {
	readonly state: AgentState;
	private streamFn: StreamFn;
	private streamOptions?: SimpleStreamOptions;
	private subscribers: AgentSubscriber[] = [];
	private steeringQueue: AgentMessage[] = [];
	private followUpQueue: AgentMessage[] = [];
	private abortController?: AbortController;
	private running: Promise<void> = Promise.resolve();

	constructor(options: AgentOptions) {
		this.state = {
			systemPrompt: options.initialState.systemPrompt,
			model: options.initialState.model,
			tools: options.initialState.tools ?? [],
			messages: options.initialState.messages ?? [],
		};
		this.streamFn = options.streamFn;
		this.streamOptions = options.streamOptions;
	}

	/** Register an event listener; returns an unsubscribe function. */
	subscribe(subscriber: AgentSubscriber): () => void {
		this.subscribers.push(subscriber);
		return () => {
			this.subscribers = this.subscribers.filter((s) => s !== subscriber);
		};
	}

	/** Queue a message to inject into the running loop before its next LLM call. */
	steer(message: AgentMessage): void {
		this.steeringQueue.push(message);
	}

	/** Queue a message that restarts the loop after it would otherwise stop. */
	followUp(message: AgentMessage): void {
		this.followUpQueue.push(message);
	}

	/** Abort the current run. */
	abort(): void {
		this.abortController?.abort();
	}

	/** Resolves when the current run (if any) has finished. */
	async waitForIdle(): Promise<void> {
		await this.running;
	}

	/** Run the agent loop with a new user message; resolves when the loop stops. */
	async prompt(input: string | AgentMessage): Promise<void> {
		const message: AgentMessage =
			typeof input === "string" ? { role: "user", content: input, timestamp: Date.now() } : input;
		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		const context: AgentContext = {
			systemPrompt: this.state.systemPrompt,
			messages: this.state.messages,
			tools: this.state.tools,
		};

		const loop = agentLoop(
			[message],
			context,
			{
				...this.streamOptions,
				model: this.state.model,
				convertToLlm: (messages) => messages.filter(isLlmMessage),
				getSteeringMessages: () => this.steeringQueue.splice(0),
				getFollowUpMessages: () => this.followUpQueue.splice(0),
			},
			signal,
			this.streamFn,
		);

		this.running = (async () => {
			for await (const event of loop) {
				for (const subscriber of this.subscribers) {
					await subscriber(event, signal);
				}
			}
		})();
		await this.running;
	}
}

function isLlmMessage(message: AgentMessage): message is Message {
	return message.role === "user" || message.role === "assistant" || message.role === "toolResult";
}
