import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

let runtime;
/** Preserve the same private storage boundary in legacy maintenance scripts. */
export function businessDataFirestore(db) {
  if (!runtime) {
    const jiti = createJiti(import.meta.url, {
      alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
    });
    runtime = jiti("../src/lib/server/businessDataFirestore.ts");
  }
  return runtime.withBusinessDataEncryption(db);
}
