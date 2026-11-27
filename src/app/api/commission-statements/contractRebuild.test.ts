import { statementImportFixture } from "./statementImport.fixture";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  batch: vi.fn(),
  transaction: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/app/api/contracts/_lib/contractsApi", async () => ({
  requireContractsEntryGuard: mocks.guard,
  hasContractAccess: (await import("@/app/api/contracts/_lib/contractsApi.access")).hasContractAccess,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, doc: mocks.doc, batch: mocks.batch, runTransaction: mocks.transaction },
}));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_reason: string, work: () => Promise<unknown>) => work(),
  trackCashflowWrite: (work: () => Promise<unknown>) => work(),
  markCashflowMutationIncomplete: vi.fn(),
}));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: mocks.history }));

import { GET, POST } from "./route";
import { calculateCppPPRbez } from "@/app/lib/productFormulas/cppPPRbez";
import { calculateDomexNeuron } from "@/app/lib/productFormulas/domexNeuron";
import { calculateFlexi } from "@/app/lib/productFormulas/flexi";
import * as commissionPayoutPositionPolicy from "@/lib/server/commissionPayoutPositionPolicy";
import { acquisitionCommissionInstallments, payoutsForAcquisitionInstallment } from "@/app/smlouvy/[id]/contractCommissionInstallments";
import { payoutStatusForCodes } from "@/app/smlouvy/[id]/ContractCommissionSection";
import type { ContractCommissionPayout } from "@/app/smlouvy/[id]/contractDetailTypes";
import { buildContractPaidCommissionTotal } from "@/app/smlouvy/[id]/contractFinancialOverviewModel";
import { INVESTMENT_PAYOUT_PROGRESS_TYPE, readInvestmentPayoutMatch, type InvestmentPayoutMatchProgress } from "@/app/lib/investmentPayoutMatching";

const viewer = "represented@example.test";
const owner = "owner@example.test";
const actor = "admin@example.test";
const contractNumber = "1234567890";
const entryPath = `users/${owner}/entries/entry-1`;
const statementPath = `usersPrivate/${viewer}/commissionStatements/statement-1`;
const records = new Map<string, Record<string, unknown>>();
const reads: string[] = [];
const writes: string[] = [];
const versions = new Map<string, number>();
let beforeReset: (() => void) | undefined;
let beforeReplayCommit: (() => void) | undefined;
let failedCollectionRead: string | undefined;
const baseContext = {
  email: viewer,
  actorEmail: viewer,
  teamEmails: [] as string[],
  accountType: "advisor",
  canManageContractsAsAdmin: false,
  isImpersonating: false,
  impersonation: null,
};
const setContext = (changes: Record<string, unknown> = {}) => mocks.guard.mockResolvedValue({
  ok: true,
  ctx: { ...baseContext, ...changes },
  withRateLimit: (response: Response) => response,
});
const request = (changes: Record<string, unknown> = {}, headers?: HeadersInit) => new NextRequest("http://localhost/api/commission-statements", {
  method: "POST",
  headers,
  body: JSON.stringify({ action: "rebuild-contract-from-statements", ownerEmail: owner, entryId: "entry-1", contractNumber, ...changes }),
});
// Older records can already exist in the archive when their contracts are linked later.
function replayArchived(statementId: string, html: string, header: Record<string, unknown>) {
  const path = `usersPrivate/${owner}/commissionStatements/${statementId}`;
  if (!records.has(path)) records.set(path, { ...header, html, processedAtMs: 1 });
  return POST(new NextRequest("https://example.test/api/commission-statements", {
    method: "POST", body: JSON.stringify({ action: "reprocess-saved-statement", statementId }),
  }));
}
const snapshot = (path: string) => {
  const data = structuredClone(records.get(path));
  return {
    id: path.split("/").at(-1)!, ref: document(path), exists: records.has(path), updateTime: versions.get(path) ?? 0,
    data: () => structuredClone(data),
  };
};
const write = (path: string, patch: Record<string, unknown>) => {
  writes.push(path);
  records.set(path, { ...records.get(path), ...structuredClone(patch) });
  versions.set(path, (versions.get(path) ?? 0) + 1);
};

describe("DOMEX Neuron observed anniversary indexation", () => {
  const setup = (flag: boolean | null = true, frequency = "annual", input = 12000) => {
    records.clear(); versions.clear(); reads.length = 0; writes.length = 0;
    setContext({ email: owner, actorEmail: owner });
    const initial = calculateDomexNeuron(input, frequency as "annual", "poradce1");
    records.set("contractRefs/neuron-reference", { ownerEmail: owner, entryId: "entry-1", entryPath, contractNumberNormalized: contractNumber });
    records.set(entryPath, {
      contractNumber, userEmail: owner, entryType: "contract", productKey: "domexneuron", frequencyRaw: frequency,
      position: "poradce1", inputAmount: input, calculationInputAmount: input, effectiveInputAmount: input,
      policyStartDate: "2026-11-05", contractSignedDate: "2026-11-04", premiumIndexationEnabled: flag,
      commissionPayouts: [], premiumStatementHistory: [], items: initial.items, total: initial.total,
    });
  };
  const upload = async (options: { year?: number; code?: string; base?: number; commission?: number; career?: string; productCode?: string;
    manager?: boolean; additionalRows?: Array<{ code: string; base: number; commission: number }> } = {}) => {
    const { year = 2027, code = "B101", base = 12600, commission = 350.28, career = "1", productCode = "CPP_DOMEX+" } = options;
    const rows = [{ code, base, commission }, ...(options.additionalRows ?? [])].map((item, index) => {
      const cells = options.manager
        ? [index + 1, contractNumber, "04.11.2026", "Synthetic client", "R", productCode, item.code, item.base, "", "", career, item.commission, 0]
        : [index + 1, contractNumber, "04.11.2026", "05.11.2026", "Synthetic client", "R", productCode, item.code, item.base, "", "", career, item.commission, 0];
      return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
    }).join("");
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify(statementImportFixture(
        `<div id="${options.manager ? "manazer" : "provize"}"><table>${rows}</table></div>`,
        { statementNumber: `neuron-${year}-${code}`, statementDate: `30.11.${year}`, period: `01.11.${year} - 30.11.${year}` },
      )),
    }));
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    return payload;
  };
  const payouts = () => records.get(entryPath)!.commissionPayouts as Record<string, unknown>[];
  const history = () => records.get(entryPath)!.premiumStatementHistory as Record<string, unknown>[];

  it("keeps free evidence-only contracts unchanged when a statement contains the same contract number", async () => {
    setup();
    records.set(entryPath, { ...records.get(entryPath), productKey: "cppAutoVozikZdarma", inputAmount: 0,
      calculationInputAmount: 0, effectiveInputAmount: 0, items: [], total: 0 });
    const before = structuredClone(records.get(entryPath));
    await upload();
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).not.toContain(entryPath);
  });

  it.each(["CPP_DOMEX+", "CPP_DOMX+N"])("records the renewed premium and paid B commission for %s while retaining the original calculation", async productCode => {
    setup();
    const before = structuredClone(records.get(entryPath));
    await upload({ productCode });
    expect(payouts()).toEqual([expect.objectContaining({ amount: 350.28, expectedAmount: 350.28, difference: 0, status: "paid" })]);
    expect(history()).toEqual([expect.objectContaining({ productCode, changeReason: "indexation", premiumKind: "auto_change",
      previousPremium: 12000, newPremium: 12600, newAnnualPremium: 12600, anniversaryDate: "2027-11-05", writtenBy: owner })]);
    expect(records.get(entryPath)).toMatchObject({ inputAmount: 12000, calculationInputAmount: 12000, effectiveInputAmount: 12600,
      items: before!.items, total: before!.total });
    expect([...records.keys()].some(path => path.includes("accountingRepairDrafts") || path.includes("externalUpdateTasks"))).toBe(false);
  });

  it("processes an annual A102 as the first renewal but keeps the original statement code", async () => {
    setup();
    await upload({ code: "A102" });
    expect(payouts()).toEqual([expect.objectContaining({ code: "A102", amount: 350.28, expectedAmount: 350.28, status: "paid" })]);
    expect(history()).toEqual([expect.objectContaining({
      commissionCode: "A102", resolvedCommissionCode: "B101", anniversaryDate: "2027-11-05",
      previousAnnualPremium: 12000, newAnnualPremium: 12600, differenceAnnual: 600,
    })]);
    await upload({ code: "B101", year: 2028, base: 13000, commission: 361.4 });
    expect(history().at(-1)).toMatchObject({
      commissionCode: "B101", resolvedCommissionCode: "B102", anniversaryDate: "2028-11-05",
      previousAnnualPremium: 12600, newAnnualPremium: 13000, differenceAnnual: 400,
    });
  });

  it("allows an unchanged anniversary and records only the later confirmed increase", async () => {
    setup();
    await upload({ productCode: "CPP_DOMX+N", base: 12000, commission: 333.60 });
    expect(payouts()).toEqual([expect.objectContaining({ code: "B101", status: "paid", expectedAmount: 333.60 })]);
    expect(history()).toEqual([]);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(12000);
    await upload({ productCode: "CPP_DOMX+N", year: 2028, code: "B102" });
    expect(history()).toEqual([expect.objectContaining({ changeReason: "indexation", anniversaryDate: "2028-11-05",
      previousAnnualPremium: 12000, newAnnualPremium: 12600 })]);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(12600);
  });

  it.each([false, null])("does not automatically grow premiums or hide a higher B mismatch for flag %s", async flag => {
    setup(flag);
    await upload();
    expect(history()).toEqual([]);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(12000);
    expect(payouts()).toEqual([expect.objectContaining({ status: "difference", differenceReason: "commission_amount_mismatch" })]);
  });

  it.each([
    { commission: 400 }, { career: "2" }, { year: 2026 },
  ])("does not turn unsupported anniversary evidence into automatic growth: %j", async options => {
    setup(); await upload(options);
    expect(history()).toEqual([]);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(12000);
    expect(payouts()[0].status).toBe("difference");
  });

  it("resolves an annual base for a quarterly premium and prices later installments from dated history", async () => {
    setup(true, "quarterly", 3000);
    await upload({ commission: 87.57 });
    expect(history()).toEqual([expect.objectContaining({ basePremiumPeriod: "annual", newAnnualPremium: 12600, newPremium: 3150 })]);
    await upload({ code: "B102", commission: 87.57, year: 2028 });
    expect(history()).toHaveLength(1);
    expect(payouts()).toEqual(expect.arrayContaining([expect.objectContaining({ code: "B102", expectedAmount: 87.57, status: "paid" })]));
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(3150);
  });

  it("preserves ordinary higher acquisition A behavior", async () => {
    setup(false); await upload({ code: "A101", commission: 1396.08 });
    expect(payouts()[0].status).toBe("paid");
    expect(history()).toEqual([]);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(12000);
  });

  it("retains already effective indexation after disabling future automatic growth and during rebuild", async () => {
    setup(); await upload();
    records.get(entryPath)!.premiumIndexationEnabled = false;
    await upload({ year: 2028, code: "B102" });
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B102", expectedAmount: 350.28, status: "paid" }));
    await upload({ year: 2029, code: "B103", base: 13200, commission: 366.96 });
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B103", expectedAmount: 350.28, status: "difference" }));
    expect((await POST(request())).status).toBe(200);
    expect(history()).toHaveLength(1);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(12600);
  });

  it("uses an already confirmed own premium for a manager's later B installment", async () => {
    setup(true, "quarterly", 3000); await upload({ commission: 87.57 });
    records.get(entryPath)!.managerOverrides = [{ email: owner, position: "manazer4",
      items: [{ code: "B101-B104", title: "Následná provize", amount: 15 }] }];
    await upload({ manager: true, career: "104", code: "B102", year: 2028, commission: 15.75 });
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B102", amount: 15.75, expectedAmount: 15.75, status: "paid" }));
    expect(history()).toHaveLength(1);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(3150);
  });

  it("does not treat duplicate same-source B codes as proof of a premium increase", async () => {
    setup(); await upload({ additionalRows: [{ code: "B101", base: 12600, commission: 350.28 }] });
    expect(history()).toEqual([]);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(12000);
    // The existing payout merger coalesces identical semantic payments.
    expect(payouts()).toHaveLength(1);
    expect(payouts().every(entry => entry.status === "difference")).toBe(true);
  });

  it("calculates multiple anniversary premiums in chronological order inside one reversed statement", async () => {
    setup(); await upload({ year: 2028, code: "B102", base: 13200, commission: 366.96,
      additionalRows: [{ code: "B101", base: 12600, commission: 350.28 }] });
    const normalized = () => history().map(entry => [entry.anniversaryDate, entry.previousAnnualPremium, entry.newAnnualPremium]);
    const reversed = normalized();
    expect(reversed).toEqual([["2027-11-05", 12000, 12600], ["2028-11-05", 12600, 13200]]);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(13200);
    setup(); await upload({ year: 2028, additionalRows: [{ code: "B102", base: 13200, commission: 366.96 }] });
    expect(normalized()).toEqual(reversed);
    expect(records.get(entryPath)!.effectiveInputAmount).toBe(13200);
  });

  it("rebuilds repeated and out-of-order statements without duplicating or regressing current premiums", async () => {
    const result = () => ({ premium: records.get(entryPath)!.effectiveInputAmount,
      history: history().map(entry => [entry.anniversaryDate, entry.previousAnnualPremium, entry.newAnnualPremium]),
      payouts: payouts().map(entry => [entry.code, entry.amount, entry.expectedAmount, entry.status]).sort(),
    });
    setup();
    const initial = await upload();
    const source = records.get(`usersPrivate/${owner}/commissionStatements/${initial.item.id}`)!;
    await upload({ year: 2028, code: "B102", base: 13200, commission: 366.96 });
    const chronological = result();
    setup(); await upload({ year: 2028, code: "B102", base: 13200, commission: 366.96 });
    expect((await replayArchived(initial.item.id, String(source.html), source)).status).toBe(200);
    expect(result()).toEqual(chronological);
    expect((await POST(request())).status).toBe(200);
    expect(result()).toEqual(chronological);
    expect((await POST(request())).status).toBe(200);
    expect(result()).toEqual(chronological);
  });

  it("does not let an unrelated user update the premium by supplying an owner", async () => {
    setup(); const before = structuredClone(records.get(entryPath));
    setContext({ email: viewer, actorEmail: viewer });
    await upload();
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).not.toContain(entryPath);
  });
});

