#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
      // fallback to split env vars
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

function hasTimeline(data) {
  const raw = data?.positionTimeline;
  if (!Array.isArray(raw)) return false;
  return raw.some((item) => {
    if (!item || typeof item !== "object") return false;
    const position = typeof item.position === "string" ? item.position.trim() : "";
    const validFrom =
      typeof item.validFrom === "string" ? item.validFrom.trim() : "";
    return position.length > 0 && validFrom.length > 0;
  });
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error(
      "Chybí FIREBASE_ADMIN_* credentials. Zkontrolujte .env.local."
    );
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });
  const db = getFirestore(app);

  const usersSnap = await db.collection("users").select().get();
  const buckets = new Map();

  usersSnap.docs.forEach((docSnap) => {
    const id = docSnap.id;
    const key = id.trim().toLowerCase();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  });

  const duplicates = Array.from(buckets.entries()).filter(
    ([, ids]) => ids.length > 1
  );

  if (duplicates.length === 0) {
    console.log("Nebyly nalezeny žádné case-variant duplicity v users/");
    return;
  }

  console.log(`Nalezeno ${duplicates.length} duplicitních e-mailových skupin:`);
  for (const [normalized, ids] of duplicates) {
    console.log(`\n- ${normalized}`);
    for (const id of ids) {
      const snap = await db.collection("users").doc(id).get();
      const data = snap.data() ?? {};
      const timeline = hasTimeline(data) ? "timeline:YES" : "timeline:NO";
      const position =
        typeof data.position === "string" && data.position.trim().length > 0
          ? `position:${data.position}`
          : "position:—";
      console.log(`  - ${id} (${timeline}, ${position})`);
    }
  }
}

main().catch((error) => {
  console.error("Kontrola duplicit selhala:", error?.message ?? error);
  process.exit(1);
});
