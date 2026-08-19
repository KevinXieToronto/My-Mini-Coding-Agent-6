import type { Api, AssistantMessage, AssistantMessageEvent, Model, ProviderStreams, Usage } from "../types.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";

function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

/** Builds the error-terminated AssistantMessage required by the stream contract. */
export function createSetupErrorMessage(model: Model<Api> | undefined, error: unknown): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model?.api ?? "unknown",
		provider: model?.provider ?? "unknown",
		model: model?.id ?? "unknown",
		usage: emptyUsage(),
		stopReason: "error",
		errorMessage: error instanceof Error ? error.message : String(error),
		timestamp: Date.now(),
	};
}

/** Pipes an inner event stream into an outer one, converting abnormal termination to an error event. */
export async function forwardStream(
	outer: AssistantMessageEventStream,
	inner: AsyncIterable<AssistantMessageEvent>,
	model?: Model<Api>,
): Promise<void> {
	let terminal = false;
	try {
		for await (const event of inner) {
			terminal = event.type === "done" || event.type === "error";
			outer.push(event);
		}
		if (!terminal) {
			const message = createSetupErrorMessage(model, new Error("stream ended without a terminal event"));
			outer.push({ type: "error", reason: "error", error: message });
		}
	} catch (error) {
		const message = createSetupErrorMessage(model, error);
		outer.push({ type: "error", reason: "error", error: message });
	}
}

/**
 * Returns a stream synchronously while running async setup (auth resolution,
 * lazy module loading) behind it. Setup failures terminate the stream with an
 * error event.
 */
export function lazyStream(
	model: Model<Api>,
	setup: () => Promise<AsyncIterable<AssistantMessageEvent>>,
): AssistantMessageEventStream {
	const outer = new AssistantMessageEventStream();

	setup()
		.then((inner) => {
			forwardStream(outer, inner, model);
		})
		.catch((error) => {
			const message = createSetupErrorMessage(model, error);
			outer.push({ type: "error", reason: "error", error: message });
			outer.end(message);
		});

	return outer;
}

/**
 * Wraps a dynamically imported API implementation module as `ProviderStreams`.
 * The module loads on first stream call; the host's import cache deduplicates
 * loads. Load failures terminate the returned stream with an error event.
 */
export function lazyApi(load: () => Promise<ProviderStreams>): ProviderStreams {
	return {
		stream: (model, context, options) =>
			lazyStream(model, async () => (await load()).stream(model, context, options)),
		streamSimple: (model, context, options) =>
			lazyStream(model, async () => (await load()).streamSimple(model, context, options)),
	};
}