describe("statement comparisons after premium-decrease endorsements", () => {
  const decreasePath = `users/${owner}/entries/decrease`;
  const rowHtml = (code: string, commission: number, base = 9600) => {
    const cells = [1, contractNumber, "01.01.2024", "01.01.2024", "Synthetic client", "Z", "CPP_NEON", code, base, "", "", "3", commission, 0];
    return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
  };
  const setup = (rows = rowHtml("B102", 80)) => {
    setContext({ teamEmails: [owner] });
    records.set(entryPath, {
      contractNumber, productKey: "neon", userEmail: owner, entryType: "contract",
      policyStartDate: "2024-01-01", contractSignedDate: "2023-12-01", inputAmount: 1000,
      position: "poradce3", commissionMode: "standard", frequencyRaw: "monthly", durationYears: 15,
      items: [{ code: "B101-B104", title: "Následná provize (2.–5. rok)", amount: 100 },
        { code: "B3601", title: "Provize po 3 letech", amount: 500 },
        { code: "B3601_HALF", title: "Provize 50% z B3601", amount: 600 },
        { code: "B201-B206", title: "Pečovatelská provize (5.–10. rok)", amount: 10 }],
      commissionPayouts: [],
    });
    records.set(decreasePath, {
      contractNumber, productKey: "neon", userEmail: owner, entryType: "endorsement",
      rootContractEntryId: "entry-1", parentContractEntryId: "entry-1", policyStartDate: "2026-01-01",
      previousInputAmount: 1000, newInputAmount: 800, premiumDelta: -200, items: [],
    });
    records.set(statementPath, { statementNumber: "1", statementDate: "23.02.2028",
      period: "01.01.2028 - 31.01.2028", html: `<div id="provize"><table>${rows}</table></div>` });
  };
  const payouts = () => records.get(entryPath)!.commissionPayouts as Record<string, unknown>[];

  it("compares each future commission with the reduced premium while retaining original periods and calculations", async () => {
    setup([rowHtml("B101", 100, 12000), rowHtml("B102", 80), rowHtml("B3601", 400),
      rowHtml("B3601_HALF", 600, 12000), rowHtml("B201", 8)].join(""));
    const items = structuredClone(records.get(entryPath)!.items);
    const amendment = structuredClone(records.get(decreasePath));
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "B101", amount: 100, expectedAmount: 100, systemBaseAmount: 12000, difference: 0, status: "paid" }),
      expect.objectContaining({ code: "B102", amount: 80, expectedAmount: 80, systemBaseAmount: 9600, difference: 0, status: "paid" }),
      expect.objectContaining({ code: "B3601", amount: 400, expectedAmount: 400, difference: 0, status: "paid" }),
      expect.objectContaining({ code: "B3601_HALF", amount: 600, expectedAmount: 600, difference: 0, status: "paid" }),
      expect.objectContaining({ code: "B201", amount: 8, expectedAmount: 8, difference: 0, status: "paid" }),
    ]));
    expect(records.get(entryPath)!.items).toEqual(items);
    expect(records.get(entryPath)!.inputAmount).toBe(1000);
    expect(records.get(decreasePath)).toEqual(amendment);
    expect([...records.keys()].some(path => path.includes("accountingRepairDrafts"))).toBe(false);
  });

  it("still records a real underpayment against the adjusted expectation", async () => {
    setup(rowHtml("B102", 60));
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual([expect.objectContaining({ amount: 60, expectedAmount: 80,
      difference: -20, status: "difference", differenceReason: "commission_amount_mismatch" })]);
  });

  it.each([
    ["B202", 10224, 359.68, "01.11.2025 - 30.11.2025", 10224, 359.68, "paid"],
    ["B202", 10224, 300, "01.11.2025 - 30.11.2025", 10224, 359.68, "difference"],
    ["B202", 10100, 359.68, "01.11.2025 - 30.11.2025", 15168, 533.61, "difference"],
    ["B202", 10224, 359.68, "01.02.2025 - 28.02.2025", 15168, 533.61, "difference"],
    ["B201", 10224, 359.68, "01.11.2025 - 30.11.2025", 15168, 533.61, "difference"],
  ])("reconciles %s at base %s with payout %s in %s", async (code, base, amount, period, systemBase, expected, status) => {
    const row = rowHtml(code, amount, base).replaceAll("01.01.2024", "19.12.2019");
    setup(row);
    records.set(entryPath, { ...records.get(entryPath), inputAmount: 1264, policyStartDate: "2019-12-19",
      contractSignedDate: "2019-12-18", items: [{ code: "B201-B206", title: "Pečovatelská provize (5.–10. rok)", amount: 533.61 }] });
    records.set(decreasePath, { ...records.get(decreasePath), policyStartDate: "2025-03-19", previousInputAmount: 1264,
      newInputAmount: 852, premiumDelta: -412 });
    records.set(statementPath, { ...records.get(statementPath), period, statementDate: "02.12.2025" });
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual([expect.objectContaining({ code, amount, statementBaseAmount: base,
      systemBaseAmount: systemBase, expectedAmount: expected, status })]);
    expect(records.get(entryPath)?.inputAmount).toBe(1264);
  });

  it("uses the already authorized in-memory family during a normal saved-statement import", async () => {
    setup();
    records.set(`usersPrivate/${viewer}/commissionStatements/endorsement-statement`, { ...records.get(statementPath) });
    for (const [id, path] of [["entry-1", entryPath], ["decrease", decreasePath]]) {
      records.set(`contractRefs/${id}`, { ownerEmail: owner, entryId: id, entryPath: path, contractNumberNormalized: contractNumber });
    }
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify({ action: "reprocess-saved-statement", statementId: "endorsement-statement" }),
    }));
    expect(response.status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B102", expectedAmount: 80, status: "paid" }));
    expect(reads).not.toContain(`users/${owner}/entries`);
  });

  it.each(["01.11.2020", "01.12.2020"])("records the full B202 amount on the original contract when the statement date is %s", async validFrom => {
    const payment = rowHtml("B202", 316.34, 11412)
      .replace("01.01.2024", "02.09.2020").replace("01.01.2024", validFrom);
    setup(payment);
    records.set(entryPath, {
      ...records.get(entryPath), inputAmount: 900, policyStartDate: "2020-11-01", contractSignedDate: "2020-09-02",
      items: [{ code: "B201-B206", title: "Pečovatelská provize (5.–10. rok)", amount: 299.38 }],
    });
    records.set(decreasePath, {
      ...records.get(decreasePath), policyStartDate: "2020-12-01", contractSignedDate: "2020-11-24",
      previousInputAmount: 900, newInputAmount: 951, premiumDelta: 51,
    });
    const amendment = structuredClone(records.get(decreasePath));
    const savedPath = `usersPrivate/${viewer}/commissionStatements/neon-recurring`;
    records.delete(statementPath);
    records.set(savedPath, {
      statementNumber: "1", statementDate: "02.12.2025", period: "01.11.2025 - 30.11.2025",
      html: `<div id="provize"><table>${payment}</table></div>`,
    });
    for (const [id, path] of [["entry-1", entryPath], ["decrease", decreasePath]]) {
      records.set(`contractRefs/${id}`, { ownerEmail: owner, entryId: id, entryPath: path, contractNumberNormalized: contractNumber });
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await POST(request({ action: "reprocess-saved-statement", statementId: "neon-recurring" }));
      expect(response.status).toBe(200);
      expect(payouts()).toEqual([expect.objectContaining({
        code: "B202", amount: 316.34, expectedAmount: 316.34, difference: 0,
        statementBaseAmount: 11412, systemBaseAmount: 11412, status: "paid",
      })]);
    }
    expect(records.get(entryPath)?.inputAmount).toBe(900);
    expect(records.get(decreasePath)).toEqual(amendment);
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual([expect.objectContaining({ expectedAmount: 316.34, status: "paid" })]);
  });

  it("loads the forced replay family only once across multiple saved statements", async () => {
    setup();
    records.set(`usersPrivate/${viewer}/commissionStatements/statement-2`, { ...records.get(statementPath),
      statementNumber: "2", statementDate: "23.03.2028", period: "01.02.2028 - 29.02.2028",
      html: `<div id="provize"><table>${rowHtml("B103", 80)}</table></div>` });
    expect((await POST(request())).status).toBe(200);
    expect(reads.filter(path => path === `users/${owner}/entries`)).toHaveLength(1);
    expect(payouts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "B102", expectedAmount: 80 }),
      expect.objectContaining({ code: "B103", expectedAmount: 80 }),
    ]));
  });

  it("keeps manager comparisons proportional to their own saved commission", async () => {
    setup();
    records.get(entryPath)!.managerOverrides = [{ email: viewer, position: "manazer8",
      items: [{ code: "B101-B104", title: "Následná provize (2.–5. rok)", amount: 50 }] }];
    const cells = [1, contractNumber, "01.01.2024", "Synthetic client", "Z", "CPP_NEON", "B102", 9600, "", "", "108", 40, 0];
    records.get(statementPath)!.html = `<div id="manazer"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`;
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual([expect.objectContaining({ code: "B102", amount: 40, expectedAmount: 40,
      difference: 0, status: "paid" })]);
  });

  it("does not guess an entitlement period for an unsupported commission code", async () => {
    setup(rowHtml("B105", 100, 12000));
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B105", expectedAmount: null, difference: null, status: "paid" }));
  });

  it("verifies a non-life installment period against the existing schedule", async () => {
    setup(rowHtml("A102", 80, 800).replace("CPP_NEON", "CPP_PPR"));
    Object.assign(records.get(entryPath)!, { productKey: "cppPPRbez", frequencyRaw: "semiannual",
      items: [{ code: "A101-A102", title: "Okamžitá provize (z platby)", amount: 100 }] });
    Object.assign(records.get(decreasePath)!, { productKey: "cppPPRbez", policyStartDate: "2024-07-01" });
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual([expect.objectContaining({ code: "A102", expectedAmount: 80, status: "paid" })]);
  });

  it.each([["cppPPRs", "CPP_PPR"], ["domex", "CPP_DOMEX+"]])("compares a %s renewal to the dated premium and frequency of its insured period", async (productKey, statementCode) => {
    setup(rowHtml("B101", 480, 6000).replace("CPP_NEON", statementCode));
    records.delete(decreasePath);
    Object.assign(records.get(entryPath)!, { productKey, frequencyRaw: "annual", inputAmount: 10000,
      items: [{ code: "B101", title: "Následná provize (z platby)", amount: 800 }],
      paymentFrequencyChanges: [{ effectiveDate: "2025-01-01", frequency: "semiannual", annualPremium: 12000, baseAnnualPremium: 10000 }],
    });
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual([expect.objectContaining({ code: "B101", amount: 480, expectedAmount: 480, difference: 0, status: "paid" })]);
  });

  it("does not apply a decrease twice to auto commissions already calculated from the statement base", async () => {
    setup(rowHtml("B101", 64, 800).replace("CPP_NEON", "CPP_1C_II"));
    Object.assign(records.get(entryPath)!, { productKey: "cppAuto", frequencyRaw: "quarterly",
      items: [{ code: "A101", title: "Okamžitá provize", amount: 80 },
        { code: "B101", title: "Následná provize", amount: 80 }] });
    Object.assign(records.get(decreasePath)!, { productKey: "cppAuto", policyStartDate: "2024-07-01" });
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B101", amount: 64, expectedAmount: 64, difference: 0 }));
  });

  it("omits comparison for repeated fixed codes instead of assigning the wrong installment", async () => {
    setup(rowHtml("A101", 80, 800).replace("CPP_NEON", "MAX_DOMOV"));
    Object.assign(records.get(entryPath)!, { productKey: "maxdomov", frequencyRaw: "quarterly",
      items: [{ code: "A101", title: "Okamžitá provize", amount: 100 },
        { code: "B101", title: "Následná provize (z platby)", amount: 20 }] });
    Object.assign(records.get(decreasePath)!, { productKey: "maxdomov", policyStartDate: "2024-07-01" });
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ expectedAmount: null, difference: null, status: "paid" }));
  });

  it.each(["monthly", "invalid"])("compares a manager auto B code only with a proven payment period (frequency: %s)", async frequencyRaw => {
    setup();
    Object.assign(records.get(entryPath)!, { productKey: "cppAuto", frequencyRaw, contractSignedDate: "2023-12-28",
      items: [{ code: "A101", title: "Okamžitá provize", amount: 100 },
        { code: "B101", title: "Následná provize", amount: 100 }],
      managerOverrides: [{ email: viewer, position: "manazer8", items: [{ code: "B101", title: "Následná provize", amount: 50 }] }] });
    Object.assign(records.get(decreasePath)!, { productKey: "cppAuto", policyStartDate: "2024-12-01" });
    const cells = [1, contractNumber, "01.01.2024", "Synthetic client", "Z", "CPP_1C_II", "B101", 800, "", "", "108", 40, 0];
    records.get(statementPath)!.html = `<div id="manazer"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`;
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B101",
      expectedAmount: frequencyRaw === "monthly" ? 40 : null, difference: frequencyRaw === "monthly" ? 0 : null }));
  });

  it("retains all payments if the family cannot be read before an explicit replay", async () => {
    setup();
    const historical = [{ key: "paid", writtenBy: viewer, statementId: "statement-1", amount: 100 }];
    records.get(entryPath)!.commissionPayouts = historical;
    failedCollectionRead = `users/${owner}/entries`;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await POST(request())).status).toBe(500);
      expect(records.get(entryPath)!.commissionPayouts).toEqual(historical);
      expect(writes).toEqual([]);
    } finally { log.mockRestore(); }
  });

  it("retains historical payments belonging to another writer during an explicit replay", async () => {
    setup();
    const historical = { key: "original-paid", writtenBy: owner, statementId: "private-history",
      code: "B101", amount: 123, expectedAmount: 125, difference: -2, status: "paid" };
    records.get(entryPath)!.commissionPayouts = [historical];
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(historical);
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B102", expectedAmount: 80 }));
    expect(reads.some(path => path.startsWith(`usersPrivate/${owner}/`))).toBe(false);
  });

  it("does not use an inaccessible sibling even when the viewer can access the original contract", async () => {
    setup(rowHtml("B102", 100, 12000));
    setContext();
    records.get(entryPath)!.managerChain = [{ email: viewer }];
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B102", expectedAmount: 100, systemBaseAmount: 12000 }));
    expect(writes).not.toContain(decreasePath);
  });

  it.each([
    { rootContractEntryId: "another-root" },
    { productKey: "flexi" },
    { previousInputAmount: 2000 },
    { policyStartDate: "2026-02-30" },
  ])("ignores inconsistent or unrelated amendment fields %j", async patch => {
    setup(rowHtml("B102", 100, 12000));
    Object.assign(records.get(decreasePath)!, patch);
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ code: "B102", expectedAmount: 100 }));
  });

  it("keeps another owner's same-number history outside the family read", async () => {
    setup(rowHtml("B102", 100, 12000));
    records.delete(decreasePath);
    const foreignPath = "users/foreign@example.test/entries/decrease";
    records.set(foreignPath, { contractNumber, productKey: "neon", entryType: "endorsement",
      rootContractEntryId: "entry-1", parentContractEntryId: "entry-1", policyStartDate: "2026-01-01",
      previousInputAmount: 1000, newInputAmount: 500 });
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toContainEqual(expect.objectContaining({ expectedAmount: 100 }));
    expect(reads.some(path => path.startsWith("users/foreign@example.test/"))).toBe(false);
    expect(writes).not.toContain(foreignPath);
  });
});
function document(path: string) {
  return {
    path, id: path.split("/").at(-1)!,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => { reads.push(path); return snapshot(path); },
    set: async (patch: Record<string, unknown>) => {
      beforeReset?.(); beforeReset = undefined;
      write(path, patch);
    },
    update: async (patch: Record<string, unknown>, precondition?: { lastUpdateTime: number }) => {
      beforeReset?.(); beforeReset = undefined;
      if (precondition && precondition.lastUpdateTime !== (versions.get(path) ?? 0)) {
        throw Object.assign(new Error("Concurrent contract change"), { code: 9 });
      }
      write(path, patch);
    },
  };
}
function collection(path: string, filters: Array<[string, unknown]> = [], limit = Infinity) {
  return {
    path,
    doc: (id: string) => document(`${path}/${id}`),
    select: () => collection(path, filters, limit),
    orderBy: () => collection(path, filters, limit),
    where: (field: string, op: string, value: unknown) => collection(path, [...filters, [field, op === "==" ? value : { op, value }]], limit),
    limit: (value: number) => collection(path, filters, value),
    get: async () => {
      if (path === failedCollectionRead) throw new Error("Synthetic collection read failure");
      reads.push(path);
      return { docs: [...records.keys()].filter(key => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
        .filter(key => filters.every(([field, value]) => {
          const actual = records.get(key)?.[field];
          if (!value || typeof value !== "object" || !("op" in value) || !("value" in value)) return actual === value;
          if (typeof actual === "string" && typeof value.value === "string") return value.op === ">=" ? actual >= value.value : actual <= value.value;
          if (actual instanceof Date && value.value instanceof Date) return value.op === ">=" ? actual >= value.value : actual <= value.value;
          return typeof actual === "number" && typeof value.value === "number" && (value.op === ">=" ? actual >= value.value : actual <= value.value);
        })).slice(0, limit).map(snapshot) };
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks(); records.clear(); versions.clear(); beforeReset = undefined; beforeReplayCommit = undefined; failedCollectionRead = undefined; reads.length = 0; writes.length = 0;
  setContext();
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(document);
  mocks.history.mockImplementation((_batch, _ref, _before, patch) => patch);
  mocks.transaction.mockImplementation(async work => {
    const pending: (() => void)[] = [];
    const tx = {
      get: (ref: { get: () => Promise<unknown> }) => ref.get(),
      set: (ref: { path: string }, patch: Record<string, unknown>) => pending.push(() => write(ref.path, patch)),
      delete: (ref: { path: string }) => pending.push(() => records.delete(ref.path)),
      getAll: async (...refs: { path: string }[]) => refs.map(ref => { reads.push(ref.path); return snapshot(ref.path); }),
      update: (ref: { path: string }, patch: Record<string, unknown>) => pending.push(() => write(ref.path, patch)) };
    const result = await work(tx);
    pending.forEach(commit => commit());
    return result;
  });
  mocks.batch.mockImplementation(() => {
    const pending: (() => void)[] = [];
    const checks: (() => void)[] = [];
    const set = (ref: { path: string }, patch: Record<string, unknown>) => pending.push(() => write(ref.path, patch));
    const update = (ref: { path: string }, patch: Record<string, unknown>, precondition?: { lastUpdateTime: number }) => {
      checks.push(() => {
        if (precondition && precondition.lastUpdateTime !== (versions.get(ref.path) ?? 0)) {
          throw Object.assign(new Error("Concurrent contract change"), { code: 9 });
        }
      });
      set(ref, patch);
    };
    const create = (ref: { path: string }, patch: Record<string, unknown>) => {
      checks.push(() => {
        if (records.has(ref.path)) throw Object.assign(new Error("Concurrent document creation"), { code: 6 });
      });
      set(ref, patch);
    };
    return { set, update, create, commit: async () => {
      beforeReplayCommit?.(); beforeReplayCommit = undefined;
      checks.forEach(check => check());
      pending.forEach(work => work());
    } };
  });
  records.set(entryPath, { contractNumber, productKey: "neon", userEmail: owner, commissionPayouts: [] });
  records.set(statementPath, {
    statementNumber: "1", statementDate: "23.04.2026", period: "01.03.2026 - 31.03.2026",
    html: `<div id="ostatni_platby"><table><tr><td>Doplatek smlouvy ${contractNumber} 50 % provize B36</td><td>2 228,00</td></tr></table></div>`,
  });
});

describe("statement processing order and first upload", () => {
  const overview = () => GET(new NextRequest("https://example.test/api/commission-statements?shape=processing-order&ownerEmail=other@example.test"));
  const upload = (date: string, claimedDate = date) => POST(new NextRequest("https://example.test/api/commission-statements", {
    method: "POST", body: JSON.stringify({
      html: `<p>Výpis ze dne ${date}</p>`, header: { statementDate: claimedDate, statementNumber: date },
      ownerEmail: "other@example.test", canManageContractsAsAdmin: true,
    }),
  }));

  beforeEach(() => {
    records.clear();
    records.set(`users/${viewer}/entries/first`, { contractSignedDate: "2025-12-31T23:00:00Z", createdAt: 1 });
    records.set(`users/${viewer}/entries/second`, { entryType: "contract", contractSignedDate: "2026-02-01" });
    records.set(`users/${viewer}/entries/change`, { entryType: "endorsement", contractSignedDate: "2024-01-01" });
    records.set(`users/${owner}/entries/foreign`, { contractSignedDate: "2020-01-01" });
  });
  it("recommends the earliest own signing month, accepts a later start and permits gaps", async () => {
    expect(await (await overview()).json()).toEqual({ firstMonth: Date.UTC(2026, 0, 1), latest: null, earliestUnfinished: null });
    expect((await upload("28.02.2026")).status).toBe(200);
    expect((await upload("31.05.2026")).status).toBe(200);
    expect(await (await overview()).json()).toEqual({ firstMonth: null, latest: Date.UTC(2026, 4, 31), earliestUnfinished: null });
    expect(reads).not.toContain(`users/${owner}/entries`);
  });
  it("rejects a newly uploaded older document even with forged request dates and permissions", async () => {
    expect((await upload("31.03.2026")).status).toBe(200);
    writes.length = 0;
    expect((await upload("28.02.2026", "30.04.2026")).status).toBe(409);
    expect((await upload("31.02.2026")).status).toBe(409);
    expect((await upload("bez data", "30.04.2026")).status).toBe(409);
    expect(writes).toEqual([]);
  });
  it("does not pass an unfinished earlier source or an active concurrent processing request", async () => {
    records.set(statementPath, { period: "01.01.2026 - 31.01.2026", updatedAtMs: 10 });
    expect((await upload("31.03.2026")).status).toBe(409);
    records.set(`usersPrivate/${viewer}/statementProcessing/order`, { token: "synthetic", until: Date.now() + 60_000 });
    expect((await upload("31.01.2026")).status).toBe(409);
    expect(writes).toEqual([]);
  });
  it.each([401, 403])("rejects unauthorized access (%i) before reading the portfolio or importing", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status }) });
    expect((await overview()).status).toBe(status);
    expect((await upload("31.01.2026")).status).toBe(status);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe("confirmed life premium changes from a saved statement", () => {
  const confirm = (patch: Record<string, unknown> = {}) => POST(request({ action: "confirm-life-premium-change", statementId: "statement-1",
    previousMonthlyPremium: 2350, newMonthlyPremium: 2479, effectiveDate: "2026-01-01", confirmed: true, ...patch }));
  const setup = () => {
    setContext({ teamEmails: [owner], actorEmail: actor });
    records.set("contractRefs/life-increase-reference", { ownerEmail: owner, entryId: "entry-1", entryPath, contractNumberNormalized: contractNumber });
    Object.assign(records.get(entryPath)!, { inputAmount: 2350, items: [{ code: "A101", title: "Provize A101", amount: 14190.24 }] });
    const rows = [["NV101", 620.9], ["NB0301", 158.1]].map(([code, amount], index) => {
      const cells = [index + 1, contractNumber, "07.09.2023", "08.09.2023", "Synthetic client", "Z", "CPP_NEON", code, 1548, "", "", "7", amount, 0];
      return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
    });
    records.get(statementPath)!.html = `<div id="provize"><table>${rows.join("")}</table></div>`;
  };
  it("stores neutral history exactly once and preserves the original contract calculation", async () => {
    setup();
    const before = structuredClone(records.get(entryPath)!);
    const response = await confirm();
    expect(response.status).toBe(200);
    const change = (await response.json()).change;
    expect(change).toMatchObject({ previousMonthlyPremium: 2350, newMonthlyPremium: 2479, annualIncrease: 1548,
      effectiveDate: "2026-01-01", statementId: "statement-1", writtenBy: viewer });
    expect(change).not.toHaveProperty("reason");
    expect(change).not.toHaveProperty("entryType");
    expect(records.get(entryPath)).toEqual({ ...before, confirmedLifePremiumChanges: [change], updatedAt: new Date(change.confirmedAtMs) });
    expect((await confirm()).status).toBe(200);
    expect(records.get(entryPath)!.confirmedLifePremiumChanges).toEqual([change]);
    expect(reads.some(path => path.includes(`usersPrivate/${actor}/`))).toBe(false);
    expect(reads).toContain(statementPath);
    expect(mocks.history.mock.calls[0][4]).toMatchObject({ actorEmail: actor, changes: [] });
  });
  it.each([
    { confirmed: false }, { previousMonthlyPremium: "2350" }, { newMonthlyPremium: -2479 }, { newMonthlyPremium: null },
    { effectiveDate: "2026-02-30" }, { effectiveDate: "" }, { entryId: "entry-1/private/secret" }, { statementId: "../other" },
  ])("rejects invalid and manipulated input %j", async patch => {
    setup(); expect((await confirm(patch)).status).toBe(400); expect(writes).toEqual([]);
  });
  it.each([
    { newMonthlyPremium: 2500 }, { contractNumber: "other" },
  ])("requires agreement with the server's stored statement %j", async patch => {
    setup(); expect((await confirm(patch)).status).toBe(409); expect(writes).toEqual([]);
  });
  it("rejects conflicting repeated confirmations", async () => {
    setup(); expect((await confirm()).status).toBe(200);
    writes.length = 0;
    expect((await confirm({ effectiveDate: "2026-02-01" })).status).toBe(409); expect(writes).toEqual([]);
  });
  it("blocks unauthorized cross-account writes and role escalation", async () => {
    setup(); setContext();
    expect((await confirm({ canManageContractsAsAdmin: true, viewerEmail: owner })).status).toBe(403);
    setContext({ accountType: "tipster", teamEmails: [owner] });
    expect((await confirm()).status).toBe(403);
    expect(writes).toEqual([]);
  });
  it("requires authentication and a source in the represented account", async () => {
    setup(); mocks.guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await confirm()).status).toBe(401);
    records.delete(statementPath);
    expect((await confirm()).status).toBe(404); expect(writes).toEqual([]);
  });
  it("preserves NV/NB payouts without comparing them with the whole original commission", async () => {
    setup();
    records.set(`usersPrivate/${viewer}/commissionStatements/statement-reprocess-1`, records.get(statementPath)!);
    const response = await POST(request({ action: "reprocess-saved-statement", statementId: "statement-reprocess-1" }));
    expect(response.status).toBe(200);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([
      expect.objectContaining({ code: "NV101", amount: 620.9, expectedAmount: null, difference: null, status: "paid" }),
      expect.objectContaining({ code: "NB0301", amount: 158.1, expectedAmount: null, difference: null, status: "paid" }),
    ]);
    expect([...records.keys()].some(key => key.includes("accountingRepairDrafts/"))).toBe(false);
    expect(records.get(entryPath)!.inputAmount).toBe(2350);
  });
});

