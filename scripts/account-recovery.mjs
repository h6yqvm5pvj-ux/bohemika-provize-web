// Operator-only recovery. No email, password, TOTP secret or account ID is logged.
import nextEnv from "@next/env";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { withFirestoreTokenRevocation } from "./auth-security.mjs";

async function main() {
  const [mode, uid] = process.argv.slice(2);
  if (!["prepare", "approve-recovery", "activate"].includes(mode) || !uid || uid.includes("/") || uid.length > 128) throw new Error("Use prepare|approve-recovery|activate UID [--apply]");
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS) : {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
  const app = initializeApp({ credential: cert(credentials) }, "account-recovery");
  const db = getFirestore(app), auth = withFirestoreTokenRevocation(getAuth(app), db);
  try {
    const user = await auth.getUser(uid), ref = db.collection("accountBlocks").doc(uid), block = await ref.get();
    if (!block.exists || block.data()?.reason !== "missing-totp") throw new Error("Only missing-TOTP blocks can be recovered by this tool");
    const hasTotp = user.multiFactor?.enrolledFactors.some(factor => factor.factorId === "totp") === true;
    if (mode === "activate" && block.data()?.mfaEmailConfirmationRequired === true &&
        !user.multiFactor?.enrolledFactors.some(factor => factor.factorId === "totp" && factor.uid === block.data()?.mfaEmailConfirmedFactorUid)) {
      throw new Error("Fresh email-confirmed enrollment is required before activation");
    }
    if (mode === "activate" && (!hasTotp || !user.emailVerified)) throw new Error("Verified email and enrolled TOTP are required before activation");
    if ((mode === "prepare" || mode === "approve-recovery") && hasTotp) throw new Error("TOTP is already enrolled; use activate after identity verification");
    if (mode === "approve-recovery" && (user.disabled || !user.emailVerified || !user.email ||
        !block.data()?.revocation?.generation || Object.keys(block.data()?.revocation?.pendingOperations ?? {}).length > 0)) {
      throw new Error("Recovery approval requires an enabled, verified account and a completed reset");
    }
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify({ mode, dryRun: true, eligible: true, businessAccessRemainsBlocked: mode !== "activate" })); return;
    }
    if (mode === "approve-recovery") {
      const now = Date.now(), expiresAtMs = now + 60 * 60_000;
      await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.reason !== "missing-totp" || current.revocation?.generation !== block.data()?.revocation?.generation ||
            Object.keys(current.revocation?.pendingOperations ?? {}).length > 0) throw new Error("Account block changed during recovery");
        tx.update(ref, { mfaRecoveryApproval: { email: user.email, approvedAtMs: now, expiresAtMs,
          revocationGeneration: current.revocation.generation, source: "operator-approved-recovery" } });
      });
      console.log(JSON.stringify({ mode, applied: true, expiresAt: new Date(expiresAtMs).toISOString(), businessAccessRemainsBlocked: true }));
      return;
    }
    await auth.revokeRefreshTokens(uid);
    await auth.updateUser(uid, { disabled: false });
    if (mode === "activate") {
      const current = await auth.getUser(uid);
      if (!current.emailVerified || !current.multiFactor?.enrolledFactors.some(factor => factor.factorId === "totp")) throw new Error("Account changed during recovery; persistent block retained");
      if (block.data()?.mfaEmailConfirmationRequired === true &&
          !current.multiFactor?.enrolledFactors.some(factor => factor.factorId === "totp" && factor.uid === block.data()?.mfaEmailConfirmedFactorUid)) {
        throw new Error("Email-confirmed factor changed during recovery; persistent block retained");
      }
      const blockFields = data => JSON.stringify(Object.keys(data).filter(key => key !== "revocation").sort().map(key => [key, data[key]]));
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref), data = snapshot.data();
        if (!data?.revocation || blockFields(data) !== blockFields(block.data())) throw new Error("Account block changed during recovery");
        // Activation removes only the persistent block; it must never erase
        // the revocation barrier or another operation's pending marker.
        tx.set(ref, { revocation: data.revocation });
      });
    }
    console.log(JSON.stringify({ mode, applied: true, businessAccessRemainsBlocked: mode === "prepare", requiresFreshLogin: true }));
  } finally { await db.terminate(); await deleteApp(app); }
}
main().catch(() => { console.error("Account recovery stopped. Check the requested action, current TOTP/email status and missing-TOTP block; no sensitive details are logged."); process.exitCode = 1; });
