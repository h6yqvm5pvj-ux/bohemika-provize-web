import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateNeon } from "@/app/lib/productFormulas/neon";
import { neonCorrectionPayoutAmount } from "@/app/lib/neonCorrection";
import { lifeRiskAnnualPremiumBase } from "@/app/lib/commissionPayoutRules";
import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";
import type { CommissionResultItemDTO } from "@/app/types/domain";
import type { ContractDoc } from "../_lib/contractsApi.types";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), update: vi.fn(), transaction: vi.fn(), history: vi.fn(), contract: {} as ContractDoc,
}));

vi.mock("../_lib/contractsApi", async importOriginal => ({
  ...await importOriginal<typeof import("../_lib/contractsApi")>(),
  requireContractsEntryGuard: mocks.guard,
}));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: (...args: unknown[]) => { mocks.history(...args); return args[3]; } }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({ withCashflowMutation: (_: string, run: () => unknown) => run(), trackCashflowWrite: (run: () => unknown) => run() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {
  collection: (collection: string) => ({ doc: (owner: string) => ({ collection: (child: string) => ({ doc: (id: string) => ({ path: `${collection}/${owner}/${child}/${id}` }) }) }) }),
  runTransaction: async (run: (transaction: unknown) => unknown) => {
    mocks.transaction();
    return run({ get: async () => ({ exists: true, data: () => mocks.contract }), update: mocks.update });
  },
} }));

import { POST } from "./route";

const owner = "advisor@example.test";
const input = { ownerEmail: owner, entryId: "synthetic-neon", monthlyPremium: 500, annualCorrection: 840,
  previousMonthlyPremium: 430, previousAnnualCorrection: null };
const request = (patch: Record<string, unknown> = {}) => new NextRequest("https://example.test/api/contracts/neon-correction", {
  method: "POST", body: JSON.stringify({ ...input, ...patch }), headers: { "Content-Type": "application/json" },
});
const setAccess = (context: Record<string, unknown> = {}) => mocks.guard.mockResolvedValue({
  ok: true, ctx: { email: owner, actorEmail: owner, accountType: "advisor", contractAccessEmails: [], ...context },
  withRateLimit: (response: Response) => response,
});
const signedDate = "2021-12-31";
const position = "poradce4";
const baseline = calculateNeon(430, position, 12, "standard", signedDate);
const full = calculateNeon(500, position, 12, "standard", signedDate);
const amount = (items: CommissionResultItemDTO[], code: string) => items.find(item => item.code === code)?.amount;

beforeEach(() => {
  vi.clearAllMocks();
  setAccess();
  mocks.contract = {
    userEmail: owner, productKey: "neon", contractSignedDate: signedDate, policyStartDate: "2022-01-01", position,
    commissionMode: "standard", frequencyRaw: "monthly", durationYears: 12, inputAmount: 430, calculationInputAmount: 430,
    items: baseline.items, managerChain: [{ email: "manager@example.test", position: "manazer5", commissionMode: "standard" }],
    commissionPayouts: [{ key: "existing-payment", code: "A101", amount: 100, status: "paid" }] as ContractDoc["commissionPayouts"],
  };
});

describe("ČPP NEON correction", () => {
  it("applies the cutoff to cashflow by month, including to repeated payments of the same kind", async () => {
    Object.assign(mocks.contract, { contractSignedDate: "2020-11-30", policyStartDate: "2020-12-01" });
    expect((await POST(request())).status).toBe(200);
    const [ref, patch] = mocks.update.mock.calls[0];
    expect(ref.path).toBe(`users/${owner}/entries/${input.entryId}`);
    expect(patch).toMatchObject({ inputAmount: 500, effectiveInputAmount: 500, calculationInputAmount: 430,
      neonCorrection: { annualAmount: 840 } });
    expect(patch).not.toHaveProperty("commissionPayouts");
    expect(patch).not.toHaveProperty("cashflowPayoutMatches");
    expect(patch.items).toEqual(baseline.items);
    expect(patch.managerOverrides).toHaveLength(1);
    const managerFull = calculateNeon(500, "manazer5", 12, "standard", signedDate);
    const updated = { ...mocks.contract, ...patch, id: input.entryId } as EntryDoc;
    expect(lifeRiskAnnualPremiumBase(updated, "2021-12")).toBe(5160);
    expect(lifeRiskAnnualPremiumBase(updated, "2022-01")).toBe(6000);
    expect(neonCorrectionPayoutAmount(updated, amount(patch.managerOverrides[0].items, "B101-B104")!, "2022-01"))
      .toBeCloseTo(amount(managerFull.items, "B101-B104")! - amount(full.items, "B101-B104")!);
    const schedule = generateCashflow([updated], 10, owner, new Date(2022, 0, 1), []);
    expect(schedule.filter(item => item.commissionCode === "B101-B104").map(item => item.amount))
      .toEqual([amount(baseline.items, "B101-B104"), ...Array(3).fill(amount(full.items, "B101-B104"))]);
    expect(schedule.find(item => item.commissionCode === "B3601")?.amount).toBeCloseTo(amount(full.items, "B3601")!);
    expect(neonCorrectionPayoutAmount(updated, amount(baseline.items, "A101")!, "2022-01")).toBeCloseTo(amount(full.items, "A101")!, 1);
  });

  it("uses January 2022 even when an existing correction contains the previous configurable month", () => {
    const neonCorrection = { annualAmount: 840, fullPremiumFromMonth: "2025-06" };
    const contract = { ...mocks.contract, inputAmount: 500, calculationInputAmount: 430, neonCorrection };
    expect(lifeRiskAnnualPremiumBase(contract, "01.12.2021 - 31.12.2021")).toBe(5160);
    expect(lifeRiskAnnualPremiumBase(contract, "01.01.2022 - 31.01.2022")).toBe(6000);
  });

  it("allows an edit and treats an identical retry as a no-op", async () => {
    Object.assign(mocks.contract, { inputAmount: 500, calculationInputAmount: 430, neonCorrection: { annualAmount: 840 } });
    const edited = await POST(request({ previousMonthlyPremium: 500, previousAnnualCorrection: 840, annualCorrection: 720 }));
    expect(edited.status).toBe(200);
    expect(mocks.update.mock.calls[0][1]).toMatchObject({ calculationInputAmount: 440, neonCorrection: { annualAmount: 720 } });
    mocks.update.mockClear();
    expect((await POST(request())).status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await POST(request({ annualCorrection: 720 }))).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429])("honors guard errors before opening a transaction (%i)", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await POST(request())).status).toBe(status);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires a permitted owner and rejects tipsters", async () => {
    expect((await POST(request({ ownerEmail: "another@example.test" }))).status).toBe(403);
    setAccess({ accountType: "tipster" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([{ productKey: "flexi" }, { entryType: "endorsement" }, { isRefresh: true },
    { contractSignedDate: "2022-01-01" }, { contractSignedDate: "2021-02-31" }, { contractSignedDate: null }])(
    "rejects an ineligible stored contract (%j)", async patch => {
      Object.assign(mocks.contract, patch);
      expect((await POST(request())).status).toBe(400);
      expect(mocks.update).not.toHaveBeenCalled();
    });

  it.each([{ annualCorrection: 0 }, { annualCorrection: 6000 }, { annualCorrection: 1.002 }, { fullPremiumFromMonth: "2023-01" },
    { monthlyPremium: "500" }, { entryId: "../foreign" }, { position: "manazer10" }, { contractSignedDate: signedDate }])(
    "rejects malformed values and attempts to override authority or eligibility (%j)", async patch => {
      expect((await POST(request(patch))).status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
});