describe("normal statement import author isolation", () => {
  const ownStatementPath = `usersPrivate/${owner}/commissionStatements/security-statement`;
  const payoutRows = () => `<div id="provize"><table>${Array.from({ length: 401 }, (_, index) => {
    const cells = [index + 1, contractNumber, "", "", "Synthetic client", "", "", `ZZ${index}`, "", "", "", "", 1, 0];
    return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
  }).join("")}</table></div>`;
  const invoke = (mode: string, html: string) => {
    records.set(ownStatementPath, { html, processedAtMs: 1 });
    return POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify(mode === "import" ? statementImportFixture(html, { statementDate: "01.01.2026" }) : {
        action: "reprocess-saved-statement", statementId: "security-statement",
      }),
    }));
  };

  beforeEach(() => {
    setContext({ email: owner, actorEmail: owner });
    records.set("contractRefs/security-reference", {
      ownerEmail: owner, entryId: "entry-1", entryPath, contractNumberNormalized: contractNumber,
    });
  });

  it("records Kooperativa C premium changes at their annual anniversaries in code order without changing the original premium", async () => {
    Object.assign(records.get(entryPath)!, { productKey: "kooperativaAuto", frequencyRaw: "annual", position: "poradce7",
      inputAmount: 10000, calculationInputAmount: 10000, effectiveInputAmount: 10000,
      contractSignedDate: "2023-05-01", policyStartDate: "2023-05-03",
      items: [{ title: "Následná provize", code: "B101", amount: 844 }] });
    const html = `<div id="provize"><table>${[["C103", 12000], ["C102", 11000]].map(([code, premium], index) => {
      const cells = [index + 1, contractNumber, "01.05.2023", "03.05.2023", "Testovací klient", "Z", "KOO_NAMIRU", code,
        10000, "", "", "7", Number(premium) * 0.0844, 0];
      return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
    }).join("")}</table></div>`;
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await invoke("reprocess", html)).status).toBe(200);
      const saved = records.get(entryPath)!;
      expect(saved.premiumStatementHistory).toEqual([
        expect.objectContaining({ commissionCode: "C102", anniversaryDate: "2025-05-03", previousAnnualPremium: 10000, newAnnualPremium: 11000 }),
        expect.objectContaining({ commissionCode: "C103", anniversaryDate: "2026-05-03", previousAnnualPremium: 11000, newAnnualPremium: 12000 }),
      ]);
      expect(saved.inputAmount).toBe(10000);
      expect(saved.commissionPayouts).toHaveLength(2);
      expect(records.get(ownStatementPath)!.autoPremiumRows).toHaveLength(2);
    }
  });

  it.each([true, false])("records a B102 annual base only when the payout also matches two installments: %s", async combined => {
    Object.assign(records.get(entryPath)!, { productKey: "cppAuto", frequencyRaw: "semiannual", position: "poradce7",
      inputAmount: 4000, calculationInputAmount: 4000, effectiveInputAmount: 4000,
      contractSignedDate: "2023-03-01", policyStartDate: "2023-03-01",
      items: [{ title: "Následná provize", code: "B101", amount: 480 }] });
    const cells = [1, contractNumber, "01.03.2023", "01.09.2024", "Testovací klient", "Z", "CPP_ACPIV", "B102",
      8000, "", "", "7", combined ? 960 : 480, 0];
    const html = `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`;
    records.set(ownStatementPath, { html, payoutMonthKey: "2024-10", statementDateMs: Date.UTC(2024, 9, 25) });

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
        method: "POST", body: JSON.stringify({ action: "reprocess-saved-statement", statementId: "security-statement" }),
      }));
      expect(response.status).toBe(200);
      const saved = records.get(entryPath)!;
      expect(saved.premiumStatementHistory ?? []).toEqual(combined ? [expect.objectContaining({
        commissionCode: "B102", combinedInstallmentCode: "B101", anniversaryNumber: 1, anniversaryDate: "2024-03-01",
        previousAnnualPremium: 8000, newAnnualPremium: 8000, differenceAnnual: 0,
        newPremium: 4000, basePremiumPeriod: "annual", sourceBasePremium: 8000,
      })] : []);
      expect(saved.inputAmount).toBe(4000);
      expect(saved.frequencyRaw).toBe("semiannual");
      expect(saved.commissionPayouts).toEqual([expect.objectContaining({ code: "B102", amount: combined ? 960 : 480 })]);
    }
  });

  it.each([
    { mode: "import", statusCode: "A001" }, { mode: "reprocess", statusCode: "A001" },
    { mode: "import", statusCode: "S001" }, { mode: "reprocess", statusCode: "S001" },
  ])("normal $mode preserves manual contract status through payouts and a reversal with code $statusCode", async ({ mode, statusCode }) => {
    Object.assign(records.get(entryPath)!, {
      status: "active", stornoDate: null, productKey: "kooperativaAuto", frequencyRaw: "semiannual", position: "poradce7",
      inputAmount: 7175, calculationInputAmount: 7175, effectiveInputAmount: 7175,
      contractSignedDate: "2023-02-16", policyStartDate: "2023-02-17",
      items: [{ title: "Následná provize", code: "B101", amount: 605.57 }],
    });
    const before = structuredClone(records.get(entryPath))!;
    const amounts = [1000, -1000, 605.57];
    for (const [index, amount] of amounts.entries()) {
      const isReversal = amount < 0;
      const cells = isReversal
        ? [1, contractNumber, "16.02.2023", "Testovací klient", "Z", "KOO_NAMIRU", "C103", statusCode, 7175, "", "60,00%", "7", amount, 0]
        : [1, contractNumber, "16.02.2023", "17.02.2023", "Testovací klient", "Z", "KOO_NAMIRU", "C103", 7175, "", "60,00%", "7", amount, 0];
      const html = `<div id="${isReversal ? "storna" : "provize"}"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`;
      const header = { statementNumber: `correction-${index}`, statementDate: `28.0${index + 1}.2026`, period: `01.0${index + 1}.2026 - 28.0${index + 1}.2026` };
      const statementId = `correction-${index}`;
      records.set(`usersPrivate/${owner}/commissionStatements/${statementId}`, { html, ...header });
      // Reprocessing the same document is idempotent and keeps earlier statements.
      for (let attempt = 0; attempt < (mode === "reprocess" ? 2 : 1); attempt++) {
        const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
          method: "POST", body: JSON.stringify(mode === "import" ? statementImportFixture(html, header) : { action: "reprocess-saved-statement", statementId }),
        }));
        expect(response.status).toBe(200);
        const saved = records.get(entryPath)!;
        const payouts = saved.commissionPayouts as ContractCommissionPayout[];
        expect(payouts.map(payout => Number(payout.amount)).sort((a, b) => a - b)).toEqual(amounts.slice(0, index + 1).sort((a, b) => a - b));
        expect(saved).toMatchObject({ status: "active", stornoDate: null, items: before.items,
          inputAmount: 7175, calculationInputAmount: 7175, effectiveInputAmount: 7175 });
        if (index > 0) {
          expect(payouts).toContainEqual(expect.objectContaining({ amount: -1000, status: "storno" }));
          expect(saved.commissionStornoSummary).toMatchObject({ totalAmount: -1000, count: 1 });
        }
      }
    }
    const payouts = records.get(entryPath)!.commissionPayouts as ContractCommissionPayout[];
    expect(payouts.reduce((sum, payout) => sum + Number(payout.amount), 0)).toBe(605.57);
    expect(payouts).toContainEqual(expect.objectContaining({ amount: 605.57, status: "paid" }));
  });

  it.each(["import", "reprocess"])("normal %s derives new Kooperativa premium despite a constant statement base", async mode => {
    const premium = 7175;
    Object.assign(records.get(entryPath)!, {
      productKey: "kooperativaAuto", frequencyRaw: "semiannual", position: "poradce7",
      inputAmount: premium, calculationInputAmount: premium, effectiveInputAmount: premium,
      contractSignedDate: "2023-02-16", policyStartDate: "2023-02-17",
      items: [{ title: "Následná provize", code: "B101", amount: 605.57 }],
    });
    const before = structuredClone(records.get(entryPath))!;
    const amounts = [["C101", 675.20], ["C102", 1065.13], ["C103", 633.00], ["C105", 717.40], ["C106", 769.80]] as const;
    const html = `<div id="provize"><table>${amounts.map(([code, amount], index) => {
      const cells = [index + 1, contractNumber, "16.02.2023", "17.02.2023", "Testovací klient", "Z", "KOO_NAMIRU", code, premium, "", "60,00%", "7", amount, 0];
      return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
    }).join("")}</table></div>`;
    for (let attempt = 0; attempt < (mode === "reprocess" ? 2 : 1); attempt++) {
      const response = await invoke(mode, html);
      expect(response.status).toBe(200);
      const saved = records.get(entryPath)!;
      const payouts = saved.commissionPayouts as ContractCommissionPayout[];
      expect(payouts).toHaveLength(amounts.length);
      expect(payouts).toEqual(expect.arrayContaining(amounts.map(([code, amount]) =>
        expect.objectContaining({ code, amount, status: "paid", expectedAmount: null, difference: null, sourceBaseAmount: premium, writtenBy: owner })
      )));
      expect(saved).toMatchObject({ inputAmount: premium, effectiveInputAmount: premium, calculationInputAmount: premium, position: "poradce7", frequencyRaw: "semiannual", items: before.items });
      expect(saved.premiumStatementHistory).toEqual([
        expect.objectContaining({ commissionCode: "C101", previousAnnualPremium: 14350, newAnnualPremium: 16000 }),
        expect.objectContaining({ commissionCode: "C103", previousAnnualPremium: 16000, newAnnualPremium: 15000 }),
        expect.objectContaining({ commissionCode: "C105", previousAnnualPremium: 15000, newAnnualPremium: 17000 }),
      ]);
      expect(saved.commissionCoefficientSetOverride).toBeUndefined();
      expect([...records.values()]).not.toContainEqual(expect.objectContaining({ kind: "commission_difference" }));
    }
  });

  it.each(["B102", "C102"])("keeps %s as a subsequent payout without a comparison to the stale base", async code => {
    Object.assign(records.get(entryPath)!, {
      productKey: "kooperativaAuto", frequencyRaw: "semiannual", position: "poradce7",
      inputAmount: 7175, calculationInputAmount: 7175, effectiveInputAmount: 7175,
      contractSignedDate: "2023-02-16", policyStartDate: "2023-02-17",
      items: [{ title: "Následná provize", code: "B101", amount: 605.57 }],
    });
    const cells = [1, contractNumber, "16.02.2023", "17.02.2023", "Testovací klient", "Z", "KOO_NAMIRU", code, 7175, "", "", "7", 500, 0];
    expect((await invoke("reprocess", `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`)).status).toBe(200);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([expect.objectContaining({
      code, amount: 500, expectedAmount: null, difference: null, status: "paid",
      differenceReason: null, writtenBy: owner,
    })]);
    expect(records.get(entryPath)!.inputAmount).toBe(7175);
    expect(records.get(entryPath)!.premiumStatementHistory ?? []).toEqual([]);
  });

  it.each([
    { codes: ["C101"], career: "8" },
    { codes: ["C101", "B101"], career: "7" },
  ])("keeps the payout but skips premium inference when renewal evidence conflicts: %j", async ({ codes, career }) => {
    Object.assign(records.get(entryPath)!, {
      productKey: "kooperativaAuto", frequencyRaw: "annual", position: "poradce7",
      inputAmount: 10000, contractSignedDate: "2023-05-01", policyStartDate: "2023-05-03",
    });
    const html = `<div id="provize"><table>${codes.map((code, index) => {
      const cells = [index + 1, contractNumber, "01.05.2023", "03.05.2023", "Testovací klient", "Z", "KOO_NAMIRU",
        code, 10000, "", "", career, 928.40, 0];
      return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
    }).join("")}</table></div>`;
    expect((await invoke("reprocess", html)).status).toBe(200);
    const saved = records.get(entryPath)!;
    expect(saved.premiumStatementHistory ?? []).toEqual([]);
    expect(saved.commissionPayouts).toEqual(codes.map(code => expect.objectContaining({ code, amount: 928.40, status: "paid" })));
  });

  it.each([
    { commission: 160, status: "difference", difference: 80 },
    { commission: 60, status: "difference", difference: -20 },
    { commission: 70, status: "paid", difference: -10 },
    { commission: 90, status: "paid", difference: 10 },
  ])("checks auto subsequent B payouts against one installment with a 10 Kč tolerance: %j", async ({ commission, status, difference }) => {
    Object.assign(records.get(entryPath)!, {
      productKey: "cppAuto", frequencyRaw: "semiannual", position: "poradce1",
      inputAmount: 3049, calculationInputAmount: 3049, effectiveInputAmount: 3049,
      contractSignedDate: "2023-02-16", policyStartDate: "2023-02-17",
      items: [{ title: "Následná provize", code: "B101", amount: 80 }],
    });
    const cells = [1, contractNumber, "16.02.2023", "17.02.2023", "Testovací klient", "Z", "CPP_1C_II", "B104", 1000, "", "", "1", commission, 0];
    const response = await invoke("reprocess", `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`);

    expect(response.status).toBe(200);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([expect.objectContaining({
      code: "B104", amount: commission, expectedAmount: 80, difference, status,
      differenceReason: status === "difference" ? "commission_amount_mismatch" : null,
      writtenBy: owner,
    })]);
  });

  it.each([
    { amount: 140, career: "7", expected: 100, status: "paid", reason: null },
    { amount: 60, career: "7", expected: 100, status: "difference", reason: "commission_amount_mismatch" },
    { amount: 140, career: "8", expected: 100, status: "difference", reason: "career_mismatch" },
    { amount: 140, career: "7", expected: null, status: "paid", reason: null },
  ])("keeps a paid higher commission distinct from real payout problems: %j", async ({ amount, career, expected, status, reason }) => {
    Object.assign(records.get(entryPath)!, { position: "poradce7", inputAmount: 1000,
      items: expected == null ? [] : [{ code: "B3601", title: "Provize po 3 letech", amount: expected }] });
    const cells = [1, contractNumber, "01.01.2020", "01.01.2020", "Testovací klient", "Z", "CPP_NEON", "B3601", 12000, "", "", career, amount, 0];
    const response = await invoke("reprocess", `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`);
    expect(response.status).toBe(200);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([expect.objectContaining({ amount, expectedAmount: expected, status, differenceReason: reason,
      difference: expected == null ? null : amount - expected })]);
    expect(records.get(entryPath)!.inputAmount).toBe(1000);
    if (status === "paid") expect([...records.keys()].filter(key => key.includes("accountingRepairDrafts/"))).toEqual([]);
  });

  it.each(["import", "reprocess"])("normal %s preserves foreign, manual and unattributed payouts under retention pressure", async mode => {
    const protectedRecords = [
      { key: "foreign", statementId: "private-statement", writtenBy: "manager@example.test", amount: 55, writtenAtMs: 1 },
      { key: "manual", writtenBy: owner, amount: 70 },
      { key: "unattributed", statementId: "legacy", amount: 80 },
      { statementId: "malformed-foreign", writtenBy: "manager@example.test", amount: 90 },
    ];
    records.get(entryPath)!.commissionPayouts = protectedRecords;
    const response = await invoke(mode, payoutRows());
    expect(response.status).toBe(200);
    const payouts = records.get(entryPath)!.commissionPayouts as unknown[];
    expect(payouts.slice(0, protectedRecords.length)).toEqual(protectedRecords);
    expect(payouts).toHaveLength(400);
    expect(payouts.slice(protectedRecords.length)).toEqual(expect.arrayContaining([
      expect.objectContaining({ writtenBy: owner, amount: 1 }),
    ]));
  });

  it.each(["import", "reprocess"])("normal %s rejects full protected capacity without changing the contract", async mode => {
    const protectedRecords = Array.from({ length: 400 }, (_, index) => ({
      key: `foreign-${index}`, statementId: "private-statement", writtenBy: "manager@example.test", amount: index + 1,
    }));
    records.get(entryPath)!.commissionPayouts = protectedRecords;
    const before = structuredClone(records.get(entryPath));
    const response = await invoke(mode, payoutRows());
    expect(response.status).toBe(409);
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).not.toContain(entryPath);
  });

  it("rejects an excessive HTML matching budget before persisting an import", async () => {
    const contracts = Array.from({ length: 1_000 }, (_, index) => `smlouvy ${100000 + index} `).join("");
    const codes = Array.from({ length: 12 }, (_, index) => `A${101 + index} B${101 + index} `).join("");
    const html = `<div id='ostatni_platby'><tr><td>${contracts}${codes}</td></tr></div>`;
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify({ html }),
    }));
    expect(response.status).toBe(413);
    expect(writes).toEqual([]);
  });

  it("rejects unsafe stored HTML before reprocessing can change a contract", async () => {
    const before = structuredClone(records.get(entryPath));
    const response = await invoke("reprocess", `<div id="provize">${"<tr>".repeat(1000)}</div>`);
    expect(response.status).toBe(400);
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).toEqual([]);
  });

  it("rejects malformed summary tables before persisting a source that readers cannot parse", async () => {
    const html = '<table><tr><td>Celkem</tr></table><div id="zadrzny_fond"></div>';
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify({ html }),
    }));
    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("adding statement external links without processing", () => {
  it("does not write links for an unpaired contract number", async () => {
    records.set("contractRefs/unavailable-reference", {
      ownerEmail: "other@example.test", entryId: "entry-foreign",
      entryPath: "users/other@example.test/entries/entry-foreign", contractNumberNormalized: contractNumber,
    });
    const cells = [
      `<a href="https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx?sml=987654">1</a>`,
      contractNumber, "04.11.2026", "05.11.2026", "Synthetic client", "R", "CPP_1C_II",
      "A1", "1000", "", "10%", "5", "100", "0",
    ];
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST",
      body: JSON.stringify({
        action: "add-external-links-only",
        html: `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`,
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, matchedContracts: 0, updatedContracts: 0, skippedContracts: 1 });
    expect(writes).toEqual([]);
  });

  it("writes only MAXX and CPP extranet link fields to an accessible matched contract", async () => {
    setContext({ teamEmails: [owner] });
    records.set("contractRefs/link-only-reference", {
      ownerEmail: owner, entryId: "entry-1", entryPath, contractNumberNormalized: contractNumber,
    });
    records.set(entryPath, {
      contractNumber, productKey: "cppAuto", userEmail: owner,
      commissionPayouts: [{ key: "unchanged", amount: 125 }],
      premiumStatementHistory: [{ key: "premium-unchanged", newPremium: 1000 }],
      inputAmount: 1000,
    });
    const cells = [
      `<a href="https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx?sml=987654&amp;typ=43">1</a>`,
      contractNumber, "04.11.2026", "05.11.2026", "Synthetic client", "R", "CPP_1C_II",
      "A1", "1000", "", "10%", "5", "100", "0",
    ];
    const html = `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`;
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify({ action: "add-external-links-only", html }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, matchedContracts: 1, updatedContracts: 1, skippedContracts: 0 });
    expect(writes).toEqual([entryPath]);
    expect(records.get(entryPath)).toMatchObject({
      maxxContractDetailUrl: "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx?sml=987654&typ=43",
      cppExtranetEntityId: "987654",
      cppExtranetEntityTypeId: "43",
      commissionPayouts: [{ key: "unchanged", amount: 125 }],
      premiumStatementHistory: [{ key: "premium-unchanged", newPremium: 1000 }],
      inputAmount: 1000,
    });
  });
});

