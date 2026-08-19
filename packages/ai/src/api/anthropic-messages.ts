// 占位骨架：真实实现约 1300 行。这里保留第 2 步契约的模板，调用时以 error 事件终止。
import type { AnthropicOptions, Context, Model, SimpleStreamOptions, StreamFunction } from "../types.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";
import { createSetupErrorMessage } from "./lazy.ts";

export const stream: StreamFunction<"anthropic-messages", AnthropicOptions> = (
	model: Model<"anthropic-messages">,
	_context: Context,
	_options?: AnthropicOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	queueMicrotask(() => {
		// 1. 把 Context 翻译为 Anthropic 请求参数（messages、tools、cache_control）
		// 2. 打开 SDK 的 SSE 流
		// 3. 对每个 SDK chunk：更新运行中的 AssistantMessage，
		//    推送对应的 text_/thinking_/toolcall_ 事件
		// 4. 推送 { type: "done", ... } —— 或在 catch 中推送 { type: "error", ... }
		const message = createSetupErrorMessage(model, new Error("anthropic-messages streaming not implemented yet"));
		stream.push({ type: "error", reason: "error", error: message });
	});

	return stream;
};

export const streamSimple = (
	model: Model<"anthropic-messages">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => stream(model, context, options);
