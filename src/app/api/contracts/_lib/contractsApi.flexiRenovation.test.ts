import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLEXI_RENOVATION_MISSING_BASE } from "@/app/lib/flexiRenovation";
import { calculateFlexi } from "@/app/lib/productFormulas/flexi";
import { calculateDomexNeuron } from "@/app/lib/productFormulas/domexNeuron";
import { calculateCommission } from "@/app/lib/calculateCommission";
import { ORIGINAL_CONTRACT_REPLACEMENT_PRODUCTS } from "@/app/lib/originalContractReplacement";
import { buildIdempotentEntryId } from "./contractsApi.identity";
import { contractNoteLocationRef } from "@/lib/server/contractNoteLocation";

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
    firestore: { collection: mocks.collection, doc: mocks.doc },
    get: async () => snapshot(path),
    collection: (name: string) => collection(`${path}/${name}`),
  };
}
function snapshot(path: string) {
  const value = records.get(path);
  return { id: path.split("/").at(-1)!, exists: value != null, updateTime: {}, ref: reference(path), data: () => value };
}
function collection(path: string, filters: Array<[string, unknown]> = []) {
  return {
    select() { return this; },
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
    update: (ref: { path: string }, data: Data) => pending.push(() => records.set(ref.path, { ...records.get(ref.path), ...data })),
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

async function save(patch: Data = {}, retryKey?: string) {
  const { handleContractsCreate } = await import("./contractsApi");
  const response = await handleContractsCreate(new NextRequest("https://example.test/api/contracts", {
    method: "POST", headers: { "content-type": "application/json", ...(retryKey ? { "x-idempotency-key": retryKey } : {}) }, body: JSON.stringify({
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

describe("FLEXI renovation awaiting a base", () => {
  const withoutBase = { flexiRenovationWithoutBase: true, flexiRenovation: null, calculationInputAmount: null };

  async function resolve(entryId: string, details: Data = { originalMonthlyPremium: 1000, guaranteeStatus: "outside" }) {
    const { handleContractsUpdateFields } = await import("./contractsApi");
    return handleContractsUpdateFields(new NextRequest("https://example.test/api/contracts/update-fields", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerEmail: owner, entryId, updates: { resolveFlexiRenovation: details } }),
    }));
  }

  it.each([null, "OLD123"])("saves the new premium without calculating or cancelling the original (%s)", async refreshOriginalContractNumber => {
    const { response, saved } = await save({ ...withoutBase, refreshOriginalContractNumber });
    expect(response.status).toBe(200);
    expect(saved).toMatchObject({
      inputAmount: 1500, effectiveInputAmount: 1500, isRefresh: true, refreshOriginalContractNumber,
      calculationInputAmount: null, refreshCommissionBase: null, items: [], managerOverrides: [],
      commissionCalculationStatus: FLEXI_RENOVATION_MISSING_BASE,
    });
    expect(mocks.find).not.toHaveBeenCalledWith("OLD123");
    expect(records.get(originalPath)).toMatchObject({ status: "active" });
  });

  it.each([
    { flexiRenovationWithoutBase: "true" }, { isRefresh: false }, { productKey: "neon" },
    { calculationInputAmount: 1500 }, { effectiveInputAmount: 1000 }, { inputAmount: 0 },
    { tipContractTipsterPercent: 50 }, { refreshOriginalContractNumber: "NEW123" },
  ])("rejects manipulated create fields %j", async overrides => {
    const { response } = await save({ ...withoutBase, ...overrides });
    expect(response.status).toBe(400);
  });

  it("computes the base and commissions from saved contract data and preserves the receipts", async () => {
    const { body } = await save(withoutBase);
    const path = `users/${owner}/entries/${body.entryId}`;
    const commissionPayouts = [{ code: "A101", amount: 2345, status: "paid" }];
    records.set(path, { ...records.get(path), commissionPayouts });
    expect((await resolve(body.entryId)).status).toBe(200);
    expect(records.get(path)).toMatchObject({
      inputAmount: 1500, calculationInputAmount: 1000, refreshOriginalMissingInSystem: true,
      refreshCommissionBase: { originalMonthlyPremium: 1000, premiumIncreaseMonthly: 500, guaranteeStatus: "outside" },
      commissionCalculationStatus: "calculated_flexi_renovation",
      items: expect.arrayContaining([expect.objectContaining({ code: "A101", amount: expect.any(Number) })]),
      managerOverrides: expect.arrayContaining([expect.objectContaining({ email: manager })]),
      commissionPayouts,
    });
    expect(records.get(originalPath)?.status).toBe("active");
    expect((await resolve(body.entryId)).status).toBe(409);
  });

  it("rejects missing authentication, restricted roles and a different contract owner", async () => {
    const { body } = await save(withoutBase);
    const ctx = { email: owner, uid: owner, decoded: { email: owner }, actorEmail: owner, actorUid: owner, isImpersonating: false, impersonation: null };
    mocks.guard.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await resolve(body.entryId)).status).toBe(401);
    const tipster = "tipster@example.test";
    records.set(`users/${tipster}`, { email: tipster, accountType: "tipster" });
    records.set(`usersPrivate/${tipster}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" });
    mocks.guard.mockResolvedValueOnce({ ok: true, ctx: { ...ctx, uid: tipster, email: tipster,
      decoded: { email: tipster }, actorEmail: tipster, actorUid: tipster } });
    expect((await resolve(body.entryId)).status).toBe(403);
    const foreign = "outsider@example.test";
    records.set(`users/${foreign}`, { email: foreign, accountType: "advisor" });
    records.set(`usersPrivate/${foreign}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" });
    mocks.guard.mockResolvedValueOnce({ ok: true, ctx: { ...ctx, uid: foreign, email: foreign,
      decoded: { email: foreign }, actorEmail: foreign, actorUid: foreign } });
    expect((await resolve(body.entryId)).status).toBe(403);
    expect(records.get(`users/${owner}/entries/${body.entryId}`)?.commissionCalculationStatus).toBe(FLEXI_RENOVATION_MISSING_BASE);
  });

  it.each([
    { originalMonthlyPremium: 1700, guaranteeStatus: "inside" },
    { originalMonthlyPremium: "1000", guaranteeStatus: "outside" },
    { originalMonthlyPremium: 1000, guaranteeStatus: "unknown" },
    { originalMonthlyPremium: 1000, guaranteeStatus: "outside", position: "manazer4" },
  ])("rejects unverified or forged resolution details %j", async details => {
    const { body } = await save(withoutBase);
    expect((await resolve(body.entryId, details)).status).toBe(400);
  });
});

describe("saving FLEXI renovation", () => {
  it.each([owner, "foreign@example.test"])("keeps duplicate metadata private for owner %s", async duplicateOwner => {
    mocks.find.mockImplementation(async (number: string) => number === "NEW123"
      ? {entryPath:`users/${duplicateOwner}/entries/private-record`,ownerEmail:duplicateOwner,entryId:"private-record"}
      : number === "OLD123" ? {entryPath:originalPath,ownerEmail:owner,entryId:"original"} : null);
    const before = new Map(records);
    const {response,body}=await save();
    expect(response.status).toBe(409);
    expect(body).toEqual({ok:false,error:"Smlouva s tímto číslem už v systému existuje."});
    expect(records).toEqual(before);
  });
  it("keeps duplicate race errors private and does not write", async () => {
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error("Smlouva s tímto číslem už v systému existuje."),{
      statusCode:409,duplicatePath:"users/foreign@example.test/entries/private-record",
    }));
    const before = new Map(records);
    const {response,body}=await save();
    expect(response.status).toBe(409);
    expect(body).toEqual({ok:false,error:"Smlouva s tímto číslem už v systému existuje."});
    expect(records).toEqual(before);
  });
  it("rejects reuse of an idempotency key reserved by transferred notes before writing anything", async () => {
    const key = "transferred-original-key";
    const path = `users/${owner}/entries/${buildIdempotentEntryId(owner, key)}`;
    const registry = contractNoteLocationRef(mocks.doc(path));
    records.set(registry.path, { contractPath: `users/${manager}/entries/moved` });
    const before = JSON.stringify([...records]);
    const { response } = await save({}, key);
    expect(response.status).toBe(409);
    expect(records.has(path)).toBe(false);
    expect(JSON.stringify([...records])).toBe(before);
  });
  it("keeps a normal idempotent retry and rejects an already recreated foreign notes root", async () => {
    const key = "normal-retry";
    const payload = { isRefresh: false, refreshOriginalContractNumber: null, flexiRenovation: null };
    const first = await save(payload, key);
    expect(first.response.status).toBe(200);
    const retry = await save(payload, key);
    expect(retry.body).toMatchObject({ ok: true, entryId: first.body.entryId, idempotentReplay: true });
    const path = `users/${owner}/entries/${first.body.entryId}`;
    records.set(contractNoteLocationRef(mocks.doc(path)).path, { contractPath: `users/${manager}/entries/moved` });
    expect((await save(payload, key)).response.status).toBe(409);
  });
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

describe("saving ČPP Auto replacements from the statement queue", () => {
  const cppReplacement = {
    productKey: "cppAuto", frequencyRaw: "annual", durationYears: null, flexiRenovation: null,
    inputAmount: 12000, effectiveInputAmount: 12000, createdFromCommissionStatement: true,
  };

  it("links the original and cancels it one day before the new policy starts", async () => {
    records.get(originalPath)!.productKey = "cppAuto";
    const { response, body, saved } = await save(cppReplacement);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: "original" });
    expect(saved).toMatchObject({ productKey: "cppAuto", isRefresh: true, refreshOriginalContractNumber: "OLD123" });
    expect(records.get(originalPath)).toMatchObject({
      status: "storno", stornoDate: new Date("2026-01-31"), refreshReplacedByEntryId: body.entryId,
    });
  });

  it.each(["missing", "wrongProduct"])("does not cancel an original that is %s", async situation => {
    const foreignPath = "users/another@example.test/entries/original";
    records.set(foreignPath, { productKey: "cppAuto", contractNumber: "OLD123", status: "active" });
    if (situation === "missing") records.delete(originalPath);
    const beforeOriginal = records.has(originalPath) ? { ...records.get(originalPath)! } : undefined;
    const beforeForeign = { ...records.get(foreignPath)! };
    const { response, body, saved } = await save(cppReplacement);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: null });
    expect(saved).toMatchObject({ isRefresh: true, refreshOriginalContractNumber: "OLD123" });
    expect(records.get(originalPath)).toEqual(beforeOriginal);
    expect(records.get(foreignPath)).toEqual(beforeForeign);
  });

  it("rejects an unauthenticated save without writing data", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }) });
    const before = new Map(records);
    const { handleContractsCreate } = await import("./contractsApi");
    const response = await handleContractsCreate(new NextRequest("https://example.test/api/contracts", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(records).toEqual(before);
  });

  it("rejects saves by a tipster account without writing data", async () => {
    records.get(`users/${owner}`)!.accountType = "tipster";
    const before = new Map(records);
    const { response } = await save(cppReplacement);
    expect(response.status).toBe(403);
    expect(records).toEqual(before);
  });

  it("saves an unlinked replacement when the original already has a successor", async () => {
    Object.assign(records.get(originalPath)!, { productKey: "cppAuto", refreshReplacedByEntryId: "another-replacement" });
    const originalBefore = { ...records.get(originalPath)! };
    const { response, body, saved } = await save(cppReplacement);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: null });
    expect(saved).toMatchObject({ productKey: "cppAuto", isRefresh: true, refreshOriginalContractNumber: "OLD123" });
    expect(records.get(originalPath)).toEqual(originalBefore);
  });

  it.each([
    [{ ownerEmail: "another@example.test" }, 403],
    [{ refreshOriginalContractNumber: "NEW123" }, 400],
    [{ refreshOriginalContractNumber: "" }, 400],
    [{ isRefresh: "true" }, 400],
  ] as const)("rejects unauthorized or manipulated queue saves: %j", async (patch, status) => {
    const before = new Map(records);
    const { response } = await save({ ...cppReplacement, ...patch });
    expect(response.status).toBe(status);
    expect(records).toEqual(before);
  });
});

