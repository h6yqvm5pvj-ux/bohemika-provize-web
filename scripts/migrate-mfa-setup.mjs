// Run without --apply first. Only automatic missing-TOTP guards are in scope.
// No passwords, email addresses, UID values, OTPs or provider tokens are logged.
import nextEnv from "@next/env";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { withFirestoreTokenRevocation } from "./auth-security.mjs";
import { mfaSetupMigrationAction } from "./mfa-setup-policy.mjs";

async function main() {
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS) : {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
  const app = initializeApp({ credential: cert(credentials) }, "mfa-setup-migration");
  const db = getFirestore(app), auth = withFirestoreTokenRevocation(getAuth(app), db);
  const apply = process.argv.includes("--apply");
  const counts = { setup: 0, complete: 0, skip: 0, pending: 0, "requires-reset": 0, enabled: 0, applied: 0 };
  try {
    const records = await db.collection("accountBlocks").where("reason", "==", "missing-totp").get();
    for (const snapshot of records.docs) {
      const uid = snapshot.id, ref = snapshot.ref;
      const user = await auth.getUser(uid);
      const enrollmentRef = db.collection("authMfaEnrollments").doc(createHash("sha256").update(uid).digest("hex"));
      const enrollment = (await enrollmentRef.get()).data();
      const before = snapshot.data(), action = mfaSetupMigrationAction(user, before, enrollment);
      counts[action]++;
      if (!apply || !["setup", "complete"].includes(action)) continue;
      // A revocation barrier denies existing sessions before enabling old accounts.
      if (user.disabled) await auth.revokeRefreshTokens(uid);
      const ready = await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        const latestEnrollment = (await tx.get(enrollmentRef)).data();
        if (mfaSetupMigrationAction(user, current, latestEnrollment) !== action) return false;
        if (action === "complete") {
          if (current.revocation) tx.set(ref, { revocation: current.revocation });
          else tx.delete(ref);
        } else {
          const next = { ...current, mfaEmailConfirmationRequired: true, mfaEmailConfirmedFactorUid: null, setupPolicyVersion: 2 };
          delete next.mfaRecoveryApproval;
          tx.set(ref, next);
        }
        return true;
      });
      if (!ready) continue;
      if (user.disabled) {
        const guard = (await ref.get()).data();
        if (guard && Object.keys(guard).some(key => key !== "revocation") && guard.reason !== "missing-totp") continue;
        await auth.updateUser(uid, { disabled: false });
        const after = (await ref.get()).data();
        // Preserve a concurrent manual disable even across the Auth/Firestore boundary.
        if (after && Object.keys(after).some(key => key !== "revocation") && after.reason !== "missing-totp") {
          await auth.updateUser(uid, { disabled: true });
          continue;
        }
        counts.enabled++;
      }
      counts.applied++;
    }
    console.log(JSON.stringify({ dryRun: !apply, ...counts }));
  } finally { await db.terminate(); await deleteApp(app); }
}
main().catch(() => { console.error("MFA setup migration stopped; private account details suppressed."); process.exitCode = 1; });