async function expectRebuilt(actorEmail: string) {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true, matchedStatements: 1, processedStatements: 1,
    processingResult: { contractsUpdated: 1, contractsMatched: 1, payoutRecordsAdded: 1, errors: [], skippedContracts: [] },
  });
  expect(records.get(entryPath)?.commissionPayouts).toEqual([
    expect.objectContaining({ statementId: "statement-1", amount: 2228, writtenBy: viewer }),
  ]);
  expect(mocks.history).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: entryPath }), expect.anything(), expect.anything(), expect.objectContaining({ actorEmail }));
  expect(reads).toContain(`usersPrivate/${viewer}/commissionStatements`);
  expect(reads).not.toContain(`usersPrivate/${actor}/commissionStatements`);
  expect(reads).not.toContain(`usersPrivate/${owner}/commissionStatements`);
}

function setAutoStatement(code = "A1", base = 6000, year = 2026) {
  records.get(entryPath)!.initialCommissionBase ??= { statementId: null, resolvedBy: owner, paymentPremium: 5000, annualPremium: 5000 };
  Object.assign(records.get(entryPath)!, {
    productKey: "cppAuto", frequencyRaw: "annual", position: "poradce5", originalPosition: "poradce5",
    inputAmount: 5000, calculationInputAmount: 5000, effectiveInputAmount: 5000,
    createdFromCommissionStatement: true, contractSignedDate: "2025-01-01", policyStartDate: "2025-01-01",
  });
  const cells = [1, contractNumber, "01.01.2025", "01.01.2025", "Testovací klient", "R", "CPP_1C_II", code, base, "", "10,60%", "5", "600,00", "0,00"];
  records.set(statementPath, {
    statementNumber: "1", statementDate: `23.04.${year}`, period: `01.03.${year} - 31.03.${year}`,
    html: `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`,
  });
}

