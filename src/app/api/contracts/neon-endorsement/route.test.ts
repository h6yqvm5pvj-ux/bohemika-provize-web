import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ collection: vi.fn(), doc: vi.fn(), transaction: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: {
    collection: mocks.collection, doc: mocks.doc, runTransaction: mocks.transaction,
    batch: () => ({ delete: () => {}, commit: async () => {} }),
  },
  adminAuth: null, adminMessaging: null,
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

const owner = "neon-owner@example.test";
const other = "neon-other@example.test";
const tipster = "neon-tipster@example.test";
const entriesPath = `users/${owner}/entries`;
const rootPath = `${entriesPath}/root`;
const base = { ownerEmail: owner, entryId: "root", signedDate: "2025-03-10", effectiveDate: "2025-04-01", monthlyPremium: 1250.50 };
type Data = Record<string, unknown>;
let records: Map<string, Data>;
let versions: Map<string, number>;

function document(path: string) {
  return {
    path, id: path.split("/").at(-1)!,
    firestore: { collection: mocks.collection, doc: mocks.doc },
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => snapshot(path),
  };
}

function snapshot(path: string) {
  const value = records.get(path);
  const ref = document(path);
  return { ref, id: ref.id, exists: value != null, updateTime: Timestamp.fromMillis(versions.get(path) ?? 1), data: () => value };
}

function collection(path: string, filters: [string, unknown][] = []) {
  return {
    select() { return this; },
    limit() { return this; },
    doc: (id: string) => document(`${path}/${id}`),
    where: (field: string, _operator: string, value: unknown) => collection(path, [...filters, [field, value]]),
    get: async () => {
      const docs = [...records.keys()].filter(key => key.slice(0, key.lastIndexOf("/")) === path &&
        filters.every(([field, value]) => records.get(key)?.[field] === value)).map(snapshot);
      return { docs, size: docs.length, empty: !docs.length, forEach: (visit: (doc: typeof docs[number]) => void) => docs.forEach(visit) };
    },
  };
}

