import "../../../../../tests/helpers/privateEncryptionTestKey";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateFirestore } from "../../../../../tests/helpers/privateFirestore";
import { sealPrivateRecord } from "@/lib/server/privateRecords";

const mocks = vi.hoisted(() => ({ db: null as Firestore | null, guard: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return mocks.db; }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("./contractsApi.duplicates", async importOriginal => ({
  ...await importOriginal<typeof import("./contractsApi.duplicates")>(),
  resolveEntryRefsByContractNumber: mocks.find,
}));

const owner = "owner@example.test", manager = "manager@example.test";
const former = "former@example.test", tip = "tip@example.test", admin = "admin@example.test";
let store: ReturnType<typeof privateFirestore>;
const asUser = (email: string, administrator = false) => mocks.guard.mockResolvedValue({ ok: true, ctx: {
  email, uid: email, decoded: { email, ...(administrator ? { admin: true, adminRole: "admin" } : {}) },
  actorEmail: email, actorUid: email, isImpersonating: false, impersonation: null,
} });
const entry = (id: string, data: Record<string, unknown> = {}) => {
  const path = `users/${owner}/entries/${id}`;
  store.records.set(path, sealPrivateRecord(path, {
    userEmail: owner, clientName: "Test client", contractNumber: "12345", productKey: "neon",
    entryType: id === "root" ? "contract" : "endorsement", rootContractEntryId: "root",
    inputAmount: 1000, contractSignedDate: "2025-01-01", policyStartDate: "2025-02-01",
    durationYears: 20, ...data,
  }));
};
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); store = privateFirestore();
  const collection = store.db.collection.bind(store.db);
  // Match the real QuerySnapshot API used by the user hierarchy loader.
  mocks.db = Object.assign(Object.create(store.db), { collection: (name: string) => {
    const ref = collection(name);
    if (name !== "users") return ref;
    return Object.assign(Object.create(ref), { select() { return this; }, get: async () => {
      const snap = await ref.get();
      return { ...snap, forEach: (visit: (doc: typeof snap.docs[number]) => void) => snap.docs.forEach(visit) };
    } });
  } });
  for (const email of [owner, manager, former, tip, admin]) {
    store.records.set(`users/${email}`, { userId: email, accountType: "advisor", position: "manazer4",
      managerEmail: email === owner ? manager : null, fullName: email });
    store.records.set(`usersPrivate/${email}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" });
  }
  mocks.find.mockImplementation(async () => [...store.records.keys()]
    .filter(path => path.startsWith(`users/${owner}/entries/`) && path.split("/").length === 4)
    .map(path => store.db.doc(path)));
  asUser(owner);
});

describe("contract response privacy at the API boundary", () => {
  const renewalRequest = (updates: Record<string, unknown>) => new NextRequest("https://example.test/api/contracts", {
    method: "PATCH", body: JSON.stringify({ action: "updateFields", ownerEmail: owner, entryId: "root", updates }),
  });
  const neuron = () => entry("root", { productKey: "domexneuron", contractSignedDate: "2026-11-04", policyStartDate: "2026-11-05",
    automaticRenewal: true, policyEndDate: null, policyTermEndDate: new Date("2027-11-04") });

  it("returns the Neuron term boundary as a date while leaving actual maturity empty", async () => {
    neuron();
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).contract).toMatchObject({ automaticRenewal: true, policyEndDate: null, policyTermEndDate: Date.parse("2027-11-04") });
  });

  it("lets the owner disable prolongation with a matching actual maturity", async () => {
    neuron();
    const { handleContractsPatch, handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsPatch(renewalRequest({ automaticRenewal: false,
      policyTermEndDate: "2027-11-04T00:00:00.000Z", policyEndDate: "2027-11-04" }));
    expect(response.status).toBe(200);
    const detail = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await detail.json()).contract).toMatchObject({ automaticRenewal: false, policyEndDate: Date.parse("2027-11-04"), policyTermEndDate: Date.parse("2027-11-04") });
    expect((await handleContractsPatch(renewalRequest({ automaticRenewal: true, policyEndDate: null }))).status).toBe(200);
    const renewed = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await renewed.json()).contract).toMatchObject({ automaticRenewal: true, policyEndDate: null, policyTermEndDate: Date.parse("2027-11-04") });
  });

  it.each(["unauthenticated", "unrelated", "tipster"])("denies a Neuron prolongation change by %s", async actor => {
    neuron();
    if (actor === "unauthenticated") mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    else {
      asUser(actor === "tipster" ? tip : former);
      if (actor === "tipster") store.records.set(`users/${tip}`, { userId: tip, accountType: "tipster" });
    }
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    const response = await handleContractsPatch(renewalRequest({ automaticRenewal: false, policyEndDate: "2027-11-04" }));
    expect(response.status).toBe(actor === "unauthenticated" ? 401 : 403);
    expect([...store.records]).toEqual(before);
  });

  it.each([
    { automaticRenewal: "false" }, { automaticRenewal: false },
    { policyTermEndDate: "2027-02-30" },
    { automaticRenewal: false, policyEndDate: "2028-11-04" },
    { automaticRenewal: false, policyEndDate: "2027-11-04", productKey: "domex" },
  ])("rejects manipulated Neuron renewal updates without writing: %j", async updates => {
    neuron();
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest(updates))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it.each(["cppPPRbez", "cppAuto", "maxdomov", "cppcestovko"])("loads the explicitly linked %s amendment family from an original without chain metadata", async productKey => {
    entry("root", { productKey, rootContractEntryId: null });
    entry("decrease", { productKey, parentContractEntryId: "root", policyStartDate: "2026-02-01",
      previousInputAmount: 1000, newInputAmount: 800, premiumDelta: -200 });
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).timeline.map((item: { id: string }) => item.id)).toEqual(["root", "decrease"]);
  });

  it.each([owner, manager, admin])("loads non-life linked ancestors and descendants for an authorized %s", async viewer => {
    entry("root", { productKey: "cppPPRbez", rootContractEntryId: null });
    entry("decrease", { productKey: "cppPPRbez", parentContractEntryId: "root", policyStartDate: "2026-02-01" });
    asUser(viewer, viewer === admin);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=decrease`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).timeline.map((item: { id: string }) => item.id)).toEqual(["root", "decrease"]);
  });

  it("keeps an inaccessible non-life amendment out of a former manager's timeline", async () => {
    entry("root", { productKey: "cppAuto", rootContractEntryId: null, managerEmailSnapshot: former });
    entry("decrease", { productKey: "cppAuto", parentContractEntryId: "root", note: "private non-life sibling sentinel" });
    asUser(former);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timeline.map((item: { id: string }) => item.id)).toEqual(["root"]);
    expect(JSON.stringify(body)).not.toContain("private non-life sibling sentinel");
  });

  it("rejects an unrelated viewer before exposing a non-life family", async () => {
    entry("root", { productKey: "cppAuto" });
    entry("decrease", { productKey: "cppAuto", parentContractEntryId: "root", note: "private family sentinel" });
    asUser(former);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain("private family sentinel");
  });

  it("requires authentication before reading a non-life family", async () => {
    entry("root", { productKey: "cppAuto" });
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const { handleContractsGet } = await import("./contractsApi");
    const reads = vi.spyOn(mocks.db!, "collection");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(401);
    expect(reads).not.toHaveBeenCalled();
  });

  it("does not merge unrelated same-number records, foreign owners, different products or disconnected parents", async () => {
    entry("root", { productKey: "cppPPRbez", rootContractEntryId: null });
    entry("decrease", { productKey: "cppPPRbez", parentContractEntryId: "root", policyStartDate: "2026-02-01" });
    entry("legacy-same-number", { productKey: "cppPPRbez", rootContractEntryId: null, note: "unrelated legacy sentinel" });
    entry("wrong-product", { productKey: "cppAuto", parentContractEntryId: "root", note: "wrong product sentinel" });
    entry("wrong-number", { productKey: "cppPPRbez", contractNumber: "54321", parentContractEntryId: "root", note: "wrong number sentinel" });
    entry("disconnected", { productKey: "cppPPRbez", parentContractEntryId: "missing", note: "disconnected sentinel" });
    entry("self-parent", { productKey: "cppPPRbez", parentContractEntryId: "self-parent", note: "self-parent sentinel" });
    entry("cycle-a", { productKey: "cppPPRbez", parentContractEntryId: "cycle-b", note: "cycle sentinel" });
    entry("cycle-b", { productKey: "cppPPRbez", parentContractEntryId: "cycle-a", note: "cycle sentinel" });
    const foreignPath = `users/${former}/entries/foreign`;
    store.records.set(foreignPath, sealPrivateRecord(foreignPath, { userEmail: former, contractNumber: "12345",
      productKey: "cppPPRbez", entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root", note: "foreign owner sentinel" }));
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timeline.map((item: { id: string }) => item.id)).toEqual(["root", "decrease"]);
    expect(JSON.stringify(body)).not.toContain("sentinel");
  });

  it.each(["conseqzenit"])("keeps %s outside proportional insurance timelines", async productKey => {
    entry("root", { productKey });
    entry("decrease", { productKey, parentContractEntryId: "root", note: "unsupported product sentinel" });
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).timeline.map((item: { id: string }) => item.id)).toEqual(["root"]);
  });

  it.each([owner, manager, admin])("returns 404 for a retired contract to %s while supported contracts remain accessible", async viewer => {
    entry("retired", { productKey: "comfortcc", note: "retired private sentinel", rootContractEntryId: null });
    entry("root", { rootContractEntryId: null });
    asUser(viewer, viewer === admin);
    const { handleContractsGet } = await import("./contractsApi");
    const retired = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=retired`), "detail");
    expect(retired.status).toBe(404);
    expect(await retired.json()).toEqual({ ok: false, error: "Smlouva nebyla nalezena." });
    const valid = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(valid.status).toBe(200);
    expect((await valid.json()).contract.id).toBe("root");
    expect(store.records.has(`users/${owner}/entries/retired`)).toBe(true);
  });

  it.each([owner, manager, admin])("omits retired contracts from lists and single/bulk matching for %s", async viewer => {
    if (viewer === admin) store.records.set(`users/${owner}`, { ...store.records.get(`users/${owner}`), managerEmail: admin });
    entry("retired", { productKey: "comfortcc", rootContractEntryId: null, note: "retired private sentinel", contractSignedDate: "2026-01-01" });
    entry("root", { rootContractEntryId: null });
    asUser(viewer, viewer === admin);
    const { handleContractsList, handleContractsFind, handleContractsFindBulk } = await import("./contractsApi");
    const scope = viewer === owner ? "my" : "team";
    const list = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=${scope}&limit=5`));
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.contracts.map((item: { id: string }) => item.id)).toEqual(["root"]);
    expect(listed.hasMore).toBe(false);
    expect(listed.nextCursor).toBe(new Date("2025-01-01").getTime());
    const find = await handleContractsFind(new NextRequest(`https://example.test/api/contracts/find?scope=${scope}&q=12345`));
    expect(find.status).toBe(200);
    expect((await find.json()).contracts.map((item: { id: string }) => item.id)).toEqual(["root"]);
    const bulk = await handleContractsFindBulk(new NextRequest("https://example.test/api/contracts/find", { method: "POST",
      body: JSON.stringify({ requests: [{ key: "match", q: "12345", scope }] }) }));
    expect(bulk.status).toBe(200);
    expect((await bulk.json()).results[0].contracts.map((item: { id: string }) => item.id)).toEqual(["root"]);
  });

  it.each([false, true])("rejects retired contract creation without changing stored records (wrapped=%s)", async wrapped => {
    const raw = { productKey: "comfortcc", entryType: "contract", frequencyRaw: "annual", clientName: "Test Client",
      contractNumber: "987654", contractSignedDate: "2026-01-01", policyStartDate: "2026-02-01", inputAmount: 1000 };
    const before = structuredClone([...store.records]);
    const { handleContractsCreate } = await import("./contractsApi");
    const response = await handleContractsCreate(new NextRequest("https://example.test/api/contracts", { method: "POST",
      body: JSON.stringify(wrapped ? { entry: raw } : raw) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("productKey") });
    expect([...store.records]).toEqual(before);
  });

  it("does not let a retired product payload bypass cross-owner creation authorization", async () => {
    const { handleContractsCreate } = await import("./contractsApi");
    const before = structuredClone([...store.records]);
    const response = await handleContractsCreate(new NextRequest("https://example.test/api/contracts", { method: "POST",
      body: JSON.stringify({ ownerEmail: former, entry: { productKey: "comfortcc" } }) }));
    expect(response.status).toBe(403);
    expect([...store.records]).toEqual(before);
  });

  it("requires authentication before retired contract reads, matching or creation", async () => {
    entry("retired", { productKey: "comfortcc" });
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const { handleContractsGet, handleContractsList, handleContractsFind, handleContractsCreate } = await import("./contractsApi");
    const reads = vi.spyOn(mocks.db!, "collection");
    for (const response of [
      await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=retired`), "detail"),
      await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my")),
      await handleContractsFind(new NextRequest("https://example.test/api/contracts/find?scope=my&q=12345")),
      await handleContractsCreate(new NextRequest("https://example.test/api/contracts", { method: "POST", body: JSON.stringify({ productKey: "comfortcc" }) })),
    ]) expect(response.status).toBe(401);
    expect(reads).not.toHaveBeenCalled();
  });

  it.each([owner, manager, admin])("filters confirmed premium changes by their author for %s", async viewer => {
    const makeChange = (writtenBy: string, key: string) => ({ key, statementId: key, statementNumber: "10", statementPeriod: null,
      statementDate: null, productCode: "CPP_NEON", annualIncrease: 1548, previousMonthlyPremium: 2350,
      newMonthlyPremium: 2479, effectiveDate: "2026-01-01", writtenBy, confirmedAtMs: 1 });
    entry("root", { confirmedLifePremiumChanges: [makeChange(owner, "own-source"), makeChange(manager, "manager-private-source")] });
    asUser(viewer, viewer === admin);
    const { handleContractsGet, handleContractsFind } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contract.confirmedLifePremiumChanges.map((item: { key: string }) => item.key))
      .toEqual(viewer === owner ? ["own-source"] : ["own-source", "manager-private-source"]);
    if (viewer === owner) expect(JSON.stringify(body)).not.toContain("manager-private-source");
    const find = await handleContractsFind(new NextRequest(`https://example.test/api/contracts/find?scope=${viewer === owner ? "my" : "team"}&q=12345`));
    if (viewer === admin) { expect(find.status).toBe(403); return; }
    expect(find.status).toBe(200);
    const matched = await find.json();
    expect(matched.contracts[0].confirmedLifePremiumChanges).toEqual(body.contract.confirmedLifePremiumChanges);
    if (viewer === owner) expect(JSON.stringify(matched)).not.toContain("manager-private-source");
  });
  it.each(["root/contractNotes/secret", "root%2FcontractNotes%2Fsecret"])("rejects nested entry paths: %s", async suppliedId => {
    entry("root");
    const notePath = `users/${owner}/entries/root/contractNotes/secret`;
    store.records.set(notePath, sealPrivateRecord(notePath, { text: "Private nested note" }));
    const { handleContractsGet, handleContractsPatch, handleContractsDelete } = await import("./contractsApi");
    // URL decoding happens once before validation. A literal percent-encoded
    // ID in JSON is just a different document ID and cannot traverse a path.
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=${suppliedId}`), "detail");
    expect(response.status).toBe(400);
    if (suppliedId.includes("/")) {
      const request = (method: string, body: unknown) => new NextRequest("https://example.test/api/contracts", { method, body: JSON.stringify(body) });
      expect((await handleContractsPatch(request("PATCH", { action: "syncEntryIndex", ownerEmail: owner, entryId: suppliedId }))).status).toBe(400);
      expect((await handleContractsDelete(request("DELETE", { entries: [{ ownerEmail: owner, entryId: "root" }, { ownerEmail: owner, entryId: suppliedId }] }))).status).toBe(400);
    }
    expect(store.records.has(notePath)).toBe(true);
    expect(store.records.has(`users/${owner}/entries/root`)).toBe(true);
  });
  it.each([former, owner, manager, admin])("authorizes each detail sibling for %s", async viewer => {
    entry("root", { managerEmailSnapshot: former, note: "allowed root note" });
    entry("new", { inputAmount: 9876, note: "private sibling sentinel" });
    asUser(viewer, viewer === admin);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contract.note).toBe("allowed root note");
    expect(body.timeline.map((item: { id: string }) => item.id)).toEqual(viewer === former ? ["root"] : ["new", "root"]);
    if (viewer === former) expect(JSON.stringify(body)).not.toContain("private sibling sentinel");
  });

  it.each(["GET", "POST"])("limits %s TIP matching to permitted data and siblings", async method => {
    entry("root", { tipContractTipsterEmail: tip, tipContractTipsterPercent: 15,
      tipContractTipsterAmountFirstYear: 123, note: "private inline sentinel", privateFutureField: "future secret",
      contractNotesPath: `users/${owner}/entries/root`, contractHistoryId: "private-history",
      clientEmail: "private-contact@example.test", managerOverrides: [{ email: manager, total: 99999 }],
    });
    entry("allowed", { tipContractTipsterEmail: tip, inputAmount: 2000, note: "allowed sibling private note" });
    entry("forbidden", { inputAmount: 9876, note: "forbidden sibling private note" });
    entry("retired", { productKey: "comfortcc", tipContractTipsterEmail: tip, inputAmount: 9999 });
    asUser(tip);
    const { handleContractsFind, handleContractsFindBulk } = await import("./contractsApi");
    const response = method === "GET"
      ? await handleContractsFind(new NextRequest("https://example.test/api/contracts/find?scope=tip&q=12345"))
      : await handleContractsFindBulk(new NextRequest("https://example.test/api/contracts/find", { method: "POST",
        body: JSON.stringify({ requests: [{ key: "tip", q: "12345", scope: "tip" }] }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const contracts = method === "GET" ? body.contracts : body.results[0].contracts;
    expect(contracts).toHaveLength(2);
    const root = contracts.find((item: { id: string }) => item.id === "root");
    expect(root).toMatchObject({ contractNumber: "12345", inputAmount: 1000,
      tipContractTipsterPercent: 15, tipContractTipsterAmountFirstYear: 123 });
    expect(root.lifePremiumChanges.map((item: { id: string }) => item.id).sort()).toEqual(["allowed", "root"]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("comfortcc");
    for (const secret of ["sentinel", "future secret", "private-history", "private-contact", "private note", "9876", "99999"])
      expect(serialized).not.toContain(secret);
    expect(root).not.toHaveProperty("note");
    expect(root).not.toHaveProperty("contractNotesPath");
    expect(root).not.toHaveProperty("contractPdfAttachment");
  });

  it.each([owner, manager, admin])("filters commission data before pagination for %s", async viewer => {
    // The team list is selected by actual hierarchy; the separate detail test
    // above exercises an administrator without a team reading this contract.
    if (viewer === admin) store.records.set(`users/${owner}`, { ...store.records.get(`users/${owner}`), managerEmail: admin });
    entry("root", { productKey: "cppAuto", commissionPayouts: [{ key: "difference", code: "A101",
      amount: 10, expectedAmount: 100, difference: -90, status: "difference", writtenBy: manager }] });
    asUser(viewer, viewer === admin);
    const { handleContractsList } = await import("./contractsApi");
    const scope = viewer === owner ? "my" : "team";
    const response = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=${scope}&commissionAudit=difference&commissionCode=a101&limit=1`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contracts).toHaveLength(viewer === owner ? 0 : 1);
    expect(body.hasMore).toBe(false);
    if (viewer === owner) expect(body.nextCursor).toBeNull();
  });
});
