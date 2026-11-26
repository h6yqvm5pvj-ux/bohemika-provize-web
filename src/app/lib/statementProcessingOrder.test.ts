import { describe, expect, it } from "vitest";
import { batchOrderProblem, firstStatementRecommendation, statementOrderDate } from "./statementProcessingOrder";

describe("statement periods", () => {
  it.each([
    [Date.UTC(2026, 0, 1), "01.01.2026 – 31.01.2026 (výplata únor 2026)"],
    [Date.UTC(2024, 1, 1), "01.02.2024 – 29.02.2024 (výplata březen 2024)"],
    [Date.UTC(2026, 11, 1), "01.12.2026 – 31.12.2026 (výplata leden 2027)"],
  ] as const)("formats the recommended period %i and its payout month", (month, text) => {
    expect(firstStatementRecommendation(month)).toBe(`Začni výpisem za období ${text}.`);
  });

  it("orders by the period end, accepts equal days and blocks undated or reversed periods", () => {
    const january = statementOrderDate({ period: "01.01.2026 - 31.01.2026", statementDate: "23.02.2026" });
    expect(january).toBe(Date.UTC(2026, 0, 31));
    const state = { latest: january, earliestUnfinished: null, firstMonth: null };
    expect(batchOrderProblem([january, Date.UTC(2026, 2, 31)], state)).toBeNull();
    expect(batchOrderProblem([Date.UTC(2025, 11, 31)], state)).toContain("předchází");
    expect(batchOrderProblem([statementOrderDate({ period: "31.01.2026 - 01.01.2026" })], state)).toContain("nelze určit");
  });
});
