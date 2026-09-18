import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, deleteField, doc, getDoc, setDoc, setLogLevel, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-bohemika-rules";
const EMAIL = "advisor@example.test";
const OTHER = "other@example.test";
const UID = "advisor-uid";
let environment: RulesTestEnvironment;

beforeAll(async () => {
  // Never run security test writes against an actual project or arbitrary host.
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") {
    throw new Error("Run npm run test:rules with the local Firestore emulator on 127.0.0.1:8180.");
  }
  setLogLevel("silent");
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1", port: 8180,
      rules: readFileSync(resolve(process.env.FIRESTORE_RULES_TEST_FILE || "firestore.rules"), "utf8"),
    },
  });
});
beforeEach(async () => environment.clearFirestore());
afterAll(async () => environment?.cleanup());

const totpFirebase = { sign_in_provider: "password" as const, sign_in_second_factor: "totp" };
const actor = (email = EMAIL, claims: Record<string, unknown> = {}) =>
  environment.authenticatedContext(email === EMAIL ? UID : "other-uid", { email, email_verified: true, firebase: totpFirebase, ...claims }).firestore();
const reference = (collection: string, email = EMAIL, claims: Record<string, unknown> = {}) =>
  doc(actor(email, claims), collection, EMAIL);
const seed = async (path: string, data: Record<string, unknown>) =>
  environment.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), path), data));
const profile = {
  email: EMAIL, userId: UID, fullName: "Test Advisor", managerEmail: "",
  accountType: "advisor", canChangePosition: false, adminFunction: false,
};

describe("mandatory verified TOTP and persistent account blocks", () => {
  const contract = { userEmail: EMAIL, userId: UID, managerEmailSnapshot: "", managerChain: [], managerOverrides: [] };
  it.each([
    { email_verified: false },
    { firebase: { sign_in_provider: "password" } },
    { firebase: { sign_in_provider: "password", sign_in_second_factor: "phone" } },
    { firebase: { sign_in_provider: "custom" } },
    { app_totp_enrolled: true, firebase: { sign_in_provider: "password" } },
    { admin: true, adminRole: "owner", firebase: { sign_in_provider: "password" } },
  ])("denies own and admin reads/writes with inadequate authentication: %j", async claims => {
    await seed(`users/${EMAIL}`, profile);
    await seed("contracts/private", contract);
    const db = actor(EMAIL, claims);
    await assertFails(getDoc(doc(db, "users", EMAIL)));
    await assertFails(getDoc(doc(db, "contracts", "private")));
    await assertFails(updateDoc(doc(db, "users", EMAIL), { fullName: "changed" }));
    await assertFails(setDoc(doc(db, "contracts", "new"), contract));
  });
  it("allows the owner through a signed passkey custom token with server-issued proof", async () => {
    await seed("contracts/private", contract);
    const db = actor(EMAIL, { app_totp_enrolled: true, firebase: { sign_in_provider: "custom" } });
    await assertSucceeds(getDoc(doc(db, "contracts", "private")));
  });
  it("blocks previously issued TOTP and passkey tokens, including owner administrators", async () => {
    await seed("contracts/private", contract);
    await seed(`accountBlocks/${UID}`, { reason: "missing-totp" });
    for (const claims of [{}, { admin: true, adminRole: "owner" }, { app_totp_enrolled: true, firebase: { sign_in_provider: "custom" } }]) {
      const db = actor(EMAIL, claims);
      await assertFails(getDoc(doc(db, "contracts", "private")));
      await assertFails(deleteDoc(doc(db, "accountBlocks", UID)));
      await assertFails(updateDoc(doc(db, "accountBlocks", UID), { reason: "" }));
    }
  });
  it("never lets client tokens modify or inspect account blocks", async () => {
    const db = actor(EMAIL, { admin: true, adminRole: "owner" });
    await assertFails(setDoc(doc(db, "accountBlocks", UID), { reason: "" }));
    await assertFails(getDoc(doc(db, "accountBlocks", UID)));
  });
});

