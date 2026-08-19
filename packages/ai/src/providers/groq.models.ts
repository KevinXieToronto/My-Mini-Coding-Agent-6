// 手写的最小目录；真实项目由 scripts/generate-models.ts 生成
import type { Model } from "../types.ts";

export const GROQ_MODELS = {
    "llama-3.3-70b-versatile": {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B Versatile",
        api: "openai-completions",
        provider: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        reasoning: false,
        input: ["text"],
        cost: {
            input: 0.59,
            output: 0.79,
            cacheRead: 0,
            cacheWrite: 0,
        },
        contextWindow: 131072,
        maxTokens: 32768,
    } satisfies Model<"openai-completions">,
} as const;
