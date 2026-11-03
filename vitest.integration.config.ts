import path from "node:path";
import { defineConfig } from "vitest/config";

// Runs against the real Supabase project in .env.local: `npm run test:integration`.
// Creates and then deletes its own test data (entries use @example.com emails).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/integration/**/*.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
