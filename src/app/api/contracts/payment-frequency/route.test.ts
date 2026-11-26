import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), create: vi.fn(), update: vi.fn(), history: vi.fn(), reads: vi.fn(), transaction: vi.fn(),
  contract: {} as Record<string, unknown> | null }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: (...args: unknown[]) => { mocks.history(...args); return args[3]; } }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_: string, run: () => unknown) => run(), trackCashflowWrite: (run: () => unknown) => run() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {
  collection: (collection: string) => ({ doc: (owner: string) => ({ collection: (child: string) => ({ doc: (id: string) => ({ id, path: `${collection}/${owner}/${child}/${id}`, parent: { doc: (nextId: string) => ({ id: nextId, path: `${collection}/${owner}/${child}/${nextId}` }) } }) }) }) }),
  runTransaction: async (run: (transaction: unknown) => unknown) => {
    mocks.transaction();
    return run({ get: async (ref: unknown) => { mocks.reads(ref); return { exists: !!mocks.contract, data: () => mocks.contract }; }, update: mocks.update, create: mocks.create });
  },
} }));

import { POST } from "./route";
const owner = "advisor@example.test";
const base = { ownerEmail: owner, entryId: "synthetic-contract", effectiveDate: "2024-09-01", frequency: "annual", revision: 0 };
const request = (patch: Record<string, unknown> = {}) => new NextRequest("https://example.test/api/contracts/payment-frequency", {
  method: "POST", body: JSON.stringify({ ...base, ...patch }), headers: { "Content-Type": "application/json" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner, actorEmail: owner, accountType: "advisor", contractAccessEmails: [] }, withRateLimit: (response: Response) => response });
  mocks.contract = { userEmail: owner, productKey: "kooperativaAuto", entryType: "contract", frequencyRaw: "quarterly", policyStartDate: "2023-09-01",
    inputAmount: 2000, items: [{ code: "B101", amount: 100 }], commissionPayouts: [{ code: "C101", amount: 450 }] };
});

