import type { Api, AssistantMessageEvent, Model, ProviderStreams } from "../types.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";

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
            forwardStream(outer, inner);
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
