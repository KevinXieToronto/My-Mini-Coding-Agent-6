import { exec as childExec } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type ExecOptions, type ExecResult, type ExecutionEnv, err, ok, type Result } from "../types.ts";

export interface NodeJsExecutionEnvOptions {
	cwd?: string;
}

/** ExecutionEnv backed by node:fs and node:child_process. */
export function createNodeJsExecutionEnv(options?: NodeJsExecutionEnvOptions): ExecutionEnv {
	const cwd = options?.cwd ?? process.cwd();

	return {
		cwd: () => cwd,

		async readFile(path: string): Promise<Result<string, string>> {
			try {
				return ok(await readFile(path, "utf8"));
			} catch (error) {
				return err(errorMessage(error));
			}
		},

		async writeFile(path: string, content: string): Promise<Result<void, string>> {
			try {
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, content, "utf8");
				return ok(undefined);
			} catch (error) {
				return err(errorMessage(error));
			}
		},

		async listDir(path: string): Promise<Result<{ name: string; isDirectory: boolean }[], string>> {
			try {
				const entries = await readdir(path, { withFileTypes: true });
				return ok(entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() })));
			} catch (error) {
				return err(errorMessage(error));
			}
		},

		async exists(path: string): Promise<boolean> {
			try {
				await stat(path);
				return true;
			} catch {
				return false;
			}
		},

		exec(command: string, options?: ExecOptions): Promise<Result<ExecResult, string>> {
			return new Promise((resolve) => {
				childExec(
					command,
					{ cwd: options?.cwd ?? cwd, timeout: options?.timeoutMs, signal: options?.signal },
					(error, stdout, stderr) => {
						if (!error) {
							resolve(ok({ stdout, stderr, exitCode: 0 }));
						} else if (typeof error.code === "number") {
							// Non-zero exit is an expected outcome, not a failure of exec itself.
							resolve(ok({ stdout, stderr, exitCode: error.code }));
						} else {
							// Spawn-level failure: command not found, killed by timeout/abort, ...
							resolve(err(error.message));
						}
					},
				);
			});
		},
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
