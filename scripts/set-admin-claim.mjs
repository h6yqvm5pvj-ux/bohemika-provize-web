#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const VALID_ROLES = new Set(["owner", "admin", "support"]);

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
  console.log("  node scripts/set-admin-claim.mjs <email> <owner|admin|support>");
  console.log("  node scripts/set-admin-claim.mjs <email> remove");
}

async function main() {
  const email = String(process.argv[2] ?? "").trim().toLowerCase();
  const role = String(process.argv[3] ?? "").trim().toLowerCase();

  if (!email || !role || (!VALID_ROLES.has(role) && role !== "remove")) {
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
  const user = await auth.getUserByEmail(email);
  const currentClaims = user.customClaims ?? {};
  const nextClaims = { ...currentClaims };

  if (role === "remove") {
    delete nextClaims.admin;
    delete nextClaims.adminRole;
  } else {
    nextClaims.admin = true;
    nextClaims.adminRole = role;
  }

  await auth.setCustomUserClaims(user.uid, nextClaims);
  await auth.revokeRefreshTokens(user.uid);

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        uid: user.uid,
        admin: nextClaims.admin === true,
        adminRole: nextClaims.adminRole ?? null,
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