describe("immediate token revocation", () => {
  const seedRevocation = (path: string, data: Record<string, unknown>) => seed(path, { revocation: data });
  const generation = "00000000-0000-0000-0000-000000000001";
  const revocation = { validAfterSeconds: 101, generation, pendingOperations: {} };
  beforeEach(async () => { await seed(`users/${EMAIL}`, profile); });
  it.each([
    { auth_time: 99 }, { auth_time: 100 }, { auth_time: 100, admin: true, adminRole: "owner" },
    { auth_time: 100, app_totp_enrolled: true, app_auth_generation: generation, firebase: { sign_in_provider: "custom" } },
    { auth_time: 101, app_totp_enrolled: true, app_auth_generation: "initial", firebase: { sign_in_provider: "custom" } },
    { auth_time: 102, app_totp_enrolled: true, firebase: { sign_in_provider: "custom" } },
  ])("rejects old authentication including old custom tokens exchanged later: %j", async claims => {
    await seedRevocation(`accountBlocks/${UID}`, revocation);
    const ref = reference("users", EMAIL, claims);
    await assertFails(getDoc(ref)); await assertFails(updateDoc(ref, { fullName: "Changed" }));
  });
  it.each([
    { auth_time: 101 },
    { auth_time: 101, app_totp_enrolled: true, app_auth_generation: generation, firebase: { sign_in_provider: "custom" } },
  ])("allows fresh authentication after completed revocation %j", async claims => {
    await seedRevocation(`accountBlocks/${UID}`, revocation);
    await assertSucceeds(getDoc(reference("users", EMAIL, claims)));
    await assertSucceeds(updateDoc(reference("users", EMAIL, claims), { fullName: "Changed" }));
  });
  it("blocks any authentication while a mutation is pending", async () => {
    await seedRevocation(`accountBlocks/${UID}`, { ...revocation, pendingOperations: { [generation]: true } });
    await assertFails(getDoc(reference("users", EMAIL, { auth_time: 999, admin: true, adminRole: "owner" })));
  });
  it.each([{}, { ...revocation, validAfterSeconds: -1 }, { ...revocation, pendingOperations: [] }, { ...revocation, generation: "" }])("fails closed on corrupted registry %j", async record => {
    await seedRevocation(`accountBlocks/${UID}`, record);
    await assertFails(getDoc(reference("users", EMAIL, { auth_time: 999 })));
  });
  it("scopes revocation to a UID and never exposes registry writes or reads", async () => {
    await seedRevocation("accountBlocks/other-uid", revocation);
    await assertSucceeds(getDoc(reference("users", EMAIL, { auth_time: 50 })));
    for (const claims of [{}, { admin: true, adminRole: "owner" }]) {
      const ref = doc(actor(EMAIL, claims), "accountBlocks", UID);
      await assertFails(getDoc(ref)); await assertFails(setDoc(ref, revocation)); await assertFails(deleteDoc(ref));
    }
  });
  it.each(["managerChain", "managerOverrides"])("preserves a manager at the end of %s after a fresh login", async field => {
    await seedRevocation("accountBlocks/other-uid", revocation);
    const managers = Array.from({ length: 10 }, (_, i) => ({ email: i === 9 ? OTHER : `level${i}@example.test` }));
    const contract = { userEmail: EMAIL, userId: UID, managerEmailSnapshot: "", managerChain: [], managerOverrides: [], [field]: managers };
    for (const path of ["contracts/managed", `users/${EMAIL}/entries/managed`]) {
      await seed(path, contract);
      await assertSucceeds(getDoc(doc(actor(OTHER, { auth_time: 101 }), path)));
      await assertFails(getDoc(doc(actor(OTHER, { auth_time: 100 }), path)));
    }
  });
  it.each(["up", "down"])("preserves profiles eight levels %s the hierarchy", async direction => {
    await seedRevocation(`accountBlocks/${UID}`, revocation);
    const emails = [EMAIL, ...Array.from({ length: 7 }, (_, i) => `level${i}@example.test`), OTHER];
    for (let i = 0; i < emails.length; i++) await seed(`users/${emails[i]}`, { email: emails[i], managerEmail: emails[i + 1] ?? "" });
    await seedRevocation("accountBlocks/other-uid", revocation);
    const viewer = direction === "up" ? EMAIL : OTHER, target = direction === "up" ? OTHER : EMAIL;
    await assertSucceeds(getDoc(doc(actor(viewer, { auth_time: 101 }), "users", target)));
  });
});

// Include every role alias used by server authorization, plus identity,
// hierarchy, financial and setup state. Future unknown fields default to deny.
const protectedFields: [string, unknown, unknown][] = [
  ["adminFunction", false, true], ["adminfunction", false, true],
  ["admin", false, true], ["adminRole", "support", "owner"],
  ["specialist", false, true], ["documentsSpecialist", false, true],
  ["roles", [], ["specialist"]], ["role", "advisor", "specialist"],
  ["appRole", "advisor", "specialist"], ["userRole", "tipster", "advisor"],
  ["accountType", "tipster", "advisor"], ["email", EMAIL, OTHER],
  ["userId", UID, "victim-uid"], ["managerEmail", "manager@example.test", OTHER],
  ["subscriptionStatus", "inactive", "active"],
  ["canChangePosition", false, true], ["position", "P1", "P8"],
  ["positionTimeline", [], [{ position: "P8", from: "2020-01-01" }]],
  ["commissionMode", "standard", "advanced"],
  ["activeCollaboration", false, true],
  ["accountSetupCompletedAt", null, "2026-09-05T10:00:00.000Z"],
  ["mfaLastVerifiedAt", null, "2026-09-05T10:00:00.000Z"],
  ["futurePrivilege", false, true],
];