describe.each([
  ["kooperativaAuto", "2026-01-31"],
  ["allianzAuto", "2026-01-31"],
  ["koopmajetekobcan", "2026-02-01"],
  ["koopfit", "2026-02-01"],
] as const)("saving %s replacements", (productKey, stornoDate) => {
  const replacement = {
    productKey, frequencyRaw: "annual", durationYears: null, flexiRenovation: null,
    inputAmount: 12_000, effectiveInputAmount: 12_000,
  };

  beforeEach(() => {
    records.get(originalPath)!.productKey = productKey;
  });

  it("links an owned original, cancels it at the correct date and calculates commission on the server", async () => {
    const expected = calculateCommission({
      productKey, position: "poradce1", commissionMode: "standard", contractSignedDateIso: "2026-01-10",
      inputAmount: 12_000, frequencyRaw: "annual", durationYears: null, durationMonths: null, maxCizinKomplexVariant: null,
    });
    if (!expected) throw new Error(`Commission calculation is unavailable for ${productKey}`);
    const { response, body, saved } = await save(replacement);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: "original" });
    expect(saved).toMatchObject({
      productKey, isRefresh: true, refreshOriginalContractNumber: "OLD123",
      inputAmount: 12_000, calculationInputAmount: 12_000, position: "poradce1", total: expected.total,
    });
    expect(records.get(originalPath)).toMatchObject({
      status: "storno", stornoDate: new Date(stornoDate), refreshReplacedByEntryId: body.entryId,
      refreshReplacedByOwnerEmail: owner,
    });
  });

  it.each(["missing", "wrongProduct"])("preserves an original that is %s and saves without linking", async situation => {
    const foreignOwner = "foreign@example.test";
    const foreignPath = `users/${foreignOwner}/entries/original`;
    records.set(foreignPath, { productKey, contractNumber: "OLD123", status: "active" });
    if (situation === "missing") records.delete(originalPath);
    if (situation === "wrongProduct") records.get(originalPath)!.productKey = "neon";
    const beforeOriginal = records.has(originalPath) ? { ...records.get(originalPath)! } : undefined;
    const beforeForeign = { ...records.get(foreignPath)! };
    const { response, body, saved } = await save(replacement);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: null });
    expect(JSON.stringify(body)).not.toContain(foreignOwner);
    expect(saved).toMatchObject({ productKey, isRefresh: true, refreshOriginalContractNumber: "OLD123" });
    expect(records.get(originalPath)).toEqual(beforeOriginal);
    expect(records.get(foreignPath)).toEqual(beforeForeign);
  });

  it("rejects an unauthenticated replacement without writing data", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: Response.json({ ok: false }, { status: 401 }) });
    const before = new Map(records);
    const { response } = await save(replacement);
    expect(response.status).toBe(401);
    expect(records).toEqual(before);
  });

  it("rejects a tipster replacement even if the client claims an advisor role", async () => {
    records.get(`users/${owner}`)!.accountType = "tipster";
    const before = new Map(records);
    const { response } = await save({ ...replacement, accountType: "advisor", role: "admin" });
    expect(response.status).toBe(403);
    expect(records).toEqual(before);
  });

  it.each([
    [{ ownerEmail: "foreign@example.test" }, 403],
    [{ refreshOriginalContractNumber: "NEW123" }, 400],
    [{ refreshOriginalContractNumber: "" }, 400],
    [{ refreshOriginalContractNumber: {} }, 400],
    [{ isRefresh: "true" }, 400],
    [{ position: "manazer10", total: 999_999 }, 400],
  ] as const)("rejects unauthorized or manipulated replacements: %j", async (patch, status) => {
    const before = new Map(records);
    const { response } = await save({ ...replacement, ...patch });
    expect(response.status).toBe(status);
    expect(records).toEqual(before);
  });

  it("preserves an original that already has a successor", async () => {
    records.get(originalPath)!.refreshReplacedByEntryId = "existing-replacement";
    const before = new Map(records);
    const { response } = await save(replacement);
    expect(response.status).toBe(409);
    expect(records).toEqual(before);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("saving DOMEX Neuron replacements", () => {
  const neuronReplacement = {
    productKey: "domexneuron", frequencyRaw: "annual", durationYears: null, flexiRenovation: null,
    contractSignedDate: "2026-11-04", policyStartDate: "2026-11-05",
    inputAmount: 12_000, effectiveInputAmount: 12_000,
  };

  it.each(["domexneuron", "domex"])("links an owned %s original and cancels it on the new policy start", async originalProduct => {
    records.get(originalPath)!.productKey = originalProduct;
    const { response, body, saved } = await save(neuronReplacement);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: "original" });
    expect(saved).toMatchObject({
      productKey: "domexneuron", isRefresh: true, refreshOriginalContractNumber: "OLD123",
      total: calculateDomexNeuron(12_000, "annual", "poradce1").total,
    });
    expect(records.get(originalPath)).toMatchObject({
      status: "storno", stornoDate: new Date("2026-11-05"), refreshReplacedByEntryId: body.entryId,
    });
  });

  it.each(["missing", "wrongProduct"])("saves the replacement without changing an original that is %s", async situation => {
    const foreignPath = "users/foreign@example.test/entries/original";
    records.set(foreignPath, { productKey: "domex", contractNumber: "OLD123", status: "active" });
    if (situation === "missing") records.delete(originalPath);
    const beforeOriginal = records.has(originalPath) ? { ...records.get(originalPath)! } : undefined;
    const beforeForeign = { ...records.get(foreignPath)! };
    const { response, body, saved } = await save(neuronReplacement);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: null });
    expect(JSON.stringify(body)).not.toContain("foreign@example.test");
    expect(saved).toMatchObject({
      productKey: "domexneuron", isRefresh: true, refreshOriginalContractNumber: "OLD123",
      total: calculateDomexNeuron(12_000, "annual", "poradce1").total,
      requiresStatementRefresh: null, commissionCalculationStatus: null, commissionBaseSource: null,
    });
    expect(records.get(originalPath)).toEqual(beforeOriginal);
    expect(records.get(foreignPath)).toEqual(beforeForeign);
  });

  it("saves an explicitly unlinked replacement even without the original number", async () => {
    records.delete(originalPath);
    const { response, body, saved } = await save({
      ...neuronReplacement, refreshOriginalMissingInSystem: true, refreshOriginalContractNumber: null,
    });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: null });
    expect(saved).toMatchObject({
      isRefresh: true, refreshOriginalMissingInSystem: true, refreshOriginalContractNumber: null,
      total: calculateDomexNeuron(12_000, "annual", "poradce1").total,
      requiresStatementRefresh: null, commissionCalculationStatus: null, commissionBaseSource: null,
    });
  });

  it("preserves an explicitly unlinked original number without linking or cancelling an existing original", async () => {
    records.get(originalPath)!.productKey = "domex";
    const beforeOriginal = { ...records.get(originalPath)! };
    const { response, body, saved } = await save({ ...neuronReplacement, refreshOriginalMissingInSystem: true });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalEntryId: null });
    expect(saved).toMatchObject({
      isRefresh: true, refreshOriginalMissingInSystem: true, refreshOriginalContractNumber: "OLD123",
      total: calculateDomexNeuron(12_000, "annual", "poradce1").total,
      requiresStatementRefresh: null, commissionCalculationStatus: null, commissionBaseSource: null,
    });
    expect(mocks.find).not.toHaveBeenCalledWith("OLD123");
    expect(records.get(originalPath)).toEqual(beforeOriginal);
  });

  it("rejects an unauthenticated replacement without writing data", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: Response.json({ ok: false }, { status: 401 }) });
    const before = new Map(records);
    const { response } = await save(neuronReplacement);
    expect(response.status).toBe(401);
    expect(records).toEqual(before);
  });

  it("rejects a tipster replacement without writing data", async () => {
    records.get(`users/${owner}`)!.accountType = "tipster";
    const before = new Map(records);
    const { response } = await save(neuronReplacement);
    expect(response.status).toBe(403);
    expect(records).toEqual(before);
  });

  it.each([
    [{ ownerEmail: "foreign@example.test" }, 403],
    [{ refreshOriginalContractNumber: "NEW123" }, 400],
    [{ refreshOriginalContractNumber: {} }, 400],
    [{ isRefresh: "true" }, 400],
  ] as const)("rejects unauthorized or manipulated replacements: %j", async (patch, status) => {
    const before = new Map(records);
    const { response } = await save({ ...neuronReplacement, ...patch });
    expect(response.status).toBe(status);
    expect(records).toEqual(before);
  });
});

