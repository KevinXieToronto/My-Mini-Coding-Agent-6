import type { SessionTreeEntry } from "./types.ts";

/** Append-only persistence for session entries. Replayed in order on load. */
export interface SessionStore {
	append(entry: SessionTreeEntry): void | Promise<void>;
	load(): SessionTreeEntry[] | Promise<SessionTreeEntry[]>;
}

export function inMemorySessionStore(initial?: SessionTreeEntry[]): SessionStore {
	const entries: SessionTreeEntry[] = [...(initial ?? [])];
	return {
		append: (entry) => {
			entries.push(entry);
		},
		load: () => [...entries],
	};
}
