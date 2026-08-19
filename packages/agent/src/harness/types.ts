/** Result of a fallible operation. Expected failures are returned as `ok: false` instead of thrown. */
export type Result<TValue, TError> = { ok: true; value: TValue } | { ok: false; error: TError };

export const ok = <TValue>(value: TValue): Result<TValue, never> => ({ ok: true, value });
export const err = <TError>(error: TError): Result<never, TError> => ({ ok: false, error });

export interface DirEntry {
	name: string;
	isDirectory: boolean;
}

export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface ExecOptions {
	cwd?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

/** File access the harness needs (skills, prompt templates, tools). */
export interface FileSystem {
	cwd(): string;
	readFile(path: string): Promise<Result<string, string>>;
	writeFile(path: string, content: string): Promise<Result<void, string>>;
	listDir(path: string): Promise<Result<DirEntry[], string>>;
	exists(path: string): Promise<boolean>;
}

/** Process execution. */
export interface Shell {
	exec(command: string, options?: ExecOptions): Promise<Result<ExecResult, string>>;
}

/** Filesystem and process execution environment used by the harness. */
export interface ExecutionEnv extends FileSystem, Shell {}
