import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local demo emulator only");
  environment = await initializeTestEnvironment({ projectId: "demo-bohemika-rules", firestore: {
    host: "127.0.0.1", port: 8180, rules: readFileSync("firestore.rules", "utf8"),
  } });
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "documentDraftKeys/synthetic-draft-key"), { ownerUid: "author", key: "synthetic-only" });
  });
});
afterAll(async () => { await environment?.cleanup(); });

describe("draft keys are server-only", () => {
  it.each(["anonymous", "author", "other", "manager", "admin", "owner"])("denies direct reads, lists and writes for %s", async role => {
    const database = role === "anonymous" ? environment.unauthenticatedContext().firestore() : environment.authenticatedContext(role, {
      email: `${role}@example.test`, email_verified: true,
      firebase: { sign_in_provider: "custom" }, app_totp_enrolled: true,
      ...(["admin", "owner"].includes(role) ? { admin: true, adminRole: role } : {}),
    }).firestore();
    const ref = doc(database, "documentDraftKeys/synthetic-draft-key");
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(database, "documentDraftKeys")));
    await assertFails(setDoc(ref, { ownerUid: role, key: "forged" }));
  });
});
