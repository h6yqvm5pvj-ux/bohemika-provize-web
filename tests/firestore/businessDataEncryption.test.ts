import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { withBusinessDataEncryption } from "../../src/lib/server/businessDataFirestore";
import { openBusinessRecord, planLegacyClaimMigration } from "../../src/lib/server/businessDataEncryption";
import { planPrivateDataMigration } from "../../src/lib/server/privateDataMigration";
import { withContractHistory, readContractHistory } from "../../src/lib/server/contractHistory";
import { buildTransferredContractData } from "../../src/app/api/contracts/_lib/contractsApi.transfer";
import { clientSlugForName } from "../../src/app/_klienti/clientIdentity";
import { readClientContractLinks } from "../../src/lib/server/clientContractIndex";

const mocks = vi.hoisted(() => ({ db: null as Firestore | null, guard: vi.fn() }));
vi.mock("../../src/lib/server/firebaseAdmin", () => ({ get adminDb() { return mocks.db; }, adminAuth: null, adminMessaging: null }));
vi.mock("../../src/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response }));

let app: App, raw: Firestore, db: Firestore;
const owner = "crypto-owner@example.test", stranger = "crypto-stranger@example.test", destinationOwner = "crypto-target@example.test";
const entriesPath = `users/${owner}/entries`;
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local demo emulator only");
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "business-data-tests");
  raw = getFirestore(app); db = withBusinessDataEncryption(raw); mocks.db = db;
});
beforeEach(async () => {
  await raw.recursiveDelete(raw.collection(entriesPath));
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner, uid: owner, decoded: { email: owner }, actorEmail: owner, actorUid: owner, isImpersonating: false, impersonation: null } });
  for (const email of [owner, stranger, destinationOwner]) {
    await raw.doc(`users/${email}`).set({ userId: email, accountType: "advisor", position: "poradce4", fullName: "Synthetic Advisor" });
    await raw.doc(`usersPrivate/${email}`).set({ subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" });
  }
});
afterAll(async () => { await raw?.terminate(); if (app) await deleteApp(app); });