describe.each(ORIGINAL_CONTRACT_REPLACEMENT_PRODUCTS)("cross-owner %s replacement", productKey => {
  it.each([manager, "unrelated@example.test"])("cancels the original owned by %s without transferring or exposing it", async originalOwner => {
    const foreignPath = `users/${originalOwner}/entries/foreign-original`;
    const original = {
      productKey, entryType: "contract", contractNumber: "OLD123", userEmail: originalOwner,
      status: "active", inputAmount: 1_000, effectiveInputAmount: 1_000,
      contractSignedDate: "2023-12-01", policyStartDate: "2024-01-01",
      allowedEmails: [originalOwner], clientName: "Private synthetic client", note: "Private synthetic note",
    };
    records.delete(originalPath);
    records.set(foreignPath, original);
    mocks.find.mockImplementation(async (number: string) => number === "OLD123"
      // Path is authoritative even if stale index metadata claims another owner.
      ? { entryPath: foreignPath, entryId: "stale-index-id", ownerEmail: owner } : null);
    const life = productKey === "neon" || productKey === "flexi";
    const patch = {
      productKey, frequencyRaw: life ? "monthly" : "annual", durationYears: life ? 30 : null,
      contractSignedDate: "2026-11-04", policyStartDate: "2026-12-01",
      inputAmount: life ? 1_500 : 12_000, effectiveInputAmount: life ? 1_500 : 12_000,
      flexiRenovation: productKey === "flexi"
        ? { originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 500, guaranteeStatus: "unknown" } : null,
    };
    const { response, body, saved } = await save(patch, "cross-owner-replacement");
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, refreshOriginalLinked: true, refreshOriginalEntryId: null });
    expect(JSON.stringify(body)).not.toMatch(/foreign-original|Private synthetic|unrelated@example|manager@example/);
    expect(saved).toMatchObject({ productKey, isRefresh: true, refreshOriginalLinked: true, userEmail: owner });
    expect(records.get(foreignPath)).toMatchObject({
      ...original, status: "storno",
      stornoDate: new Date(["cppAuto", "allianzAuto", "kooperativaAuto"].includes(productKey) ? "2026-11-30" : "2026-12-01"),
      refreshReplacedByEntryId: body.entryId, refreshReplacedByOwnerEmail: owner,
    });
    expect(saved?.allowedEmails).not.toContain(originalOwner === manager ? "unrelated@example.test" : originalOwner);

    const replay = await save(patch, "cross-owner-replacement");
    expect(replay.body).toMatchObject({ ok: true, entryId: body.entryId, idempotentReplay: true, refreshOriginalLinked: true });
  });
});

