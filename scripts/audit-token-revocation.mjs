// Diagnostic only. This writes synthetic data exclusively to local demo emulators.
// A failing exit status means a revoked token still reaches Firestore directly.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { withFirestoreTokenRevocation } from "./auth-security.mjs";

assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9299");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8180");
const projectId = "demo-bohemika-rules";
const uid = "revocation-audit-synthetic-user";
const email = "revocation-audit@example.test";
const app = initializeApp({ projectId }, "token-revocation-audit");
const db = getFirestore(app);
const rawAuth = getAuth(app);
const auth = withFirestoreTokenRevocation(rawAuth, db);
let environment;
let createdUser = false;
let result;

try {
  environment = await initializeTestEnvironment({
    projectId, firestore: {
      host: "127.0.0.1", port: 8180,
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
  await auth.createUser({ uid, email, emailVerified: true });
  createdUser = true;
  // Match the Firestore claims of a passkey login. No real account or passkey is used.
  const customToken = await auth.createCustomToken(uid, { app_totp_enrolled: true });
  const exchange = async token => {
  const signIn = await fetch("http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, returnSecureToken: true }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(signIn.status, 200);
  const { idToken } = await signIn.json();
  assert.equal(typeof idToken, "string");
  return idToken;
  };
  const idToken = await exchange(customToken);
  await auth.verifyIdToken(idToken, true);
  await db.doc("contracts/revocation-audit-synthetic").set({
    userEmail: email, userId: uid, managerEmailSnapshot: "", managerChain: [], managerOverrides: [],
  });
  const directRead = async (token = idToken) => {
    const response = await fetch(`http://127.0.0.1:8180/v1/projects/${projectId}/databases/(default)/documents/contracts/revocation-audit-synthetic`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status;
  };
  const beforeRevocation = await directRead();
  assert.equal(beforeRevocation, 200);
  // Auth timestamps have second precision. Make the revocation strictly later.
  await new Promise(resolve => setTimeout(resolve, 1_100));
  await auth.revokeRefreshTokens(uid);
  let adminSdkRejectsRevokedToken = false;
  try { await rawAuth.verifyIdToken(idToken, true); }
  catch (error) { adminSdkRejectsRevokedToken = error?.code === "auth/id-token-revoked"; }
  assert.equal(adminSdkRejectsRevokedToken, true);
  const afterRevocation = await directRead();
  assert.equal(afterRevocation, 403);
  const replayedCustomToken = await directRead(await exchange(customToken));
  assert.equal(replayedCustomToken, 403);
  const freshToken = await exchange(await auth.createCustomToken(uid, { app_totp_enrolled: true }));
  const afterFreshLogin = await directRead(freshToken);
  assert.equal(afterFreshLogin, 200);
  await auth.verifyIdToken(freshToken, true);
  await db.doc(`accountBlocks/${uid}`).set({ reason: "synthetic-audit" });
  const afterPersistentBlock = await directRead(freshToken);
  assert.equal(afterPersistentBlock, 403);
  result = {
    checkedAt: new Date().toISOString(), environment: "local-demo-emulators",
    beforeRevocation, adminSdkRejectsRevokedToken, afterRevocation, replayedCustomToken, afterFreshLogin, afterPersistentBlock,
    revokedTokenStillReadsFirestore: afterRevocation === 200,
    productionAccess: false,
  };
  if (afterRevocation !== 403) process.exitCode = 1;
} catch {
  result = { diagnosticFailed: true, detailsSuppressed: true, productionAccess: false };
  process.exitCode = 2;
} finally {
  if (createdUser) {
    await db.doc("contracts/revocation-audit-synthetic").delete();
    await db.doc(`accountBlocks/${uid}`).delete();
    await rawAuth.deleteUser(uid);
  }
  await environment?.cleanup();
  await db.terminate();
  await deleteApp(app);
}
console.log(JSON.stringify(result, null, 2));
