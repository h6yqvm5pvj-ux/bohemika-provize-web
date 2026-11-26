import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractAutoPremiumHistory } from "./ContractAutoPremiumHistory";
import { initialAnnualPremiumFromStatementRows } from "./ContractAutoPremiumHistory";
import { premiumBaseSourceKey, resolveAutoPremiumBasis, type PremiumBaseResolution } from "@/app/lib/autoPremiumBasis";
import { projectConfirmedCommissionCodes } from "@/app/lib/commissionPayoutCodeAdjustment";
import { confirmedPremiumHistoryPatch, type PremiumHistoryContract } from "@/app/api/commission-statements/premiumHistory";
import type { ContractAutoPremiumStatementHistoryEntry, ContractCommissionStatementSummary } from "./contractDetailTypes";
import { PremiumBaseReview } from "./PremiumBaseReview";

const owner = "owner@example.test";
const row = { rowId: "row", contractNumber: "999000111", client: null, productCode: "CPP_ACPIII", productKey: "cppAuto" as const,
  commissionCode: "B121", basePremium: 2536, commission: 268.82, signedAt: "02.04.2015", validFrom: "01.06.2015", source: "own" as const };
const statements: ContractCommissionStatementSummary[] = [
  { id: "june", fileName: "june.html", statementNumber: "75", statementDate: "23.07.2026", period: "01.06.2026 - 30.06.2026", periodStartMs: null, periodEndMs: null, payoutMonthKey: null, autoPremiumRows: [row] },
  { id: "november", fileName: "november.html", statementNumber: "67", statementDate: "15.12.2025", period: "01.11.2025 - 30.11.2025", periodStartMs: null, periodEndMs: null, payoutMonthKey: null, autoPremiumRows: [{ ...row, commissionCode: "B120", basePremium: 2441 }] },
];
const policyStart = "14.03.2022";
const historicalStatementRows: ContractCommissionStatementSummary[] = [
  ["A101", 3049, "14.03.2022"], ["A102", 3049, "14.09.2022"],
  ["B101", 1701, "14.03.2023"], ["B102", 1701, "14.09.2023"],
  ["B103", 1769, "14.03.2024"], ["B104", 1769, "14.09.2024"],
  ["B105", 1869, "14.03.2025"], ["B106", 1869, "14.09.2025"],
  ["B107", 1983, "14.03.2026"], ["B108", 1983, "14.09.2026"],
].map(([commissionCode, basePremium, date], index) => {
  const day = date as string;
  const normalized = day.split(".").reverse().join("");
  return {
    id: `history-${index}`, fileName: `history-${index}.html`, statementNumber: String(index + 1),
    statementDate: day, period: `${day} - ${day}`, periodStartMs: null,
    periodEndMs: Date.UTC(Number(normalized.slice(0, 4)), Number(normalized.slice(4, 6)) - 1, Number(normalized.slice(6, 8))), payoutMonthKey: null,
    autoPremiumRows: [{ ...row, rowId: `history-row-${index}`, commissionCode: commissionCode as string, basePremium: basePremium as number,
      premiumKind: String(commissionCode).startsWith("A") ? "auto_initial" as const : "auto_change" as const, validFrom: policyStart }],
  };
});
const contract: PremiumHistoryContract = { productKey: "cppAuto", frequencyRaw: "semiannual", inputAmount: 1145, policyStartDate: "2015-06-01" };
const legacy: ContractAutoPremiumStatementHistoryEntry = { key: "old-guess", premiumKind: "auto_change", statementId: "june", statementNumber: "75", statementPeriod: statements[0].period,
  statementDate: statements[0].statementDate, anniversaryNumber: 11, anniversaryDate: "2026-06-01", previousAnnualPremium: 2290, newAnnualPremium: 2536,
  newPremium: 1268, previousPremium: 1145, basePremiumPeriod: "annual", differenceAnnual: 246, rowId: "row", commissionCode: "B121", productCode: "CPP_ACPIII", writtenBy: owner, source: "own" };
const render = (history: ContractAutoPremiumStatementHistoryEntry[] = [legacy], resolutions: PremiumBaseResolution[] = [], extra = {}) => renderToStaticMarkup(createElement(ContractAutoPremiumHistory, {
  product: "cppAuto", viewerEmail: owner, contractNumber: row.contractNumber, policyStartDate: "2015-06-01", signedAnnualPremium: 2290,
  systemAnnualPremium: 2290, paymentFrequency: "semiannual", contractPaymentFrequency: "semiannual", statements,
  storedHistory: history, baseResolutions: resolutions, onResolveBase: async () => {}, ...extra,
})).replace(/\u00a0/g, " ");

