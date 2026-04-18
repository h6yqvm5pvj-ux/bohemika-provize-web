#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const PRIVATE_FIELDS = [
  "subscriptionStatus",
  "adminFunction",
  "adminfunction",
  "fcmTokens",
  "pushTokens",
  "notificationTokens",
  "fcmTokensByDevice",
  "pushTokensByDevice",
];

const BATCH_LIMIT = 400;

function hasArg(name) {
  return process.argv.includes(name);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function loadCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    } catch {
      // fallback to split env vars below
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

async function main() {
  const apply = hasArg("--apply");
  const deleteFromUsers = hasArg("--delete-from-users");

  if (!apply) {
    console.log(
      "[dry-run] Nic nezapisuju. Pro zápis spusť: node scripts/migrate-users-private-fields.mjs --apply [--delete-from-users]"
    );
  }

  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("Chybí FIREBASE_ADMIN_* credentials.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });

  const db = getFirestore(app);
  const usersSnap = await db.collection("users").get();

  let totalUsers = 0;
  let touchedUsers = 0;
  let privateWrites = 0;
  let publicCleans = 0;
  let skippedWithoutEmail = 0;

  let batch = db.batch();
  let opsInBatch = 0;

  const commitBatch = async () => {
    if (!apply || opsInBatch === 0) return;
    await batch.commit();
    batch = db.batch();
    opsInBatch = 0;
  };

  for (const userDoc of usersSnap.docs) {
    totalUsers += 1;
    const data = userDoc.data() ?? {};

    const privatePayload = {};
    for (const key of PRIVATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        privatePayload[key] = data[key];
      }
    }

    const privateKeys = Object.keys(privatePayload);
    if (privateKeys.length === 0) continue;

    const canonicalEmail = normalizeEmail(data.email ?? userDoc.id);
    if (!canonicalEmail) {
      skippedWithoutEmail += 1;
      continue;
    }

    touchedUsers += 1;

    if (apply) {
      const privateRef = db.collection("usersPrivate").doc(canonicalEmail);
      batch.set(privateRef, privatePayload, { merge: true });
      opsInBatch += 1;
      privateWrites += 1;

      if (deleteFromUsers) {
        const deletePayload = {};
        for (const key of privateKeys) {
          deletePayload[key] = FieldValue.delete();
        }
        batch.set(userDoc.ref, deletePayload, { merge: true });
        opsInBatch += 1;
        publicCleans += 1;
      }

      if (opsInBatch >= BATCH_LIMIT) {
        await commitBatch();
      }
    }
  }

  await commitBatch();

  console.log("----- migrate-users-private-fields -----");
  console.log(`users scanned: ${totalUsers}`);
  console.log(`users with private fields: ${touchedUsers}`);
  console.log(`users skipped (missing canonical email): ${skippedWithoutEmail}`);
  if (apply) {
    console.log(`usersPrivate writes: ${privateWrites}`);
    console.log(
      deleteFromUsers
        ? `users cleanup ops: ${publicCleans}`
        : "users cleanup ops: 0 (delete disabled)"
    );
  } else {
    console.log("dry-run mode: no writes");
  }
}

main().catch((error) => {
  console.error("migrate-users-private-fields failed:", error?.message ?? error);
  process.exit(1);
});
