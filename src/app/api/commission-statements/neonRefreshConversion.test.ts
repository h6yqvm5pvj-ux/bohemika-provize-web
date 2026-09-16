import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), collection: vi.fn(), batch: vi.fn(), history: vi.fn() }));
vi.mock("@/app/api/contracts/_lib/contractsApi", async () => ({
  requireContractsEntryGuard: mocks.guard,
  hasContractAccess: (await import("@/app/api/contracts/_lib/contractsApi.access")).hasContractAccess,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: mocks.collection } }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_reason: string, work: () => Promise<unknown>) => work(),
  trackCashflowWrite: (work: () => Promise<unknown>) => work(),
  markCashflowMutationIncomplete: vi.fn(),
}));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: mocks.history }));

import { POST } from "./route";
import { calculateNeon } from "@/app/lib/productFormulas/neon";

const owner = "adviser@example.test";
const actor = "admin@example.test";
const contractNumber = "1234567890";
const entryPath = `users/${owner}/entries/entry-1`;
const statementId = "statement-0001";
const statementPath = `usersPrivate/${owner}/commissionStatements/${statementId}`;
const records = new Map<string, Record<string, unknown>>();
const writes: string[] = [];
const header = { period: "01.08.2026 - 31.08.2026", statementDate: "15.09.2026", statementNumber: "123" };
const row = (code: string, base: number, product = "CPP_NRF_LF", commission = 100) => {
  const cells = [1, contractNumber, "13.04.2023", "01.05.2023", "Testovací klient", "Z", product, code, base, "", "", "107", commission, 0];
  return `<tr>${cells.map(cell => `<td>${cell}</td>`).join("")}</tr>`;
};
const html = (rows = row("A201", 60000) + row("A101", 6757)) => `<div id="provize"><table>${rows}</table></div>`;
const request = (changes: Record<string, unknown> = {}) => new NextRequest("http://localhost/api/commission-statements", {
  method: "POST", body: JSON.stringify({ action: "convert-neon-refresh-from-statement", ownerEmail: owner,
    entryId: "entry-1", contractNumber, header, html: html(), ...changes }),
});
const setContext = (changes: Record<string, unknown> = {}) => mocks.guard.mockResolvedValue({
  ok: true, ctx: { email: owner, actorEmail: owner, teamEmails: [], accountType: "advisor",
    canManageContractsAsAdmin: false, impersonation: null, ...changes },
  withRateLimit: (response: Response) => response,
});
function collection(path: string) {
  return { doc: (id: string) => document(`${path}/${id}`) };
}
function document(path: string) {
  return { path, firestore: { batch: mocks.batch }, collection: (name: string) => collection(`${path}/${name}`),
    get: async () => ({ exists: records.has(path), updateTime: 123,
      data: () => structuredClone(records.get(path)) }),
  };
}

beforeEach(() => {
  vi.resetAllMocks(); records.clear(); writes.length = 0; setContext();
  mocks.collection.mockImplementation(collection);
  mocks.history.mockImplementation((_batch, _ref, _before, patch) => patch);
  mocks.batch.mockImplementation(() => {
    const pending: (() => void)[] = [];
    return {
      update: (ref: { path: string }, patch: Record<string, unknown>, precondition: unknown) => {
        expect(precondition).toEqual({ lastUpdateTime: 123 });
        pending.push(() => { writes.push(ref.path); records.set(ref.path, { ...records.get(ref.path), ...patch }); });
      },
      commit: async () => pending.forEach(work => work()),
    };
  });
  records.set(entryPath, { contractNumber, productKey: "neon", userEmail: owner, position: "poradce7",
    inputAmount: 2000, calculationInputAmount: 280, commissionMode: "accelerated", frequencyRaw: "monthly",
    durationYears: 40, contractSignedDate: "2023-04-13", policyStartDate: "2023-05-01", items: [], total: 1,
    commissionPayouts: [{ id: "existing-payout", amount: 50 }] });
});

