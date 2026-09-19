import { describe, expect, it } from "vitest";
import { matchesStatementHistorySearch, statementHistoryPeriod, statementPayoutTitle } from "./statementHistoryPresentation";
import type { SavedCommissionStatement } from "./statementTypes";

const statement: SavedCommissionStatement = {
  id: "history-76", fileName: "vypis-76.html", statementNumber: "76",
  statementDate: "24.08.2026", period: "01.07.2026 - 31.07.2026",
  payoutMonthKey: "2026-8", processedAtMs: Date.UTC(2026, 8, 14),
};

describe("statement history payout labels", () => {
  it.each(["2026-8", "2026-08"])("shows August payout separately from July earnings with key %s", (payoutMonthKey) => {
    expect(statementPayoutTitle({ ...statement, payoutMonthKey })).toBe("Výplata Srpen 2026");
    expect(statementHistoryPeriod(statement)).toBe("Za období 01.07. – 31.07.2026");
  });
  it("uses the stored payout month before issue or processing dates", () => {
    expect(statementPayoutTitle({ ...statement, payoutMonthKey: "2026-09" })).toBe("Výplata Září 2026");
  });
  it.each([null, "2026-13", "unknown"])("falls back to the issue date for a missing or invalid key %s", (payoutMonthKey) => {
    expect(statementPayoutTitle({ ...statement, payoutMonthKey })).toBe("Výplata Srpen 2026");
  });
  it("uses the month following the earnings period for legacy statements, including a new year", () => {
    expect(statementPayoutTitle({ ...statement, payoutMonthKey: null, statementDate: null,
      period: "01.12.2025 - 31.12.2025" })).toBe("Výplata Leden 2026");
  });
  it("retains both years for a period spanning a year boundary", () => {
    expect(statementHistoryPeriod({ ...statement, period: "15. 12. 2025 – 15. 01. 2026" }))
      .toBe("Za období 15.12.2025 – 15.01.2026");
  });
  it("uses saved period timestamps when the period text is absent", () => {
    const legacy = { ...statement, period: null, payoutMonthKey: null, statementDate: null,
      periodStartMs: new Date(2026, 6, 1, 12).getTime(), periodEndMs: new Date(2026, 6, 31, 12).getTime() };
    expect(statementHistoryPeriod(legacy)).toBe("Za období 01.07. – 31.07.2026");
    expect(statementPayoutTitle(legacy)).toBe("Výplata Srpen 2026");
  });
  it("does not invent a payout date from the upload date or mislabel the payout month as the earnings period", () => {
    const missing = { id: "missing", fileName: "old.html", processedAtMs: statement.processedAtMs };
    expect(statementPayoutTitle(missing)).toBe("Výplata bez data");
    expect(statementHistoryPeriod({ ...missing, payoutMonthKey: "2026-8" })).toBe("Období neuvedeno");
  });
});

describe("statement history search", () => {
  const paid = { ...statement, payoutTotal: 26956 };
  it.each(["", "  ", "2026", "Srpen", "SRPEN 2026", "8/2026", "08/2026", "08.2026", "2026-08", "26956", "26 956", "26 956,00 Kč", "26.956,00", "2026 srpen 26956"])
    ("finds a payout by year, month or amount: %s", (query) => {
      expect(matchesStatementHistorySearch(paid, query)).toBe(true);
    });
  it("searches without accents", () => {
    expect(matchesStatementHistorySearch({ ...paid, payoutMonthKey: "2026-09" }, "zari")).toBe(true);
  });
  it.each(["2025", "červenec", "září", "neznámé", "200000", "2025 srpen"])
    ("excludes unrelated payouts, including the earnings and upload months: %s", (query) => {
      expect(matchesStatementHistorySearch(paid, query)).toBe(false);
    });
  it("matches signed amounts and leaves missing amounts unknown", () => {
    expect(matchesStatementHistorySearch({ ...paid, payoutTotal: -4500.25 }, "-4500,25")).toBe(true);
    expect(matchesStatementHistorySearch({ ...paid, payoutTotal: null }, "26956")).toBe(false);
  });
});
