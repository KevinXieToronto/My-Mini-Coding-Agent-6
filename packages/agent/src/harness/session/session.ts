import type { AgentMessage } from "../../types.ts";
import type { SessionStore } from "./store.ts";
import type {
	LabelEntry,
	LeafEntry,
	MessageEntry,
	NewSessionTreeEntry,
	SessionInfoEntry,
	SessionTreeEntry,
} from "./types.ts";

export interface SessionOptions {
	id?: string;
	title?: string;
	cwd?: string;
	store?: SessionStore;
}

/**
 * A session is a tree of entries: normal appends extend the current leaf, and
 * moving the leaf to an older entry starts a new branch. LeafEntry and LabelEntry
 * are log-only bookkeeping — they never appear on a path.
 */
export class Session {
	readonly id: string;
	private entries = new Map<string, SessionTreeEntry>();
	private order: string[] = [];
	private leafId: string | null = null;
	private store?: SessionStore;

	private constructor(id: string, store?: SessionStore) {
		this.id = id;
		this.store = store;
	}

	static create(options?: SessionOptions): Session {
		const session = new Session(options?.id ?? crypto.randomUUID(), options?.store);
		session.append({
			type: "session-info",
			sessionId: session.id,
			title: options?.title,
			cwd: options?.cwd,
		});
		return session;
	}

	/** Rebuild a session by replaying a store's log. */
	static async open(store: SessionStore): Promise<Session> {
		const entries = await store.load();
		const info = entries.find((entry): entry is SessionInfoEntry => entry.type === "session-info");
		const session = new Session(info?.sessionId ?? crypto.randomUUID());
		for (const entry of entries) {
			session.entries.set(entry.id, entry);
			session.order.push(entry.id);
			if (entry.type === "leaf") session.leafId = entry.leafId;
			else if (entry.type !== "label") session.leafId = entry.id;
		}
		session.store = store; // attach after replay so load doesn't re-append
		return session;
	}

	getEntry(id: string): SessionTreeEntry | undefined {
		return this.entries.get(id);
	}

	/** All entries in append order (the full log, including abandoned branches). */
	getEntries(): SessionTreeEntry[] {
		return this.order.map((id) => this.entries.get(id)!);
	}

	getLeafId(): string | null {
		return this.leafId;
	}

	/** Entries from the root to the given leaf (default: current leaf). */
	getPathEntries(leafId?: string | null): SessionTreeEntry[] {
		const path: SessionTreeEntry[] = [];
		let cursor = leafId === undefined ? this.leafId : leafId;
		while (cursor !== null) {
			const entry = this.entries.get(cursor);
			if (!entry) break;
			path.push(entry);
			cursor = entry.parentId;
		}
		return path.reverse();
	}

	/** Append an entry as the child of the current leaf; the new entry becomes the leaf. */
	append<TNew extends NewSessionTreeEntry>(entry: TNew): Extract<SessionTreeEntry, { type: TNew["type"] }> {
		const isLogOnly = entry.type === "leaf" || entry.type === "label";
		const full = {
			...entry,
			id: crypto.randomUUID(),
			parentId: isLogOnly ? null : this.leafId,
			timestamp: new Date().toISOString(),
		} as unknown as Extract<SessionTreeEntry, { type: TNew["type"] }>;
		this.entries.set(full.id, full);
		this.order.push(full.id);
		if (!isLogOnly) this.leafId = full.id;
		void this.store?.append(full);
		return full;
	}

	appendMessage(message: AgentMessage): MessageEntry {
		return this.append({ type: "message", message });
	}

	/** Move the current leaf to an existing entry; the next append branches from there. */
	setLeaf(entryId: string): LeafEntry {
		if (!this.entries.has(entryId)) throw new Error(`Unknown session entry: ${entryId}`);
		const entry = this.append({ type: "leaf", leafId: entryId });
		this.leafId = entryId;
		return entry;
	}

	/** Bookmark an entry with a human-readable name. */
	label(targetId: string, label: string): LabelEntry {
		if (!this.entries.has(targetId)) throw new Error(`Unknown session entry: ${targetId}`);
		return this.append({ type: "label", targetId, label });
	}

	/** Latest label for an entry, if any. */
	getLabel(targetId: string): string | undefined {
		for (let i = this.order.length - 1; i >= 0; i--) {
			const entry = this.entries.get(this.order[i]!);
			if (entry?.type === "label" && entry.targetId === targetId) return entry.label;
		}
		return undefined;
	}
}
