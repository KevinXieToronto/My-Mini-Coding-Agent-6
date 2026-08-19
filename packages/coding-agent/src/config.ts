import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_NAME = "pi";

/** Works from both src/ (tsx) and dist/ (built) — package.json sits one level up. */
function readPackageVersion(): string {
	try {
		const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
		const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8")) as { version?: string };
		return pkg.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

export const VERSION: string = readPackageVersion();
