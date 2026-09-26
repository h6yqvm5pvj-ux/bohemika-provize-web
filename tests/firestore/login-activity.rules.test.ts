import { readFileSync } from "node:fs";
import { afterAll, beforeAll, it } from "vitest";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc } from "firebase/firestore";
let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local Firestore emulator required");
  setLogLevel("silent");
  environment = await initializeTestEnvironment({ projectId: "demo-bohemika-rules", firestore: { host: "127.0.0.1", port: 8180, rules: readFileSync("firestore.rules", "utf8") } });
  await environment.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "_authActivity/synthetic"), { outcome: "success" });
    await setDoc(doc(ctx.firestore(), "_securityMonitoring/loginActivity"), { startedAtMs: 1 });
  });
});
afterAll(async () => environment?.cleanup());
it.each(["anonymous", "advisor", "admin"])("prevents %s client tokens from reading or modifying server audit records", async actor => {
  const firebase = { sign_in_provider: "password" as const, sign_in_second_factor: "totp" };
  const db = actor === "anonymous" ? environment.unauthenticatedContext().firestore() : environment.authenticatedContext(actor, {
    email: `${actor}@example.test`, email_verified: true, firebase,
    ...(actor === "admin" ? { admin: true, adminRole: "owner" } : {}),
  }).firestore();
  for (const path of ["_authActivity/synthetic", "_securityMonitoring/loginActivity"]) {
    const ref = doc(db, path); await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { tampered: true }));
    await assertFails(updateDoc(ref, { tampered: true })); await assertFails(deleteDoc(ref));
  }
});
