import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/firestore/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 15_000,
  },
});
