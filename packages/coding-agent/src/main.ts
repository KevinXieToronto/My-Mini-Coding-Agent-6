/**
 * Main entry point for the coding agent CLI.
 *
 * Handles CLI argument parsing and dispatches to a mode. Only --version
 * and --help exist so far; print/interactive modes arrive in later steps.
 */

import { APP_NAME, VERSION } from "./config.ts";

function printHelp(): void {
	console.log(`Usage: ${APP_NAME} [options] [message...]

Options:
  -v, --version   Print version and exit
  -h, --help      Show this help and exit`);
}

export async function main(args: string[]): Promise<void> {
	if (args.includes("--version") || args.includes("-v")) {
		console.log(VERSION);
		return;
	}

	if (args.includes("--help") || args.includes("-h")) {
		printHelp();
		return;
	}

	console.error(`${APP_NAME}: print/interactive modes are not implemented yet. Try --version or --help.`);
	process.exitCode = 1;
}
