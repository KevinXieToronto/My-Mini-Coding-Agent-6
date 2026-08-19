// NOTE: 目前只有教程给出的签名与循环骨架片段，完整实现待补。

/*
循环是自由函数，不是类——状态进，事件出：

export function agentLoop(
    prompts: AgentMessage[],
    context: AgentContext,
    config: AgentLoopConfig,
    signal?: AbortSignal,
    streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]>

循环主体骨架：

// Check for steering messages at start (user may have typed while waiting)
let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || [];

// Outer loop: continues when queued follow-up messages arrive after agent would stop
while (true) {
    let hasMoreToolCalls = true;

    // Inner loop: process tool calls and steering messages
    while (hasMoreToolCalls || pendingMessages.length > 0) {
        // 1. 把待处理消息注入上下文
        // 2. 流式产出一次 assistant 响应
        const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFn);

        if (message.stopReason === "error" || message.stopReason === "aborted") {
            await emit({ type: "turn_end", message, toolResults: [] });
            await emit({ type: "agent_end", messages: newMessages });
            return;
        }

        // 3. 执行工具调用，把结果追加到上下文
        // 4. 发出 turn_end；咨询 prepareNextTurn / shouldStopAfterTurn
        pendingMessages = (await config.getSteeringMessages?.()) || [];
    }

    // Agent would stop here. Check for follow-up messages.
    const followUpMessages = (await config.getFollowUpMessages?.()) || [];
    if (followUpMessages.length > 0) {
        pendingMessages = followUpMessages;
        continue;
    }
    break;
}
*/
