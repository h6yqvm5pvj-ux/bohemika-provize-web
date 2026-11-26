import { describe, expect, it } from "vitest";
import { computeCashflow, type CashflowSnapshot } from "./computeCashflow";
import { applyIntelligentCashflowPrediction } from "./helpers";
import { buildCashflowView, type CashflowViewOptions } from "./buildCashflowView";
import { createCashflowModel } from "./cashflowModel";
import { parseCashflowSnapshot, serializeCashflowSnapshot } from "./cashflowSnapshotWire";
import type { CashflowCommissionStatementSummary, EntryDoc } from "./types";

const asOf = new Date(2025, 7, 1, 12);
const owner = "advisor@example.test";
const entry: EntryDoc = { id: "auto", userEmail: owner, productKey: "kooperativaAuto", frequencyRaw: "quarterly",
  policyStartDate: "2023-09-01", contractSignedDate: "2023-09-01",
  items: [{ code: "A101", title: "Okamžitá provize", amount: 150 }, { code: "B101", title: "Následná provize", amount: 150 }],
  paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual" }],
  commissionPayouts: [{ key: "first", code: "C101", amount: 580, status: "paid", payoutMonthKey: "2024-9", writtenBy: owner },
    { key: "correction", code: "B101", amount: 20, status: "difference", payoutMonthKey: "2025-1", writtenBy: owner }],
};
const snapshot = (ownEntries: EntryDoc[]): CashflowSnapshot => ({ email: owner, myPosition: null, myCommissionMode: null,
  hasAnyTeam: false, ownEntries, teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [] });
const options = { scopeFilter: "own" as const, productFilter: "all" as const, asOf };

