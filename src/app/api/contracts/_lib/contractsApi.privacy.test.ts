import "../../../../../tests/helpers/privateEncryptionTestKey";
import { NextRequest } from "next/server";
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
    return Object.assign(Object.create(ref), { get: async () => {
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
