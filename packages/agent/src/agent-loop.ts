import {
	type AssistantMessage,
	type Context,
	EventStream,
	type SimpleStreamOptions,
	type ToolCall,
	type ToolResultMessage,
} from "@earendil-works/pi-ai";
import type { AgentContext, AgentEvent, AgentLoopConfig, AgentMessage, AgentTool, StreamFn } from "./types.ts";

type Emit = (event: AgentEvent) => void;

/** 循环是自由函数，不是类——状态进，事件出。新消息会被追加到传入的 context.messages。 */
export function agentLoop(
	prompts: AgentMessage[],
	context: AgentContext,
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
	const stream = new EventStream<AgentEvent, AgentMessage[]>(
		(event) => event.type === "agent_end",
		(event) => (event.type === "agent_end" ? event.messages : []),
	);
	run(prompts, context, config, (event) => stream.push(event), signal, streamFn);
	return stream;
}

async function run(
	prompts: AgentMessage[],
	context: AgentContext,
	config: AgentLoopConfig,
	emit: Emit,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): Promise<void> {
	const newMessages: AgentMessage[] = [];
	emit({ type: "agent_start" });

	const addMessage = (message: AgentMessage): void => {
		context.messages.push(message);
		newMessages.push(message);
		emit({ type: "message_start", message });
		emit({ type: "message_end", message });
	};

	try {
		if (!streamFn) throw new Error("agentLoop requires a streamFn");

		// Check for steering messages at start (user may have typed while waiting)
		let pendingMessages: AgentMessage[] = [...prompts, ...((await config.getSteeringMessages?.()) || [])];

		// Outer loop: continues when queued follow-up messages arrive after agent would stop
		while (true) {
			let hasMoreToolCalls = true;

			// Inner loop: process tool calls and steering messages
			while (hasMoreToolCalls || pendingMessages.length > 0) {
				// 1. 把待处理消息注入上下文
				for (const message of pendingMessages) addMessage(message);
				pendingMessages = [];

				emit({ type: "turn_start" });
				await config.prepareNextTurn?.(context.messages);

				// 2. 流式产出一次 assistant 响应
				const message = await streamAssistantResponse(context, config, signal, emit, streamFn);
				context.messages.push(message);
				newMessages.push(message);

				if (message.stopReason === "error" || message.stopReason === "aborted") {
					emit({ type: "turn_end", message, toolResults: [] });
					emit({ type: "agent_end", messages: newMessages });
					return;
				}

				// 3. 执行工具调用，把结果追加到上下文
				const toolCalls = message.content.filter((block): block is ToolCall => block.type === "toolCall");
				const toolResults: ToolResultMessage[] = [];
				for (const call of toolCalls) {
					const result = await executeToolCall(call, context.tools ?? [], emit, signal);
					context.messages.push(result);
					newMessages.push(result);
					emit({ type: "message_start", message: result });
					emit({ type: "message_end", message: result });
					toolResults.push(result);
				}
				hasMoreToolCalls = toolCalls.length > 0;

				// 4. 发出 turn_end；咨询 shouldStopAfterTurn / 拉取转向消息
				emit({ type: "turn_end", message, toolResults });
				if (await config.shouldStopAfterTurn?.(newMessages)) {
					hasMoreToolCalls = false;
					pendingMessages = [];
					break;
				}
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
	} catch (error) {
		emit({ type: "agent_end", messages: newMessages });
		throw error;
	}
	emit({ type: "agent_end", messages: newMessages });
}

async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: Emit,
	streamFn: StreamFn,
): Promise<AssistantMessage> {
	let messages = context.messages;
	if (config.transformContext) messages = await config.transformContext(messages, signal);
	const llmMessages = await config.convertToLlm(messages);
	const llmContext: Context = {
		systemPrompt: context.systemPrompt,
		messages: llmMessages,
		tools: context.tools,
	};
	const options: SimpleStreamOptions = {
		apiKey: config.apiKey,
		baseUrl: config.baseUrl,
		maxTokens: config.maxTokens,
		temperature: config.temperature,
		headers: config.headers,
		reasoning: config.reasoning,
		signal,
	};

	const stream = streamFn(config.model, llmContext, options);
	let started = false;
	for await (const event of stream) {
		if ("partial" in event) {
			if (!started) {
				started = true;
				emit({ type: "message_start", message: event.partial });
			}
			emit({ type: "message_update", message: event.partial, assistantMessageEvent: event });
		}
	}
	const message = await stream.result();
	emit({ type: "message_end", message });
	return message;
}

async function executeToolCall(
	call: ToolCall,
	tools: AgentTool<any, any>[],
	emit: Emit,
	signal?: AbortSignal,
): Promise<ToolResultMessage> {
	emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.arguments });
	try {
		const tool = tools.find((t) => t.name === call.name);
		if (!tool) throw new Error(`Unknown tool: ${call.name}`);
		const params = tool.prepareArguments ? tool.prepareArguments(call.arguments) : call.arguments;
		const result = await tool.execute(call.id, params, signal, (partialResult) => {
			emit({
				type: "tool_execution_update",
				toolCallId: call.id,
				toolName: call.name,
				args: call.arguments,
				partialResult,
			});
		});
		emit({ type: "tool_execution_end", toolCallId: call.id, toolName: call.name, result, isError: false });
		return {
			role: "toolResult",
			toolCallId: call.id,
			toolName: call.name,
			content: result.content,
			details: result.details,
			isError: false,
			timestamp: Date.now(),
		};
	} catch (error) {
		const text = error instanceof Error ? error.message : String(error);
		emit({ type: "tool_execution_end", toolCallId: call.id, toolName: call.name, result: text, isError: true });
		return {
			role: "toolResult",
			toolCallId: call.id,
			toolName: call.name,
			content: [{ type: "text", text }],
			isError: true,
			timestamp: Date.now(),
		};
	}
}
