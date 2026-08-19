// 占位骨架：真实实现负责把 Context 翻译为 Chat Completions 请求并转回事件流。
import type { Context, Model, SimpleStreamOptions, StreamFunction } from "../types.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";
import { createSetupErrorMessage } from "./lazy.ts";

export const stream: StreamFunction<"openai-completions"> = (model, _context, _options) => {
	const stream = new AssistantMessageEventStream();
	queueMicrotask(() => {
		const message = createSetupErrorMessage(model, new Error("openai-completions streaming not implemented yet"));
		stream.push({ type: "error", reason: "error", error: message });
	});
	return stream;
};

export const streamSimple = (
	model: Model<"openai-completions">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => stream(model, context, options);
