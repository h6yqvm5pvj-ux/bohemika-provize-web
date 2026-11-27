import { describe, expect, it } from "vitest";
import { matchFlexiIncreaseByCommission, matchLifeStatementEntry } from "./lifeStatementMatching";

const family = [
  { id: "root", entryType: "contract", policyStartDate: "2024-01-01" },
  { id: "one", entryType: "endorsement", policyStartDate: "2025-05-01", premiumDelta: 100 },
  { id: "two", entryType: "endorsement", policyStartDate: "2025-09-01", premiumDelta: 100 },
];

describe("life statement row assignment", () => {
  it.each([["01.05.2025", "one"], ["01.09.2025", "two"]])("distinguishes equal increases effective %s", (validFrom, id) => {
    expect(matchLifeStatementEntry(family, { commissionCode: "NV101", baseAmount: 1200, validFrom })?.id).toBe(id);
  });
  it("keeps the original's B row separate from an NV row in the same statement", () => {
    expect(matchLifeStatementEntry(family, { commissionCode: "B101", baseAmount: 12000, validFrom: "01.01.2024" })?.id).toBe("root");
    expect(matchLifeStatementEntry(family, { commissionCode: "NB0301", baseAmount: 1200, validFrom: "01.05.2025" })?.id).toBe("one");
  });
  it.each([undefined, "", "31.02.2025", "01.03.2025"])("never guesses between equal increases with date %s", validFrom => {
    expect(matchLifeStatementEntry(family, { commissionCode: "NV101", baseAmount: 1200, validFrom })).toBeNull();
  });
  it("requires the increase base and refuses future or unrelated amendments", () => {
    expect(matchLifeStatementEntry(family, { commissionCode: "NV101", baseAmount: 2400, validFrom: "01.05.2025" })).toBeNull();
  });
  it("does not silently move an original-coded B mismatch to an increase with the same premium base", () => {
    expect(matchLifeStatementEntry(family, { commissionCode: "B102", baseAmount: 1200, validFrom: "01.01.2024" })?.id).toBe("root");
  });

  describe("month-dated NEON increase payouts", () => {
    const amendment = { ...family[1], productKey: "neon", policyStartDate: "2025-05-17" };
    const row = { commissionCode: "NV101", baseAmount: 1200, commission: 100, validFrom: "01.05.2025", signedAt: "01.05.2025" };
    const statementEnd = "2025-05-31";
    it.each(["NV101", "NB0301"])("matches %s by the annual increase within the reported month", commissionCode => {
      expect(matchLifeStatementEntry([amendment, family[2]], { ...row, commissionCode }, statementEnd)).toBe(amendment);
    });
    it.each([
      { baseAmount: 600 }, { baseAmount: null }, { signedAt: "07.05.2025" }, { validFrom: "02.05.2025" },
      { validFrom: "01.06.2025", signedAt: "01.06.2025" }, { commissionCode: "A101" },
      { commissionCode: "NB3601" }, { commission: -100 }, { status: "storno" },
    ])("requires corroborating statement data %j", changes => {
      expect(matchLifeStatementEntry([amendment], { ...row, ...changes }, statementEnd)).toBeNull();
    });
    it.each(["NV101", "NB0301"])("prioritizes the exact effective date for %s even when another increase matches the base and signature", commissionCode => {
      const exact = { ...amendment, id: "exact", policyStartDate: "2025-05-01", contractSignedDate: "2025-04-22" };
      const later = { ...amendment, contractSignedDate: "2025-05-01" };
      for (const entries of [[later, exact], [exact, later]]) {
        expect(matchLifeStatementEntry(entries, { ...row, commissionCode }, statementEnd)).toBe(exact);
      }
    });
    it("leaves the payout unresolved when the exact effective date conflicts with the annual increase", () => {
      const exact = { ...amendment, id: "exact", policyStartDate: "2025-05-01", premiumDelta: 200 };
      expect(matchLifeStatementEntry([amendment, exact], row, statementEnd)).toBeNull();
    });
    it("leaves two same-month increases unresolved when neither effective date matches", () => {
      const other = { ...amendment, id: "other", policyStartDate: "2025-05-21" };
      expect(matchLifeStatementEntry([amendment, other], row, statementEnd)).toBeNull();
    });
    it("requires an effective amendment by the statement date and limits this rule to NEON", () => {
      expect(matchLifeStatementEntry([amendment], row, "2025-05-10")).toBeNull();
      expect(matchLifeStatementEntry([amendment], row)).toBeNull();
      expect(matchLifeStatementEntry([{ ...amendment, productKey: "flexi" }], row, statementEnd)).toBeNull();
    });
  });
});

describe("FLEXI increase matching without a statement base", () => {
  const entries = family.map(entry => ({
    ...entry, productKey: "flexi",
    items: [{ code: "A101", title: "Provize A101", amount: 100 },
      { code: "B0301", title: "Provize B0301", amount: entry.id === "one" ? 25 : 30 }],
  }));
  const nv = { commissionCode: "NV101", baseAmount: 0, commission: 100, validFrom: "01.01.2024" };
  const nb = { commissionCode: "NB0301", baseAmount: null, commission: 24.99 };

  it("uses all components to distinguish endorsements with an equal NV payout", () => {
    expect(matchFlexiIncreaseByCommission(entries, [nv])).toBeNull();
    expect(matchFlexiIncreaseByCommission(entries, [nv, nb])?.id).toBe("one");
  });

  it("keeps duplicate components, a conflicting endorsement date and explicit bases out of the fallback", () => {
    expect(matchFlexiIncreaseByCommission(entries, [nv, nv, nb])).toBeNull();
    expect(matchFlexiIncreaseByCommission(entries, [{ ...nv, validFrom: "01.09.2025" }, nb])).toBeNull();
    expect(matchFlexiIncreaseByCommission(entries, [{ ...nv, baseAmount: 3600 }, nb])).toBeNull();
  });
});
