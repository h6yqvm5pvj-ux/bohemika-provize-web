import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), collection: vi.fn(), doc: vi.fn(), batch: vi.fn(), history: vi.fn(),
}));
vi.mock("@/app/api/contracts/_lib/contractsApi", async () => ({
  requireContractsEntryGuard: mocks.guard,
  hasContractAccess: (await import("@/app/api/contracts/_lib/contractsApi.access")).hasContractAccess,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, doc: mocks.doc, batch: mocks.batch },
}));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_reason: string, work: () => Promise<unknown>) => work(),
  trackCashflowWrite: (work: () => Promise<unknown>) => work(),
  markCashflowMutationIncomplete: vi.fn(),
}));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: mocks.history }));

import { POST } from "./route";
import { calculateNeon } from "@/app/lib/productFormulas/neon";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";

const owner = "adviser@example.test";
const contractNumber = "1234567890";
const entryPath = `users/${owner}/entries/entry-1`;
const records = new Map<string, Record<string, unknown>>();
const contractPatches: Record<string, unknown>[] = [];
const calculation = (annual: number) => calculateNeon(
  Math.round(annual / 12 * 100) / 100, "poradce7", 20, "accelerated", "2023-01-01", "historical"
);
const contract = () => records.get(entryPath)! as ContractDoc;
const row = (annual: number, code = "A101", paid?: number) => {
  const amount = paid ?? calculation(annual).items.find(item => item.code === code)?.amount ?? 100;
  const cells = [1, contractNumber, "01.01.2023", "01.01.2023", "Testovací klient", "Z",
    "CPP_NEONRF", code, annual, "", "", "7", amount, 0];
  return `<tr>${cells.map(value => `<td>${value}</td>`).join("")}</tr>`;
};
const periods = ["01.01.2026 - 31.01.2026", "01.02.2026 - 28.02.2026", "01.03.2026 - 31.03.2026"];
const header = (month: number) => ({
  statementNumber: String(month), statementDate: `01.0${month}.2026`, period: periods[month - 1] ?? null,
});
const request = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/commission-statements", {
  method: "POST", body: JSON.stringify(body),
});
const snapshot = (path: string) => ({
  id: path.split("/").at(-1)!, ref: document(path), exists: records.has(path), updateTime: 1,
  data: () => structuredClone(records.get(path)),
});
function write(path: string, patch: Record<string, unknown>) {
  if (path === entryPath) contractPatches.push(structuredClone(patch));
  records.set(path, { ...records.get(path), ...structuredClone(patch) });
}
function document(path: string) {
  return {
    id: path.split("/").at(-1)!, path,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => snapshot(path),
    set: async (patch: Record<string, unknown>) => write(path, patch),
  };
}
function collection(path: string, filters: [string, unknown][] = []) {
  return {
    doc: (id: string) => document(`${path}/${id}`),
    where: (field: string, op: string, value: unknown) => {
      expect(op).toBe("==");
      return collection(path, [...filters, [field, value]]);
    },
    limit: () => collection(path, filters),
    get: async () => ({ docs: [...records.keys()].filter(key =>
      key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/") &&
      filters.every(([field, value]) => records.get(key)?.[field] === value)
    ).map(snapshot) }),
  };
}
async function process(body: Record<string, unknown>) {
  const response = await POST(request(body));
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  expect(result.processingResult).toMatchObject({ contractsMatched: 1, errors: [], notFoundContracts: [] });
  return result;
}
const upload = (month: number, annual: number, rows = row(annual)) => process({
  header: header(month), html: `<div id="provize"><table>${rows}</table></div>`,
});

beforeEach(() => {
  vi.resetAllMocks(); records.clear(); contractPatches.length = 0;
  mocks.guard.mockResolvedValue({ ok: true,
    ctx: { email: owner, actorEmail: owner, teamEmails: [], accountType: "advisor", canManageContractsAsAdmin: false },
    withRateLimit: (response: Response) => response,
  });
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(document);
  mocks.history.mockImplementation((_batch, _ref, _before, patch) => patch);
  mocks.batch.mockImplementation(() => {
    const pending: (() => void)[] = [];
    const set = (ref: { path: string }, patch: Record<string, unknown>) => pending.push(() => write(ref.path, patch));
    return { set, update: set, commit: async () => pending.forEach(work => work()) };
  });
  const baseline = calculation(12000);
  records.set(entryPath, {
    contractNumber, productKey: "neon", userEmail: owner, position: "poradce7",
    commissionMode: "accelerated", frequencyRaw: "monthly", durationYears: 20,
    contractSignedDate: Date.UTC(2023, 0, 1), policyStartDate: Date.UTC(2023, 0, 1),
    isRefresh: true, requiresStatementRefresh: false, inputAmount: 2000, calculationInputAmount: 1000,
    refreshCommissionBase: { calculationMonthlyPremium: 1000, calculationAnnualPremium: 12000 },
    commissionBaseSource: "commission_statement", commissionCalculationStatus: "statement_resolved_refresh_base",
    refreshStatementResolvedStatementId: "january", refreshStatementResolvedStatementNumber: "1",
    refreshStatementResolvedStatementDate: "01.01.2026", refreshStatementResolvedStatementPeriod: periods[0],
    refreshStatementResolvedStatementChronologyMs: Date.UTC(2026, 0, 1),
    commissionCoefficientSetOverride: "historical", items: baseline.items, total: baseline.total,
    result: baseline, commissionPayouts: [],
  });
  records.set("contractRefs/entry-1", { contractNumberNormalized: contractNumber, entryPath, ownerEmail: owner, entryId: "entry-1" });
});