describe("matching investment payouts", () => {
  const archive = `usersPrivate/${owner}/commissionStatements`;
  const html = (payouts: number[], productCode: string, number = contractNumber, section = "provize") =>
    `<div id="${section}"><table>${payouts.map((amount, index) => {
      const cells = [index + 1, number, "05.01.2020", ...(section === "manazer" ? [] : ["06.01.2020"]),
        "Synthetic client", "S", productCode, "BC180", 10000, "", "0.02%", "6", amount, 0];
      return `<tr>${cells.map(cell => `<td>${cell}</td>`).join("")}</tr>`;
    }).join("")}</table></div>`;

  const setup = (productKey = "investikaRealitniFond") => {
    setContext({ email: owner, actorEmail: owner });
    records.set(entryPath, { id: "entry-1", contractNumber, entryType: "contract", productKey,
      userEmail: owner, commissionPayouts: [], inputAmount: 0, total: 0, items: [] });
  };

  const saveStatement = (id: string, statementNumber: string, source: string, updatedAtMs = 1) =>
    records.set(`${archive}/${id}`, { statementNumber, advisorNumber: "123", statementDate: "23.04.2026",
      period: "01.03.2026 - 31.03.2026", html: source, updatedAtMs });

  const payouts = () => records.get(entryPath)?.commissionPayouts as ContractCommissionPayout[];

  const mixedInvestikaStatement = () => html([337.68, 0.31], "INVESTIKA")
    .replace("</table></div>", html([0.14], "EFEKTIKA").replace('<div id="provize"><table>', ""));

  it("links both funds in one contract from the archive, even across statements", async () => {
    setup();
    saveStatement("mixed-source", "1", mixedInvestikaStatement());
    saveStatement("efektika-only", "2", html([5], "EFEKTIKA"));
    saveStatement("conseq-only", "3", html([999], "CON_INV2_C"));
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toHaveLength(4);
    expect(payouts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "INVESTIKA · BC180", amount: 337.68 }),
      expect.objectContaining({ title: "INVESTIKA · BC180", amount: 0.31 }),
      expect.objectContaining({ title: "EFEKTIKA · BC180", amount: 0.14 }),
      expect.objectContaining({ title: "EFEKTIKA · BC180", amount: 5 }),
    ]));
    const contract = { ...records.get(entryPath)!, id: "entry-1", commissionPayouts: payouts() };
    expect(buildContractPaidCommissionTotal({ contract, timeline: [contract], ownerEmail: owner, viewerEmail: owner })).toBe(343.13);
    expect((await POST(request())).status).toBe(200);
    expect(writes).toEqual([entryPath]);
  });

  it("writes a newly uploaded mixed statement to an existing Investika contract in one update", async () => {
    setup("investikaEfektika");
    records.set("contractRefs/investment", { ownerEmail: owner, entryId: "entry-1", entryPath, contractNumberNormalized: contractNumber });
    const response = await POST(new NextRequest("http://localhost/api/commission-statements", {
      method: "POST", body: JSON.stringify(statementImportFixture(mixedInvestikaStatement(),
        { advisorNumber: "123", statementNumber: "1", statementDate: "23.04.2026", period: "01.03.2026 - 31.03.2026" },
      )),
    }));
    expect(await response.json()).toMatchObject({ ok: true, processingResult: { contractsUpdated: 1, payoutRecordsAdded: 3 } });
    expect(payouts().map(payout => payout.amount)).toEqual(expect.arrayContaining([337.68, 0.31, 0.14]));
    expect(writes.filter(path => path === entryPath)).toHaveLength(1);
  });

  it("does not copy a mixed statement into two stored Investika contracts with the same number", async () => {
    setup();
    records.set(`users/${owner}/entries/entry-2`, { contractNumber, productKey: "investikaEfektika", userEmail: owner });
    saveStatement("mixed-source", "1", mixedInvestikaStatement());
    expect((await POST(request())).status).toBe(409);
    expect(writes).toEqual([]);
    expect(reads).not.toContain(archive);
  });

  it.each([
    ["INVESTIKA", "investikaRealitniFond"],
    ["EFEKTIKA", "investikaEfektika"],
    ["MONETIKA", "investikaMonetika"],
    ["CON_INV2_C", "conseqInvest"],
  ])("records all matching own %s rows and derives the net total", async (code, product) => {
    setup(product);
    saveStatement("latest-copy-001", "1", html([11.11, 11.11, -2.02], code), 10);
    saveStatement("older-copy-001", "1", html([999], code));
    saveStatement("second-source-002", "2", html([4.8], code));
    saveStatement("different-product", "3", html([500], "CPP_1C_II"));
    saveStatement("different-contract", "4", html([300], code, "9988776611"));
    saveStatement("manager-payout", "5", html([50], code, contractNumber, "manazer"));
    records.get(statementPath)!.html = html([1000], code);

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ matchedStatements: 2, processingResult: {
      payoutRecordsAdded: 4, contractsUpdated: 1, premiumUpdates: 0, accountingRepairDrafts: 0,
    } });
    expect(payouts().map(payout => payout.amount).sort()).toEqual([-2.02, 11.11, 11.11, 4.8].sort());
    expect(payouts().every(payout => payout.writtenBy === owner && payout.expectedAmount === null &&
      payout.difference === null && payout.status !== "difference")).toBe(true);
    expect(records.get(entryPath)).toMatchObject({ productKey: product, inputAmount: 0, total: 0, items: [] });
    const contract = { ...records.get(entryPath)!, id: "entry-1", commissionPayouts: payouts() };
    expect(buildContractPaidCommissionTotal({ contract, timeline: [contract], ownerEmail: owner, viewerEmail: owner })).toBe(25);
    expect(writes).toEqual([entryPath]);
    expect(reads).not.toContain(`usersPrivate/${viewer}/commissionStatements`);

    const repeated = await POST(request());
    expect(await repeated.json()).toMatchObject({ processingResult: { payoutRecordsExisting: 4, contractsUpdated: 0 } });
    expect(writes).toEqual([entryPath]);
  });

  it("records new statements and treats a corrected copy as the same source", async () => {
    setup();
    records.set("contractRefs/investment", { ownerEmail: owner, entryId: "entry-1", entryPath, contractNumberNormalized: contractNumber });
    Object.assign(records.get(entryPath)!, { commissionPayouts: [{ key: "manual", amount: 10 }] });
    const upload = (amount: number) => POST(new NextRequest("http://localhost/api/commission-statements", {
      method: "POST", body: JSON.stringify(statementImportFixture(html([amount], "INVESTIKA"),
        { advisorNumber: "123", statementNumber: "1", statementDate: "23.04.2026", period: "01.03.2026 - 31.03.2026" },
      )),
    }));

    const first = await upload(22.5);
    expect(await first.json()).toMatchObject({ ok: true, processingResult: { payoutRecordsAdded: 1 } });
    expect((await POST(request())).status).toBe(200);
    expect(payouts().map(payout => payout.amount)).toEqual([10, 22.5]);

    const revised = await upload(17.5);
    expect(await revised.json()).toMatchObject({ ok: true, processingResult: { contractsUpdated: 1 } });
    expect(payouts().map(payout => payout.amount)).toEqual([10, 17.5]);
    expect(payouts()[0]).toEqual({ key: "manual", amount: 10 });
  });

  it("retains both entries for a full reversal within a saved statement", async () => {
    setup();
    const deductionCells = [1, contractNumber, "05.01.2020", "Synthetic client", "S", "INVESTIKA", "BC180", 10000, "", "0.02%", "6", -15, 0];
    const deduction = `<div id="odecty"><table><tr>${deductionCells.map(cell => `<td>${cell}</td>`).join("")}</tr></table></div>`;
    saveStatement("full-reversal-001", "1", html([15], "INVESTIKA") + deduction);
    expect((await POST(request())).status).toBe(200);
    expect(payouts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 15, status: "paid" }),
      expect.objectContaining({ amount: -15, status: "storno" }),
    ]));
  });

  it("checks authentication, the active owner, account type and submitted identifiers", async () => {
    setup();
    saveStatement("investment-source", "1", html([10], "INVESTIKA"));
    mocks.guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    setContext({ teamEmails: [owner], canManageContractsAsAdmin: true });
    expect((await POST(request({ viewerEmail: owner, canManageContractsAsAdmin: true }))).status).toBe(403);
    setContext({ email: owner, accountType: "tipster" });
    expect((await POST(request())).status).toBe(403);
    setContext({ email: owner });
    expect((await POST(request({ ownerEmail: "other@example.test/entries/foo" }))).status).toBe(400);
    expect((await POST(request({ contractNumber: `fake-${contractNumber}` }))).status).toBe(400);
    expect((await POST(request({ contractNumber: "9988776611" }))).status).toBe(400);
    expect(payouts()).toEqual([]);
    expect(writes).toEqual([]);
    expect(reads).not.toContain(archive);
  });

  it("uses the verified adviser archive during impersonation and preserves a concurrent contract change", async () => {
    setup();
    setContext({ email: owner, actorEmail: actor, isImpersonating: true, impersonation: { actorRole: "admin" } });
    saveStatement("investment-source", "1", html([10], "INVESTIKA"));
    beforeReplayCommit = () => write(entryPath, { commissionPayouts: [{ key: "concurrent", amount: 20 }] });
    expect((await POST(request())).status).toBe(409);
    expect(payouts()).toEqual([{ key: "concurrent", amount: 20 }]);
    expect((await POST(request())).status).toBe(200);
    expect(payouts().map(payout => payout.amount)).toEqual([20, 10]);
    expect(reads).not.toContain(`usersPrivate/${actor}/commissionStatements`);
  });

  it("streams archive progress in chronological order and reports completion after saving", async () => {
    setup();
    saveStatement("february", "2", html([5], "INVESTIKA", "9988776611"));
    Object.assign(records.get(`${archive}/february`)!, { period: "01.02.2023 - 28.02.2023", statementDate: "15.04.2023" });
    saveStatement("january", "1", html([10], "INVESTIKA"));
    Object.assign(records.get(`${archive}/january`)!, { period: "01.01.2023 - 31.01.2023", statementDate: "20.04.2023" });
    const response = await POST(request({}, { Accept: INVESTMENT_PAYOUT_PROGRESS_TYPE }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const progress: InvestmentPayoutMatchProgress[] = [];
    const result = await readInvestmentPayoutMatch(response, event => progress.push(event));
    expect(progress.map(event => [event.phase, event.scanned, event.total])).toEqual([
      ["scanning", 0, 2], ["scanning", 1, 2], ["scanning", 2, 2], ["saving", 2, 2],
    ]);
    expect(progress.flatMap(event => event.monthMs == null ? [] : new Date(event.monthMs).getUTCMonth())).toEqual([0, 1]);
    expect(result).toMatchObject({ matchedStatements: 1, processingResult: { payoutRecordsAdded: 1 } });
    expect(payouts()).toEqual([expect.objectContaining({ amount: 10, statementId: "january" })]);
  });

  it("streams a safe error after a failed write and keeps the original payouts", async () => {
    setup();
    saveStatement("investment-source", "1", html([10], "INVESTIKA"));
    beforeReplayCommit = () => write(entryPath, { commissionPayouts: [{ key: "concurrent", amount: 20 }] });
    const response = await POST(request({}, { Accept: INVESTMENT_PAYOUT_PROGRESS_TYPE }));
    await expect(readInvestmentPayoutMatch(response, () => {})).rejects.toThrow("Smlouva se mezitím změnila.");
    expect(payouts()).toEqual([{ key: "concurrent", amount: 20 }]);
  });
});