describe.each(["users", "usersPrivate"])("%s protected profile fields", (collection) => {
  for (const [field, initial, elevated] of protectedFields) {
    it(`denies adding ${field}`, async () => {
      const data: Record<string, unknown> = collection === "users" ? { ...profile } : { pushTokens: [] };
      delete data[field];
      await seed(`${collection}/${EMAIL}`, data);
      await assertFails(updateDoc(reference(collection), { [field]: elevated }));
    });
    it(`denies changing ${field}`, async () => {
      await seed(`${collection}/${EMAIL}`, { ...profile, [field]: initial });
      await assertFails(updateDoc(reference(collection), { [field]: elevated }));
    });
    it(`denies removing ${field}`, async () => {
      await seed(`${collection}/${EMAIL}`, { ...profile, [field]: initial });
      await assertFails(updateDoc(reference(collection), { [field]: deleteField() }));
    });
    it(`denies creating a profile with ${field}`, async () => {
      await assertFails(setDoc(reference(collection), { [field]: elevated }));
    });
  }

  it("blocks bypass by deletion followed by re-addition", async () => {
    await seed(`${collection}/${EMAIL}`, { ...profile, specialist: false, adminFunction: false });
    const ref = reference(collection);
    await assertFails(updateDoc(ref, { adminFunction: deleteField() }));
    await assertFails(updateDoc(ref, { adminFunction: true }));
    expect((await assertSucceeds(getDoc(ref))).data()?.adminFunction).toBe(false);
  });

  it("blocks deleting the entire profile and recreating it with new permissions", async () => {
    await seed(`${collection}/${EMAIL}`, { ...profile, specialist: false });
    const ref = reference(collection);
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(ref, { fullName: "New profile", specialist: true }));
    expect((await assertSucceeds(getDoc(ref))).data()?.specialist).toBe(false);
  });

  it("blocks overwriting protected fields while changing an allowed field", async () => {
    await seed(`${collection}/${EMAIL}`, { ...profile, pushTokens: [] });
    const update = collection === "users" ? { fullName: "New name" } : { pushTokens: ["new-token"] };
    await assertFails(updateDoc(reference(collection), { ...update, roles: { specialist: true } }));
  });

  it("denies another user's writes", async () => {
    await seed(`${collection}/${EMAIL}`, profile);
    await assertFails(updateDoc(reference(collection, OTHER), { fullName: "Impersonated name" }));
  });

  it("denies unauthenticated access", async () => {
    await seed(`${collection}/${EMAIL}`, profile);
    const ref = doc(environment.unauthenticatedContext().firestore(), collection, EMAIL);
    await assertFails(getDoc(ref));
    await assertFails(updateDoc(ref, { specialist: true }));
  });
});

describe("normal profile use", () => {
  it("allows adding, changing and removing a normal own-profile field", async () => {
    await seed(`users/${EMAIL}`, profile);
    const ref = reference("users");
    await assertSucceeds(updateDoc(ref, { phoneNumber: "+420 777 000 111" }));
    await assertSucceeds(updateDoc(ref, { phoneNumber: "+420 777 000 222", fullName: "Updated name" }));
    await assertSucceeds(updateDoc(ref, { phoneNumber: deleteField() }));
    expect((await assertSucceeds(getDoc(ref))).data()?.fullName).toBe("Updated name");
  });

  it("allows own UI preferences while protected roles remain unchanged", async () => {
    await seed(`users/${EMAIL}`, { ...profile, roles: ["advisor"] });
    const ref = reference("users");
    await assertSucceeds(updateDoc(ref, { reduceMotion: true, notificationSettings: { mailbox: true }, homeWidgets: [] }));
    expect((await getDoc(ref)).data()?.roles).toEqual(["advisor"]);
  });

  it("allows own private push tokens to be created, changed and removed", async () => {
    const ref = reference("usersPrivate");
    await assertSucceeds(setDoc(ref, { pushTokens: ["first"] }));
    await seed(`usersPrivate/${EMAIL}`, { pushTokens: ["first"], adminFunction: false });
    await assertSucceeds(updateDoc(ref, { pushTokens: ["second"], fcmTokensByDevice: { test: "token" } }));
    await assertSucceeds(updateDoc(ref, { pushTokens: deleteField() }));
    expect((await getDoc(ref)).data()?.adminFunction).toBe(false);
  });

  it("does not let a manager attach a privilege change to a subordinate position update", async () => {
    await seed(`usersPrivate/${OTHER}`, { adminFunction: true, adminfunction: false });
    await seed(`users/${OTHER}`, { email: OTHER, managerEmail: "", adminFunction: true, adminfunction: false });
    await seed(`users/${EMAIL}`, { ...profile, canChangePosition: true, managerEmail: OTHER, position: "P1" });
    await assertFails(updateDoc(reference("users", OTHER), { position: "P2", specialist: true }));
    // Career changes are validated by the server API, never directly by clients.
    await assertFails(updateDoc(reference("users", OTHER), { position: "P2" }));
  });
});