describe("NEON REFRESH statement chronology", () => {
  it.each([
    [1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1],
  ])("keeps March's risk base and all payouts when uploaded in order %i, %i, %i", async (...months) => {
    let marchId: string | undefined;
    for (const month of months) {
      const result = await upload(month, month === 2 ? 6000 : 12000);
      if (month === 3) marchId = result.item.id;
    }
    expect(contract()).toMatchObject({
      calculationInputAmount: 1000, inputAmount: 2000, total: calculation(12000).total,
      refreshCommissionBase: { calculationAnnualPremium: 12000 },
      refreshStatementResolvedStatementId: marchId,
      refreshStatementResolvedStatementNumber: "3",
      refreshStatementResolvedStatementPeriod: periods[2],
      refreshStatementResolvedStatementDate: "01.03.2026",
      refreshStatementResolvedStatementChronologyMs: Date.UTC(2026, 2, 1),
    });
    expect(contract().items).toEqual(calculation(12000).items);
    expect(contract().commissionPayouts).toHaveLength(3);
    expect(contract().commissionPayouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ statementNumber: "2", amount: calculation(6000).items.find(item => item.code === "A101")!.amount }),
    ]));
  });

  it("records a newer confirmation without rewriting an unchanged calculation", async () => {
    await upload(3, 12000);
    expect(contractPatches).toHaveLength(1);
    expect(contractPatches[0]).toMatchObject({ refreshStatementResolvedStatementChronologyMs: Date.UTC(2026, 2, 1) });
    for (const field of ["calculationInputAmount", "refreshCommissionBase", "items", "total", "result", "managerOverrides"]) {
      expect(contractPatches[0]).not.toHaveProperty(field);
    }
  });

  it("repairs stale provenance on reprocessing even when the payout is already recorded", async () => {
    const march = await upload(3, 12000);
    const payouts = structuredClone(contract().commissionPayouts);
    Object.assign(contract(), {
      refreshStatementResolvedStatementId: "january", refreshStatementResolvedStatementNumber: "1",
      refreshStatementResolvedStatementPeriod: periods[0], refreshStatementResolvedStatementDate: "01.01.2026",
      refreshStatementResolvedStatementChronologyMs: Date.UTC(2026, 0, 1),
    });
    contractPatches.length = 0;
    const result = await process({ action: "reprocess-saved-statement", statementId: march.item.id });
    expect(result.processingResult).toMatchObject({ contractsUpdated: 1, payoutRecordsAdded: 0, payoutRecordsUpdated: 0 });
    expect(contractPatches).toHaveLength(1);
    expect(contract().refreshStatementResolvedStatementId).toBe(march.item.id);
    expect(contract().refreshStatementResolvedStatementChronologyMs).toBe(Date.UTC(2026, 2, 1));
    expect(contract().commissionPayouts).toEqual(payouts);
    await upload(2, 6000);
    expect(contract().calculationInputAmount).toBe(1000);
  });

  it("preserves manager commission precision when only the legacy source needs confirmation", async () => {
    delete contract().commissionBaseSource;
    const managerOverrides = [{ email: "manager@example.test", position: "manazer10" as const,
      items: [{ code: "B3601", title: "Provize po 3 letech", amount: 1701.7776 }], total: 6986.91516 }];
    contract().managerOverrides = managerOverrides;
    await upload(3, 12000);
    expect(contract().commissionBaseSource).toBe("commission_statement");
    expect(contract().refreshStatementResolvedStatementChronologyMs).toBe(Date.UTC(2026, 2, 1));
    expect(contract().managerOverrides).toEqual(managerOverrides);
    expect(contractPatches[0]).not.toHaveProperty("managerOverrides");
  });

  it("does not rewrite the contract when the same confirmation is processed again", async () => {
    const march = await upload(3, 12000);
    contractPatches.length = 0;
    const result = await process({ action: "reprocess-saved-statement", statementId: march.item.id });
    expect(result.processingResult).toMatchObject({ contractsUpdated: 0, payoutRecordsAdded: 0 });
    expect(contractPatches).toEqual([]);
  });

  it.each(["draft", "resolved", "approved"])("resolves only an open obsolete accounting draft (previous status %s)", async status => {
    const saved = await upload(3, 12000);
    const payout = contract().commissionPayouts![0];
    payout.status = "difference";
    payout.expectedAmount = Number(payout.amount) - 100;
    payout.difference = 100;
    const id = createHash("sha256").update(`${saved.item.id}:commission-difference:${entryPath}:${payout.key}`).digest("hex").slice(0, 32);
    const draftPath = `usersPrivate/${owner}/accountingRepairDrafts/${id}`;
    records.set(draftPath, {kind: "commission_difference", status, entryPath, statementId: saved.item.id, expectedAmount: payout.expectedAmount});
    await process({action: "reprocess-saved-statement", statementId: saved.item.id});
    expect(contract().commissionPayouts![0].status).toBe("paid");
    expect(records.get(draftPath)!.status).toBe(status === "draft" ? "resolved" : status);
    if (status === "draft") expect(records.get(draftPath)).toMatchObject({
      resolutionReason: "statement_reprocessed_without_difference", resolvedBy: owner, resolvedDifference: 0,
    });
    else expect(records.get(draftPath)).not.toHaveProperty("resolvedAtMs");
  });

  it("still accepts a genuinely newer changed risk base", async () => {
    await upload(3, 12000);
    await upload(4, 18000);
    expect(contract()).toMatchObject({ calculationInputAmount: 1500, inputAmount: 2000,
      refreshCommissionBase: { calculationAnnualPremium: 18000 },
      refreshStatementResolvedStatementChronologyMs: Date.UTC(2026, 3, 1),
      items: calculation(18000).items, total: calculation(18000).total,
    });
  });

  it("confirms B0301 risk independently of a larger investment base", async () => {
    await upload(3, 12000, row(60000, "A201") + row(12000, "B0301"));
    await upload(2, 6000);
    expect(contract()).toMatchObject({ calculationInputAmount: 1000,
      refreshStatementResolvedStatementChronologyMs: Date.UTC(2026, 2, 1),
    });
    expect(contract().commissionPayouts).toHaveLength(3);
  });

  it.each(["A201", "B101"])("does not advance risk chronology from %s alone", async code => {
    await upload(3, 60000, row(60000, code));
    expect(contract().refreshStatementResolvedStatementChronologyMs).toBe(Date.UTC(2026, 0, 1));
    await upload(2, 6000);
    expect(contract().calculationInputAmount).toBe(500);
  });

  it("honors a newer legacy confirmation stored as a date without a timestamp", async () => {
    delete contract().refreshStatementResolvedStatementChronologyMs;
    contract().refreshStatementResolvedStatementDate = "01.03.2026";
    await upload(2, 6000);
    expect(contract().calculationInputAmount).toBe(1000);
    expect(contract().refreshStatementResolvedStatementDate).toBe("01.03.2026");
  });
});

