export interface AuthResult {
	auth: { apiKey?: string; oauthToken?: string };
	/** Where the credential came from, e.g. "ANTHROPIC_API_KEY" or "stored credential". */
	source: string;
}

export interface LoginCallbacks {
	prompt(options: { type: "secret" | "text"; message: string }): Promise<string>;
}

export interface ApiKeyCredential {
	type: "api_key";
	key: string;
}

export interface OAuthCredential {
	type: "oauth";
	access: string;
	refresh: string;
	expires: number; // Unix timestamp in milliseconds
}

export interface AuthContext {
	env(name: string): Promise<string | undefined>;
}

export interface ApiKeyAuth {
	name: string;
	login(callbacks: LoginCallbacks): Promise<ApiKeyCredential>;
	resolve(args: { ctx: AuthContext; credential?: ApiKeyCredential }): Promise<AuthResult | undefined>;
}

export interface OAuthAuth {
	name: string;
	login?(callbacks: LoginCallbacks): Promise<OAuthCredential>;
	refresh?(credential: OAuthCredential): Promise<OAuthCredential>;
	resolve(args: { ctx: AuthContext; credential?: OAuthCredential }): Promise<AuthResult | undefined>;
}

export interface ProviderAuth {
	apiKey?: ApiKeyAuth;
	oauth?: OAuthAuth;
}
