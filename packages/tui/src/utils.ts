/** Matches ANSI escape sequences (CSI, OSC, and two-byte escapes). */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b(?:\[[0-9;:?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g;

/** Strip ANSI escape sequences from a string. */
export function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

/** Visible width of a string (ANSI sequences count as zero columns). */
export function visibleWidth(text: string): number {
	return stripAnsi(text).length;
}

/**
 * Word-wrap text to the given width. Existing newlines are preserved.
 * Words longer than the width are hard-broken.
 */
export function wrapText(text: string, width: number): string[] {
	if (width <= 0) return [text];
	const result: string[] = [];
	for (const paragraph of text.split("\n")) {
		if (paragraph.length === 0) {
			result.push("");
			continue;
		}
		let line = "";
		for (const word of paragraph.split(" ")) {
			let chunk = word;
			// Hard-break words that don't fit on a line by themselves
			while (visibleWidth(chunk) > width) {
				if (line.length > 0) {
					result.push(line);
					line = "";
				}
				result.push(chunk.slice(0, width));
				chunk = chunk.slice(width);
			}
			const candidate = line.length === 0 ? chunk : `${line} ${chunk}`;
			if (visibleWidth(candidate) > width) {
				result.push(line);
				line = chunk;
			} else {
				line = candidate;
			}
		}
		result.push(line);
	}
	return result;
}
