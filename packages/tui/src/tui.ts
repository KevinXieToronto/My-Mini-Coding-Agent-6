import type { Component } from "./component.ts";
import { CURSOR_MARKER, isKeyRelease, parseKey } from "./keys.ts";
import { StdinBuffer } from "./stdin-buffer.ts";
import { ProcessTerminal, type Terminal } from "./terminal.ts";
import { stripAnsi } from "./utils.ts";

/**
 * Owns the screen: renders a vertical stack of components and repaints only
 * the lines that changed since the previous frame. Input sequences from the
 * terminal are re-assembled by a StdinBuffer and dispatched to the focused
 * component; a component embeds CURSOR_MARKER in its output to position the
 * hardware cursor.
 */
export class TUI {
	/** Called on ctrl+c; defaults to stopping the TUI when unset. */
	onCtrlC?: () => void;

	private components: Component[] = [];
	private focused?: Component;
	private readonly stdinBuffer: StdinBuffer;
	private previousLines: string[] = [];
	private previousWidth = -1;
	private renderScheduled = false;
	private running = false;
	private readonly terminal: Terminal;

	constructor(terminal: Terminal = new ProcessTerminal()) {
		this.terminal = terminal;
		this.stdinBuffer = new StdinBuffer((data) => this.dispatch(data));
	}

	addComponent(component: Component): void {
		this.components.push(component);
		this.requestRender();
	}

	removeComponent(component: Component): void {
		this.components = this.components.filter((c) => c !== component);
		if (this.focused === component) this.focused = undefined;
		this.requestRender();
	}

	setFocus(component: Component | undefined): void {
		this.focused = component;
		this.requestRender();
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.terminal.start(
			(chunk) => this.stdinBuffer.feed(chunk),
			() => this.handleResize(),
		);
		this.requestRender();
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		this.stdinBuffer.dispose();
		this.terminal.stop();
	}

	/** Schedule a repaint; multiple requests in one tick coalesce. */
	requestRender(): void {
		if (this.renderScheduled) return;
		this.renderScheduled = true;
		queueMicrotask(() => {
			this.renderScheduled = false;
			if (this.running) this.render();
		});
	}

	/** Force every component to re-render on the next frame. */
	invalidate(): void {
		for (const component of this.components) component.invalidate();
		this.previousLines = [];
		this.previousWidth = -1;
		this.requestRender();
	}

	private dispatch(data: string): void {
		if (parseKey(data) === "ctrl+c") {
			if (this.onCtrlC) this.onCtrlC();
			else this.stop();
			return;
		}
		if (isKeyRelease(data) && !this.focused?.wantsKeyRelease) return;
		this.focused?.handleInput?.(data);
		this.requestRender();
	}

	private handleResize(): void {
		this.invalidate();
	}

	private render(): void {
		const width = this.terminal.columns;
		const rawLines = this.components.flatMap((component) => component.render(width));

		// Extract the cursor position and strip the marker.
		let cursorRow = -1;
		let cursorCol = -1;
		const lines = rawLines.map((line, row) => {
			const index = line.indexOf(CURSOR_MARKER);
			if (index === -1) return line;
			cursorRow = row;
			cursorCol = stripAnsi(line.slice(0, index)).length;
			return line.slice(0, index) + line.slice(index + CURSOR_MARKER.length);
		});

		let out = "\x1b[?25l";
		if (width !== this.previousWidth) {
			// Full repaint on the first frame and after a resize.
			out += "\x1b[2J";
			for (let i = 0; i < lines.length; i++) {
				out += `\x1b[${i + 1};1H\x1b[2K${lines[i]}`;
			}
		} else {
			for (let i = 0; i < lines.length; i++) {
				if (lines[i] !== this.previousLines[i]) {
					out += `\x1b[${i + 1};1H\x1b[2K${lines[i]}`;
				}
			}
			// Clear lines left over from a taller previous frame.
			for (let i = lines.length; i < this.previousLines.length; i++) {
				out += `\x1b[${i + 1};1H\x1b[2K`;
			}
		}

		if (cursorRow !== -1) {
			out += `\x1b[${cursorRow + 1};${cursorCol + 1}H\x1b[?25h`;
		}

		this.terminal.write(out);
		this.previousLines = lines;
		this.previousWidth = width;
	}
}
