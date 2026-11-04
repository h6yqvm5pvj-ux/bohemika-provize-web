#!/usr/bin/env node

// Read-only inventory. No client names, emails, contract numbers or document paths are printed.
import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

nextEnv.loadEnvConfig(process.cwd());
const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
});
const { adminDb } = jiti("../src/lib/server/firebaseAdmin.ts");

async function main() {
  if (process.argv.length > 2) throw new Error("This inventory accepts no mutation options.");
  if (!adminDb) throw new Error("Firebase Admin is not configured.");
  const counts = {};
  for (const collection of ["entries", "contractRefs", "clientContractLinks"]) {
    const query = collection === "entries" ? adminDb.collectionGroup(collection) : adminDb.collection(collection);
    const snapshot = await query.where("productKey", "==", "comfortcc").count().get();
    counts[collection] = snapshot.data().count;
  }
  console.log(JSON.stringify({ mode: "read-only", productKey: "comfortcc", counts }, null, 2));
}

main().catch(() => {
  console.error("Inventory could not be completed. Check Firebase Admin configuration, connectivity and query indexes. No records were changed.");
  process.exitCode = 1;
});
