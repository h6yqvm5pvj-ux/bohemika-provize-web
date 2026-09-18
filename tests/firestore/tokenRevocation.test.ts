import { readFileSync } from "node:fs";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { withFirestoreTokenRevocation } from "../../src/lib/server/tokenRevocation";

const state = vi.hoisted(() => ({ auth: null as Auth | null, db: null as Firestore | null }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ get adminAuth() { return state.auth; }, get adminDb() { return state.db; } }));
import { confirmPasswordResetWithRevocation } from "../../src/lib/server/passwordReset";
const projectId = "demo-bohemika-rules", uid = "revocation-integration", email = "revocation@example.test";
let app: App, raw: Auth, rules: RulesTestEnvironment;
const endpoint = "http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:";
async function authRequest(method: string, body: unknown) {
  const response = await fetch(`${endpoint}${method}?key=synthetic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect(response.status).toBe(200); return response.json();
}
const exchange = async (customToken: string) => (await authRequest("signInWithCustomToken", { token: customToken, returnSecureToken: true })).idToken as string;
const freshToken = async () => exchange(await state.auth!.createCustomToken(uid, { app_totp_enrolled: true }));
async function directRead(token: string) {
  const response = await fetch(`http://127.0.0.1:8180/v1/projects/${projectId}/databases/(default)/documents/contracts/revocation-integration`, { headers: { Authorization: `Bearer ${token}` } });
  await response.body?.cancel(); return response.status;
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9299") throw new Error("Local demo emulators only");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "synthetic"); vi.stubEnv("GCLOUD_PROJECT", projectId);
  app = initializeApp({ projectId }, "revocation-integration"); raw = getAuth(app); state.db = getFirestore(app);
  state.auth = withFirestoreTokenRevocation(raw, state.db);
  rules = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8180, rules: readFileSync("firestore.rules", "utf8") } });
});
beforeEach(async () => {
  await raw.deleteUser(uid).catch(error => { if (error.code !== "auth/user-not-found") throw error; });
  await state.db!.doc(`accountBlocks/${uid}`).delete();
  await raw.createUser({ uid, email, emailVerified: true, password: "Synthetic-old-123!" });
  await state.db!.doc("contracts/revocation-integration").set({ userEmail: email, userId: uid, managerEmailSnapshot: "", managerChain: [], managerOverrides: [] });
});
afterAll(async () => {
  vi.unstubAllEnvs(); await rules?.cleanup(); await state.db?.terminate(); if (app) await deleteApp(app);
});

describe("real issued tokens against Firestore REST", () => {
  it("revokes direct reads and late exchanges of existing custom tokens, then allows a fresh passkey login", async () => {
    const originalCustom = await state.auth!.createCustomToken(uid, { app_totp_enrolled: true });
    const original = await exchange(originalCustom);
    expect(await directRead(original)).toBe(200);
    await state.auth!.revokeRefreshTokens(uid);
    expect(await directRead(original)).toBe(403);
    await expect(state.auth!.verifyIdToken(original, true)).rejects.toMatchObject({ code: "auth/id-token-revoked" });
    const replayed = await exchange(originalCustom);
    expect(await directRead(replayed)).toBe(403);
    await expect(state.auth!.verifyIdToken(replayed, true)).rejects.toMatchObject({ code: "auth/id-token-revoked" });
    const fresh = await freshToken();
    expect(await directRead(fresh)).toBe(200);
    await expect(state.auth!.verifyIdToken(fresh, true)).resolves.toMatchObject({ uid });
  });
  it.each(["password", "claims", "delete"])("denies old direct access after %s changes", async kind => {
    const old = await freshToken(); expect(await directRead(old)).toBe(200);
    if (kind === "password") await state.auth!.updateUser(uid, { password: "Synthetic-new-456!" });
    else if (kind === "claims") await state.auth!.setCustomUserClaims(uid, { admin: false });
    else await state.auth!.deleteUser(uid);
    expect(await directRead(old)).toBe(403);
  });
  it("rejects old direct access after an actual email-code password reset", async () => {
    const old = await freshToken(); expect(await directRead(old)).toBe(200);
    const link = new URL(await raw.generatePasswordResetLink(email));
    await confirmPasswordResetWithRevocation(link.searchParams.get("oobCode")!, "Reset-new-synthetic-456!");
    expect(await directRead(old)).toBe(403);
    await authRequest("signInWithPassword", { email, password: "Reset-new-synthetic-456!", returnSecureToken: true });
    expect(await directRead(await freshToken())).toBe(200);
    await expect(confirmPasswordResetWithRevocation(link.searchParams.get("oobCode")!, "Another-synthetic-789!")).rejects.toMatchObject({ code: "auth/invalid-action-code" });
  });
  it("rejects invalid reset codes before writing revocation state", async () => {
    await expect(confirmPasswordResetWithRevocation("invalid-synthetic-code", "New-synthetic-123!")).rejects.toMatchObject({ code: "auth/invalid-action-code" });
    expect((await state.db!.doc(`accountBlocks/${uid}`).get()).exists).toBe(false);
  });
  it("survives two concurrent actual Firebase revocations", async () => {
    const old = await freshToken();
    await Promise.all([state.auth!.revokeRefreshTokens(uid), state.auth!.revokeRefreshTokens(uid)]);
    expect(await directRead(old)).toBe(403);
    expect((await state.db!.doc(`accountBlocks/${uid}`).get()).data()?.revocation.pendingOperations).toEqual({});
    expect(await directRead(await freshToken())).toBe(200);
  });
});