describe("premium unit review in the contract detail", () => {
  const anniversaryStatement = (code: string, premium: number, year: number): ContractCommissionStatementSummary => ({
    id: `anniversary-${code}`, fileName: "synthetic.html", statementNumber: code, statementDate: `23.07.${year}`,
    period: `01.06.${year} - 30.06.${year}`, periodStartMs: Date.UTC(year, 5, 1), periodEndMs: Date.UTC(year, 5, 30),
    payoutMonthKey: null, autoPremiumRows: [{ ...row, rowId: code, commissionCode: code, basePremium: premium,
      validFrom: "12.06.2024", signedAt: "12.06.2024" }],
  });

  it("shows each evidenced unchanged anniversary once, excluding ordinary installments and unknown future years", () => {
    const html = render([], [], { paymentFrequency: "quarterly", contractPaymentFrequency: "quarterly",
      policyStartDate: "2024-06-12", signedAnnualPremium: 15552, signedAnnualPremiumOverride: 15552, systemAnnualPremium: 15552,
      statements: [anniversaryStatement("A101", 3888, 2024), anniversaryStatement("B101", 3888, 2025),
        anniversaryStatement("B102", 3888, 2025), anniversaryStatement("B105", 3888, 2026)] });
    expect(html).toContain("Historie pojistného");
    expect(html).toContain("2 záznamy");
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(html.match(/Beze změny/g)).toHaveLength(2);
    expect(html).toContain("1. výročí");
    expect(html).toContain("2. výročí");
    expect(html).not.toContain("3. výročí");
    expect(html).not.toContain("Pojistné zvýšeno");
    expect(html).not.toContain("Pojistné poníženo");
  });

  it("retains an earlier unchanged anniversary beside a saved later price change", () => {
    const html = render([{ key: "second-anniversary", premiumKind: "auto_change", source: "own",
      productCode: row.productCode, commissionCode: "B105",
      anniversaryNumber: 2, anniversaryDate: "2026-06-12", previousAnnualPremium: 15552, newAnnualPremium: 13036,
      previousPremium: 3888, newPremium: 3259, basePremiumPeriod: "payment" }], [], {
      paymentFrequency: "quarterly", contractPaymentFrequency: "quarterly", policyStartDate: "2024-06-12",
      signedAnnualPremium: 15552, signedAnnualPremiumOverride: 15552, systemAnnualPremium: 15552,
      statements: [anniversaryStatement("A102", 3888, 2024), anniversaryStatement("B101", 3888, 2025)],
    });
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(html).toContain("Beze změny");
    expect(html).toContain("Pojistné poníženo");
    expect(html.indexOf("1. výročí")).toBeLessThan(html.indexOf("2. výročí"));
    expect(html).toContain("13.036,00 Kč ročně");
    expect(html).toContain("-2.516,00 Kč ročně");
  });

  it("shows an unchanged anniversary recorded in history even without currently loaded statement rows", () => {
    const html = render([{ key: "unchanged", premiumKind: "auto_change", anniversaryNumber: 1,
      anniversaryDate: "2023-03-14", previousAnnualPremium: 6098, newAnnualPremium: 6098,
      basePremiumPeriod: "annual" }], [], { statements: [], signedAnnualPremium: 6098, systemAnnualPremium: 6098 });
    expect(html).toContain("1 záznam");
    expect(html).toContain("1. výročí");
    expect(html).toContain("Beze změny");
    expect(html).toContain("Pojistné při výročí");
  });

  it("shows a saved combined B102 basis as annual and uses it for the next premium comparison", () => {
    const combined = anniversaryStatement("B102", 8000, 2025);
    const next = anniversaryStatement("B103", 4200, 2026);
    const source = { ...combined.autoPremiumRows![0], statementId: combined.id, statementNumber: combined.statementNumber,
      statementDate: combined.statementDate, statementPeriod: combined.period, statementOwnerEmail: owner };
    const history: ContractAutoPremiumStatementHistoryEntry[] = [{
      key: "combined", premiumKind: "auto_change", statementId: combined.id, statementNumber: combined.statementNumber,
      rowId: "B102", commissionCode: "B102", productCode: row.productCode, source: "own", writtenBy: owner,
      basePremiumResolutionKey: premiumBaseSourceKey(source, contract), combinedInstallmentCode: "B101",
      sourceBasePremium: 8000, basePremiumPeriod: "annual", newAnnualPremium: 8000, previousAnnualPremium: 8000,
      newPremium: 4000, previousPremium: 4000, anniversaryNumber: 1, anniversaryDate: "2025-06-12",
    }];
    const html = render(history, [], { statements: [combined, next], policyStartDate: "2024-06-12",
      signedAnnualPremium: 8000, signedAnnualPremiumOverride: 8000, systemAnnualPremium: 8000 });
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(html).toContain("Beze změny");
    expect(html).toContain("8.400,00 Kč ročně");
    expect(html).toContain("+400,00 Kč ročně");
    expect(html.match(/<article[\s\S]*?<\/article>/g)?.join("")).not.toContain("16.000,00 Kč");
  });

  it("compares the corrected second anniversary with the annual B102 base before a history rebuild", () => {
    const start = "2023-03-21";
    const payouts = [
      { code: "B102", amount: 960, sourceBaseAmount: 8000, payoutMonthKey: "2024-10" },
      { code: "B101", amount: 500, sourceBaseAmount: 4200, payoutMonthKey: "2025-5" },
      { code: "B103", amount: 500, sourceBaseAmount: 4200, payoutMonthKey: "2025-10" },
    ].map(payout => ({ ...payout, statementId: `anniversary-${payout.code}`, status: "paid", writtenBy: owner }));
    const commissionPayouts = projectConfirmedCommissionCodes({ ...contract, policyStartDate: start, inputAmount: 4000,
      items: [{ title: "Následná provize", code: "B101", amount: 480 }] }, payouts);
    const sourceStatements = payouts.map(payout => {
      const statement = anniversaryStatement(payout.code, payout.sourceBaseAmount, Number(payout.payoutMonthKey.slice(0, 4)));
      return { ...statement, autoPremiumRows: [{ ...statement.autoPremiumRows[0], commission: payout.amount }] };
    });
    const html = render([], [], { statements: sourceStatements, commissionPayouts, policyStartDate: start,
      signedAnnualPremium: 8000, systemAnnualPremium: 8000 });
    const anniversary = html.match(/<article[\s\S]*?<\/article>/g)?.find(article => article.includes("2. výročí"));
    expect(anniversary).toContain("B101 → B103");
    expect(anniversary).toContain("8.000,00 Kč ročně");
    expect(anniversary).toContain("8.400,00 Kč ročně");
    expect(anniversary).toContain("+400,00 Kč ročně");
    expect(anniversary).not.toContain("16.000,00 Kč");
  });

  it("derives the overview's initial annual premium from A101/A102 frequency payments", () => {
    expect(initialAnnualPremiumFromStatementRows({
      contractNumber: row.contractNumber, product: "cppAuto", frequency: "semiannual",
      statements: historicalStatementRows,
    })).toBe(6098);
  });
  it("automatically rebuilds the initial premium and anniversary changes from frequency payments", () => {
    const staleInitialEstimate = { ...legacy, statementId: "history-8", rowId: "history-row-8", commissionCode: "B107",
      anniversaryNumber: 4, anniversaryDate: "2026-03-14", previousAnnualPremium: 2290, newAnnualPremium: 1983,
      previousPremium: 1145, newPremium: 1983, basePremiumPeriod: "annual" as const };
    const html = render([staleInitialEstimate], [], {
      contractNumber: row.contractNumber, statements: historicalStatementRows, policyStartDate: "2022-03-14",
      signedAnnualPremium: 2290, systemAnnualPremium: 2290,
    });
    expect(html).toContain("Základny určené automaticky");
    expect(html).toContain("6.098,00 Kč ročně");
    expect(html).toContain("3.966,00 Kč ročně");
    expect(html).not.toContain("Čeká na ověření");
    expect(html).toContain("Pojistné poníženo");
    expect(html).toContain("-2.696,00 Kč ročně");
    expect(html).toContain("228,00 Kč ročně");
    expect(html).toContain("4 záznamy");
  });
  it.each([["payment", "5.072,00", "+190,00"], ["annual", "2.536,00", "+95,00"]] as const)("shows one confirmed anniversary for %s units", (period, annual, delta) => {
    let working = contract;
    for (const statement of statements) {
      const source = { ...statement.autoPremiumRows[0], statementId: statement.id, statementNumber: statement.statementNumber,
        statementPeriod: statement.period, statementDate: statement.statementDate, statementOwnerEmail: owner };
      const confirmation: PremiumBaseResolution = { ...source, key: premiumBaseSourceKey(source, contract), productKey: "cppAuto", frequencyRaw: "semiannual", period,
        confirmedAtMs: 1, confirmedBy: owner, writtenBy: owner, statementChronologyMs: statement.id === "june" ? Date.UTC(2026, 6, 23) : Date.UTC(2025, 11, 15), payoutMonthKey: null };
      working = { ...working, ...confirmedPremiumHistoryPatch(working, confirmation, 2) };
    }
    const html = render(working.premiumStatementHistory as ContractAutoPremiumStatementHistoryEntry[], working.premiumStatementBaseResolutions ?? []);
    expect(html).not.toContain("Čeká na ověření");
    expect(html).toContain(`${annual} Kč ročně`); expect(html).toContain(`${delta} Kč ročně`);
    expect(html.match(/<article/g)).toHaveLength(1);
  });
  it("does not give a read-only viewer confirmation buttons that write", () => {
    const html = render([], [], { onResolveBase: undefined });
    expect(html.match(/disabled=""/g)).toHaveLength(4);
  });
  it("does not offer a per-payment override for Allianz annual statement bases", () => {
    const allianzContract = { ...contract, productKey: "allianzAuto" as const };
    const source = { ...row, productKey: "allianzAuto" as const, frequencyRaw: "semiannual" as const };
    const html = renderToStaticMarkup(createElement(PremiumBaseReview, {
      items: [{ source, basis: resolveAutoPremiumBasis(source, allianzContract) }],
    }));
    expect(html).toContain("Je to za celý rok");
    expect(html).not.toContain("Je to za jednu platbu");
  });
});
