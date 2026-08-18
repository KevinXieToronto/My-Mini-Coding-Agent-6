import { builtinModels, getBuiltinModel } from "./src/providers/all.ts";

const models = builtinModels();
console.log(`${models.getProviders().length} providers, ${models.getModels().length} models`);

const fable = getBuiltinModel("anthropic", "claude-fable-5");
console.log(fable.name, "| context:", fable.contextWindow, "| $ per Mtok in:", fable.cost.input);

const auth = await models.getAuth(fable);
console.log("auth:", auth ? `configured via ${auth.source}` : "not configured");

// OpenAI：同一个注册表、同一条认证管线，key 来自 OPENAI_API_KEY。
const gpt = getBuiltinModel("openai", "gpt-5.6"); // 从 openai.models.ts 里任选一个 id——id 会随目录漂移
const openaiAuth = await models.getAuth(gpt);
console.log("openai auth:", openaiAuth ? `configured via ${openaiAuth.source}` : "not configured");