describe("rolling auto estimates in cashflow", () => {
  it("keeps the actual receipts and only forecasts the following insured annual term", () => {
    const data = snapshot([entry]);
    const before = structuredClone(data);
    const result = computeCashflow(data, options);
    const future = result.filter(item => item.commissionCode?.startsWith("B") && item.payoutStatus !== "paid");
    expect(future).toHaveLength(1);
    expect(future[0]).toMatchObject({ commissionCode: "B102", amount: 600, autoCommissionForecastMinimum: 552, autoCommissionForecastMaximum: 648 });
    expect(result.filter(item => item.payoutStatus === "paid").reduce((sum, item) => sum + item.amount, 0)).toBe(600);
    expect(applyIntelligentCashflowPrediction({ cashflowItems: result, enabled: true, today: new Date(2024, 0, 1) })).toContainEqual(future[0]);
    expect(data).toEqual(before);
    expect(parseCashflowSnapshot(JSON.parse(JSON.stringify(serializeCashflowSnapshot({ items: result, months: [] }))))?.items).toEqual(result);
  });

  it("does not use another contract's or another adviser's receipts as a basis", () => {
    const own = { ...entry, id: "unpaid", commissionPayouts: [] };
    const foreign = { ...entry, userEmail: "other@example.test", commissionPayouts: [{ code: "C101", amount: 90000, status: "paid", writtenBy: "other@example.test", payoutMonthKey: "2024-9" }] };
    const result = computeCashflow(snapshot([own, foreign]), options);
    expect(result.filter(item => item.commissionCode === "B101")).toHaveLength(1);
    expect(result.find(item => item.commissionCode === "B101")?.amount).toBe(600);
    expect(result.some(item => item.amount >= 90000)).toBe(false);
  });

  it("includes every quarterly installment of the next insured year without extending into another unknown year", () => {
    const quarterly: EntryDoc = { ...entry, paymentFrequencyChanges: [], commissionPayouts: [
      { code: "C104", amount: 160, status: "paid", payoutMonthKey: "2025-6", writtenBy: owner },
    ] };
    const result = computeCashflow(snapshot([quarterly]), options);
    const nextYear = result.filter(item => item.payoutStatus !== "paid" && /^B10[5-8]$/.test(item.commissionCode ?? ""));
    expect(nextYear.map(item => item.commissionCode)).toEqual(["B105", "B106", "B107", "B108"]);
    for (const item of nextYear) expect(item).toMatchObject({ amount: 160,
      autoCommissionForecastMinimum: 147.2, autoCommissionForecastMaximum: 172.8 });
    expect(result.some(item => /^B(?:109|11\d)$/.test(item.commissionCode ?? ""))).toBe(false);
  });

  it("uses only the manager's own receipts for the manager renewal estimate", () => {
    const adviser = "other@example.test";
    const data = snapshot([]);
    data.hasAnyTeam = true;
    data.teamEntriesRaw = [{ ...entry, userEmail: adviser,
      managerOverrides: [{ email: owner, position: "manazer8", commissionMode: "standard", total: 60,
        items: [{ code: "A101", title: "Okamžitá provize", amount: 15 }, { code: "B101", title: "Následná provize", amount: 15 }] }],
      commissionPayouts: [
        { code: "C101", amount: 90000, status: "paid", payoutMonthKey: "2024-9", writtenBy: adviser },
        { code: "C101", amount: 60, status: "paid", payoutMonthKey: "2024-9", writtenBy: owner },
      ],
    }];
    const result = computeCashflow(data, { ...options, scopeFilter: "team" });
    expect(result.find(item => item.commissionCode === "B102")).toMatchObject({ amount: 60,
      source: "manager", autoCommissionForecastMinimum: 55.2, autoCommissionForecastMaximum: 64.8 });
    expect(result.some(item => item.amount >= 90000)).toBe(false);
  });

  it("preserves exact remaining installments in cashflow and the snapshot while keeping next year's uncertainty", () => {
    const quarterly: EntryDoc = { ...entry, paymentFrequencyChanges: [], commissionPayouts: [
      { code: "C105", amount: 365.01, status: "paid", payoutMonthKey: "2025-9", writtenBy: owner },
      { code: "C106", amount: 365.01, status: "paid", payoutMonthKey: "2025-12", writtenBy: owner },
    ] };
    const result = computeCashflow(snapshot([quarterly]), options);
    for (const code of ["B107", "B108"]) expect(result.find(item => item.commissionCode === code)).toMatchObject({
      amount: 365.01, autoCommissionForecastMinimum: 365.01, autoCommissionForecastMaximum: 365.01, autoCommissionConfirmedPolicyYear: true,
    });
    for (const code of ["B109", "B110", "B111", "B112"]) expect(result.find(item => item.commissionCode === code)).toMatchObject({
      amount: 365.01, autoCommissionForecastMinimum: 335.81, autoCommissionForecastMaximum: 394.21, autoCommissionConfirmedPolicyYear: false,
    });
    expect(result.some(item => item.commissionCode === "B113")).toBe(false);
    const restored = parseCashflowSnapshot(JSON.parse(JSON.stringify(serializeCashflowSnapshot({ items: result, months: [] }))));
    expect(restored?.items).toEqual(result);
  });
});

it("applies a manual CPP annual reduction only to future forecasts and keeps A101 receipts", () => {
  const contract: EntryDoc = { ...entry, productKey: "cppAuto", frequencyRaw: "annual", inputAmount: 10000,
    items: [{ code: "A101", title: "Okamžitá provize", amount: 1000 }, { code: "B101", title: "Následná provize", amount: 800 }],
    paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual", annualPremium: 3000, baseAnnualPremium: 10000 }],
    commissionPayouts: [{ key: "first", code: "A101", amount: 1000, status: "paid", payoutMonthKey: "2023-9", writtenBy: owner }] };
  const result = computeCashflow(snapshot([contract]), { ...options, asOf: new Date(2024, 6, 1, 12) });
  expect(result.find(item => item.commissionCode === "B101" && item.payoutStatus !== "paid")?.amount).toBe(240);
  expect(result.filter(item => item.payoutStatus === "paid").reduce((sum, item) => sum + item.amount, 0)).toBe(1000);
});

