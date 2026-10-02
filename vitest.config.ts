import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: { setupFiles: ["tests/helpers/businessEncryptionTestSetup.ts"], exclude: [...configDefaults.exclude, ".tmp/**", "tests/firestore/**"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