describe("cross-owner replacement transaction boundaries", () => {
  const foreignPath = "users/foreign@example.test/entries/foreign-original";
  const patch = { productKey: "kooperativaAuto", frequencyRaw: "annual", flexiRenovation: null, durationYears: null };
  beforeEach(() => {
    records.set(foreignPath, { productKey: "kooperativaAuto", entryType: "contract", contractNumber: "OLD123", status: "active" });
    mocks.find.mockImplementation(async (number: string) => number === "OLD123"
      ? { entryPath: foreignPath, ownerEmail: "foreign@example.test", entryId: "foreign-original" } : null);
  });

  it.each([
    { productKey: "allianzAuto" }, { contractNumber: "OTHER123" }, { entryType: "endorsement" },
    { refreshReplacedByEntryId: "another-replacement" },
  ])("rechecks the original inside the transaction before writing: %j", async concurrentChange => {
    const runTransaction = mocks.transaction.getMockImplementation()!;
    mocks.transaction.mockImplementationOnce(async run => {
      Object.assign(records.get(foreignPath)!, concurrentChange);
      return runTransaction(run);
    });
    const { response } = await save(patch);
    expect([400, 409]).toContain(response.status);
    expect(records.get(foreignPath)).toMatchObject({ status: "active", ...concurrentChange });
    expect([...records.keys()].filter(path => path.startsWith(`users/${owner}/entries/new-`))).toHaveLength(0);
  });

  it("keeps ordinary contract creation outside the cross-owner exception", async () => {
    const original = { ...records.get(foreignPath)! };
    expect((await save({ ...patch, isRefresh: false, refreshOriginalContractNumber: null })).response.status).toBe(200);
    expect(records.get(foreignPath)).toEqual(original);
  });

  it("does not grant ordinary read or mutation access to the original", async () => {
    expect((await save(patch)).response.status).toBe(200);
    const { handleContractsGet, handleContractsPatch } = await import("./contractsApi");
    const detail = await handleContractsGet(new NextRequest("https://example.test/api/contracts/detail?ownerEmail=foreign@example.test&entryId=foreign-original"), "detail");
    expect(detail.status).toBe(403);
    const before = { ...records.get(foreignPath)! };
    const update = await handleContractsPatch(new NextRequest("https://example.test/api/contracts", {
      method: "PATCH", body: JSON.stringify({ action: "updateFields", ownerEmail: "foreign@example.test", entryId: "foreign-original", updates: { status: "active" } }),
    }));
    expect(update.status).toBe(403);
    expect(records.get(foreignPath)).toEqual(before);
  });
});

