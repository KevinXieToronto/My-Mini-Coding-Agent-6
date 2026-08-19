// 手写的最小目录；真实项目由 scripts/generate-models.ts 生成
import type { Model } from "../types.ts";

export const OPENAI_MODELS = {
    "gpt-5.6": {
        id: "gpt-5.6",
        name: "GPT-5.6",
        api: "openai-responses",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        reasoning: true,
        input: ["text", "image"],
        cost: {
            input: 1.25,
            output: 10,
            cacheRead: 0.125,
            cacheWrite: 0,
        },
        contextWindow: 400000,
        maxTokens: 128000,
    } satisfies Model<"openai-responses">,
} as const;
