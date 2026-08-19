import type { Component } from "../component.ts";
import { wrapText } from "../utils.ts";

export interface TextOptions {
	/** Blank columns added to the left of every line. */
	paddingLeft?: number;
	/** Blank lines added above the text. */
	paddingTop?: number;
	/** Blank lines added below the text. */
	paddingBottom?: number;
}

/** Static (or updatable) block of word-wrapped text. */
export class Text implements Component {
	private text: string;
	private paddingLeft: number;
	private paddingTop: number;
	private paddingBottom: number;
	// Cache for rendered output
	private cachedText?: string;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(text = "", options: TextOptions = {}) {
		this.text = text;
		this.paddingLeft = options.paddingLeft ?? 0;
		this.paddingTop = options.paddingTop ?? 0;
		this.paddingBottom = options.paddingBottom ?? 0;
	}

	setText(text: string): void {
		this.text = text;
	}

	getText(): string {
		return this.text;
	}

	render(width: number): string[] {
		// Check cache
		if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const pad = " ".repeat(this.paddingLeft);
		const contentWidth = Math.max(1, width - this.paddingLeft);
		const lines: string[] = [];
		for (let i = 0; i < this.paddingTop; i++) lines.push("");
		for (const line of wrapText(this.text, contentWidth)) {
			lines.push(pad + line);
		}
		for (let i = 0; i < this.paddingBottom; i++) lines.push("");

		this.cachedText = this.text;
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedText = undefined;
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}