describe("encrypted Firestore business boundary", () => {
  it("protects set/create/update, SDK overloads, batches and nested merge semantics", async () => {
    const ref = db.collection(entriesPath).doc("writes");
    await ref.set({ clientName: "Sensitive first", contractNumber: "CN-001", clientAddress: "Sensitive address", status: "active" });
    await ref.update("clientName", "Sensitive second");
    const before = await ref.get();
    await ref.update({ clientPhone: "Sensitive phone" }, { lastUpdateTime: before.updateTime! });
    expect((await ref.get()).data()).toMatchObject({ clientName: "Sensitive second", contractNumber: "CN-001" });
    const batch = db.batch();
    batch.update(ref, { contractNumber: "CN-002" }).create(db.collection(entriesPath).doc("batch"), { clientName: "Sensitive batch" });
    await batch.commit();
    await raw.doc(ref.path).update({ refreshCommissionBase: { oldPlaintext: "Sensitive retained map" } });
    await ref.set({ refreshCommissionBase: { originalContractNumber: "Sensitive original" }, neutral: { one: 1 } }, { merge: true });
    await ref.set({ neutral: { two: 2 } }, { merge: true });
    const physical = (await raw.doc(ref.path).get()).data()!;
    expect(JSON.stringify(physical)).not.toContain("Sensitive");
    expect(JSON.stringify(physical)).not.toContain("CN-002");
    expect(physical.refreshCommissionBase).not.toHaveProperty("oldPlaintext");
    expect((await ref.get()).data()).toMatchObject({ refreshCommissionBase: { originalContractNumber: "Sensitive original" }, neutral: { one: 1, two: 2 } });
    await ref.set({ clientName: "Sensitive masked", clientPhone: "unused" }, { mergeFields: ["clientName"] });
    expect((await ref.get()).get("clientName")).toBe("Sensitive masked");
    expect((await ref.get()).get("clientPhone")).toBe("Sensitive phone");
    await ref.update({ contractNumber: FieldValue.delete() });
    const deleted = (await raw.doc(ref.path).get()).data()!;
    expect(deleted).not.toHaveProperty("contractNumber");
    expect(deleted).not.toHaveProperty("_businessLookup_contractNumber");
  });

  it("queries mixed legacy and encrypted numbers, retains cursor/read-time and selected-field behavior", async () => {
    await raw.collection(entriesPath).doc("legacy").set({ clientName: "Sensitive legacy", contractNumber: "CN-123", productKey: "neon" });
    await db.collection(entriesPath).doc("new").set({ clientName: "Sensitive new", contractNumber: "CN-123", productKey: "neon" });
    const query = db.collection(entriesPath).where(new FieldPath("contractNumber"), "==", "CN-123").orderBy(FieldPath.documentId());
    const first = await query.limit(1).get();
    expect(first.docs[0].id).toBe("legacy");
    const next = await query.startAfter(first.docs[0]).get();
    expect(next.docs.map(doc => doc.id)).toEqual(["new"]);
    expect(next.docs[0].get("contractNumber")).toBe("CN-123");
    const selected = await db.collection(entriesPath).select("clientName").get();
    expect(selected.docs.map(doc => doc.data().clientName)).toEqual(["Sensitive legacy", "Sensitive new"]);
    const hydrated = await db.runTransaction(tx => tx.getAll(next.docs[0].ref, { fieldMask: ["clientName"] }), { readOnly: true, readTime: next.readTime });
    expect(hydrated[0].data()).toEqual({ clientName: "Sensitive new" });
    const all = await db.collectionGroup("entries").where("contractNumber", "==", "CN-123").get();
    expect(all.docs.filter(doc => doc.ref.path.startsWith(entriesPath)).length).toBe(2);
    expect(JSON.stringify(next.docs[0].data())).not.toContain("_businessLookup");
    const rawLegacy = await raw.collection(entriesPath).doc("legacy").get();
    await rawLegacy.ref.set(planPrivateDataMigration(rawLegacy.ref.path, rawLegacy.data()!)!);
    process.env.BUSINESS_DATA_ENCRYPTION_REQUIRED = "true";
    try { expect((await db.collection(entriesPath).where("contractNumber", "==", "CN-123").get()).size).toBe(2); }
    finally { process.env.BUSINESS_DATA_ENCRYPTION_REQUIRED = "false"; }
  });

  it("preserves transfer, history, client directory and encrypted destination context", async () => {
    const source = db.collection(entriesPath).doc("transfer");
    const target = db.doc(`users/${destinationOwner}/entries/transfer`);
    await raw.doc(target.path).delete();
    const original = { userEmail: owner, clientName: "Synthetic Client", clientPhone: "+420777000111", contractNumber: "CN-TRANSFER", productKey: "neon", entryType: "contract" };
    const batch = db.batch();
    batch.create(source, withContractHistory(batch, source, {}, original, { actorEmail: owner, kind: "created" }));
    await batch.commit();
    await db.runTransaction(async tx => {
      const before = (await tx.get(source)).data()!;
      const transferred = buildTransferredContractData({ contract: before, fromOwnerEmail: owner, toOwnerEmail: destinationOwner, toOwnerUserId: null, actorEmail: owner, transferredAt: new Date() });
      tx.create(target, withContractHistory(tx, source, before, transferred, { actorEmail: owner, kind: "transfer" }));
      tx.delete(source);
    });
    const current = (await target.get()).data()!;
    expect(current.clientName).toBe(original.clientName);
    expect((await source.get()).exists).toBe(false);
    expect((await readContractHistory(target, current, null)).events.length).toBe(2);
    const links = await readClientContractLinks(db, destinationOwner, null, clientSlugForName(original.clientName), null);
    expect(links).toHaveLength(1);
    expect(links[0].clientName).toBe(original.clientName);
    const physicalLinks = await raw.collection("clientContractLinks").where("ownerEmail", "==", destinationOwner).get();
    expect(JSON.stringify(physicalLinks.docs.map(doc => doc.data()))).not.toContain(original.clientName);
    expect(JSON.stringify(physicalLinks.docs.map(doc => doc.data()))).not.toContain("CN-TRANSFER");
    const physical = (await raw.doc(target.path).get()).data()!;
    expect(() => openBusinessRecord(source.path, physical)).toThrow();
  });

  it("preserves readable contract API output and denies foreign corrupted content", async () => {
    const ownRef = db.collection(entriesPath).doc("api");
    await ownRef.set({ userEmail: owner, clientName: "Sensitive Client", contractNumber: "CN-API", productKey: "neon", entryType: "contract", inputAmount: 1000, durationYears: 20, contractSignedDate: new Date("2025-01-01"), policyStartDate: new Date("2025-02-01") });
    const { handleContractsGet, handleContractsList } = await import("../../src/app/api/contracts/_lib/contractsApi");
    const detail = new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=api`);
    expect((await (await handleContractsGet(detail, "detail")).json()).contract.clientName).toBe("Sensitive Client");
    const list = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&q=Sensitive&limit=1"));
    expect(list.status).toBe(200);
    expect((await list.json()).contracts[0].contractNumber).toBe("CN-API");
    await raw.doc(ownRef.path).update({ clientName: { businessEncryption: 1, ciphertext: Buffer.from("bad") } });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: stranger, uid: stranger, decoded: { email: stranger }, actorEmail: stranger, actorUid: stranger, isImpersonating: false, impersonation: null } });
    expect((await handleContractsGet(detail, "detail")).status).toBe(403);
  });

  it("replaces legacy HTML/maps without retaining readable copies and moves number claim IDs", async () => {
    const statement = raw.doc(`usersPrivate/${owner}/commissionStatements/migration`);
    const legacy = { html: "<p>Sensitive original statement CN-777</p>", autoPremiumRows: [{ contractNumber: "CN-777" }] };
    await statement.set(legacy);
    await statement.set(planPrivateDataMigration(statement.path, (await statement.get()).data()!)!);
    expect((await db.doc(statement.path).get()).data()).toEqual(legacy);
    expect(planPrivateDataMigration(statement.path, (await statement.get()).data()!)).toBeNull();
    const claimPath = "contractNumberClaims/cn-777";
    const claim = { contractNumberNormalized: "CN-777", entryPath: `${entriesPath}/one` };
    const move = planLegacyClaimMigration(claimPath, claim)!;
    expect(move.path).toMatch(/^contractNumberClaims\/b1_[a-f0-9]{64}$/);
    expect(openBusinessRecord(move.path, move.data)).toEqual(claim);
    expect(planLegacyClaimMigration(move.path, move.data)).toBeNull();
  });

  it("protects query snapshot handles and rejects unsupported or manipulated private writes", async () => {
    const ref = db.collection(entriesPath).doc("guarded");
    await ref.set({ clientName: "Sensitive guarded", contractNumber: "CN-GUARD" });
    const page = await db.collection(entriesPath).get();
    expect((await page.query.where("contractNumber", "==", "CN-GUARD").get()).size).toBe(1);
    const txPage = await db.runTransaction(tx => tx.get(db.collection(entriesPath)));
    expect((await txPage.query.where("contractNumber", "==", "CN-GUARD").get()).size).toBe(1);
    expect(() => ref.update(new FieldPath("clientName"), FieldValue.increment(1))).toThrow();
    expect(() => ref.update({ "clientAddress.city": "Sensitive nested" })).toThrow();
    expect(() => ref.set({ _businessLookup_contractNumber: "client-controlled" }, { merge: true })).toThrow();
    expect(() => db.collection(entriesPath).orderBy("clientName")).toThrow();
    expect(() => db.collection(entriesPath).select("clientAddress.city")).toThrow();
    expect(() => db.bulkWriter()).toThrow();
    const statement = db.doc(`usersPrivate/${owner}/commissionStatements/query`);
    await statement.set({ autoPremiumContractNumbers: ["CN-GUARD", "CN-OTHER"], html: "Sensitive HTML" });
    const matches = await statement.parent.where("autoPremiumContractNumbers", "array-contains", "CN-GUARD").get();
    expect(matches.docs.map(doc => doc.id)).toContain("query");
    expect(matches.docs[0].get("html")).toBe("Sensitive HTML");
  });
});
