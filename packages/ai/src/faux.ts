import { createProvider, type Provider } from "./models.ts";
import type { Api, AssistantMessage, Model, ProviderStreams, TextContent, Usage } from "./types.ts";
import { AssistantMessageEventStream } from "./utils/event-stream.ts";

function fauxUsage(outputTokens: number): Usage {
	return {
		input: 0,
		output: outputTokens,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: outputTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

/** A canned assistant response for tests; output tokens are a rough estimate from text length. */
export function fauxAssistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "faux",
		provider: "faux",
		model: "faux-1",
		usage: fauxUsage(Math.max(1, Math.ceil(text.length / 4))),
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

export interface FauxProvider {
	provider: Provider;
	setResponses(responses: AssistantMessage[]): void;
	getModel(): Model<Api>;
}

/** In-memory provider that replays queued responses through the real stream protocol. */
export function fauxProvider(): FauxProvider {
	const responses: AssistantMessage[] = [];

	const model: Model<Api> = {
		id: "faux-1",
		name: "Faux Model",
		api: "faux",
		provider: "faux",
		baseUrl: "faux://localhost",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
	};

	const replay = (): AssistantMessageEventStream => {
		const stream = new AssistantMessageEventStream();
		const response = responses.shift();
		queueMicrotask(() => {
			if (!response) {
				const message: AssistantMessage = {
					...fauxAssistantMessage(""),
					content: [],
					stopReason: "error",
					errorMessage: "faux provider has no queued responses",
				};
				stream.push({ type: "error", reason: "error", error: message });
				return;
			}
			const partial: AssistantMessage = { ...response, content: [] };
			stream.push({ type: "start", partial });
			let contentIndex = 0;
			for (const block of response.content) {
				if (block.type === "text") {
					const running: TextContent = { type: "text", text: "" };
					partial.content.push(running);
					stream.push({ type: "text_start", contentIndex, partial });
					for (let i = 0; i < block.text.length; i += 8) {
						const delta = block.text.slice(i, i + 8);
						running.text += delta;
						stream.push({ type: "text_delta", contentIndex, delta, partial });
					}
					stream.push({ type: "text_end", contentIndex, content: block.text, partial });
				} else {
					partial.content.push(block);
				}
				contentIndex++;
			}
			const reason =
				response.stopReason === "toolUse" || response.stopReason === "length" ? response.stopReason : "stop";
			stream.push({ type: "done", reason, message: response });
		});
		return stream;
	};

	const api: ProviderStreams = {
		stream: () => replay(),
		streamSimple: () => replay(),
	};

	const provider = createProvider({ id: "faux", name: "Faux", auth: {}, models: [model], api });

	return {
		provider,
		setResponses: (messages) => {
			responses.length = 0;
			responses.push(...messages);
		},
		getModel: () => model,
	};
}
