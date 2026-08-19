export interface SystemPromptInputs {
	cwd: string;
	modelName?: string;
	toolNames?: readonly string[];
	/** From SYSTEM.md: replaces the built-in prompt entirely. */
	systemMd?: string;
	/** From APPEND_SYSTEM.md: appended after whichever base prompt is in effect. */
	appendSystemMd?: string;
	today?: Date;
}

const DEFAULT_PROMPT = `You are pi, a coding agent running in the user's terminal.

Be concise and direct. Use the available tools to read and modify the project
rather than guessing at its contents. When you change code, match the style of
the surrounding code. Report failures plainly, including relevant output.`;

/**
 * Assemble the system prompt: SYSTEM.md (if present) replaces the built-in
 * base, an environment block is always appended, APPEND_SYSTEM.md goes last.
 * Skills are formatted by the harness, not here.
 */
export function buildSystemPrompt(inputs: SystemPromptInputs): string {
	const base = inputs.systemMd ?? DEFAULT_PROMPT;

	const envLines = [
		`Working directory: ${inputs.cwd}`,
		`Platform: ${process.platform}`,
		`Today's date: ${(inputs.today ?? new Date()).toISOString().slice(0, 10)}`,
	];
	if (inputs.modelName) envLines.push(`Model: ${inputs.modelName}`);
	if (inputs.toolNames && inputs.toolNames.length > 0) envLines.push(`Available tools: ${inputs.toolNames.join(", ")}`);

	const sections = [base, `# Environment\n${envLines.join("\n")}`];
	if (inputs.appendSystemMd) sections.push(inputs.appendSystemMd);
	return sections.join("\n\n");
}