describe("rebuilding a contract from saved statements", () => {
  it("rejects unsafe stored HTML before clearing the caller's existing records", async () => {
    setContext({ email: owner, actorEmail: owner });
    records.delete(statementPath);
    records.set(`usersPrivate/${owner}/commissionStatements/invalid-source`, {
      html: `<div id="provize">${"<tr>".repeat(1000)}</div>`,
    });
    records.get(entryPath)!.commissionPayouts = [
      { key: "own", statementId: "old", writtenBy: owner, amount: 100 },
    ];
    const before = structuredClone(records.get(entryPath));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).toEqual([]);
  });

  it("rebuilds legacy CPP Auto premium changes and compares each renewal with its statement base", async () => {
    setContext({ teamEmails: [owner] });
    records.set(entryPath, {
      contractNumber, productKey: "cppAuto", userEmail: owner,
      frequencyRaw: "annual", position: "poradce5", originalPosition: "poradce5",
      acquisitionType: "inherited", inputAmount: 5462, effectiveInputAmount: 5462,
      calculationInputAmount: 5462, contractSignedDate: "2012-08-08", policyStartDate: "2012-08-14",
      items: [{ title: "Následná provize", code: "B101", amount: 578.972 }], total: 578.972,
    });
    for (const [index, [year, code, base, commission]] of [
      [2025, "B113", 7188, "761,93"], [2026, "B114", 7528, "797,97"],
    ].entries()) {
      const cells = [161887, contractNumber, "08.08.2012", "14.08.2012", "Testovací klient", "R", "CPP_1C_II", code, base, "", "10,60%", "5", commission, "0,00"];
      records.set(`usersPrivate/${viewer}/commissionStatements/statement-${index + 1}`, {
        statementNumber: String(index + 1), statementDate: `23.07.${year}`,
        period: `01.06.${year} - 30.06.${year}`,
        autoPremiumRows: [], autoPremiumContractNumbers: [],
        html: `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`,
      });
    }
    // The rebuild must repair stale statement indexes and stay repeatable.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, matchedStatements: 2, processedStatements: 2, processingResult: { errors: [] } });
      const contract = records.get(entryPath)!;
      expect(contract.premiumStatementHistory).toEqual([
        expect.objectContaining({ commissionCode: "B113", anniversaryDate: "2025-08-14", previousAnnualPremium: 5462, newAnnualPremium: 7188, differenceAnnual: 1726 }),
        expect.objectContaining({ commissionCode: "B114", anniversaryDate: "2026-08-14", previousAnnualPremium: 7188, newAnnualPremium: 7528, differenceAnnual: 340 }),
      ]);
      expect(contract.commissionPayouts).toEqual([
        expect.objectContaining({ code: "B113", amount: 761.93, expectedAmount: 761.93, difference: 0, status: "paid" }),
        expect.objectContaining({ code: "B114", amount: 797.97, expectedAmount: 797.97, difference: 0, status: "paid" }),
      ]);
      expect(contract).toMatchObject({ inputAmount: 5462, contractSignedDate: "2012-08-08", policyStartDate: "2012-08-14" });
      for (let index = 1; index <= 2; index++) {
        const statement = records.get(`usersPrivate/${viewer}/commissionStatements/statement-${index}`)!;
        expect(statement.autoPremiumContractNumbers).toEqual([contractNumber]);
        expect(statement.autoPremiumRows).toEqual([expect.objectContaining({ productKey: "cppAuto", productCode: "CPP_1C_II", premiumKind: "auto_change" })]);
      }
    }
  });

  it("fills every acquisition installment from archived statements and preserves sources on repeated rebuilds", async () => {
    setContext({ teamEmails: [owner] });
    const calculation = calculateCppPPRbez(6989, "semiannual", "poradce5");
    records.set(entryPath, { contractNumber, productKey: "cppPPRbez", userEmail: owner, frequencyRaw: "semiannual", position: "poradce5", inputAmount: 6989, items: calculation.items, total: calculation.total });
    for (const [index, code] of ["A101", "A102"].entries()) {
      const cells = [1, contractNumber, "01.01.2026", "01.01.2026", "Testovací firma", "Z", "CPP_PPR", code, 6989, "", "", "5", "1 235,66", 0];
      records.set(`usersPrivate/${viewer}/commissionStatements/statement-${index + 1}`, {
        statementNumber: String(index + 1), statementDate: `23.0${index + 1}.2026`,
        period: `01.0${index + 1}.2026 - 28.0${index + 1}.2026`,
        html: `<div id="provize"><table><tr>${cells.map((value) => `<td>${value}</td>`).join("")}</tr></table></div>`,
      });
    }
    const installments = acquisitionCommissionInstallments({ item: calculation.items[0], product: "cppPPRbez", frequency: "semiannual" });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, matchedStatements: 2, processedStatements: 2 });
      const payouts = records.get(entryPath)!.commissionPayouts as ContractCommissionPayout[];
      expect(payouts).toHaveLength(2);
      const states = installments.map((part) => payoutStatusForCodes(payoutsForAcquisitionInstallment(payouts, part), part.codes, part.amount));
      expect(states.map((state) => state.status)).toEqual(["paid", "paid"]);
      expect(states.map((state) => state.records[0].statementId)).toEqual(["statement-1", "statement-2"]);
    }
  });

  it("allows an administrator outside the owner's team through both access checks", async () => {
    setContext({ canManageContractsAsAdmin: true });
    await expectRebuilt(viewer);
  });

  it.each(["admin", "owner"])("retains verified %s authority while impersonating an adviser", async actorRole => {
    setContext({ actorEmail: actor, isImpersonating: true, impersonation: { actorEmail: actor, actorRole, targetEmail: viewer } });
    await expectRebuilt(actor);
  });

  it("preserves ordinary team access", async () => {
    setContext({ teamEmails: [owner] });
    await expectRebuilt(viewer);
  });

  it("preserves access through the saved manager chain", async () => {
    records.get(entryPath)!.managerChain = [{ email: viewer }];
    await expectRebuilt(viewer);
  });

  it("does not grant a support role administrator rights", async () => {
    setContext({ actorEmail: actor, isImpersonating: true, impersonation: { actorEmail: actor, actorRole: "support", targetEmail: viewer } });
    expect((await POST(request())).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("rejects an unrelated adviser even if the request claims administrator rights", async () => {
    const response = await POST(request({ canManageContractsAsAdmin: true, actorEmail: actor, impersonation: { actorRole: "owner" } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Nemáš oprávnění přepočítat tuto smlouvu." });
    expect(reads).toEqual([entryPath]);
    expect(writes).toEqual([]);
  });

  it("requires authentication before reading or writing", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(reads).toEqual([]); expect(writes).toEqual([]);
  });

  it("still rejects a mismatched contract number for an administrator", async () => {
    setContext({ canManageContractsAsAdmin: true });
    expect((await POST(request({ contractNumber: "9999999999" }))).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("keeps the contract intact when the represented account has no matching statements", async () => {
    setContext({ actorEmail: actor, isImpersonating: true, impersonation: { actorEmail: actor, actorRole: "admin", targetEmail: viewer } });
    records.set(`usersPrivate/${actor}/commissionStatements/statement-1`, records.get(statementPath)!);
    records.delete(statementPath);
    const before = structuredClone(records.get(entryPath));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ matchedStatements: 0, reset: null });
    expect(writes).toEqual([]);
    expect(records.get(entryPath)).toEqual(before);
  });

  it.each(["team", "historical-manager", "impersonation"])("preserves foreign, unattributed and manual records during %s rebuild", async mode => {
    if (mode === "team") setContext({ teamEmails: [owner] });
    if (mode === "historical-manager") records.get(entryPath)!.managerChain = [{ email: viewer }];
    if (mode === "impersonation") setContext({ actorEmail: actor, isImpersonating: true, impersonation: { actorRole: "admin" } });
    const protectedPayouts = [
      { key: "foreign", statementId: "other-statement", writtenBy: owner, amount: -55, status: "storno" },
      { key: "unknown", statementId: "statement-1", amount: 72 },
      { key: "manual", writtenBy: viewer, amount: 90 },
      { statementId: "legacy-malformed", writtenBy: owner, amount: 12 },
    ];
    const protectedHistory = [
      { key: "foreign-history", statementId: "other-statement", writtenBy: owner },
      { key: "unknown-history", statementId: "statement-1" },
    ];
    Object.assign(records.get(entryPath)!, {
      commissionPayouts: [...protectedPayouts, { key: "own-stale", statementId: "old", writtenBy: ` ${viewer.toUpperCase()} `, amount: 1 }],
      premiumStatementHistory: [...protectedHistory, { key: "own-history", statementId: "old", writtenBy: viewer }],
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(request());
      expect(response.status).toBe(200);
      const contract = records.get(entryPath)!;
      expect(contract.commissionPayouts).toEqual([...protectedPayouts, expect.objectContaining({ amount: 2228, writtenBy: viewer })]);
      expect(contract.premiumStatementHistory).toEqual(protectedHistory);
      expect(contract.commissionStornoSummary).toMatchObject({ totalAmount: -55, count: 1 });
    }
  });

  it("does not replace a foreign payout with an identical generated key", async () => {
    setContext({ teamEmails: [owner] });
    await expectRebuilt(viewer);
    const foreign = { ...(records.get(entryPath)!.commissionPayouts as Record<string, unknown>[])[0], writtenBy: owner, amount: 999 };
    records.get(entryPath)!.commissionPayouts = [foreign];
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([foreign, expect.objectContaining({ writtenBy: viewer, amount: 2228 })]);
  });

  it("does not trim protected payouts when the shared array has reached its limit", async () => {
    setContext({ teamEmails: [owner] });
    const foreign = Array.from({ length: 400 }, (_, index) => ({ key: `foreign-${index}`, statementId: `foreign-statement-${index}`, writtenBy: owner, amount: index + 1 }));
    records.get(entryPath)!.commissionPayouts = foreign;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(records.get(entryPath)!.commissionPayouts).toEqual(foreign);
    log.mockRestore();
  });

  it("preserves foreign and unowned shared provenance even for the same statement ID", async () => {
    setContext({ teamEmails: [owner] });
    const base = { statementId: "statement-1", resolvedBy: owner, paymentPremium: 900, rowId: "base-row" };
    const pointer = { premiumUpdatedFromStatementId: "statement-1", premiumUpdatedFromStatementAtMs: 80, premiumUpdatedFromStatementChronologyMs: 9999999999999 };
    Object.assign(records.get(entryPath)!, { initialCommissionBase: base, ...pointer,
      premiumStatementHistory: [{ key: "foreign", statementId: "statement-1", writtenBy: owner, rowId: "base-row" }] });
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)).toMatchObject({ initialCommissionBase: base, ...pointer });
  });

  it("rejects a stale reset before it can erase a concurrently added foreign payout", async () => {
    setContext({ teamEmails: [owner] });
    const foreign = { key: "concurrent", statementId: "other", writtenBy: owner, amount: 543 };
    beforeReset = () => write(entryPath, { commissionPayouts: [foreign] });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([foreign]);
    expect(writes).toEqual([entryPath]);
    log.mockRestore();
  });

  it("also protects a foreign payout added between replay read and commit", async () => {
    setContext({ teamEmails: [owner] });
    const foreign = { key: "concurrent-replay", statementId: "other", writtenBy: owner, amount: 543 };
    beforeReplayCommit = () => write(entryPath, { commissionPayouts: [foreign] });
    expect((await POST(request())).status).toBe(409);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([foreign]);
    expect(writes).toEqual([entryPath, entryPath]);
  });

  it("preserves identical foreign premium keys and semantic rows on repeated rebuilds", async () => {
    setContext({ teamEmails: [owner] });
    setAutoStatement();
    expect((await POST(request())).status).toBe(200);
    const generated = (records.get(entryPath)!.premiumStatementHistory as Record<string, unknown>[])[0];
    expect(generated).toMatchObject({ premiumKind: "auto_initial", writtenBy: viewer });
    const foreign = [
      { ...generated, writtenBy: owner },
      { ...generated, key: "same-semantic-row", writtenBy: "another@example.test" },
      { ...generated, key: "unattributed", writtenBy: null },
    ];
    records.get(entryPath)!.premiumStatementHistory = foreign;
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await POST(request())).status).toBe(200);
      expect(records.get(entryPath)!.premiumStatementHistory).toEqual([
        ...foreign, expect.objectContaining({ writtenBy: viewer, newPremium: 6000 }),
      ]);
    }
  });

  it("does not evict foreign premium history at its shared retention limit", async () => {
    setContext({ teamEmails: [owner] });
    setAutoStatement();
    const history = Array.from({ length: 120 }, (_, index) => ({ key: `foreign-${index}`, statementId: `foreign-${index}`, writtenBy: owner }));
    Object.assign(records.get(entryPath)!, {
      premiumStatementHistory: history,
      commissionPayouts: [{ key: "own", statementId: "statement-1", writtenBy: viewer, amount: 123 }],
      initialCommissionBase: { statementId: "statement-1", writtenBy: viewer, paymentPremium: 6000 },
      premiumUpdatedFromStatementId: "statement-1", premiumUpdatedFromStatementWrittenBy: viewer,
      premiumUpdatedFromStatementAtMs: 100, premiumUpdatedFromStatementChronologyMs: 200,
    });
    const before = structuredClone(records.get(entryPath));
    expect((await POST(request())).status).toBe(409);
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).toEqual([]);
  });

  it("reserves protected payout capacity while applying retention to the caller's records", async () => {
    setContext({ teamEmails: [owner] });
    const foreign = Array.from({ length: 399 }, (_, index) => ({ key: `foreign-${index}`, statementId: `foreign-${index}`, writtenBy: owner, amount: index + 1 }));
    records.get(entryPath)!.commissionPayouts = foreign;
    records.set(statementPath.replace("statement-1", "statement-2"), {
      statementNumber: "2", statementDate: "23.05.2026", period: "01.04.2026 - 30.04.2026",
      html: `<div id="ostatni_platby"><table><tr><td>Doplatek smlouvy ${contractNumber} 50 % provize B36</td><td>3 000,00</td></tr></table></div>`,
    });
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)!.commissionPayouts).toEqual([...foreign, expect.objectContaining({ statementId: "statement-2", writtenBy: viewer })]);
  });

  it("regenerates an owned initial base even when the calculation amounts stay the same", async () => {
    setContext({ teamEmails: [owner] });
    setAutoStatement();
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)!.initialCommissionBase).toMatchObject({ paymentPremium: 6000, writtenBy: viewer });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reset: { initialCommissionBaseCleared: true } });
    expect(records.get(entryPath)!.initialCommissionBase).toMatchObject({ paymentPremium: 6000, writtenBy: viewer });
  });

  it("preserves a manually confirmed original premium and its calculation when reimporting initial statement rows", async () => {
    setContext({ teamEmails: [owner] });
    setAutoStatement();
    records.get(entryPath)!.signedAnnualPremiumOverride = 5000;
    const items = [{ code: "A101", title: "Okamžitá provize", amount: 530 }];
    records.get(entryPath)!.items = structuredClone(items);
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)).toMatchObject({ signedAnnualPremiumOverride: 5000,
      inputAmount: 5000, calculationInputAmount: 5000, items });
    expect(records.get(entryPath)!.premiumStatementHistory).toEqual([expect.objectContaining({ newPremium: 6000 })]);
  });

  it.each([owner, undefined])("preserves an initial base with protected source author %s during replay", async writtenBy => {
    setContext({ teamEmails: [owner] });
    setAutoStatement();
    const base = { statementId: "statement-1", rowId: "1", resolvedBy: viewer, paymentPremium: 7777, ...(writtenBy ? { writtenBy } : {}) };
    records.get(entryPath)!.initialCommissionBase = base;
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)!.initialCommissionBase).toEqual(base);
    expect(records.get(entryPath)!.premiumStatementHistory).toEqual([expect.objectContaining({ writtenBy: viewer, newPremium: 6000 })]);
  });

  it("keeps foreign premium history as the basis for calculating the next premium change", async () => {
    setContext({ teamEmails: [owner] });
    setAutoStatement("A1", 6000, 2025);
    expect((await POST(request())).status).toBe(200);
    const foreign = { ...(records.get(entryPath)!.premiumStatementHistory as Record<string, unknown>[])[0], statementId: "foreign", writtenBy: owner };
    records.get(entryPath)!.premiumStatementHistory = [foreign];
    setAutoStatement("B101", 6500, 2026);
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)!.premiumStatementHistory).toEqual([
      foreign, expect.objectContaining({ writtenBy: viewer, previousAnnualPremium: 6000, newAnnualPremium: 6500, differenceAnnual: 500 }),
    ]);
    expect(records.get(entryPath)).toMatchObject({ premiumUpdatedFromStatementWrittenBy: viewer });
    const repeat = await POST(request());
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({ reset: { statementPremiumPointerCleared: true } });
  });

  it("stores nullable provenance when an unattributed initial history row supplies the base", async () => {
    setContext({ teamEmails: [owner] });
    setAutoStatement();
    expect((await POST(request())).status).toBe(200);
    const unattributed = { ...(records.get(entryPath)!.premiumStatementHistory as Record<string, unknown>[])[0] };
    delete unattributed.writtenBy;
    Object.assign(records.get(entryPath)!, { premiumStatementHistory: [unattributed], initialCommissionBase: null });
    expect((await POST(request())).status).toBe(200);
    expect(records.get(entryPath)!.initialCommissionBase).toMatchObject({ paymentPremium: 6000, writtenBy: null });
    expect(Object.values(records.get(entryPath)!.initialCommissionBase as Record<string, unknown>)).not.toContain(undefined);
    expect(records.get(entryPath)!.premiumStatementHistory).toEqual([unattributed, expect.objectContaining({ writtenBy: viewer })]);
  });

  it.each([owner, undefined])("keeps a newer premium pointer from protected author %s during older replay", async writtenBy => {
    setContext({ teamEmails: [owner] });
    setAutoStatement("B101", 6500, 2026);
    const pointer = { premiumUpdatedFromStatementId: "newer", premiumUpdatedFromStatementAtMs: 200,
      premiumUpdatedFromStatementChronologyMs: Date.UTC(2027, 0, 1), ...(writtenBy ? { premiumUpdatedFromStatementWrittenBy: writtenBy } : {}) };
    Object.assign(records.get(entryPath)!, pointer);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reset: { statementPremiumPointerCleared: false } });
    expect(records.get(entryPath)).toMatchObject(pointer);
    expect(records.get(entryPath)!.premiumStatementHistory).toEqual([expect.objectContaining({ writtenBy: viewer, premiumKind: "auto_change" })]);
  });
});