it("keeps the original signing position for confirmed auto premiums in cashflow", () => {
  const contract: EntryDoc = {
    ...entry, productKey: "cppAuto", frequencyRaw: "semiannual", policyStartDate: "2024-01-29",
    contractSignedDate: "2024-01-22", inputAmount: 12000, originalPosition: "poradce8", position: "poradce8",
    payoutPositionOverride: "poradce10",
    items: [{ code: "A101", title: "Okamžitá provize", amount: 1392 }, { code: "B101", title: "Následná provize", amount: 1392 }],
    paymentFrequencyChanges: [{ effectiveDate: "2026-01-29", frequency: "annual", annualPremium: 22037, baseAnnualPremium: 24000 }],
    commissionPayouts: [
      { key: "first", code: "B101", amount: 2511.11, status: "paid", payoutMonthKey: "2025-1", writtenBy: owner },
      { key: "second", code: "B102", amount: 2499.99, status: "paid", payoutMonthKey: "2026-1", writtenBy: owner },
    ],
  };
  const data = { ...snapshot([contract]), myPosition: "poradce10" as const };
  const result = computeCashflow(data, { ...options, asOf: new Date(2026, 10, 23) });
  const pending = result.find(item => item.commissionCode === "B103" && item.payoutStatus !== "paid");
  expect(pending).toMatchObject({ amount: 2556.29, predictedAmount: 2556.29, predictionPosition: "poradce8",
    autoCommissionForecastMinimum: 2556.29, autoCommissionForecastMaximum: 2556.29, autoCommissionFromSavedPremium: true });
  expect(pending).not.toHaveProperty("originalPositionAmount");
  const restored = parseCashflowSnapshot(JSON.parse(JSON.stringify(serializeCashflowSnapshot({ items: result, months: [] }))));
  expect(restored?.items.find(item => item.id === pending?.id)).toEqual(pending);
  expect(result.filter(item => item.payoutStatus === "paid").map(item => item.amount)).toEqual([2511.11, 2499.99]);
});