describe("saving the free ČPP trailer contract", () => {
  const freeEntry = {
    productKey: "cppAutoVozikZdarma", inputAmount: undefined, effectiveInputAmount: undefined,
    frequencyRaw: undefined, calculationInputAmount: null, durationYears: null,
    isRefresh: false, refreshOriginalContractNumber: null, flexiRenovation: null,
  };
  it("persists an ordinary portfolio entry without premium, commission or manager overrides", async () => {
    const { response, saved } = await save(freeEntry);
    expect(response.status).toBe(200);
    expect(saved).toMatchObject({ productKey: freeEntry.productKey, inputAmount: 0, effectiveInputAmount: 0,
      calculationInputAmount: 0, items: [], total: 0, result: { items: [], total: 0 }, paid: true });
    expect((saved?.managerOverrides as Array<{ items: unknown[]; total: number }>).every(row => row.items.length === 0 && row.total === 0)).toBe(true);
  });
  it("requires authentication", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }) });
    const before = new Map(records);
    expect((await save(freeEntry)).response.status).toBe(401);
    expect(records).toEqual(before);
  });
  it("rejects a tipster without contract creation permissions", async () => {
    records.set(`users/${owner}`, { ...records.get(`users/${owner}`), accountType: "tipster" });
    const before = new Map(records);
    expect((await save(freeEntry)).response.status).toBe(403);
    expect(records).toEqual(before);
  });
  it("rejects saving into another user's portfolio", async () => {
    const before = new Map(records);
    expect((await save({ ...freeEntry, ownerEmail: "foreign@example.test" })).response.status).toBe(403);
    expect(records).toEqual(before);
  });
  it.each([{ inputAmount: 100 }, { position: "manazer10" }, { total: 9999 }, { items: [{ amount: 1000 }] }])("rejects financial and privilege manipulation without writes: %j", patch => {
    const before = new Map(records);
    return save({ ...freeEntry, ...patch }).then(({ response }) => {
      expect(response.status).toBe(400);
      expect(records).toEqual(before);
    });
  });
});
