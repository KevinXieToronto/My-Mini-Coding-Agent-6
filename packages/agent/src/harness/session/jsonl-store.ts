import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionStore } from "./store.ts";
import type { SessionTreeEntry } from "./types.ts";

/** Node-only store: one JSON entry per line, appended synchronously so no write is lost on crash. */
export function jsonlSessionStore(filePath: string): SessionStore {
	return {
		append(entry: SessionTreeEntry): void {
			mkdirSync(dirname(filePath), { recursive: true });
			appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
		},
		load(): SessionTreeEntry[] {
			if (!existsSync(filePath)) return [];
			return readFileSync(filePath, "utf8")
				.split("\n")
				.filter((line) => line.trim().length > 0)
				.map((line) => JSON.parse(line) as SessionTreeEntry);
		},
	};
}
