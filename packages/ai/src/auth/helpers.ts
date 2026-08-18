export function envApiKeyAuth(name: string, envVars: readonly string[]): ApiKeyAuth {
    return {
        name,
        login: async (callbacks) => {
            const key = await callbacks.prompt({ type: "secret", message: `Enter ${name}` });
            return { type: "api_key", key };
        },
        resolve: async ({ ctx, credential }) => {
            if (credential?.key) return { auth: { apiKey: credential.key }, source: "stored credential" };
            for (const envVar of envVars) {
                const value = await ctx.env(envVar);
                if (value) return { auth: { apiKey: value }, source: envVar };
            }
            return undefined;
        },
    };
}
