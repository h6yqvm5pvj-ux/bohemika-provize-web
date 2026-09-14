import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractAutoPremiumHistory } from "./ContractAutoPremiumHistory";
import { premiumBaseSourceKey, type PremiumBaseResolution } from "@/app/lib/autoPremiumBasis";
import { confirmedPremiumHistoryPatch, type PremiumHistoryContract } from "@/app/api/commission-statements/premiumHistory";
import type { ContractAutoPremiumStatementHistoryEntry, ContractCommissionStatementSummary } from "./contractDetailTypes";

const owner = "owner@example.test";
const row = { rowId: "row", contractNumber: "999000111", client: null, productCode: "CPP_ACPIII", productKey: "cppAuto" as const,
  commissionCode: "B121", basePremium: 2536, commission: 268.82, signedAt: "02.04.2015", validFrom: "01.06.2015", source: "own" as const };
const statements: ContractCommissionStatementSummary[] = [
  { id: "june", fileName: "june.html", statementNumber: "75", statementDate: "23.07.2026", period: "01.06.2026 - 30.06.2026", periodStartMs: null, periodEndMs: null, payoutMonthKey: null, autoPremiumRows: [row] },
  { id: "november", fileName: "november.html", statementNumber: "67", statementDate: "15.12.2025", period: "01.11.2025 - 30.11.2025", periodStartMs: null, periodEndMs: null, payoutMonthKey: null, autoPremiumRows: [{ ...row, commissionCode: "B120", basePremium: 2441 }] },
];
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
  it("quarantines the old annual guess and offers both interpretations without two price increases", () => {
    const html = render();
    expect(html).toContain("Čeká na ověření");
    expect(html).toContain("2.536,00 Kč ročně"); expect(html).toContain("5.072,00 Kč ročně");
    expect(html).not.toContain("Pojistné zvýšeno");
    expect(html).not.toContain("2 změny");
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
});