describe("chronology reconciliation when reprocessing archived statements", () => {
  const header = (year: number) => ({ statementNumber: `${year}-05`, statementDate: `31.05.${year}`, period: `01.05.${year} - 31.05.${year}` });
  const html = (year: number, base = year === 2025 ? 10000 : year === 2026 ? 12000 : 14000) => {
    const code = year === 2025 ? "A1" : `B10${year - 2025}`;
    const cells = [1, contractNumber, "01.05.2025", "01.05.2025", "Synthetic client", "R", "CPP_1C_II", code, base, "", "", "5", base * 0.106, 0];
    return `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`;
  };
  const setup = () => {
    records.clear(); versions.clear(); reads.length = 0; writes.length = 0;
    setContext({ email: owner, actorEmail: owner });
    records.set("contractRefs/chronology-reference", { ownerEmail: owner, entryId: "entry-1", entryPath, contractNumberNormalized: contractNumber });
    records.set(entryPath, {
      contractNumber, userEmail: owner, productKey: "cppAuto", frequencyRaw: "annual", position: "poradce5", originalPosition: "poradce5",
      commissionMode: "accelerated", inputAmount: 12000, calculationInputAmount: 12000, effectiveInputAmount: 12000,
      createdFromCommissionStatement: true, contractSignedDate: "2025-05-01", policyStartDate: "2025-05-01",
      commissionPayouts: [], premiumStatementHistory: [],
    });
  };
  const upload = (year: number, base?: number) => POST(new NextRequest("https://example.test/api/commission-statements", {
    method: "POST", body: JSON.stringify(statementImportFixture(html(year, base), header(year))),
  }));
  const replay = (year: number, base?: number) => replayArchived(`archived-${year}`, html(year, base), header(year));
  const expectReplay = async (year: number, base?: number) => {
    const response = await replay(year, base);
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    return payload;
  };
  const summary = () => {
    const contract = records.get(entryPath)!;
    return {
      inputAmount: contract.inputAmount, effectiveInputAmount: contract.effectiveInputAmount,
      calculationInputAmount: contract.calculationInputAmount,
      initialBase: (contract.initialCommissionBase as Record<string, unknown>)?.paymentPremium,
      premiumChronology: contract.premiumUpdatedFromStatementChronologyMs,
      history: ((contract.premiumStatementHistory ?? []) as Record<string, unknown>[])
        .map(item => ({ kind: item.premiumKind, date: item.anniversaryDate, amount: item.newAnnualPremium, previous: item.previousAnnualPremium, difference: item.differenceAnnual }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date))),
      payouts: ((contract.commissionPayouts ?? []) as Record<string, unknown>[])
        .map(item => ({ code: item.code, month: item.payoutMonthKey, amount: item.amount, expected: item.expectedAmount, status: item.status }))
        .sort((a, b) => String(a.month).localeCompare(String(b.month))),
    };
  };

  beforeEach(setup);

  it("records the same premiums and payouts for May 2026 then May 2025 as for chronological import", async () => {
    await expectReplay(2025); await expectReplay(2026);
    const ordered = summary();
    setup();
    await expectReplay(2026); await expectReplay(2025);
    expect(summary()).toEqual(ordered);
    expect(summary().history).toEqual([
      { kind: "auto_initial", date: "2025-05-01", amount: 10000, previous: null, difference: null },
      { kind: "auto_change", date: "2026-05-01", amount: 12000, previous: 10000, difference: 2000 },
    ]);
    expect(summary().payouts.map(item => [item.month, item.amount])).toEqual([["2025-5", 1060], ["2026-5", 1272]]);
  });

  it.each([[2027, 2025, 2026], [2027, 2026, 2025], [2026, 2025, 2027], [2026, 2027, 2025], [2025, 2027, 2026]])("reconciles three anniversary statements in order %j", async (...years) => {
    for (const year of [2025, 2026, 2027]) await expectReplay(year);
    const ordered = summary();
    setup();
    for (const year of years) await expectReplay(year);
    expect(summary()).toEqual(ordered);
  });

  it("preserves manual, foreign and unattributed records and never reads another author's statement collection", async () => {
    await expectReplay(2026);
    const protectedPayouts = [
      { key: "manual", amount: 40 },
      { key: "foreign", statementId: "private-source", writtenBy: viewer, amount: 70 },
      { key: "legacy", statementId: "unknown-source", amount: 90 },
      { key: "orphan", statementId: "missing-own-source", writtenBy: owner, amount: 25 },
    ];
    const protectedHistory = [{ key: "foreign-history", statementId: "private-source", writtenBy: viewer, premiumKind: "auto_initial", newPremium: 10000, newAnnualPremium: 10000, anniversaryDate: "2025-05-01" }];
    const contract = records.get(entryPath)!;
    contract.commissionPayouts = [...protectedPayouts, ...(contract.commissionPayouts as unknown[])];
    contract.premiumStatementHistory = protectedHistory;
    records.set(`usersPrivate/${viewer}/commissionStatements/private-source`, { html: html(2027, 99999), ...header(2027) });
    await expectReplay(2025);
    expect(records.get(entryPath)!.commissionPayouts).toEqual(expect.arrayContaining(protectedPayouts));
    expect(records.get(entryPath)!.premiumStatementHistory).toEqual(expect.arrayContaining(protectedHistory));
    expect(reads.some(path => path.startsWith(`usersPrivate/${viewer}/commissionStatements`))).toBe(false);
    expect(summary().payouts.some(item => item.amount === 99999 * 0.106)).toBe(false);
  });

  it("does not clear existing payouts or premium history when another writer changes the contract during replay", async () => {
    await expectReplay(2026);
    const before = structuredClone(records.get(entryPath)!);
    const concurrent = { key: "concurrent", statementId: "another-source", writtenBy: viewer, amount: 55 };
    beforeReplayCommit = () => write(entryPath, { commissionPayouts: [...(records.get(entryPath)!.commissionPayouts as unknown[]), concurrent] });
    const response = await replay(2025);
    expect(response.status).toBe(409);
    expect(records.get(entryPath)).toEqual({ ...before, commissionPayouts: [...(before.commissionPayouts as unknown[]), concurrent] });
  });

  it("remains idempotent when the older source is processed again", async () => {
    await expectReplay(2026); await expectReplay(2025);
    const before = summary();
    const repeat = await expectReplay(2025);
    expect(repeat.processingResult).toMatchObject({ payoutRecordsAdded: 0, payoutRecordsUpdated: 0, premiumUpdates: 0 });
    expect(summary()).toEqual(before);
    expect(summary().payouts).toHaveLength(2);
  });


  const derivedTasks = () => [...records.entries()].filter(([path]) =>
    path.startsWith(`usersPrivate/${owner}/accountingRepairDrafts/`) || path.startsWith(`usersPrivate/${owner}/externalUpdateTasks/`));

  it("updates the later premium repair and external task from the corrected previous premium", async () => {
    await expectReplay(2027);
    const originalTasks = structuredClone(derivedTasks());
    expect(originalTasks).toHaveLength(2);
    expect(originalTasks.every(([, task]) => task.previousAnnualPremium === 12000)).toBe(true);
    await expectReplay(2025);
    for (const [path, original] of originalTasks) {
      expect(records.get(path)).toMatchObject({ previousAnnualPremium: 10000, newAnnualPremium: 14000, differenceAnnual: 4000,
        createdAtMs: original.createdAtMs, createdBy: original.createdBy });
    }
    await expectReplay(2026);
    expect(derivedTasks()).toHaveLength(4);
    for (const [path] of originalTasks) expect(records.get(path)).toMatchObject({
      previousAnnualPremium: 12000, newAnnualPremium: 14000, differenceAnnual: 2000,
    });
  });

  it("never reopens already completed repair drafts or external tasks during replay", async () => {
    await expectReplay(2027);
    for (const [path] of derivedTasks()) write(path, { status: "completed", reviewedBy: owner });
    const completed = structuredClone(derivedTasks());
    const result = await expectReplay(2025);
    expect(result.processingResult).toMatchObject({ accountingRepairDrafts: 0, externalUpdateTasks: 0 });
    for (const [path, task] of completed) expect(records.get(path)).toEqual(task);
    expect(summary().history).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2027-05-01", previous: 10000, difference: 4000 }),
    ]));
  });

  it("rejects the whole replay if an existing draft is completed concurrently", async () => {
    await expectReplay(2027);
    const before = structuredClone(records.get(entryPath));
    const [taskPath] = derivedTasks()[0];
    beforeReplayCommit = () => write(taskPath, { status: "completed" });
    const response = await replay(2025);
    expect(response.status).toBe(409);
    expect(records.get(entryPath)).toEqual(before);
    expect(records.get(taskPath)?.status).toBe("completed");
  });

  it("does not overwrite a task created concurrently with the atomic replay", async () => {
    await expectReplay(2026);
    const before = structuredClone(records.get(entryPath));
    // Capture the deterministic new task path as it is read during simulation.
    beforeReplayCommit = () => {
      const taskPath = reads.find(path => path.startsWith(`usersPrivate/${owner}/externalUpdateTasks/`));
      expect(taskPath).toBeDefined();
      write(taskPath!, { status: "completed", marker: "concurrent" });
    };
    expect((await replay(2025)).status).toBe(409);
    expect(records.get(entryPath)).toEqual(before);
    expect(derivedTasks()).toEqual([[expect.any(String), { status: "completed", marker: "concurrent" }]]);
  });

  it("leaves all financial records intact if a saved source fails validation", async () => {
    const latest = await expectReplay(2026);
    write(`usersPrivate/${owner}/commissionStatements/${latest.item.id}`, { html: '<div id="provize">' + "<tr>".repeat(1000) + "</div>" });
    const before = structuredClone(records.get(entryPath));
    expect((await replay(2025)).status).toBe(400);
    expect(records.get(entryPath)).toEqual(before);
    expect(derivedTasks()).toEqual([]);
  });

  it("repairs an already imported older statement through the saved-statement action", async () => {
    await expectReplay(2026);
    const older = await expectReplay(2025);
    const expected = summary();
    // Simulate the missing history produced by the previous implementation.
    records.get(entryPath)!.premiumStatementHistory = (records.get(entryPath)!.premiumStatementHistory as Record<string, unknown>[])
      .filter(item => item.premiumKind === "auto_initial");
    records.get(entryPath)!.premiumUpdatedFromStatementChronologyMs = null;
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify({ action: "reprocess-saved-statement", statementId: older.item.id }),
    }));
    expect(response.status).toBe(200);
    expect(summary()).toEqual(expected);
  });

  it.each([401, 403])("rejects a denied import (%i) before any source or contract read", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await upload(2025)).status).toBe(status);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("does not let another user trigger replay by supplying a target owner or an administrator flag", async () => {
    await expectReplay(2026);
    const before = structuredClone(records.get(entryPath));
    reads.length = 0; writes.length = 0;
    setContext({ email: viewer, actorEmail: viewer });
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify({ ...statementImportFixture(html(2025), header(2025)), ownerEmail: owner,
        entryId: "entry-1", canManageContractsAsAdmin: true, replayContext: { ownerEmail: owner } }),
    }));
    expect(response.status).toBe(200);
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).not.toContain(entryPath);
    expect(reads.some(path => path.startsWith(`usersPrivate/${owner}/`))).toBe(false);
  });

  it("keeps other contracts and the historical source audit unchanged", async () => {
    const latest = await expectReplay(2026);
    const sourcePath = `usersPrivate/${owner}/commissionStatements/${latest.item.id}`;
    const otherPath = `users/${owner}/entries/other-contract`;
    records.set(otherPath, { contractNumber: "9876543210", productKey: "cppAuto", commissionPayouts: [{ key: "manual", amount: 42 }] });
    const other = structuredClone(records.get(otherPath));
    const source = records.get(sourcePath)!;
    source.html = String(source.html).replace("</table>", html(2026).match(/<tr>.*<\/tr>/)![0].replace(contractNumber, "9876543210") + "</table>");
    const sourceBefore = structuredClone(source);
    await expectReplay(2025);
    expect(records.get(otherPath)).toEqual(other);
    expect(records.get(sourcePath)).toEqual(sourceBefore);
  });
});

