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

import { POST } from "./route";
import { calculateCppPPRbez } from "@/app/lib/productFormulas/cppPPRbez";
import { acquisitionCommissionInstallments, payoutsForAcquisitionInstallment } from "@/app/smlouvy/[id]/contractCommissionInstallments";
import { payoutStatusForCodes } from "@/app/smlouvy/[id]/ContractCommissionSection";
import type { ContractCommissionPayout } from "@/app/smlouvy/[id]/contractDetailTypes";

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
const request = (changes: Record<string, unknown> = {}) => new NextRequest("http://localhost/api/commission-statements", {
  method: "POST",
  body: JSON.stringify({ action: "rebuild-contract-from-statements", ownerEmail: owner, entryId: "entry-1", contractNumber, ...changes }),
});
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
    where: (field: string, _operator: string, value: unknown) => collection(path, [...filters, [field, value]], limit),
    limit: (value: number) => collection(path, filters, value),
    get: async () => {
      reads.push(path);
      return { docs: [...records.keys()].filter(key => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
        .filter(key => filters.every(([field, value]) => records.get(key)?.[field] === value)).slice(0, limit).map(snapshot) };
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks(); records.clear(); versions.clear(); beforeReset = undefined; beforeReplayCommit = undefined; reads.length = 0; writes.length = 0;
  setContext();
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(document);
  mocks.history.mockImplementation((_batch, _ref, _before, patch) => patch);
  mocks.transaction.mockImplementation(async work => {
    const pending: (() => void)[] = [];
    const tx = { getAll: async (...refs: { path: string }[]) => refs.map(ref => { reads.push(ref.path); return snapshot(ref.path); }),
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
    records.set(ownStatementPath, { html });
    return POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify(mode === "import" ? { html } : {
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

  it.each(["import", "reprocess"])("normal %s records actual Kooperativa C payouts without changing a constant premium", async mode => {
    const premium = 7175;
    Object.assign(records.get(entryPath)!, {
      productKey: "kooperativaAuto", frequencyRaw: "semiannual", position: "poradce7",
      inputAmount: premium, calculationInputAmount: premium, effectiveInputAmount: premium,
      contractSignedDate: "2023-02-16", policyStartDate: "2023-02-17",
      items: [{ title: "Následná provize", code: "B101", amount: 605.57 }],
    });
    const before = structuredClone(records.get(entryPath))!;
    const amounts = [["C101", 937.80], ["C103", 970.20], ["C105", 1019.40], ["C106", 769.80]] as const;
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
        expect.objectContaining({ code, amount, status: "paid", expectedAmount: null, difference: null, writtenBy: owner })
      )));
      expect(saved).toMatchObject({ inputAmount: premium, effectiveInputAmount: premium, calculationInputAmount: premium, position: "poradce7", frequencyRaw: "semiannual", items: before.items });
      expect(saved.premiumStatementHistory ?? []).toEqual([]);
      expect(saved.commissionCoefficientSetOverride).toBeUndefined();
    }
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


describe("automatic chronology reconciliation on statement import", () => {
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
    method: "POST", body: JSON.stringify({ html: html(year, base), header: header(year) }),
  }));
  const expectUpload = async (year: number, base?: number) => {
    const response = await upload(year, base);
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
    await expectUpload(2025); await expectUpload(2026);
    const ordered = summary();
    setup();
    await expectUpload(2026); await expectUpload(2025);
    expect(summary()).toEqual(ordered);
    expect(summary().history).toEqual([
      { kind: "auto_initial", date: "2025-05-01", amount: 10000, previous: null, difference: null },
      { kind: "auto_change", date: "2026-05-01", amount: 12000, previous: 10000, difference: 2000 },
    ]);
    expect(summary().payouts.map(item => [item.month, item.amount])).toEqual([["2025-5", 1060], ["2026-5", 1272]]);
  });

  it.each([[2027, 2025, 2026], [2027, 2026, 2025], [2026, 2025, 2027], [2026, 2027, 2025], [2025, 2027, 2026]])("reconciles three anniversary statements in order %j", async (...years) => {
    for (const year of [2025, 2026, 2027]) await expectUpload(year);
    const ordered = summary();
    setup();
    for (const year of years) await expectUpload(year);
    expect(summary()).toEqual(ordered);
  });

  it("preserves manual, foreign and unattributed records and never reads another author's statement collection", async () => {
    await expectUpload(2026);
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
    await expectUpload(2025);
    expect(records.get(entryPath)!.commissionPayouts).toEqual(expect.arrayContaining(protectedPayouts));
    expect(records.get(entryPath)!.premiumStatementHistory).toEqual(expect.arrayContaining(protectedHistory));
    expect(reads.some(path => path.startsWith(`usersPrivate/${viewer}/commissionStatements`))).toBe(false);
    expect(summary().payouts.some(item => item.amount === 99999 * 0.106)).toBe(false);
  });

  it("does not clear existing payouts or premium history when another writer changes the contract during replay", async () => {
    await expectUpload(2026);
    const before = structuredClone(records.get(entryPath)!);
    const concurrent = { key: "concurrent", statementId: "another-source", writtenBy: viewer, amount: 55 };
    beforeReplayCommit = () => write(entryPath, { commissionPayouts: [...(records.get(entryPath)!.commissionPayouts as unknown[]), concurrent] });
    const response = await upload(2025);
    expect(response.status).toBe(409);
    expect(records.get(entryPath)).toEqual({ ...before, commissionPayouts: [...(before.commissionPayouts as unknown[]), concurrent] });
  });

  it("remains idempotent when the older source is processed again", async () => {
    await expectUpload(2026); await expectUpload(2025);
    const before = summary();
    const repeat = await expectUpload(2025);
    expect(repeat.processingResult).toMatchObject({ payoutRecordsAdded: 0, payoutRecordsUpdated: 0, premiumUpdates: 0 });
    expect(summary()).toEqual(before);
    expect(summary().payouts).toHaveLength(2);
  });


  const derivedTasks = () => [...records.entries()].filter(([path]) =>
    path.startsWith(`usersPrivate/${owner}/accountingRepairDrafts/`) || path.startsWith(`usersPrivate/${owner}/externalUpdateTasks/`));

  it("updates the later premium repair and external task from the corrected previous premium", async () => {
    await expectUpload(2027);
    const originalTasks = structuredClone(derivedTasks());
    expect(originalTasks).toHaveLength(2);
    expect(originalTasks.every(([, task]) => task.previousAnnualPremium === 12000)).toBe(true);
    await expectUpload(2025);
    for (const [path, original] of originalTasks) {
      expect(records.get(path)).toMatchObject({ previousAnnualPremium: 10000, newAnnualPremium: 14000, differenceAnnual: 4000,
        createdAtMs: original.createdAtMs, createdBy: original.createdBy });
    }
    await expectUpload(2026);
    expect(derivedTasks()).toHaveLength(4);
    for (const [path] of originalTasks) expect(records.get(path)).toMatchObject({
      previousAnnualPremium: 12000, newAnnualPremium: 14000, differenceAnnual: 2000,
    });
  });

  it("never reopens already completed repair drafts or external tasks during replay", async () => {
    await expectUpload(2027);
    for (const [path] of derivedTasks()) write(path, { status: "completed", reviewedBy: owner });
    const completed = structuredClone(derivedTasks());
    const result = await expectUpload(2025);
    expect(result.processingResult).toMatchObject({ accountingRepairDrafts: 0, externalUpdateTasks: 0 });
    for (const [path, task] of completed) expect(records.get(path)).toEqual(task);
    expect(summary().history).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2027-05-01", previous: 10000, difference: 4000 }),
    ]));
  });

  it("rejects the whole replay if an existing draft is completed concurrently", async () => {
    await expectUpload(2027);
    const before = structuredClone(records.get(entryPath));
    const [taskPath] = derivedTasks()[0];
    beforeReplayCommit = () => write(taskPath, { status: "completed" });
    const response = await upload(2025);
    expect(response.status).toBe(409);
    expect(records.get(entryPath)).toEqual(before);
    expect(records.get(taskPath)?.status).toBe("completed");
  });

  it("does not overwrite a task created concurrently with the atomic replay", async () => {
    await expectUpload(2026);
    const before = structuredClone(records.get(entryPath));
    // Capture the deterministic new task path as it is read during simulation.
    beforeReplayCommit = () => {
      const taskPath = reads.find(path => path.startsWith(`usersPrivate/${owner}/externalUpdateTasks/`));
      expect(taskPath).toBeDefined();
      write(taskPath!, { status: "completed", marker: "concurrent" });
    };
    expect((await upload(2025)).status).toBe(409);
    expect(records.get(entryPath)).toEqual(before);
    expect(derivedTasks()).toEqual([[expect.any(String), { status: "completed", marker: "concurrent" }]]);
  });

  it("leaves all financial records intact if a saved source fails validation", async () => {
    const latest = await expectUpload(2026);
    write(`usersPrivate/${owner}/commissionStatements/${latest.item.id}`, { html: '<div id="provize">' + "<tr>".repeat(1000) + "</div>" });
    const before = structuredClone(records.get(entryPath));
    expect((await upload(2025)).status).toBe(400);
    expect(records.get(entryPath)).toEqual(before);
    expect(derivedTasks()).toEqual([]);
  });

  it("repairs an already imported older statement through the saved-statement action", async () => {
    await expectUpload(2026);
    const older = await expectUpload(2025);
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
    await expectUpload(2026);
    const before = structuredClone(records.get(entryPath));
    reads.length = 0; writes.length = 0;
    setContext({ email: viewer, actorEmail: viewer });
    const response = await POST(new NextRequest("https://example.test/api/commission-statements", {
      method: "POST", body: JSON.stringify({ html: html(2025), header: header(2025), ownerEmail: owner,
        entryId: "entry-1", canManageContractsAsAdmin: true, replayContext: { ownerEmail: owner } }),
    }));
    expect(response.status).toBe(200);
    expect(records.get(entryPath)).toEqual(before);
    expect(writes).not.toContain(entryPath);
    expect(reads.some(path => path.startsWith(`usersPrivate/${owner}/`))).toBe(false);
  });

  it("keeps other contracts and the historical source audit unchanged", async () => {
    const latest = await expectUpload(2026);
    const sourcePath = `usersPrivate/${owner}/commissionStatements/${latest.item.id}`;
    const otherPath = `users/${owner}/entries/other-contract`;
    records.set(otherPath, { contractNumber: "9876543210", productKey: "cppAuto", commissionPayouts: [{ key: "manual", amount: 42 }] });
    const other = structuredClone(records.get(otherPath));
    const source = records.get(sourcePath)!;
    source.html = String(source.html).replace("</table>", html(2026).match(/<tr>.*<\/tr>/)![0].replace(contractNumber, "9876543210") + "</table>");
    const sourceBefore = structuredClone(source);
    await expectUpload(2025);
    expect(records.get(otherPath)).toEqual(other);
    expect(records.get(sourcePath)).toEqual(sourceBefore);
  });
});