describe("regular NEON payouts with different bases", () => {
  beforeEach(() => {
    Object.assign(contract(), {
      isRefresh: false, position: "poradce6", inputAmount: 1000, calculationInputAmount: 1000,
      items: [{ code: "B101-B104", title: "Následná provize (2.–5. rok)", amount: 47.52 }],
      commissionBaseSource: null, refreshCommissionBase: null,
    });
  });
  const regularRows = (rows: string) => rows.replaceAll("CPP_NEONRF", "CPP_NEON").replaceAll("<td>7</td>", "<td>6</td>");

  it("retains all four screenshot payouts and compares B104 instead of declaring it investment", async () => {
    const htmlRows = regularRows(row(732, "B104", 2.90) + row(11268, "B103", 44.62) +
      row(12000, "B102", 47.52) + row(12000, "B101", 47.52));
    const result = await upload(3, 12000, htmlRows);
    expect(result.processingResult.duplicatePayoutRowsSkipped).toBe(0);
    expect(contract().commissionPayouts).toHaveLength(4);
    expect(contract().commissionPayouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "B104", statementBaseAmount: 732, systemBaseAmount: 12000,
        amount: 2.90, expectedAmount: 47.52, difference: -44.62, status: "difference" }),
      expect.objectContaining({ code: "B103", statementBaseAmount: 11268, amount: 44.62, expectedAmount: 47.52 }),
    ]));
    expect(JSON.stringify(contract().commissionPayouts)).not.toContain("investiční složka");
    expect(contract()).toMatchObject({ isRefresh: false, inputAmount: 1000, calculationInputAmount: 1000 });
    const repeated = await process({ action: "reprocess-saved-statement", statementId: result.item.id });
    expect(repeated.processingResult.payoutRecordsAdded).toBe(0);
    expect(contract().commissionPayouts).toHaveLength(4);
  });

  it("does not discard a smaller B101 payout just because another B101 matches the expected amount", async () => {
    await upload(3, 12000, regularRows(row(12000, "B101", 47.52) + row(732, "B101", 2.90)));
    expect(contract().commissionPayouts).toHaveLength(2);
    expect(contract().commissionPayouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 2.90, expectedAmount: 47.52, status: "difference" }),
    ]));
  });

  it("still leaves explicit A201 investment commission outside the risk comparison", async () => {
    await upload(3, 12000, regularRows(row(732, "A201", 2.90)));
    expect(contract().commissionPayouts).toEqual([
      expect.objectContaining({ code: "A201", amount: 2.90, expectedAmount: null, difference: null, status: "paid" }),
    ]);
  });
});
