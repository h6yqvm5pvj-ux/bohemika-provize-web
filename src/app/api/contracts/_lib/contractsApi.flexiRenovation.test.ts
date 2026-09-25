import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateFlexi } from "@/app/lib/productFormulas/flexi";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(), doc: vi.fn(), batch: vi.fn(), transaction: vi.fn(), guard: vi.fn(), find: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, doc: mocks.doc, batch: mocks.batch, runTransaction: mocks.transaction },
  adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_source: string, run: () => unknown) => run(),
  trackCashflowWrite: (run: () => unknown) => run(), markCashflowMutationIncomplete: vi.fn(),
}));
vi.mock("@/lib/server/contractHistory", () => ({
  withContractHistory: (_tx: unknown, _ref: unknown, _before: unknown, patch: unknown) => patch,
}));
vi.mock("./contractsApi.duplicates", async importOriginal => ({
  ...await importOriginal<typeof import("./contractsApi.duplicates")>(),
  findExistingContractByNumber: mocks.find, collectContractDuplicateGuardRefs: async () => [],
}));

const owner = "advisor@example.test";
const manager = "manager@example.test";
const originalPath = `users/${owner}/entries/original`;
type Data = Record<string, unknown>;
let records: Map<string, Data>;
let sequence: number;

function reference(path: string) {
  return {
    id: path.split("/").at(-1)!, path,
    get: async () => snapshot(path),
    collection: (name: string) => collection(`${path}/${name}`),
  };
}
function snapshot(path: string) {
  const value = records.get(path);
  return { id: path.split("/").at(-1)!, exists: value != null, ref: reference(path), data: () => value };
}
function collection(path: string, filters: Array<[string, unknown]> = []) {
  return {
    doc: (id = `new-${++sequence}`) => reference(`${path}/${id}`),
    where: (field: string, _op: string, value: unknown) => collection(path, [...filters, [field, value]]),
    limit: () => collection(path, filters),
    get: async () => {
      const docs = [...records.keys()].filter(key => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
        .filter(key => filters.every(([field, value]) => records.get(key)?.[field] === value)).map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (doc: ReturnType<typeof snapshot>) => void) => docs.forEach(fn) };
    },
  };
}
function batch() {
  const pending: Array<() => void> = [];
  return {
    get: async (ref: { path: string }) => snapshot(ref.path),
    create: (ref: { path: string }, data: Data) => pending.push(() => records.set(ref.path, data)),
    set: (ref: { path: string }, data: Data, options?: { merge?: boolean }) => pending.push(() => records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...data })),
    delete: (ref: { path: string }) => pending.push(() => records.delete(ref.path)),
    commit: async () => { pending.forEach(write => write()); },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  sequence = 0;
  const profile = (email: string, position: string, managerEmail: string | null) => ({
    email, userId: email, position, managerEmail, commissionMode: "standard", accountType: "advisor",
    positionTimeline: [{ position, validFrom: "2020-01-01", validTo: null }],
  });
  records = new Map<string, Data>([
    [`users/${owner}`, profile(owner, "poradce1", manager)],
    [`users/${manager}`, profile(manager, "manazer4", null)],
    [`usersPrivate/${owner}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }],
    [originalPath, { productKey: "flexi", contractNumber: "OLD123", entryType: "contract", status: "active", inputAmount: 1_000, userEmail: owner }],
  ]);
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(reference);
  mocks.batch.mockImplementation(batch);
  mocks.transaction.mockImplementation(async (run: (tx: ReturnType<typeof batch>) => Promise<unknown>) => {
    const tx = batch();
    const result = await run(tx);
    await tx.commit();
    return result;
  });
  mocks.find.mockImplementation(async (number: string) => number === "OLD123" && records.has(originalPath)
    ? { entryPath: originalPath, entryId: "original", ownerEmail: owner } : null);
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email: owner, uid: owner, decoded: { email: owner }, actorEmail: owner, actorUid: owner, isImpersonating: false, impersonation: null,
  } });
});

async function save(patch: Data = {}) {
  const { handleContractsCreate } = await import("./contractsApi");
  const response = await handleContractsCreate(new NextRequest("https://example.test/api/contracts", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      productKey: "flexi", entryType: "contract", clientName: "Test Client", contractNumber: "NEW123",
      contractSignedDate: "2026-01-10", policyStartDate: "2026-02-01", durationYears: 30,
      frequencyRaw: "monthly", inputAmount: 1_500, effectiveInputAmount: 1_500,
      isRefresh: true, refreshOriginalContractNumber: "OLD123", calculationInputAmount: 999_999,
      flexiRenovation: { originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 500, guaranteeStatus: "unknown" },
      ...patch,
    }),
  }));
  const body = await response.json();
  return { response, body, saved: records.get(`users/${owner}/entries/${body.entryId}`) };
}

describe("saving FLEXI renovation", () => {
  it("recalculates adviser and manager commission server-side and cancels the original on the new policy start", async () => {
    const { response, body, saved } = await save();
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: "original" });
    expect(response.status).toBe(200);
    expect(saved).toMatchObject({ inputAmount: 1_500, effectiveInputAmount: 1_500, calculationInputAmount: 1_000,
      total: calculateFlexi(1_000, "poradce1", "standard", 30).total,
      commissionCalculationStatus: "provisional_flexi_renovation", requiresStatementRefresh: false,
      refreshCommissionBase: { calculationMonthlyPremium: 1_000, originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 500, provisional: true },
    });
    const overrides = saved?.managerOverrides as Array<{ email: string; total: number }>;
    expect(overrides).toHaveLength(1);
    expect(overrides[0].email).toBe(manager);
    const ordinary = await save({ contractNumber: "CONTROL123", isRefresh: false, refreshOriginalContractNumber: null,
      flexiRenovation: null, inputAmount: 1_000, effectiveInputAmount: 1_000 });
    expect(ordinary.body.ok).toBe(true);
    expect(overrides).toEqual(ordinary.saved?.managerOverrides);
    expect(records.get(originalPath)).toMatchObject({ status: "storno", stornoDate: new Date("2026-02-01"), refreshReplacedByEntryId: body.entryId });
  });
  it.each(["missing", "otherOwner", "wrongProduct"])("saves without cancellation when the original is %s", async situation => {
    if (situation === "missing") records.delete(originalPath);
    if (situation === "wrongProduct") records.get(originalPath)!.productKey = "neon";
    if (situation === "otherOwner") mocks.find.mockImplementation(async (number: string) => number === "OLD123"
      ? { entryPath: "users/another@example.test/entries/original", entryId: "original" } : null);
    const { body, saved } = await save();
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: null });
    expect(saved).toMatchObject({ calculationInputAmount: 1_000, refreshOriginalMissingInSystem: true, requiresStatementRefresh: false });
    expect(records.get(originalPath)?.status).not.toBe("storno");
  });
  it("persists zero commission for a contract in the guarantee period with no increase", async () => {
    const { body, saved } = await save({ inputAmount: 1_000, effectiveInputAmount: 1_000,
      flexiRenovation: { originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 0, guaranteeStatus: "inside" } });
    expect(body.ok).toBe(true);
    expect(saved).toMatchObject({ calculationInputAmount: 0, total: 0, refreshCommissionBase: { provisional: true } });
  });
  it("refuses to replace an original already linked to another renovation", async () => {
    records.get(originalPath)!.refreshReplacedByEntryId = "another-renovation";
    const { response } = await save();
    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(records.get(originalPath)?.status).toBe("active");
  });
});
