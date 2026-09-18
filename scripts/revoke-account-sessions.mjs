// Operator-only revocation. Dry run unless --apply is explicit; no account data in stdout.
import nextEnv from "@next/env";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { withFirestoreTokenRevocation } from "./auth-security.mjs";

async function main() {
  const [uid, ...flags] = process.argv.slice(2);
  if (!uid || uid.includes("/") || uid.length > 128 || flags.some(flag => flag !== "--apply")) throw new Error("Use UID [--apply]");
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS) : {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
  const app = initializeApp({ credential: cert(credentials) }, "operator-session-revocation");
  const db = getFirestore(app), auth = withFirestoreTokenRevocation(getAuth(app), db);
  try {
    await auth.getUser(uid);
    const previous = await db.collection("accountBlocks").doc(uid).get();
    if (previous.exists && Object.keys(previous.data()?.revocation?.pendingOperations ?? {}).length) throw new Error("Pending operation needs recovery");
    if (!flags.includes("--apply")) {
      console.log(JSON.stringify({ dryRun: true, accountExists: true, willRequireFreshLogin: true })); return;
    }
    await auth.revokeRefreshTokens(uid);
    const current = await db.collection("accountBlocks").doc(uid).get();
    if (!current.exists || Object.keys(current.data().revocation.pendingOperations).length) throw new Error("Revocation did not finish");
    console.log(JSON.stringify({ applied: true, requiresFreshLogin: true, firestoreRevocationRecorded: true }));
  } finally { await db.terminate(); await deleteApp(app); }
}
main().catch(() => {
  console.error("Revocation stopped. Check credentials, UID and pending operations using the revocation runbook; private details suppressed.");
  process.exitCode = 1;
});