describe("equal life premium increases in one policy family", () => {
  const firstPath = `users/${owner}/entries/increase-one`;
  const secondPath = `users/${owner}/entries/increase-two`;
  const setupFamily = () => {
    setContext({ email: owner, actorEmail: owner });
    records.set(entryPath, { contractNumber, userEmail: owner, productKey: "neon", entryType: "contract",
      policyStartDate: "2024-01-01", contractSignedDate: "2023-12-01", position: "poradce7", commissionMode: "standard",
      inputAmount: 1000, calculationInputAmount: 1000, items: [{ title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 40 }], commissionPayouts: [] });
    for (const [index, path, day] of [[1, firstPath, "2025-05-01"], [2, secondPath, "2025-09-01"]] as const) {
      records.set(path, { ...records.get(entryPath), entryType: "endorsement", rootContractEntryId: "entry-1",
        parentContractEntryId: index === 1 ? "entry-1" : "increase-one", policyStartDate: day,
        inputAmount: 100, calculationInputAmount: 100, premiumDelta: 100, previousInputAmount: 900 + index * 100,
        newInputAmount: 1000 + index * 100, items: [{ title: "Provize A101", code: "A101", amount: 100 },
          { title: "Provize B0301", code: "B0301", amount: 25 }], commissionPayouts: [] });
    }
    for (const [index, path] of [entryPath, firstPath, secondPath].entries()) records.set(`contractRefs/family-${index}`, {
      ownerEmail: owner, entryId: path.split("/").at(-1), entryPath: path, contractNumberNormalized: contractNumber,
    });
  };
  const row = (id: number, code: string, effective: string, base: number | "", amount: number, product = "CPP_N_LIFE", signedAt = "01.01.2024") => {
    const cells = [id, contractNumber, signedAt, effective, "Synthetic client", "R", product, code, base, "", "", product === "KOOP_FLEXI" ? "10" : "7", amount, 0];
    return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
  };
  const uploadFamily = async (rows: string, number = "family-1", statementDate = "23.10.2025", period = "01.09.2025 - 30.09.2025") => {
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify(statementImportFixture(`<div id="provize"><table>${rows}</table></div>`,
        { statementNumber: number, statementDate, period })),
    }));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    return response.json();
  };
  const codes = (path: string) => (records.get(path)?.commissionPayouts as {code: string}[]).map(payout => payout.code);

  const setupFlexiFamily = () => {
    setupFamily();
    const items = calculateFlexi(618 - 396, "poradce10", "accelerated").items;
    for (const path of [entryPath, firstPath, secondPath]) {
      records.set(path, { ...records.get(path), productKey: "flexi", position: "poradce10" });
    }
    records.set(entryPath, { ...records.get(entryPath), inputAmount: 396, calculationInputAmount: 396 });
    records.set(firstPath, { ...records.get(firstPath), premiumDelta: null,
      inputAmount: 222, calculationInputAmount: 222, previousInputAmount: 396, newInputAmount: 618, items });
  };
  const flexiRows = (nv = 1304.20, nb = 312.05) =>
    row(1, "NV101", "01.01.2024", "", nv, "KOOP_FLEXI") +
    row(2, "NB0301", "01.01.2024", 0, nb, "KOOP_FLEXI");

  it("assigns both FLEXI codes without a base to the calculated endorsement and replays them there", async () => {
    setupFlexiFamily();
    await uploadFamily(flexiRows());
    expect([codes(entryPath), codes(firstPath).sort(), codes(secondPath)]).toEqual([[], ["NB0301", "NV101"], []]);
    const payouts = records.get(firstPath)?.commissionPayouts as ContractCommissionPayout[];
    expect(payouts).toHaveLength(2);
    expect(payouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NV101", amount: 1304.20, expectedAmount: 1304.20, status: "paid", statementBaseAmount: null }),
      expect.objectContaining({ code: "NB0301", amount: 312.05, expectedAmount: 312.06, difference: -0.01, status: "paid", statementBaseAmount: null }),
    ]));
    expect(records.get(firstPath)?.premiumStatementHistory ?? []).toEqual([]);
    await uploadFamily(flexiRows());
    expect(records.get(firstPath)?.commissionPayouts).toEqual(payouts);
    expect((await POST(request({ entryId: "entry-1" }))).status).toBe(200);
    expect(codes(entryPath)).toEqual([]);
    expect((await POST(request({ entryId: "increase-one" }))).status).toBe(200);
    expect(codes(firstPath).sort()).toEqual(["NB0301", "NV101"]);
    expect(codes(secondPath)).toEqual([]);
  });

  it("keeps both FLEXI payouts unresolved if one differs even though their total is correct", async () => {
    setupFlexiFamily();
    const { processingResult } = await uploadFamily(flexiRows(1303.20, 313.05));
    expect(processingResult.ambiguousContracts).toContain(contractNumber);
    expect([codes(entryPath), codes(firstPath), codes(secondPath)]).toEqual([[], [], []]);
  });

  it("keeps amount-based FLEXI matching within the authorized contract family", async () => {
    setupFlexiFamily();
    setContext();
    await uploadFamily(flexiRows());
    expect([codes(entryPath), codes(firstPath), codes(secondPath)]).toEqual([[], [], []]);
    expect(reads).not.toContain(firstPath);
  });

  it("uses the authorized payout position consistently on import and replay", async () => {
    setupFlexiFamily();
    records.set(firstPath, { ...records.get(firstPath), position: "poradce8", commissionMode: "accelerated",
      items: calculateFlexi(222, "poradce8", "accelerated").items });
    const policy = vi.spyOn(commissionPayoutPositionPolicy, "commissionPayoutPositionForOwner")
      .mockImplementation(email => email === owner ? "poradce10" : null);
    try {
      await uploadFamily(flexiRows(), "2026-flexi", "23.06.2026", "01.05.2026 - 31.05.2026");
      expect(codes(firstPath).sort()).toEqual(["NB0301", "NV101"]);
      const payouts = records.get(firstPath)?.commissionPayouts as ContractCommissionPayout[];
      expect(payouts.every(payout => payout.status === "paid" && payout.expectedAmount != null)).toBe(true);
      expect((await POST(request({ entryId: "increase-one" }))).status).toBe(200);
      expect(codes(firstPath).sort()).toEqual(["NB0301", "NV101"]);
    } finally {
      policy.mockRestore();
    }
  });

  it("splits an original B receipt and the second NV receipt in the same statement and is idempotent", async () => {
    setupFamily();
    const html = row(1, "B101", "01.01.2024", 12000, 40) + row(2, "NV101", "01.09.2025", 1200, 100);
    await uploadFamily(html);
    expect(codes(entryPath)).toEqual(["B101"]);
    expect(codes(firstPath)).toEqual([]);
    expect(codes(secondPath)).toEqual(["NV101"]);
    const receipts = structuredClone([records.get(entryPath)?.commissionPayouts, records.get(secondPath)?.commissionPayouts]);
    await uploadFamily(html);
    expect([records.get(entryPath)?.commissionPayouts, records.get(secondPath)?.commissionPayouts]).toEqual(receipts);
    expect(records.get(secondPath)?.commissionPayouts).toEqual([expect.objectContaining({ expectedAmount: 100,
      difference: 0, sourceValidFrom: "01.09.2025", sourceBaseAmount: 1200 })]);
  });
  it("assigns the first NV and its NB to the first increase", async () => {
    setupFamily();
    await uploadFamily(row(1, "NV101", "01.05.2025", 1200, 100) + row(2, "NB0301", "01.05.2025", 1200, 25));
    expect(codes(firstPath)).toEqual(["NV101", "NB0301"]);
    expect(codes(secondPath)).toEqual([]);
  });
  it("imports both month-dated immediate NEON payouts onto the mid-month increase only once", async () => {
    setupFamily();
    records.get(firstPath)!.policyStartDate = "2025-05-14";
    const rows = row(1, "NV101", "01.05.2025", 1200, 100.18, "CPP_N_LIFE", "01.05.2025") +
      row(2, "NB0301", "01.05.2025", 1200, 25.15, "CPP_N_LIFE", "01.05.2025");
    for (let attempt = 0; attempt < 2; attempt++) {
      await uploadFamily(rows);
      expect([codes(entryPath), codes(firstPath), codes(secondPath)]).toEqual([[], ["NV101", "NB0301"], []]);
    }
  });
  it("assigns two equal NV101 rows independently when their statements arrive out of order", async () => {
    setupFamily();
    const january = await uploadFamily(row(2, "NV101", "01.09.2025", 1200, 100), "january", "23.02.2026", "01.01.2026 - 31.01.2026");
    const septemberResponse = await replayArchived("archived-september", `<div id="provize"><table>${row(1, "NV101", "01.05.2025", 1200, 100)}</table></div>`,
      { statementNumber: "september", statementDate: "23.10.2025", period: "01.09.2025 - 30.09.2025" });
    expect(septemberResponse.status).toBe(200);
    const september = await septemberResponse.json();
    expect(records.get(firstPath)?.commissionPayouts).toEqual([
      expect.objectContaining({ statementId: september.item.id, code: "NV101", amount: 100, sourceValidFrom: "01.05.2025" }),
    ]);
    expect(records.get(secondPath)?.commissionPayouts).toEqual([
      expect.objectContaining({ statementId: january.item.id, code: "NV101", amount: 100, sourceValidFrom: "01.09.2025" }),
    ]);
    expect(codes(entryPath)).toEqual([]);
  });
  it("compares NB3601 and NB4801 with the first amendment's own deferred amounts and imports only once", async () => {
    setupFamily();
    const first = records.get(firstPath)!;
    first.items = [...first.items as object[],
      { title: "Provize po 3 letech", code: "B3601", amount: 75 },
      { title: "Provize po 4 letech", code: "B4801", amount: 15 },
    ];
    const html = row(1, "NB3601", "01.05.2025", 1200, 75) + row(2, "NB4801", "01.05.2025", 1200, 15);
    await uploadFamily(html, "deferred", "23.06.2029", "01.05.2029 - 31.05.2029");
    expect(codes(entryPath)).toEqual([]);
    expect(codes(secondPath)).toEqual([]);
    const payouts = structuredClone(records.get(firstPath)?.commissionPayouts) as ContractCommissionPayout[];
    expect(payouts).toHaveLength(2);
    expect(payouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NB3601", expectedAmount: 75, difference: 0, status: "paid" }),
      expect.objectContaining({ code: "NB4801", expectedAmount: 15, difference: 0, status: "paid" }),
    ]));
    expect(payoutStatusForCodes(payouts, ["B0301"], 25, "neon", true)).toMatchObject({ status: "pending", paidAmount: 0 });
    await uploadFamily(html, "deferred", "23.06.2029", "01.05.2029 - 31.05.2029");
    expect(records.get(firstPath)?.commissionPayouts).toEqual(payouts);
  });
  it("reports ambiguity instead of choosing the first equal increase", async () => {
    setupFamily();
    const payload = await uploadFamily(row(1, "NV101", "", 1200, 100));
    expect(payload.processingResult.ambiguousContracts).toContain(contractNumber);
    expect([codes(entryPath), codes(firstPath), codes(secondPath)]).toEqual([[], [], []]);
  });
  it("does not use a forced rebuild of the first amendment to copy the second amendment's receipt", async () => {
    setupFamily();
    records.set(`usersPrivate/${owner}/commissionStatements/mixed`, { statementNumber: "mixed", statementDate: "23.10.2025",
      period: "01.09.2025 - 30.09.2025", html: `<div id="provize"><table>${row(1, "NV101", "01.09.2025", 1200, 100)}</table></div>` });
    const response = await POST(request({ entryId: "increase-one" }));
    expect(response.status).toBe(200);
    expect(codes(firstPath)).toEqual([]);
    expect(codes(secondPath)).toEqual([]);
  });
  it("replays an older original receipt without copying a mixed source's NV to the original", async () => {
    setupFamily();
    await uploadFamily(row(1, "B101", "01.01.2024", 12000, 40) + row(2, "NV101", "01.09.2025", 1200, 100), "later");
    expect((await replayArchived("archived-earlier", `<div id="provize"><table>${row(3, "A101", "01.01.2024", 12000, 1000)}</table></div>`,
      { statementNumber: "earlier", statementDate: "23.06.2025", period: "01.05.2025 - 31.05.2025" })).status).toBe(200);
    expect(codes(entryPath).sort()).toEqual(["A101", "B101"]);
    expect(codes(firstPath)).toEqual([]);
    expect(codes(secondPath)).toEqual(["NV101"]);
  });
  it("keeps unauthorized families out of the candidate set", async () => {
    setupFamily(); setContext();
    const before = structuredClone([records.get(firstPath), records.get(secondPath)]);
    await uploadFamily(row(1, "NV101", "01.09.2025", 1200, 100));
    expect([records.get(firstPath), records.get(secondPath)]).toEqual(before);
    expect(reads).not.toContain(firstPath);
    expect(reads).not.toContain(secondPath);
  });
});

describe("effective adviser position for the January 2026 payout", () => {
  it.each([
    { account: "jindrich.hajek@bohemika.eu", period: "16.12.2025 - 31.12.2025", career: "10" },
    { account: "jindra.hajek@bohemika.eu", period: "16.12.2025 - 31.12.2025", career: "8" },
    { account: "jindrich.hajek@bohemika.eu", period: "01.12.2025 - 15.12.2025", career: "8" },
    { account: "other@example.test", period: "16.12.2025 - 31.12.2025", career: "8" },
  ])("compares a deferred NEON commission for $period at the applicable position", async ({ account, period, career }) => {
    const { calculateNeon } = await import("@/app/lib/productFormulas/neon");
    const original = calculateNeon(1200, "poradce8", 25, "standard", "2022-12-01");
    const expected = calculateNeon(1200, career === "10" ? "poradce10" : "poradce8", 25, "standard", "2022-12-01")
      .items.find(item => item.code === "B3601")!.amount;
    const path = `users/${account}/entries/legacy-neon`;
    setContext({ email: account, actorEmail: account });
    records.set("contractRefs/legacy-neon", {
      ownerEmail: account, entryId: "legacy-neon", entryPath: path, contractNumberNormalized: contractNumber,
    });
    records.set(path, {
      contractNumber, userEmail: account, position: "poradce8", productKey: "neon",
      policyStartDate: "2022-12-01", contractSignedDate: "2022-12-01", inputAmount: 1200,
      frequencyRaw: "monthly", durationYears: 25, items: original.items, total: original.total, commissionPayouts: [],
    });
    const cells = [1, contractNumber, "01.12.2022", "01.12.2022", "Synthetic client", "Z", "CPP_NEON", "B3601", 14400, "", "", career, expected, 0];
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST",
      body: JSON.stringify(statementImportFixture(
        `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`,
        { statementNumber: "legacy-neon", statementDate: "20.12.2025", period },
      )),
    }));
    expect(response.status).toBe(200);
    expect(records.get(path)).toMatchObject({
      position: "poradce8", items: original.items,
      commissionPayouts: [expect.objectContaining({
        code: "B3601", expectedAmount: expected, difference: 0,
        differenceReason: null, status: "paid",
        ...(career === "10" ? { payoutMonthKey: "2026-01" } : {}),
      })],
    });
  });
});

it("uses the January receipt for delayed FLEXI B0301 and keeps A101 at its earlier position", async () => {
  const { calculateFlexi } = await import("@/app/lib/productFormulas/flexi");
  const { generateCashflow } = await import("@/app/cashflow/generator");
  const account = "jindrich.hajek@bohemika.eu";
  const path = `users/${account}/entries/flexi-delayed`;
  const original = calculateFlexi(786, "poradce8", "standard", 13);
  const current = calculateFlexi(786, "poradce10", "standard", 13);
  setContext({ email: account, actorEmail: account });
  records.set("contractRefs/flexi-delayed", {
    ownerEmail: account, entryId: "flexi-delayed", entryPath: path, contractNumberNormalized: contractNumber,
  });
  const entry = {
    id: "flexi-delayed", contractNumber, userEmail: account, position: "poradce8",
    productKey: "flexi", policyStartDate: "2025-09-06", contractSignedDate: "2025-09-05",
    inputAmount: 786, frequencyRaw: "monthly", durationYears: 13, commissionMode: "standard",
    items: original.items, total: original.total,
  } as const;
  records.set(path, { ...entry, commissionPayouts: [] });
  const earlyAmount = original.items.find(item => item.code === "A101")!.amount;
  const lateAmount = current.items.find(item => item.code === "B0301")!.amount;
  for (const [code, amount, career, period, statementDate] of [
    ["A101", earlyAmount, "8", "01.09.2025 - 30.09.2025", "20.10.2025"],
    ["B0301", lateAmount, "10", "16.12.2025 - 31.12.2025", "20.01.2026"],
  ] as const) {
    const cells = [1, contractNumber, "05.09.2025", "06.09.2025", "Synthetic client", "Z", "KOOP_FLEXI", code, 9432, "", "", career, amount, 0];
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST",
      body: JSON.stringify(statementImportFixture(
        `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`,
        { statementNumber: `flexi-${code}`, statementDate, period },
      )),
    }));
    expect(response.status).toBe(200);
  }
  const commissionPayouts = records.get(path)!.commissionPayouts as { code: string; amount: number }[];
  expect(commissionPayouts).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "A101", amount: earlyAmount, expectedAmount: earlyAmount, career: "8", status: "paid" }),
    expect.objectContaining({ code: "B0301", amount: lateAmount, expectedAmount: lateAmount, career: "10", status: "paid", payoutMonthKey: "2026-01" }),
  ]));
  const cashflow = generateCashflow([{ ...entry, commissionPayouts, payoutPositionOverride: "poradce10" }], 10, account, new Date(2026, 0, 20));
  const late = cashflow.filter(item => item.commissionCode === "B0301");
  expect(late).toHaveLength(1);
  expect(late[0]).toMatchObject({ payoutStatus: "paid", amount: lateAmount });
  expect(late[0].date.getFullYear()).toBe(2026);
  expect(late[0].date.getMonth()).toBe(0);
  expect(records.get(path)?.position).toBe("poradce8");
});

it("replaces the scheduled FLEXI A101 with the actual receipt and keeps the rest of the schedule without amounts", async () => {
  const { generateCashflow } = await import("@/app/cashflow/generator");
  const { FLEXI_RENOVATION_MISSING_BASE } = await import("@/app/lib/flexiRenovation");
  setContext({ email: owner, actorEmail: owner });
  const path = `users/${owner}/entries/flexi-pending`;
  const entry = {
    id: "flexi-pending", contractNumber, userEmail: owner, position: "poradce8",
    productKey: "flexi", isRefresh: true, commissionCalculationStatus: FLEXI_RENOVATION_MISSING_BASE,
    policyStartDate: "2025-09-06", contractSignedDate: "2025-09-05",
    inputAmount: 1500, calculationInputAmount: null, refreshCommissionBase: null,
    frequencyRaw: "monthly", durationYears: 25, items: [],
  } satisfies import("@/app/cashflow/types").EntryDoc & { isRefresh: boolean };
  records.set("contractRefs/flexi-pending", {
    ownerEmail: owner, entryId: entry.id, entryPath: path, contractNumberNormalized: contractNumber,
  });
  records.set(path, { ...entry, commissionPayouts: [] });
  const cells = [1, contractNumber, "05.09.2025", "06.09.2025", "Synthetic client", "Z", "KOOP_FLEXI", "A101", 0, "", "", "8", 2345.67, 0];
  const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
    method: "POST",
    body: JSON.stringify(statementImportFixture(
      `<div id="provize"><table><tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr></table></div>`,
      { statementNumber: "flexi-pending", statementDate: "20.10.2025", period: "01.09.2025 - 30.09.2025" },
    )),
  }));
  expect(response.status).toBe(200);
  const saved = records.get(path)!;
  expect(saved).toMatchObject({
    commissionCalculationStatus: FLEXI_RENOVATION_MISSING_BASE,
    calculationInputAmount: null,
    commissionPayouts: [expect.objectContaining({
      code: "A101", amount: 2345.67, sourceBaseAmount: 0, expectedAmount: null, difference: null, status: "paid",
    })],
  });
  const payouts = saved.commissionPayouts as import("@/app/cashflow/types").EntryDoc["commissionPayouts"];
  const cashflow = generateCashflow([{ ...entry, items: [], commissionPayouts: payouts }], 10, owner, new Date(2025, 9, 20));
  expect(cashflow.filter(item => item.commissionCode === "A101")).toEqual([
    expect.objectContaining({
      amount: 2345.67, commissionCode: "A101", payoutStatus: "paid", predictedAmount: null,
      lifeStornoBaseMonthlyPremium: null, isStatementOnly: true,
    }),
  ]);
  expect(cashflow.filter(item => item.commissionCode !== "A101")).toEqual(expect.arrayContaining([
    expect.objectContaining({ commissionCode: "B0301", payoutStatus: "predicted", amountUnknown: true }),
    expect.objectContaining({ commissionCode: "B36", payoutStatus: "predicted", amountUnknown: true }),
    expect.objectContaining({ commissionCode: "B48", payoutStatus: "predicted", amountUnknown: true }),
  ]));
});
