import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    // Electron app is launched per-test via _electron helper
  },
  // Don't run e2e in CI by default — requires a built dist/
  projects: [
    {
      name: "electron",
      testMatch: "**/*.spec.{js,mjs}",
    },
  ],
});
