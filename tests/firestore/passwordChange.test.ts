import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, setLogLevel } from "firebase/firestore";
const state = vi.hoisted(() => ({ db: null as Firestore | null, auth: null as Auth | null, messages: [] as string[] }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ get adminDb() { return state.db; }, get adminAuth() { return state.auth; } }));
vi.mock("@/lib/server/firebaseAuthEmail", () => ({ requireAuthEmailConfig: () => {}, sendAuthEmailMessage: async (_email: string, message: { code: string }) => { state.messages.push(message.code); } }));
vi.mock("@/lib/server/passwordChangeEmail", () => ({ renderPasswordChangeCode: (code: string) => ({ code }), queuePasswordChanged: async () => ({ sent: true, jobId: "synthetic-notice" }) }));
vi.mock("@/lib/appSession", () => ({ resolveAppSessionSecret: () => "synthetic-local-secret" }));
import { authorizePasswordChange, completePasswordChange, preparePasswordChange } from "../../src/lib/server/passwordChange";
import { withFirestoreTokenRevocation } from "../../src/lib/server/tokenRevocation";
let app: App, rules: RulesTestEnvironment;
const projectId = "demo-bohemika-rules";
const email = "password-change@example.test", uid = "password-change-synthetic-uid";
const oldPassword = "Old-secret-927!", newPassword = "Different-secret-83!";
async function signIn(password: string) {
  const r = await fetch("http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-key", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return { ok: r.ok, body: await r.json() };
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9299") throw new Error("Only local demo emulators allowed.");
  app = initializeApp({ projectId }, "password-change-integration"); state.db = getFirestore(app); state.auth = withFirestoreTokenRevocation(getAuth(app), state.db);
  await state.auth.createUser({ uid, email, password: oldPassword, emailVerified: true });
  setLogLevel("silent");
  rules = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8180, rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(async () => { await rules?.cleanup(); await state.db?.terminate(); if (app) await deleteApp(app); });

describe("password change on real Firebase emulators", () => {
  it("requires fresh proof and a code, consumes concurrent requests once, and actually replaces the password", async () => {
    const original = await signIn(oldPassword); expect(original.ok).toBe(true);
    const oldToken = await state.auth!.verifyIdToken(original.body.idToken, true), user = await state.auth!.getUser(uid);
    const challenge = await preparePasswordChange(oldToken, user);
    await expect(authorizePasswordChange(oldToken, user, challenge.challengeId)).rejects.toMatchObject({ code: "change/expired" });
    await new Promise(resolve => setTimeout(resolve, challenge.waitMs));
    const fresh = await signIn(oldPassword); const token = await state.auth!.verifyIdToken(fresh.body.idToken, true);
    await authorizePasswordChange(token, user, challenge.challengeId);
    const code = state.messages.at(-1)!; expect(code).toMatch(/^\d{6}$/);
    const results = await Promise.allSettled([1, 2].map(() => completePasswordChange(token, user, challenge.challengeId, newPassword, code)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await signIn(oldPassword)).ok).toBe(false); expect((await signIn(newPassword)).ok).toBe(true);
    await expect(completePasswordChange(token, user, challenge.challengeId, oldPassword, code)).rejects.toMatchObject({ code: "change/expired" });
    await expect(state.auth!.verifyIdToken(original.body.idToken, true)).rejects.toBeInstanceOf(Error);
  });
  it.each(["authPasswordChanges", "authPasswordChangeNotices"])("denies all browser reads/writes to %s, including admin claims", async collection => {
    for (const claims of [{ email }, { email, admin: true, adminRole: "owner" }]) {
      const db = rules.authenticatedContext(uid, claims).firestore(); const ref = doc(db, collection, "synthetic-record");
      await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { code: "123456", state: "ready" }));
    }
  });
  it("commits wrong-code attempt counters in actual transactions and invalidates the fifth attempt", async () => {
    const current = await signIn(newPassword); const old = await state.auth!.verifyIdToken(current.body.idToken, true);
    const user = await state.auth!.getUser(uid); const c = await preparePasswordChange(old, user);
    await new Promise(resolve => setTimeout(resolve, c.waitMs));
    const fresh = await signIn(newPassword); const token = await state.auth!.verifyIdToken(fresh.body.idToken, true);
    await authorizePasswordChange(token, user, c.challengeId); const code = state.messages.at(-1)!;
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 1; i <= 5; i++) await expect(completePasswordChange(token, user, c.challengeId, oldPassword, wrong)).rejects.toMatchObject({ code: i === 5 ? "change/expired" : "change/wrong-code" });
    await expect(completePasswordChange(token, user, c.challengeId, oldPassword, code)).rejects.toMatchObject({ code: "change/expired" });
    expect((await signIn(newPassword)).ok).toBe(true);
  });
});
