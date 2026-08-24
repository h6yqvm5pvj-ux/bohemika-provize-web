#!/usr/bin/env node

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": fileURLToPath(new URL("../src", import.meta.url)),
  },
});
const { adminDb } = jiti("../src/lib/server/firebaseAdmin.ts");
const {
  contractListIndexFieldsForContract,
  contractSearchIndexFieldsForContract,
} = jiti(
  "../src/app/api/contracts/_lib/contractsApi.listFilters.ts"
);

const BATCH_LIMIT = 400;
const ENTRY_PAGE_SIZE = 300;

const hasArg = (name) => process.argv.includes(name);

const parseArgValue = (key, fallback = null) => {
  const prefix = `${key}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(key);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const valuesEqual = (left, right) => {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
  return (left ?? null) === (right ?? null);
};

const buildPatch = ({ ownerEmail, data }) => {
  const expected = {
    userEmail: ownerEmail,
    paid: data?.paid === true,
    ...contractListIndexFieldsForContract(data ?? {}),
    ...contractSearchIndexFieldsForContract(data ?? {}),
  };
  const patch = {};

  for (const [key, value] of Object.entries(expected)) {
    if (!valuesEqual(data?.[key], value)) {
      patch[key] = value;
    }
  }

  return patch;
};

const commitPlanned = async (planned) => {
  let batch = adminDb.batch();
  let inBatch = 0;
  let written = 0;

  for (const item of planned) {
    batch.set(item.ref, item.patch, { merge: true });
    inBatch += 1;

    if (inBatch >= BATCH_LIMIT) {
      await batch.commit();
      written += inBatch;
      batch = adminDb.batch();
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
    written += inBatch;
  }

  return written;
};

const main = async () => {
  if (!adminDb) throw new Error("Missing Firebase Admin configuration.");

  const write = hasArg("--write") || hasArg("--apply");
  const ownerFilter = normalizeEmail(parseArgValue("--owner"));
  const limitRaw = parseArgValue("--limit");
  const limit = limitRaw ? Math.max(0, Number.parseInt(limitRaw, 10) || 0) : 0;

  const stats = {
    mode: write ? "write" : "dry-run",
    scannedUsers: 0,
    scannedEntries: 0,
    plannedUpdates: 0,
    written: 0,
    skippedUsersWithoutEmail: 0,
  };
  const planned = [];

  const users = [];
  if (ownerFilter) {
    const userSnap = await adminDb.collection("users").doc(ownerFilter).get();
    if (userSnap.exists) users.push(userSnap);
  } else {
    const usersSnap = await adminDb.collection("users").get();
    users.push(...usersSnap.docs);
  }

  for (const userDoc of users) {
    if (limit > 0 && planned.length >= limit) break;

    const ownerEmail = normalizeEmail(userDoc.data()?.email ?? userDoc.id);
    if (!ownerEmail) {
      stats.skippedUsersWithoutEmail += 1;
      continue;
    }
    stats.scannedUsers += 1;

    let cursor = null;
    while (true) {
      if (limit > 0 && planned.length >= limit) break;

      let query = adminDb
        .collection("users")
        .doc(ownerEmail)
        .collection("entries")
        .orderBy("__name__")
        .limit(ENTRY_PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);

      const snap = await query.get();
      if (snap.empty) break;

      for (const entryDoc of snap.docs) {
        if (limit > 0 && planned.length >= limit) break;
        stats.scannedEntries += 1;

        const data = entryDoc.data() ?? {};
        const patch = buildPatch({ ownerEmail, data });
        if (Object.keys(patch).length === 0) continue;

        planned.push({
          ownerEmail,
          entryId: entryDoc.id,
          contractNumber: data.contractNumber ?? null,
          patch,
          ref: entryDoc.ref,
        });
      }

      cursor = snap.docs[snap.docs.length - 1] ?? null;
      if (!cursor || snap.size < ENTRY_PAGE_SIZE) break;
    }
  }

  stats.plannedUpdates = planned.length;
  if (write && planned.length > 0) {
    stats.written = await commitPlanned(planned);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...stats,
        examples: planned.slice(0, 20).map((item) => ({
          ownerEmail: item.ownerEmail,
          entryId: item.entryId,
          contractNumber: item.contractNumber,
          patch: item.patch,
        })),
      },
      null,
      2
    )
  );

  if (!write) {
    console.log(
      "\n[dry-run] Nic nezapsáno. Pro zápis spusť: node scripts/backfill-contract-list-index-fields.mjs --write"
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
