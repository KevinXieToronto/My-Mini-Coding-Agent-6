import type { OAuthAuth } from "../../auth/types.ts";

/** OAuth 登录流程尚未实现；返回 undefined 表示未配置（认证会退回到 API key）。 */
export async function loadAnthropicOAuth(): Promise<OAuthAuth | undefined> {
	return undefined;
}
