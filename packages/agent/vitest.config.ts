import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// Test against pi-ai's sources so a stale dist/ can't skew results.
			"@earendil-works/pi-ai": fileURLToPath(new URL("../ai/src/index.ts", import.meta.url)),
		},
	},
});