const asUser = (email: string) => mocks.guard.mockResolvedValue({ ok: true, ctx: {
  email, uid: email, decoded: { email }, actorEmail: email, actorUid: email, isImpersonating: false, impersonation: null,
} });

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  versions = new Map();
  records = new Map([[rootPath, {
    userEmail: owner, productKey: "neon", contractNumber: "9400001234", clientName: "Test Klient", inputAmount: 1000,
    frequencyRaw: "monthly", contractSignedDate: "2023-01-10", policyStartDate: "2023-02-01", durationYears: 25,
  }]]);
  for (const email of [owner, other, tipster]) {
    records.set(`users/${email}`, {
      email, userId: email, accountType: email === tipster ? "tipster" : "advisor", position: "poradce4", commissionMode: "standard",
      positionTimeline: [{ position: "poradce4", validFrom: "2020-01-01" }],
    });
    records.set(`usersPrivate/${email}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" });
  }
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(document);
  mocks.transaction.mockImplementation(async work => {
    const writes: (() => void)[] = [];
    const result = await work({
      get: (ref: { get: () => unknown }) => ref.get(),
      create: (ref: { path: string }, data: Data) => writes.push(() => records.set(ref.path, data)),
      set: (ref: { path: string }, data: Data) => writes.push(() => records.set(ref.path, data)),
      delete: (ref: { path: string }) => writes.push(() => records.delete(ref.path)),
      update: (ref: { path: string }, data: Data) => writes.push(() => {
        records.set(ref.path, { ...records.get(ref.path), ...data });
        versions.set(ref.path, (versions.get(ref.path) ?? 1) + 1);
      }),
    });
    writes.forEach(write => write());
    return result;
  });
  asUser(owner);
});

async function post(patch: Data = {}) {
  const { POST } = await import("./route");
  const response = await POST(new NextRequest("https://example.test/api/contracts/neon-endorsement", {
    method: "POST", body: JSON.stringify({ ...base, ...patch }), headers: { "Content-Type": "application/json" },
  }));
  return { status: response.status, body: await response.json() };
}

describe("Neon endorsement from contract detail", () => {
  it("saves a linked endorsement with server-calculated commission, and replays the same request", async () => {
    const result = await post();
    expect(result).toMatchObject({ status: 200, body: { ok: true, entryId: expect.any(String) } });
    const saved = records.get(`${entriesPath}/${result.body.entryId}`);
    expect(saved).toMatchObject({
      productKey: "neon", entryType: "endorsement", contractNumber: "9400001234", userEmail: owner,
      rootContractEntryId: "root", parentContractEntryId: "root", frequencyRaw: "monthly", contractSignedDate: new Date(base.signedDate),
      policyStartDate: new Date(base.effectiveDate), previousInputAmount: 1000, newInputAmount: 1250.5,
      inputAmount: 250.5, calculationInputAmount: 250.5, changeType: "increase", items: expect.arrayContaining([expect.any(Object)]),
    });
    expect(records.get(rootPath)?.inputAmount).toBe(1000);
    expect(await post()).toMatchObject({ status: 200, body: { entryId: result.body.entryId, idempotentReplay: true } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("takes the previous premium from the latest endorsement and applies Neon decrease rules", async () => {
    const initial = await post();
    expect(initial.status).toBe(200);
    const decrease = await post({ signedDate: "2025-05-10", effectiveDate: "2025-06-01", monthlyPremium: 1100 });
    expect(decrease.status).toBe(200);
    const saved = records.get(`${entriesPath}/${decrease.body.entryId}`);
    expect(saved).toMatchObject({ previousInputAmount: 1250.5, newInputAmount: 1100, premiumDelta: -150.5,
      changeType: "decrease", parentContractEntryId: initial.body.entryId, rootContractEntryId: "root" });
    expect(saved?.total).toBeLessThan(0);
  });

  it("prevents the calculator from creating a second branch after an amendment is saved in detail", async () => {
    const first = await post();
    expect(first.status).toBe(200);
    const { POST } = await import("../route");
    const calculate = (parent: string, previous: number) => POST(new NextRequest("https://example.test/api/contracts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerEmail: owner, entry: {
        productKey: "neon", entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: parent,
        parentContractEntryPath: `${entriesPath}/${parent}`, clientName: "Test Klient", contractNumber: "9400001234",
        contractSignedDate: "2025-05-10", policyStartDate: "2025-06-01", frequencyRaw: "monthly", durationYears: 23,
        previousInputAmount: previous, newInputAmount: 1500, effectiveInputAmount: 1500, premiumDelta: 1500 - previous,
        inputAmount: 1500 - previous, calculationInputAmount: 1500 - previous, changeType: "increase",
      } }),
    }));
    expect((await calculate("root", 1000)).status).toBe(409);
    expect((await calculate(first.body.entryId, 1250.5)).status).toBe(200);
  });

  it.each([401, 429])("does not enter the write path when the guard returns %i", async status => {
    mocks.guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await post()).status).toBe(status);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies foreign owners, tipsters and entries stored under the wrong owner", async () => {
    asUser(other);
    expect((await post()).status).toBe(403);
    asUser(tipster);
    expect((await post()).status).toBe(403);
    asUser(owner);
    records.set(rootPath, { ...records.get(rootPath), userEmail: other });
    expect((await post()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([{ entryId: "../root" }, { monthlyPremium: 0 }, { monthlyPremium: 123.456 }, { signedDate: "2025-02-30" },
    { effectiveDate: "2025-03-01" }, { effectiveDate: "2022-01-01", signedDate: "2021-12-01" },
    { role: "admin" }, { parentContractEntryId: "foreign" }, { calculationInputAmount: 300000 }, { monthlyPremium: 1000 },
  ])("rejects invalid or manipulated requests %j", async patch => {
    expect((await post(patch)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects non-Neon roots and stale writes", async () => {
    records.set(rootPath, { ...records.get(rootPath), productKey: "flexi" });
    expect((await post()).status).toBe(400);
    records.set(rootPath, { ...records.get(rootPath), productKey: "neon" });
    const transaction = mocks.transaction.getMockImplementation()!;
    mocks.transaction.mockImplementationOnce((...args) => {
      versions.set(rootPath, 2);
      return transaction(...args);
    });
    expect((await post()).status).toBe(409);
    expect([...records.keys()].filter(path => path.startsWith(`${entriesPath}/`))).toEqual([rootPath]);
  });
});