describe("REFRESH directly from a statement preview", () => {
  it.each(["CPP_NRF_LF", "CPP_NEONRF", "CPP_NRF_IN"])("recalculates %s from risk HTML before processing, preserving premium and payouts", async product => {
    const response = await POST(request({ html: html(row("A201", 60000, product) + row("A101", 6757, product)), calculationInputAmount: 9999 }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.contract).toMatchObject({ isRefresh: true, requiresStatementRefresh: false,
      calculationInputAmount: 563.08, commissionBaseSource: "commission_statement",
      refreshStatementResolvedStatementId: null, refreshStatementResolvedStatementNumber: "123",
      refreshCommissionBase: { newMonthlyPremium: 2000, calculationAnnualPremium: 6757, calculationMonthlyPremium: 563.08 } });
    const expected = calculateNeon(563.08, "poradce7", 20, "accelerated", "2023-04-13", "historical");
    expect(payload.contract.items).toEqual(expected.items);
    expect(payload.contract.total).toBe(expected.total);
    expect(records.get(entryPath)).toMatchObject({ inputAmount: 2000, commissionPayouts: [{ id: "existing-payout", amount: 50 }] });
    expect(writes).toEqual([entryPath]); // No saved statement or paid commissions yet.
    expect(mocks.history).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ actorEmail: owner, title: "Převedeno na Refresh podle výpisu" }));
  });

  it("uses the saved HTML when an ID is supplied, ignoring replacement HTML", async () => {
    records.set(statementPath, { ...header, html: html(row("A101", 12000)) });
    const response = await POST(request({ statementId }));
    expect(response.status).toBe(200);
    expect((await response.json()).contract).toMatchObject({ calculationInputAmount: 1000, refreshStatementResolvedStatementId: statementId });
  });

  it.each(["A201", "AP201", "AZ201", "APZ201", "B101"])("never substitutes investment or ambiguous subsequent %s for the risk base", async code => {
    expect((await POST(request({ html: html(row(code, 60000)) }))).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("rejects conflicting risk bases", async () => {
    expect((await POST(request({ html: html(row("A101", 6757) + row("B0301", 12000)) }))).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("ignores a reversed risk row even when investment commission remains", async () => {
    expect((await POST(request({ html: html(row("A101", 6757, "CPP_NRF_LF", -100) + row("A201", 60000)) }))).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("does not treat a regular NEON row as evidence of REFRESH", async () => {
    expect((await POST(request({ html: html(row("A101", 6757, "CPP_N_LIFE")) }))).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("retains the verified admin's authority and audit identity during impersonation", async () => {
    setContext({ email: "represented@example.test", actorEmail: actor, impersonation: { actorRole: "admin" } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.history.mock.calls[0][4].actorEmail).toBe(actor);
  });

  it.each([null, { actorRole: "support" }])("rejects unrelated users despite claimed admin rights", async impersonation => {
    setContext({ email: "unrelated@example.test", impersonation });
    expect((await POST(request({ canManageContractsAsAdmin: true, actorEmail: actor }))).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("rejects tipsters", async () => {
    setContext({ accountType: "tipster" });
    expect((await POST(request())).status).toBe(403); expect(writes).toEqual([]);
  });

  it("requires authentication", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401); expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("does not overwrite an already converted contract or its original contract reference", async () => {
    records.get(entryPath)!.isRefresh = true;
    records.get(entryPath)!.refreshOriginalContractNumber = "9876543210";
    expect((await POST(request())).status).toBe(409); expect(writes).toEqual([]);
  });

  it("does not overwrite a calculation based on a newer statement", async () => {
    records.get(entryPath)!.refreshStatementResolvedStatementChronologyMs = Date.UTC(2026, 11, 1);
    expect((await POST(request())).status).toBe(409); expect(writes).toEqual([]);
  });

  it.each([{ contractNumber: "9999999999" }, { statementId: "invalid/id" }, { html: "" }, { html: "x".repeat(850001) }])("rejects invalid sources and targets without writes", async changes => {
    expect((await POST(request(changes))).status).toBeGreaterThanOrEqual(400); expect(writes).toEqual([]);
  });
});