describe("semiannual coverage from a combined B payment", () => {
  const contract: EntryDoc = {
    id: "semiannual", userEmail: owner, productKey: "cppAuto", contractNumber: "123456789",
    frequencyRaw: "semiannual", policyStartDate: "2023-03-01", contractSignedDate: "2023-03-01", inputAmount: 4000,
    items: [{ code: "A101", title: "Okamžitá provize", amount: 470 }, { code: "B101", title: "Následná provize", amount: 480 }],
    commissionPayouts: [
      ["B101", 480, 4000, "2024-4"], ["B102", 960, 8000, "2024-10"], ["B101", -480, 4000, "2024-11"],
      ["B101", 500, 4170, "2025-4"], ["B103", 500, 4170, "2025-10"], ["B104", 520, 4330, "2026-1"],
      ["B105", 520, 4330, "2026-11"],
    ].map(([code, amount, sourceBaseAmount, payoutMonthKey], index) => ({
      key: `test-${index}`, code: String(code), amount: Number(amount), sourceBaseAmount: Number(sourceBaseAmount),
      status: Number(amount) < 0 ? "storno" : "paid", payoutMonthKey: String(payoutMonthKey), writtenBy: owner,
    })),
  };
  const asOf = new Date(2026, 10, 23);
  const view: CashflowViewOptions = { ...options, contractNumberQuery: "", showPastYears: true, tipsterMode: false, intelligentPredictionEnabled: false };
  const itemsFor = (entry: EntryDoc) => computeCashflow(snapshot([entry]), { ...options, asOf });
  const visible = (entry: EntryDoc, statements: CashflowCommissionStatementSummary[] = []) =>
    buildCashflowView(itemsFor(entry), statements, view, asOf).flatMap(month => month.items);

  it("reassigns each recorded installment without adding a receipt or moving the original cash", () => {
    const result = visible(contract);
    const receipts = result.filter(item => item.payoutStatus === "paid");
    expect(receipts.map(item => item.amount).reduce((sum, amount) => sum + amount, 0)).toBe(3000);
    expect(receipts.find(item => item.commissionCode === "B102")).toMatchObject({ amount: 960,
      date: new Date(2024, 9, 25), installmentCoverageNote: "Souhrnná výplata pokrývá období B101 a B102." });
    expect(receipts.filter(item => item.commissionCode === "B101").map(item => item.amount)).toEqual([480, -480]);
    expect(receipts.find(item => item.commissionCode === "B103")).toMatchObject({ amount: 500, date: new Date(2025, 3, 25), predictedAmount: 480 });
    expect(receipts.find(item => item.commissionCode === "B104")).toMatchObject({ amount: 500, date: new Date(2025, 9, 25) });
    expect(receipts.find(item => item.commissionCode === "B105")).toMatchObject({ amount: 520, date: new Date(2026, 0, 25) });
    expect(receipts.find(item => item.commissionCode === "B106")).toMatchObject({ amount: 520, date: new Date(2026, 10, 25) });
    expect(result.find(item => item.commissionCode === "B107")?.payoutStatus).not.toBe("paid");
  });

  const legacyContract = () => {
    const copy = structuredClone(contract);
    copy.commissionPayouts!.pop();
    delete copy.commissionPayouts![1].sourceBaseAmount;
    copy.commissionPayouts![1].statementId = "annual-base";
    return copy;
  };
  const combinedStatement: CashflowCommissionStatementSummary = {
    id: "annual-base", fileName: "annual-base.html", statementNumber: "18", statementDate: null, period: "09/2024",
    advisorNumber: null, periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: "2024-10",
    paidContractNumbers: ["123456789"], paidCommissionKeys: ["123456789:B102"],
    paidAutoInstallments: [{ contractNumber: "123456789", code: "B102", amount: 960, productKey: "cppAuto", source: "own", sourceBaseAmount: 8000 }],
    commissionTotal: 960, payoutTotal: 960, managerCommissionTotal: 0, otherPaymentsTotal: 0, createdAtMs: null, updatedAtMs: null,
  };

  it("uses the historical statement base before shifting forecast payouts into November", () => {
    const data = snapshot([legacyContract()]);
    const before = structuredClone(data);
    const statements = [combinedStatement, ...Array.from({ length: 7 }, (_, index) => ({
      ...combinedStatement, id: `monthly-${index}`, payoutMonthKey: `2026-${index + 4}`,
      paidContractNumbers: ["987654321"], paidCommissionKeys: [], paidAutoInstallments: undefined,
    }))];
    const combined = { ...view, scopeFilter: "combined" as const };
    const oldItems = computeCashflow(data, { ...combined, asOf });
    const oldNovember = buildCashflowView(oldItems, statements, combined, asOf).find(month => month.key === "2026-11");
    expect(oldNovember?.items.map(item => item.commissionCode)).toEqual(expect.arrayContaining(["B105", "B106"]));

    const items = computeCashflow(data, { ...combined, asOf, statements });
    expect(items.filter(item => item.commissionCode === "B105")).toEqual([expect.objectContaining({
      amount: 520, date: new Date(2026, 0, 25), payoutStatus: "paid",
    })]);
    const months = buildCashflowView(items, statements, combined, asOf);
    const november = months.find(month => month.key === "2026-11");
    expect(november?.items).toEqual([expect.objectContaining({ commissionCode: "B106", amount: 520, payoutStatus: "shifted" })]);
    const model = createCashflowModel({ snapshot: data, statements, asOf });
    model.view(combined);
    expect(model.month("2026-11")).toEqual(november);
    expect(data).toEqual(before);
  });

  it.each(["contract", "product", "source", "amount", "statement", "duplicate", "writer"])(
    "does not recover statement evidence with a mismatched %s", mismatch => {
      const entry = legacyContract();
      const statement = structuredClone(combinedStatement);
      const row = statement.paidAutoInstallments![0];
      if (mismatch === "contract") row.contractNumber = "987654321";
      if (mismatch === "product") row.productKey = "kooperativaAuto";
      if (mismatch === "source") row.source = "manager";
      if (mismatch === "amount") row.amount = 959.99;
      if (mismatch === "statement") statement.id = "different-statement";
      if (mismatch === "duplicate") statement.paidAutoInstallments!.push({ ...row, sourceBaseAmount: 4000 });
      if (mismatch === "writer") entry.commissionPayouts![1].writtenBy = "other@example.test";
      expect(computeCashflow(snapshot([entry]), { ...options, asOf, statements: [statement] }))
        .toEqual(itemsFor(entry));
    },
  );

  it.each(["normal base", "foreign receipt", "partial reversal", "earlier payout", "missing code", "separate first payment", "different paired amounts"])("keeps B106 open with %s", reason => {
    const entry = structuredClone(contract);
    const payouts = entry.commissionPayouts!;
    if (reason === "normal base") payouts[1].sourceBaseAmount = 4000;
    if (reason === "foreign receipt") payouts[1].writtenBy = "other@example.test";
    if (reason === "partial reversal") payouts[2].amount = -250;
    if (reason === "earlier payout") payouts[6].payoutMonthKey = "2026-7";
    if (reason === "missing code") payouts.splice(4, 1);
    if (reason === "separate first payment") payouts.splice(2, 2);
    if (reason === "different paired amounts") payouts[4].amount = 540;
    expect(visible(entry).find(item => item.commissionCode === "B106")?.payoutStatus).not.toBe("paid");
    expect(visible(entry).some(item => item.commissionCode === "B106")).toBe(true);
  });

  it.each([false, true])("uses B102 to cover the missing B101 in its own term, with a reversed B101 receipt: %s", reversed => {
    const payouts = contract.commissionPayouts!.filter((_, index) => index !== 3 && (reversed || ![0, 2].includes(index)));
    const result = visible({ ...contract, commissionPayouts: payouts });

    expect(result.filter(item => item.commissionCode === "B101")).toHaveLength(reversed ? 2 : 0);
    expect(result.filter(item => item.commissionCode === "B102")).toEqual([expect.objectContaining({
      amount: 960, date: new Date(2024, 9, 25), installmentCoverageNote: "Souhrnná výplata pokrývá období B101 a B102.",
    })]);
    expect(result.find(item => item.commissionCode === "B106")).toMatchObject({ amount: 520 });
  });

  it("accepts a subsequently available exact B106 receipt from the statement summary", () => {
    const summary: CashflowCommissionStatementSummary = {
      id: "november", fileName: "november.html", statementNumber: "11", statementDate: null, period: "10/2026", advisorNumber: null,
      periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: "2026-11", paidContractNumbers: ["123456789"],
      paidCommissionKeys: ["123456789:B106"], paidAutoInstallments: [{ contractNumber: "123456789", code: "B106", amount: 511.73, productKey: "cppAuto", source: "own" }],
      commissionTotal: 511.73, payoutTotal: 511.73, managerCommissionTotal: 0, otherPaymentsTotal: 0, createdAtMs: null, updatedAtMs: null,
    };
    const incomplete = { ...contract, commissionPayouts: contract.commissionPayouts!.filter((_, index) => ![0, 2, 6].includes(index)) };
    expect(visible(incomplete, [summary]).filter(item => item.commissionCode === "B106")).toEqual([
      expect.objectContaining({ amount: 511.73, payoutStatus: "paid" }),
    ]);
    const items = itemsFor(incomplete);
    const snapshot = parseCashflowSnapshot(JSON.parse(JSON.stringify(serializeCashflowSnapshot({ items, months: [] }))));
    expect(snapshot?.items.find(item => item.commissionCode === "B101")?.coveredByCombinedPayout).toBe(true);
    const resumed = { ...incomplete, commissionPayouts: [...incomplete.commissionPayouts,
      { ...contract.commissionPayouts![6], code: "B106", amount: 511.73 }] };
    const actual = visible(resumed);
    expect(actual.find(item => item.commissionCode === "B105")).toMatchObject({ amount: 520, payoutStatus: "paid" });
    expect(actual.find(item => item.commissionCode === "B106")).toMatchObject({ amount: 511.73, payoutStatus: "paid" });
  });
});
