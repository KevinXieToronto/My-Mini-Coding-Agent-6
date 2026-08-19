import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface TrustFile {
	trustedProjects: string[];
}

/**
 * Remembers which project directories the user has trusted (see
 * TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES for what trust unlocks).
 * Decisions persist in a JSON file under the agent directory.
 */
export class TrustManager {
	readonly filePath: string;
	private trusted: Set<string>;

	constructor(filePath: string) {
		this.filePath = filePath;
		this.trusted = new Set(this.load().trustedProjects.map((dir) => normalize(dir)));
	}

	isTrusted(projectDir: string): boolean {
		return this.trusted.has(normalize(projectDir));
	}

	setTrusted(projectDir: string, trusted: boolean): void {
		const dir = normalize(projectDir);
		if (trusted) this.trusted.add(dir);
		else this.trusted.delete(dir);
		this.save();
	}

	private load(): TrustFile {
		if (!existsSync(this.filePath)) return { trustedProjects: [] };
		try {
			const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<TrustFile>;
			return { trustedProjects: Array.isArray(parsed.trustedProjects) ? parsed.trustedProjects : [] };
		} catch {
			return { trustedProjects: [] };
		}
	}

	private save(): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const file: TrustFile = { trustedProjects: [...this.trusted].sort() };
		writeFileSync(this.filePath, `${JSON.stringify(file, null, "\t")}\n`, "utf8");
	}
}

function normalize(dir: string): string {
	return resolve(dir);
}
