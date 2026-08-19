import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createModels, fauxProvider } from "@earendil-works/pi-ai";

/**
 * Shared suite-test harness: a real agent wired to the faux provider.
 * Never touches real provider APIs, keys, or paid tokens.
 */
export interface HarnessOptions {
	tools?: AgentTool<any, any>[];
	systemPrompt?: string;
}

export interface Harness {
	session: {
		prompt(input: string): Promise<void>;
		readonly messages: AgentMessage[];
	};
	setResponses(responses: AssistantMessage[]): void;
	cleanup(): void;
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);

	const agent = new Agent({
		initialState: {
			model: faux.getModel(),
			tools: options.tools ?? [],
			systemPrompt: options.systemPrompt ?? "You are a coding agent.",
		},
		streamFn: (model, context, streamOptions) => models.streamSimple(model, context, streamOptions),
	});

	return {
		session: {
			prompt: (input) => agent.prompt(input),
			get messages() {
				return agent.state.messages;
			},
		},
		setResponses: (responses) => faux.setResponses(responses),
		cleanup: () => {},
	};
}

/** Concatenated text content of a message; ignores non-text blocks. */
export function getMessageText(message: AgentMessage): string {
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block): block is { type: "text"; text: string } => block?.type === "text")
		.map((block) => block.text)
		.join("\n");
}
