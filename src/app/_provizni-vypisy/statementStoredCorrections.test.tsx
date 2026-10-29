import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { extendStatementCorrectionsWithStoredHistory } from "./statementStoredCorrections";
import { statementDiscrepancyKey } from "./statementDiscrepancies";
import { commissionRowCorrectionKey } from "./statementParsing";
import { statementContractReview } from "./statementContractReview";
import { filterStatementBrowserItems } from "./StatementContractBrowser";
import { StatementContractHeader } from "./StatementContractHeader";
import { StatementCorrectionWarning } from "./statementWarnings";
import type { CommissionRow, ContractCommissionPayoutRecord, ContractMatchesByNumber, ParsedStatement, StatementCorrectionContext } from "./statementTypes";

const writer = "advisor@example.test";
const row: CommissionRow = {
  id: "1", contractNumber: "SYNTHETIC-1", product: "CPP_NEON", type: "B3601", base: 12000,
  career: "6", percent: "10 %", commission: 1000, reserveFund: 150, detailUrl: null,
  signedAt: "01.01.2020", validFrom: "01.01.2020", client: "Testovací klient", role: "Z",
  lifeSplitKind: "b3601", lifeSplitLabel: "Provize po třech letech",
};
const statement: ParsedStatement = {
  fileName: "synthetic-original.html", header: { statementNumber: "1", period: "01.01.2026 - 31.01.2026", statementDate: "20.02.2026", advisorNumber: "TEST" },
  commissionRows: [row], deductionRows: [], stornoRows: [], otherPayments: [], contractStatusRules: [],
  managerCommissions: [], lifeSplitContracts: [], otherProductContracts: [], unmatchedB36Payments: [], parseWarnings: [], payoutTotal: 1000,
};
const original: ContractCommissionPayoutRecord = {
  key: "original", code: "B3601", title: "CPP_NEON · B3601", amount: 1000, career: "6", writtenBy: writer,
  statementId: "source-1", statementNumber: "1", statementPeriod: statement.header.period, statementDate: statement.header.statementDate,
  statementChronologyMs: Date.UTC(2026, 0, 31), status: "difference", expectedAmount: 800,
};
const reversal: ContractCommissionPayoutRecord = {
  ...original, key: "reversal", amount: -1000, status: "storno", differenceReason: "storno",
  statementId: "source-2", statementNumber: "2", statementPeriod: "01.02.2026 - 28.02.2026", statementDate: "20.03.2026",
  statementChronologyMs: Date.UTC(2026, 1, 28),
};
const replacement: ContractCommissionPayoutRecord = {
  ...reversal, key: "replacement", amount: 800, expectedAmount: 800, difference: 0, career: "7", status: "paid", differenceReason: null,
};
const emptyContext = (): StatementCorrectionContext => ({ correctedRowKeys: new Set(), correctedRowLabels: new Map(), correctedRowDetails: new Map() });
const matches = (payouts: ContractCommissionPayoutRecord[] = [original, reversal, replacement]): ContractMatchesByNumber => ({
  "my:SYNTHETIC-1": { status: "matched", contracts: [{ id: "entry", adviserEmail: writer,
    productKey: "neon", contractNumber: row.contractNumber, commissionPayouts: payouts }] },
});
const options = () => ({ context: emptyContext(), statements: [statement], matchesByContractNumber: matches(), writerEmail: writer });
const key = commissionRowCorrectionKey(statementDiscrepancyKey(statement), row);
const noMatches: ContractMatchesByNumber = {};

