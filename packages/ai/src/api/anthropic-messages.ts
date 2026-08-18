// 占位骨架：真实实现约 1300 行，这里只保留第 2 步契约的模板。
import type { Context, Model, StreamFunction } from "../types.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";

export const stream: StreamFunction<"anthropic-messages", AnthropicOptions> = (
    model: Model<"anthropic-messages">,
    context: Context,
    options?: AnthropicOptions,
): AssistantMessageEventStream => {
    const stream = new AssistantMessageEventStream();

    (async () => {
        // 1. 把 Context 翻译为 Anthropic 请求参数（messages、tools、cache_control）
        // 2. 打开 SDK 的 SSE 流
        // 3. 对每个 SDK chunk：更新运行中的 AssistantMessage，
        //    推送对应的 text_/thinking_/toolcall_ 事件
        // 4. 推送 { type: "done", ... } —— 或在 catch 中推送 { type: "error", ... }
    })();

    return stream;
};
