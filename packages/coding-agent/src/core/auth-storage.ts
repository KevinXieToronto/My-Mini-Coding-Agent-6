import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ApiKeyCredential, OAuthCredential } from "@earendil-works/pi-ai";

export type StoredCredential = ApiKeyCredential | OAuthCredential;

const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 10_000;

/**
 * Credential storage for API keys and OAuth tokens.
 * Handles loading, saving, and refreshing credentials from auth.json.
 *
 * Uses file locking to prevent race conditions when multiple pi instances
 * try to refresh tokens simultaneously.
 */
export class AuthStorage {
	readonly filePath: string;

	constructor(filePath: string) {
		this.filePath = filePath;
	}

	async list(): Promise<Record<string, StoredCredential>> {
		return this.read();
	}

	async get(providerId: string): Promise<StoredCredential | undefined> {
		return (await this.read())[providerId];
	}

	async set(providerId: string, credential: StoredCredential): Promise<void> {
		await this.withLock(async () => {
			const all = await this.read();
			all[providerId] = credential;
			await this.write(all);
		});
	}

	async remove(providerId: string): Promise<void> {
		await this.withLock(async () => {
			const all = await this.read();
			delete all[providerId];
			await this.write(all);
		});
	}

	/**
	 * Read-modify-write under the lock. The updater sees the freshly-read
	 * credential (another process may have changed it since any earlier read);
	 * returning `undefined` keeps the stored value unchanged. Resolves to
	 * whatever is stored once the lock is released.
	 */
	async modify(
		providerId: string,
		updater: (current: StoredCredential | undefined) => Promise<StoredCredential | undefined>,
	): Promise<StoredCredential | undefined> {
		return this.withLock(async () => {
			const all = await this.read();
			const next = await updater(all[providerId]);
			if (next === undefined) return all[providerId];
			all[providerId] = next;
			await this.write(all);
			return next;
		});
	}

	// ---- Internals ----

	private async read(): Promise<Record<string, StoredCredential>> {
		try {
			return JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, StoredCredential>;
		} catch {
			return {};
		}
	}

	private async write(all: Record<string, StoredCredential>): Promise<void> {
		await mkdir(dirname(this.filePath), { recursive: true });
		await writeFile(this.filePath, `${JSON.stringify(all, null, "\t")}\n`, "utf8");
	}

	/** Cross-process mutex: a lock directory next to auth.json, created atomically. */
	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		const lockPath = `${this.filePath}.lock`;
		await mkdir(dirname(this.filePath), { recursive: true });
		const deadline = Date.now() + LOCK_TIMEOUT_MS;
		for (;;) {
			try {
				await mkdir(lockPath);
				break;
			} catch {
				// Held by someone else: steal it if the holder looks dead, else wait.
				try {
					const info = await stat(lockPath);
					if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
						await rm(lockPath, { recursive: true, force: true });
						continue;
					}
				} catch {
					continue; // released between mkdir and stat
				}
				if (Date.now() > deadline) throw new Error(`Timed out waiting for auth lock: ${lockPath}`);
				await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
			}
		}
		try {
			return await fn();
		} finally {
			await rm(lockPath, { recursive: true, force: true });
		}
	}
}