describe("correction evidence from stored contract payout history", () => {
  it("recognizes a later reversal and replacement when only the original statement is open", () => {
    const input = options();
    const before = structuredClone(input);
    const result = extendStatementCorrectionsWithStoredHistory(input);
    expect(result.correctedRowKeys.has(key)).toBe(true);
    expect(result.correctedRowLabels.get(key)).toBe("Opraveno navazujícím výpisem");
    const detail = result.correctedRowDetails.get(key)!.replaceAll("\u00a0", " ");
    expect(detail).toContain("1 000,00 Kč");
    expect(detail).toContain("800,00 Kč ve výpisu č. 2");
    expect(detail).toContain("Původní Kar. 6, nová Kar. 7");
    expect(input).toEqual(before);
  });

  it("supports the selected stored document ID and normalizes the history writer", () => {
    const input = options();
    input.matchesByContractNumber = matches([original, reversal, replacement].map(item => ({ ...item, writtenBy: ` ${writer.toUpperCase()} ` })));
    expect(extendStatementCorrectionsWithStoredHistory({ ...input, statementIdsByKey: { [statementDiscrepancyKey(statement)]: "source-1" } }).correctedRowKeys.has(key)).toBe(true);
    expect(extendStatementCorrectionsWithStoredHistory({ ...input, statementIdsByKey: { [statementDiscrepancyKey(statement)]: "other-source" } }).correctedRowKeys.size).toBe(0);
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber: matches([{ ...original, statementNumber: "different" }, reversal, replacement]),
      statementIdsByKey: { [statementDiscrepancyKey(statement)]: "source-1" } }).correctedRowKeys.size).toBe(0);
  });

  it("preserves correction evidence from the currently loaded statement batch", () => {
    const context = emptyContext();
    context.correctedRowKeys.add("batch-row"); context.correctedRowLabels.set("batch-row", "Oprava kariérního stupně");
    context.correctedRowDetails.set("batch-row", "Doloženo načteným výpisem.");
    const result = extendStatementCorrectionsWithStoredHistory({ ...options(), context });
    expect(result.correctedRowKeys).toEqual(new Set(["batch-row", key]));
    expect(result.correctedRowDetails.get("batch-row")).toBe("Doloženo načteným výpisem.");
    expect(context.correctedRowKeys).toEqual(new Set(["batch-row"]));
  });

  it.each([
    [original, replacement], [original, reversal], [reversal, replacement],
    [original, { ...reversal, amount: -500 }, replacement],
    [original, reversal, { ...replacement, statementId: "unrelated-statement" }],
    [original, reversal, { ...replacement, status: "difference", differenceReason: "commission_amount_mismatch" }],
    [original, reversal, { ...replacement, amount: Number.NaN }],
    [original, reversal, { ...replacement, amount: 1000, career: "6" }],
    [original, { ...reversal, career: "8" }, replacement],
    [original, { ...reversal, statementPeriod: "01.12.2025 - 31.12.2025", statementChronologyMs: Date.UTC(2025, 11, 31) }, replacement],
  ])("does not clear a row without a complete and consistent correction chain: %j", (...payouts) => {
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber: matches(payouts) }).correctedRowKeys.size).toBe(0);
  });

  it.each([
    { writerEmail: null }, { writerEmail: "other@example.test" },
    { matchesByContractNumber: noMatches },
    { matchesByContractNumber: { "my:SYNTHETIC-1": { status: "error" as const, contracts: [], error: "History unavailable" } } },
  ])("does not infer corrections from missing or unrelated account evidence: %j", patch => {
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), ...patch }).correctedRowKeys.size).toBe(0);
  });

  it.each(["code", "product", "writer", "statement", "base"])("keeps an original with an unrelated %s unresolved", field => {
    const patched = { ...original,
      ...(field === "code" ? { code: "B4801" } : {}),
      ...(field === "product" ? { title: "CPP_NRF_LF · B3601" } : {}),
      ...(field === "writer" ? { writtenBy: "other@example.test" } : {}),
      ...(field === "statement" ? { statementNumber: "different" } : {}),
      ...(field === "base" ? { statementBaseAmount: 24000 } : {}),
    };
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber: matches([patched, reversal, replacement]) }).correctedRowKeys.size).toBe(0);
  });

  it("does not infer corrections from an ambiguous contract family", () => {
    const ambiguous = matches();
    const match = ambiguous["my:SYNTHETIC-1"];
    if (match.status !== "matched") throw new Error("Invalid fixture");
    match.contracts.push({ ...match.contracts[0], id: "unrelated-entry", adviserEmail: "other@example.test" });
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber: ambiguous }).correctedRowKeys.size).toBe(0);
  });

  it("requires a unique original and a unique replacement rather than choosing by amount", () => {
    for (const payouts of [[original, { ...original, key: "duplicate-original" }, reversal, replacement],
      [original, reversal, replacement, { ...replacement, key: "duplicate-replacement", amount: 900 }]]) {
      expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber: matches(payouts) }).correctedRowKeys.size).toBe(0);
    }
    const duplicateRows = { ...statement, commissionRows: [row, { ...row, id: "2" }] };
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), statements: [duplicateRows] }).correctedRowKeys.size).toBe(0);
  });

  it("does not clear a row from conflicting copies of one stored payout key", () => {
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber:
      matches([original, { ...original, amount: 900 }, reversal, replacement]) }).correctedRowKeys.size).toBe(0);
  });

  it("keeps a row unresolved when the reversal could belong to another earlier payout", () => {
    const earlier = { ...original, key: "earlier", statementId: "earlier-source", statementNumber: "0",
      statementPeriod: "01.12.2025 - 31.12.2025", statementChronologyMs: Date.UTC(2025, 11, 31) };
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber:
      matches([earlier, original, reversal, replacement]) }).correctedRowKeys.size).toBe(0);
  });

  it("does not infer a reversal from a different known base or from import timestamps alone", () => {
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber:
      matches([{ ...original, statementBaseAmount: 12000 }, { ...reversal, statementBaseAmount: 24000 }, replacement]) }).correctedRowKeys.size).toBe(0);
    const unknownDates = [original, reversal, replacement].map((item, index) => ({ ...item, statementPeriod: null, statementDate: null,
      statementChronologyMs: null, writtenAtMs: Date.UTC(2026, index, 1) }));
    const unknownStatement = { ...statement, header: { ...statement.header, period: null, statementDate: null } };
    expect(extendStatementCorrectionsWithStoredHistory({ ...options(), statements: [unknownStatement], matchesByContractNumber: matches(unknownDates),
      statementIdsByKey: { [statementDiscrepancyKey(unknownStatement)]: "source-1" } }).correctedRowKeys.size).toBe(0);
  });

  it("follows a repeated correction to the final active paid replacement", () => {
    const laterReversal = { ...replacement, key: "later-reversal", amount: -800, status: "storno", differenceReason: "storno",
      statementId: "source-3", statementNumber: "3", statementPeriod: "01.03.2026 - 31.03.2026", statementDate: "20.04.2026", statementChronologyMs: Date.UTC(2026, 2, 31) };
    const final = { ...laterReversal, key: "final", amount: 900, expectedAmount: 900, status: "paid", differenceReason: null };
    const result = extendStatementCorrectionsWithStoredHistory({ ...options(), matchesByContractNumber: matches([original, reversal, replacement, laterReversal, final]) });
    expect(result.correctedRowKeys.has(key)).toBe(true);
    expect(result.correctedRowDetails.get(key)).toContain("900,00 Kč ve výpisu č. 3");
  });

  it("shows the resolved badge and removes the original from unresolved and wrong-commission filters", () => {
    const correction = extendStatementCorrectionsWithStoredHistory(options());
    const activeRows = statement.commissionRows.filter(item => !correction.correctedRowKeys.has(commissionRowCorrectionKey(statementDiscrepancyKey(statement), item)));
    expect(activeRows).toEqual([]);
    const review = statementContractReview({ matched: true, unpaired: false, comparisons: [], issueCount: 0,
      hasWarnings: true, corrected: correction.correctedRowKeys.has(key) });
    const item = { key: "contract", searchText: "Testovací klient", amount: 1000, issueCount: 0, unpaired: false, review };
    expect(filterStatementBrowserItems([item], "", "issues")).toEqual([]);
    expect(filterStatementBrowserItems([item], "", "commission-error")).toEqual([]);
    const html = renderToStaticMarkup(createElement(StatementContractHeader, { client: "Testovací klient", contractNumber: row.contractNumber,
      products: "NEON", commission: 1000, badges: "", expanded: false, onToggle: () => {}, verified: review.verified, reviewSummary: review.summary }));
    expect(html).toContain("Opraveno navazujícím výpisem");
    expect(html).toContain('data-tone="ok"');
    const warning = renderToStaticMarkup(createElement(StatementCorrectionWarning, { label: correction.correctedRowLabels.get(key)!, details: [correction.correctedRowDetails.get(key)!] }));
    expect(warning).toContain("border-emerald-200");
    expect(warning).not.toContain("Pozor:");
  });
});
