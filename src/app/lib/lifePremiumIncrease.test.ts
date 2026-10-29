import { describe, expect, it } from "vitest";
import { confirmedLifeStatementChange, currentConfirmedLifePremium, lifeIncreaseExpectedAmount, matchesLifePremiumIncrease, type LifeStatementPremiumChange } from "./lifePremiumIncrease";

const change: LifeStatementPremiumChange = { key: "change", statementId: "source", statementNumber: "10", statementPeriod: "01.01.2026 - 31.01.2026",
  statementDate: "20.02.2026", productCode: "CPP_NEON", annualIncrease: 1548, previousMonthlyPremium: 2350,
  newMonthlyPremium: 2479, effectiveDate: "2026-01-01", writtenBy: "advisor@example.test", confirmedAtMs: 1 };

describe("life premium increases", () => {
  it("uses confirmed premiums only after their effective date and preserves a newer endorsement's premium", () => {
    expect(currentConfirmedLifePremium([change], "2025-12-31")).toBeNull();
    expect(currentConfirmedLifePremium([change], "2026-01-01")).toEqual(change);
    expect(currentConfirmedLifePremium([change], "2026-10-28", "2026-02-01")).toBeNull();
    const later = { ...change, key: "later", effectiveDate: "2026-02-01", newMonthlyPremium: 2600 };
    expect(currentConfirmedLifePremium([later, change], "2026-10-28")).toEqual(later);
    expect(currentConfirmedLifePremium([change, { ...change, key: "conflict", newMonthlyPremium: 2500 }], "2026-01-01")).toBeNull();
  });
  it("never uses an original contract's full commission as the expectation for an increase", () => {
    expect(matchesLifePremiumIncrease({ entryType: "contract", premiumDelta: 129 }, 1548)).toBe(false);
    expect(matchesLifePremiumIncrease({ entryType: "endorsement", premiumDelta: -129 }, 1548)).toBe(false);
    expect(matchesLifePremiumIncrease({ entryType: "endorsement", premiumDelta: 300 }, 1548)).toBe(false);
    expect(matchesLifePremiumIncrease({ entryType: "endorsement", premiumDelta: 129 }, 1548)).toBe(true);
  });
  it("compares each NV/NB code only with its corresponding endorsement item", () => {
    const items = [{ code: "A101", title: "A101", amount: 620.9 }, { code: "B0301", title: "B0301", amount: 158.1 },
      { code: "TOTAL", title: "Celkem", amount: 779 }];
    expect(lifeIncreaseExpectedAmount(items, ["NV101", "NB0301"])).toBe(779);
    expect(lifeIncreaseExpectedAmount(items, ["NB0301"])).toBe(158.1);
    expect(lifeIncreaseExpectedAmount(items.slice(0, 1), ["NV101", "NB0301"])).toBeNull();
    expect(lifeIncreaseExpectedAmount([{ title: "Okamžitá A101", amount: 620.9 }], ["NV101"])).toBe(620.9);
  });
  it("recognizes a confirmation by its source, including a re-upload of the same business statement", () => {
    const source = { statementId: "source", productCode: "CPP_NEON", annualIncrease: 1548 };
    expect(confirmedLifeStatementChange([change], source)).toEqual(change);
    expect(confirmedLifeStatementChange([change], { ...change, statementId: "new-hash" })).toEqual(change);
    expect(confirmedLifeStatementChange([change], { ...source, statementId: "other" })).toBeNull();
    expect(confirmedLifeStatementChange([change], { ...source, annualIncrease: 3000 })).toBeNull();
    expect(confirmedLifeStatementChange([change, { ...change, key: "ambiguous" }], source)).toBeNull();
  });
});
