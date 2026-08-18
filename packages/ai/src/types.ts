import type { TSchema } from "typebox";
import type { AssistantMessageEventStream } from "./utils/event-stream.ts";

export interface TextContent {
    type: "text";
    text: string;
    textSignature?: string; // e.g., for OpenAI responses, message metadata
}

export interface ThinkingContent {
    type: "thinking";
    thinking: string;
    thinkingSignature?: string; // e.g., for OpenAI responses, the reasoning item ID
    redacted?: boolean;
}

export interface ImageContent {
    type: "image";
    data: string; // base64 encoded image data
    mimeType: string; // e.g., "image/jpeg", "image/png"
}

export interface ToolCall {
    type: "toolCall";
    id: string;
    name: string;
    arguments: Record<string, any>;
    thoughtSignature?: string; // Google-specific: opaque signature for reusing thought context
}

export type KnownApi =
    | "openai-completions"
    | "openai-responses"
    | "anthropic-messages"
    | "bedrock-converse-stream"
    | "google-generative-ai"
    | "google-vertex"; // ...真实文件中列有九种

export type Api = KnownApi | (string & {});

export type KnownProvider = "anthropic" | "openai" | "google" | "amazon-bedrock" | "groq"; // ...真实文件约有 35 个
export type ProviderId = KnownProvider | string;

export interface Model<TApi extends Api> {
    id: string;
    name: string;
    api: TApi;
    provider: ProviderId;
    baseUrl: string;
    reasoning: boolean;
    input: ("text" | "image")[];
    cost: ModelCost;
    contextWindow: number;
    maxTokens: number;
    headers?: Record<string, string>;
    // compat?: ... — 各 API 的兼容性覆盖，见教程 03
}

export interface Usage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    reasoning?: number;
    totalTokens: number;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
    };
}

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export interface UserMessage {
    role: "user";
    content: string | (TextContent | ImageContent)[];
    timestamp: number; // Unix timestamp in milliseconds
}

export interface AssistantMessage {
    role: "assistant";
    content: (TextContent | ThinkingContent | ToolCall)[];
    api: Api;
    provider: ProviderId;
    model: string;
    usage: Usage;
    stopReason: StopReason;
    errorMessage?: string;
    timestamp: number;
}

export interface ToolResultMessage<TDetails = any> {
    role: "toolResult";
    toolCallId: string;
    toolName: string;
    content: (TextContent | ImageContent)[]; // Supports text and images
    details?: TDetails;
    isError: boolean;
    timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export type AssistantMessageEvent =
    | { type: "start"; partial: AssistantMessage }
    | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
    | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
    | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
    | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
    | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
    | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
    | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
    | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
    | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
    | { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
    | { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };

export interface Tool<TParameters extends TSchema = TSchema> {
    name: string;
    description: string;
    parameters: TParameters;
}

export interface Context {
    systemPrompt?: string;
    messages: Message[];
    tools?: Tool[];
}

// Contract:
// - Must return an AssistantMessageEventStream.
// - Once invoked, request/model/runtime failures should be encoded in the
//   returned stream, not thrown.
// - Error termination must produce an AssistantMessage with stopReason
//   "error" or "aborted" and errorMessage, emitted via the stream protocol.
export type StreamFunction<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> = (
    model: Model<TApi>,
    context: Context,
    options?: TOptions,
) => AssistantMessageEventStream;

export interface ProviderStreams {
    stream(model: Model<Api>, context: Context, options?: StreamOptions): AssistantMessageEventStream;
    streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
}
