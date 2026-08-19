/**
 * Minimal terminal abstraction so the TUI can be tested against a fake
 * terminal and run against process stdin/stdout in production.
 */
export interface Terminal {
	/** Enter raw mode and start delivering input/resize events. */
	start(onInput: (data: string) => void, onResize: () => void): void;
	/** Restore the terminal and stop delivering events. */
	stop(): void;
	write(data: string): void;
	get columns(): number;
	get rows(): number;
}

/** Terminal backed by process.stdin / process.stdout. */
export class ProcessTerminal implements Terminal {
	private onData?: (data: Buffer | string) => void;
	private onResize?: () => void;
	private started = false;

	start(onInput: (data: string) => void, onResize: () => void): void {
		if (this.started) return;
		this.started = true;

		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();

		this.onData = (chunk) => onInput(chunk.toString("utf8"));
		this.onResize = onResize;
		process.stdin.on("data", this.onData);
		process.stdout.on("resize", this.onResize);

		// Hide the cursor; the TUI positions it explicitly on each render.
		this.write("\x1b[?25l");
	}

	stop(): void {
		if (!this.started) return;
		this.started = false;

		if (this.onData) process.stdin.off("data", this.onData);
		if (this.onResize) process.stdout.off("resize", this.onResize);
		this.onData = undefined;
		this.onResize = undefined;

		this.write("\x1b[?25h");
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();
	}

	write(data: string): void {
		process.stdout.write(data);
	}

	get columns(): number {
		return process.stdout.columns ?? 80;
	}

	get rows(): number {
		return process.stdout.rows ?? 24;
	}
}