describe("administrator role boundaries", () => {
  for (const claims of [
    {}, { admin: false, adminRole: "owner" }, { admin: true, adminRole: "support" },
    { admin: true, adminRole: "unknown" }, { admin: true, adminRole: null },
  ]) {
    it(`denies direct contract read/write for unprivileged claims ${JSON.stringify(claims)}`, async () => {
      for (const path of ["contracts/test", `users/${EMAIL}/entries/test`]) {
        await seed(path, { userEmail: EMAIL, userId: UID, managerEmailSnapshot: "", managerChain: [], managerOverrides: [] });
        const ref = doc(actor(OTHER, claims), path);
        await assertFails(getDoc(ref));
        await assertFails(updateDoc(ref, { clientName: "Changed" }));
        await assertFails(deleteDoc(ref));
        await assertFails(setDoc(doc(actor(OTHER, claims), `${path}-new`), { userEmail: OTHER }));
      }
    });
  }

  it.each([{}, { adminRole: "admin" }, { adminRole: "owner" }])("preserves authorized admin contract access (%j)", async (role) => {
    const db = actor(OTHER, { admin: true, ...role });
    for (const path of ["contracts/test", `users/${EMAIL}/entries/test`]) {
      const ref = doc(db, path);
      await assertSucceeds(setDoc(ref, { userEmail: EMAIL }));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(updateDoc(ref, { clientName: "Admin update" }));
      await assertSucceeds(deleteDoc(ref));
    }
  });

  it("keeps account-creator-only users from using old admin claims", async () => {
    const db = actor("vojtech.mahr@bohemika.eu", { admin: true, adminRole: "owner" });
    await assertFails(setDoc(doc(db, "contracts/test"), { userEmail: OTHER }));
    await assertFails(setDoc(doc(db, `users/${OTHER}`), { specialist: true }));
  });

  it.each(["users", "usersPrivate"])("permits a trusted owner to manage %s roles", async (collection) => {
    const ref = reference(collection, OTHER, { admin: true, adminRole: "owner" });
    await assertSucceeds(setDoc(ref, { ...profile, specialist: false }));
    await assertSucceeds(updateDoc(ref, { specialist: true, canChangePosition: true }));
    await assertSucceeds(deleteDoc(ref));
  });

  it("preserves server-managed profile changes", async () => {
    // Admin SDK endpoints bypass client rules after their own authorization.
    await seed(`users/${EMAIL}`, { ...profile, specialist: true, position: "P8" });
    expect((await assertSucceeds(getDoc(reference("users")))).data()?.specialist).toBe(true);
  });
});

describe("existing data isolation", () => {
  it("allows the owner and declared manager to read a contract, denies unrelated users", async () => {
    await seed("contracts/test", { userEmail: EMAIL, userId: UID, managerEmailSnapshot: "manager@example.test", managerChain: [], managerOverrides: [] });
    await assertSucceeds(getDoc(doc(actor(), "contracts/test")));
    await assertSucceeds(getDoc(doc(actor("manager@example.test"), "contracts/test")));
    await assertFails(getDoc(doc(actor(OTHER), "contracts/test")));
  });

  it("allows an existing direct manager to read the public profile", async () => {
    await seed(`users/${EMAIL}`, { ...profile, managerEmail: OTHER });
    await assertSucceeds(getDoc(reference("users", OTHER)));
    await assertFails(getDoc(reference("usersPrivate", OTHER)));
  });

  it("keeps client cards accessible only through the server", async () => {
    const path = `clientCardsPrivate/${UID}/cards/test`;
    await seed(path, { ownerUid: UID });
    for (const db of [actor(), actor(OTHER), actor(OTHER, { admin: true, adminRole: "owner" })]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerUid: UID }));
    }
  });
});


describe("contract history is accessible only through the authorized server API", () => {
  it("denies direct reads, creation, changes and deletion even for the contract owner", async () => {
    await seed(`users/${EMAIL}`, profile);
    await seed(`users/${EMAIL}/entries/history-contract`, { userEmail: EMAIL, contractHistoryId: "history-1" });
    const path = "contractHistories/history-1/events/event-1";
    await seed(path, { title: "Historical change", actorEmail: OTHER });
    const event = doc(actor(), path);
    await assertFails(getDoc(event));
    await assertFails(setDoc(doc(actor(), "contractHistories/history-1/events/forged"), { title: "Forged" }));
    await assertFails(updateDoc(event, { title: "Rewritten" }));
    await assertFails(deleteDoc(event));
  });
});
