import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// biome-ignore lint/style/noDefaultExport: Vitest requires a default config export.
export default defineConfig({
  resolve: {
    alias: {
      "@anori/sdk": fileURLToPath(new URL("../src/sdk/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