describe("dated payment frequency endpoint", () => {
  it("appends a dated change without writing the original frequency, premium, commission base or payout history", async () => {
    const original = structuredClone(mocks.contract);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: `users/${owner}/entries/synthetic-contract` }), {
      paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual" }],
    });
    expect(mocks.contract).toEqual(original);
    expect(mocks.history.mock.calls[0][4]).toMatchObject({ actorEmail: owner, title: "Změna frekvence placení" });
  });

  it("allows only a server-authorized manager or represented account to change the owner's schedule", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "manager@example.test", actorEmail: "admin@example.test", accountType: "advisor", contractAccessEmails: [owner] }, withRateLimit: (response: Response) => response });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.history.mock.calls[0][4].actorEmail).toBe("admin@example.test");
  });

  it.each([401, 403, 429])("honors the authentication/authorization/rate-limit guard before database access: %i", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await POST(request())).status).toBe(status);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("prevents user A from reading or mutating user B's contract", async () => {
    expect((await POST(request({ ownerEmail: "other@example.test" }))).status).toBe(403);
    expect(mocks.reads).not.toHaveBeenCalled();
  });

  it("denies tipsters even if they own a record", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner, accountType: "tipster", contractAccessEmails: [] }, withRateLimit: (response: Response) => response });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([{ entryId: "../other" }, { entryId: "bad/id" }, { ownerEmail: "bad/owner@example.test" },
    { effectiveDate: "2024-02-30" }, { effectiveDate: "2023-09-01" }, { effectiveDate: "2023-08-31" },
    { frequency: "daily" }, { frequency: ["annual"] }, { revision: -1 }, { admin: true }, { inputAmount: 123 },
    { paymentFrequencyChanges: [] }])("rejects manipulated input %j", async patch => {
    expect((await POST(request(patch))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("validates frequencies against the stored product and rejects non-auto products", async () => {
    mocks.contract!.productKey = "cppAuto";
    expect((await POST(request({ frequency: "monthly" }))).status).toBe(400);
    mocks.contract!.productKey = "neon";
    expect((await POST(request())).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not overwrite a concurrent frequency change or a transferred contract", async () => {
    mocks.contract!.paymentFrequencyChanges = [{ effectiveDate: "2024-09-01", frequency: "annual" }];
    expect((await POST(request())).status).toBe(409);
    mocks.contract!.userEmail = "new-owner@example.test";
    expect((await POST(request())).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate dates, redundant frequencies and additions before the latest change", async () => {
    expect((await POST(request({ frequency: "quarterly" }))).status).toBe(400);
    mocks.contract!.paymentFrequencyChanges = [{ effectiveDate: "2025-09-01", frequency: "annual" }];
    expect((await POST(request({ revision: 1 }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("auto premium amendments", () => {
  it("atomically creates an amendment and updates future premiums without modifying receipts or acquisition items", async () => {
    mocks.contract = { ...mocks.contract, productKey: "cppAuto", frequencyRaw: "annual", inputAmount: 10000, contractNumber: "SYNTHETIC", clientName: "Test Klient" };
    const original = structuredClone(mocks.contract);
    const response = await POST(request({ annualPremium: 3000 }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.endorsementId).toEqual(expect.any(String));
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.any(Object), expect.objectContaining({
      rootContractEntryId: "synthetic-contract", entryType: "endorsement", autoPremiumAmendment: true,
      previousInputAmount: 10000, inputAmount: 3000, premiumDelta: -7000, items: [], total: 0,
    }));
    expect(mocks.update.mock.calls[0][1]).toEqual({ paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual", annualPremium: 3000, baseAnnualPremium: 10000, endorsementId: result.endorsementId }] });
    expect(mocks.contract).toEqual(original);
  });
  it("changes premium and frequency together, keeping the amendment input in the product's payment unit", async () => {
    const response = await POST(request({ annualPremium: 12000, frequency: "semiannual" }));
    expect(response.status).toBe(200);
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ inputAmount: 6000, previousInputAmount: 2000, autoPremiumAnnual: 12000, autoPremiumPreviousAnnual: 8000, previousFrequency: "quarterly" });
  });
  it.each([0, -1, "3000", null, {}, 1000000001, 1.234])("rejects invalid annual premiums %j", async annualPremium => {
    expect((await POST(request({ annualPremium }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects duplicate submission with a stale revision", async () => {
    mocks.contract!.paymentFrequencyChanges = [{ effectiveDate: "2024-09-01", frequency: "annual", annualPremium: 3000, baseAnnualPremium: 8000 }];
    expect((await POST(request({ annualPremium: 3000 }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("ČPP KOMPLEX underwriting amendments", () => {
  beforeEach(() => {
    mocks.contract = { ...mocks.contract, productKey: "cppPPRs", frequencyRaw: "quarterly", inputAmount: 2500 };
  });

  it("stores a dated premium change and keeps the original commission and receipts", async () => {
    const original = structuredClone(mocks.contract);
    const response = await POST(request({ frequency: "semiannual", annualPremium: 12000 }));
    expect(response.status).toBe(200);
    const { endorsementId } = await response.json();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ id: endorsementId }), expect.objectContaining({
      productKey: "cppPPRs", entryType: "endorsement", rootContractEntryId: base.entryId,
      policyStartDate: base.effectiveDate, inputAmount: 6000, previousInputAmount: 2500,
      autoPremiumAnnual: 12000, autoPremiumPreviousAnnual: 10000, items: [], autoPremiumAmendment: true,
    }));
    expect(mocks.update.mock.calls[0][1]).toEqual({ paymentFrequencyChanges: [{
      effectiveDate: base.effectiveDate, frequency: "semiannual", annualPremium: 12000, baseAnnualPremium: 10000, endorsementId,
    }] });
    expect(mocks.contract).toEqual(original);
  });

  it.each([{ frequency: "monthly", annualPremium: 12000 }, { frequency: "quarterly", annualPremium: 10000.01 },
    { frequency: "annual" }, { frequency: "annual", annualPremium: 12000, position: "manazer10" }])("rejects unsupported or manipulated changes %j", async patch => {
    expect((await POST(request(patch))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
