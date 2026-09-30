import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  batch: vi.fn(),
  history: vi.fn(),
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
function collection(path: string) {
  return {
    doc: (id: string) => document(`${path}/${id}`),
    get: async () => {
      reads.push(path);
      return { docs: [...records.keys()].filter(key => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/")).map(snapshot) };
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks(); records.clear(); versions.clear(); beforeReset = undefined; beforeReplayCommit = undefined; reads.length = 0; writes.length = 0;
  setContext();
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(document);
  mocks.history.mockImplementation((_batch, _ref, _before, patch) => patch);
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
    return { set, update, commit: async () => {
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
