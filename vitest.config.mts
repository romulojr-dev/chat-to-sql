import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig({
  resolve: { alias: { "@": process.cwd() } },
  test: {
    // Playwright specs live in e2e/ and run with `npm run test:e2e`.
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    // Load .env.local so integration tests can reach the database locally.
    // Tests that need DATABASE_URL skip themselves when it is absent (e.g. CI).
    env: loadEnv("test", process.cwd(), ""),
  },
});
