#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const ONLINE_CARD_SLUG_MAX_LEN = 64;
const ONLINE_CARD_SLUG_MIN_LEN = 3;

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
  console.log("  node scripts/set-online-card-slug.mjs <email> <slug>");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function slugify(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ONLINE_CARD_SLUG_MAX_LEN);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isSameUserDoc(doc, targetEmail, targetUid) {
  const data = doc.data() ?? {};
  const docEmail = normalizeEmail(doc.id);
  const dataEmail = normalizeEmail(data.email);
  const dataUid = typeof data.userId === "string" ? data.userId.trim() : "";
  return (
    docEmail === targetEmail ||
    dataEmail === targetEmail ||
    (targetUid !== "" && dataUid === targetUid)
  );
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

async function findEnabledSlugConflict(db, slug, email, uid) {
  const snap = await db.collection("users").where("onlineCard.slug", "==", slug).limit(20).get();

  for (const doc of snap.docs) {
    if (isSameUserDoc(doc, email, uid)) continue;
    const data = doc.data() ?? {};
    const onlineCard = isPlainObject(data.onlineCard) ? data.onlineCard : {};
    if (onlineCard.enabled === true) {
      return {
        path: doc.ref.path,
        email: normalizeEmail(data.email) || normalizeEmail(doc.id) || doc.id,
      };
    }
  }

  return null;
}

async function main() {
  const email = normalizeEmail(process.argv[2]);
  const slug = slugify(process.argv[3]);

  if (!email || !slug) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (slug.length < ONLINE_CARD_SLUG_MIN_LEN) {
    throw new Error(`Slug must have at least ${ONLINE_CARD_SLUG_MIN_LEN} characters.`);
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
  const uid = authUser?.uid ?? "";

  const conflict = await findEnabledSlugConflict(db, slug, email, uid);
  if (conflict) {
    throw new Error(
      `Online card slug "${slug}" is already used by enabled profile ${conflict.email} (${conflict.path}).`
    );
  }

  const refs = await findPublicProfileRefs(db, email, uid);
  const targetRefs = refs.length > 0 ? refs : [db.collection("users").doc(email)];
  const currentSnaps = await Promise.all(targetRefs.map((ref) => ref.get()));
  const nowIso = new Date().toISOString();

  const batch = db.batch();
  currentSnaps.forEach((snap, index) => {
    const data = snap.data() ?? {};
    const currentOnlineCard = isPlainObject(data.onlineCard) ? data.onlineCard : {};
    batch.set(
      targetRefs[index],
      {
        email,
        ...(uid ? { userId: uid } : {}),
        onlineCard: {
          ...currentOnlineCard,
          slug,
          updatedAt: nowIso,
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedByEmail: "script:set-online-card-slug",
      },
      { merge: true }
    );
  });

  await batch.commit();

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        uid: uid || null,
        slug,
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
