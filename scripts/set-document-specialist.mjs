#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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

function usage() {
  console.log("Usage:");
  console.log("  node scripts/set-document-specialist.mjs <email> on");
  console.log("  node scripts/set-document-specialist.mjs <email> off");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

async function findPublicProfileRefs(db, email, uid) {
  const usersCol = db.collection("users");
  const [direct, byEmail, byUid] = await Promise.all([
    usersCol.doc(email).get(),
    usersCol.where("email", "==", email).limit(10).get(),
    uid ? usersCol.where("userId", "==", uid).limit(10).get() : Promise.resolve(null),
  ]);

  const refs = [];
  if (direct.exists) refs.push(direct.ref);
  byEmail.docs.forEach((doc) => refs.push(doc.ref));
  byUid?.docs.forEach((doc) => refs.push(doc.ref));

  const byPath = new Map();
  refs.forEach((ref) => byPath.set(ref.path, ref));
  return Array.from(byPath.values());
}

async function main() {
  const email = normalizeEmail(process.argv[2]);
  const mode = String(process.argv[3] ?? "on").trim().toLowerCase();
  if (!email || (mode !== "on" && mode !== "off")) {
    usage();
    process.exitCode = 1;
    return;
  }

  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("Missing FIREBASE_ADMIN_* credentials. Check .env.local.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });

  const auth = getAuth(app);
  const db = getFirestore(app);
  const authUser = await auth.getUserByEmail(email).catch((error) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });

  const refs = await findPublicProfileRefs(db, email, authUser?.uid);
  const targetRefs = refs.length > 0 ? refs : [db.collection("users").doc(email)];
  const patch = {
    email,
    specialist: mode === "on",
    updatedAt: FieldValue.serverTimestamp(),
    updatedByEmail: "script:set-document-specialist",
  };
  if (authUser?.uid) patch.userId = authUser.uid;

  const batch = db.batch();
  targetRefs.forEach((ref) => batch.set(ref, patch, { merge: true }));
  await batch.commit();

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        uid: authUser?.uid ?? null,
        specialist: mode === "on",
        updatedProfilePaths: targetRefs.map((ref) => ref.path),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
