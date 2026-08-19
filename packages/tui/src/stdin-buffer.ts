/**
 * Buffers raw stdin chunks and re-emits them as complete input sequences.
 *
 * Terminals may split an escape sequence across chunks (or coalesce a paste
 * with a key press). This class splits the stream so each callback receives
 * either one complete escape sequence or a run of plain text.
 */
export class StdinBuffer {
	private buffer = "";
	private flushTimer?: NodeJS.Timeout;
	private readonly onSequence: (data: string) => void;
	private readonly escapeTimeoutMs: number;

	constructor(
		onSequence: (data: string) => void,
		/** How long to wait for the rest of a partial escape sequence. */
		escapeTimeoutMs = 50,
	) {
		this.onSequence = onSequence;
		this.escapeTimeoutMs = escapeTimeoutMs;
	}

	feed(chunk: string): void {
		this.buffer += chunk;
		this.drain();
	}

	/** Cancel any pending timers. Buffered partial input is discarded. */
	dispose(): void {
		if (this.flushTimer) clearTimeout(this.flushTimer);
		this.flushTimer = undefined;
		this.buffer = "";
	}

	private drain(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}

		while (this.buffer.length > 0) {
			if (this.buffer[0] !== "\x1b") {
				// Plain text run up to the next escape
				const end = this.buffer.indexOf("\x1b");
				const text = end === -1 ? this.buffer : this.buffer.slice(0, end);
				this.buffer = end === -1 ? "" : this.buffer.slice(end);
				this.emitText(text);
				continue;
			}

			const length = this.completeEscapeLength(this.buffer);
			if (length === -1) {
				// Incomplete sequence: wait briefly for the rest, then flush
				// as-is (covers a bare ESC key press).
				this.flushTimer = setTimeout(() => {
					this.flushTimer = undefined;
					const pending = this.buffer;
					this.buffer = "";
					if (pending.length > 0) this.onSequence(pending);
				}, this.escapeTimeoutMs);
				return;
			}
			const sequence = this.buffer.slice(0, length);
			this.buffer = this.buffer.slice(length);
			this.onSequence(sequence);
		}
	}

	private emitText(text: string): void {
		// Split control characters out of pasted runs so each key event is
		// delivered on its own; contiguous printable text stays together.
		let run = "";
		for (const char of text) {
			if (char < " " || char === "\x7f") {
				if (run.length > 0) {
					this.onSequence(run);
					run = "";
				}
				this.onSequence(char);
			} else {
				run += char;
			}
		}
		if (run.length > 0) this.onSequence(run);
	}

	/**
	 * Length of the complete escape sequence at the start of `data`,
	 * or -1 if more bytes are needed.
	 */
	private completeEscapeLength(data: string): number {
		if (data.length === 1) return -1;
		const second = data[1];

		if (second === "[") {
			// CSI: parameters/intermediates, then a final byte in @-~
			for (let i = 2; i < data.length; i++) {
				const code = data.charCodeAt(i);
				if (code >= 0x40 && code <= 0x7e) return i + 1;
			}
			return -1;
		}
		if (second === "]" || second === "_" || second === "P" || second === "^") {
			// OSC / APC / DCS / PM: terminated by BEL or ST (ESC \)
			for (let i = 2; i < data.length; i++) {
				if (data[i] === "\x07") return i + 1;
				if (data[i] === "\x1b" && data[i + 1] === "\\") return i + 2;
			}
			return -1;
		}
		if (second === "O") {
			// SS3: one final character
			return data.length >= 3 ? 3 : -1;
		}
		// Alt+key: ESC followed by any single character
		return 2;
	}
}
