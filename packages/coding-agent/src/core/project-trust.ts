/**
 * Project-level config can inject instructions and executable behavior into the
 * agent (a cloned repo could carry a malicious SYSTEM.md or skill). These
 * resources are only loaded from a project directory the user has explicitly
 * trusted; everything else (plain source files the model reads via tools) needs
 * no trust decision.
 */
export const TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES = [
	"settings.json",
	"extensions",
	"skills",
	"prompts",
	"themes",
	"SYSTEM.md",
	"APPEND_SYSTEM.md",
] as const;

export type TrustRequiringProjectConfigResource = (typeof TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES)[number];

export function requiresProjectTrust(resource: string): resource is TrustRequiringProjectConfigResource {
	return (TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES as readonly string[]).includes(resource);
}
