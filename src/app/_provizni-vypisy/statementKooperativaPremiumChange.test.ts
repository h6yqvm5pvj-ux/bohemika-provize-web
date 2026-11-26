import { describe, expect, it } from "vitest";
import { statementKooperativaPremiumChange } from "./statementKooperativaPremiumChange";
import type { CommissionRow, MatchedSystemContract, OtherProductContractPreview } from "./statementTypes";

const row = (type: string, commission: number, base = 1000): CommissionRow => ({
  id: `${type}-${commission}`, type, base, commission, product: "KOO_NAMIRU", career: "7", percent: "60 %",
  contractNumber: "SYNTHETIC", client: "Testovací klient", signedAt: "01.05.2023", validFrom: "03.05.2023",
  role: "Z", reserveFund: 0, detailUrl: null, lifeSplitKind: "unknown", lifeSplitLabel: "",
});
const system: MatchedSystemContract = { id: "synthetic", adviserEmail: "owner@example.test", productKey: "kooperativaAuto",
  frequencyRaw: "semiannual", policyStartDate: "2023-05-03", contractSignedDate: "2023-05-01", position: "poradce7", inputAmount: 1000 };
const source = (rows: CommissionRow[]): OtherProductContractPreview => ({ key: "synthetic", contractNumber: "SYNTHETIC",
  client: "Testovací klient", signedAt: "01.05.2023", validFrom: "03.05.2023", rows, b36Payments: [] });

describe("Kooperativa renewal premium derived from the commission", () => {
  it.each([
    ["annual", "C102", 1], ["semiannual", "C103", 2], ["quarterly", "C105", 4], ["monthly", "C113", 12],
  ] as const)("assigns %s %s to the second anniversary and annualizes the derived payment", (frequencyRaw, code, payments) => {
    expect(statementKooperativaPremiumChange(source([row(code, 92.84)]), { ...system, frequencyRaw }))
      .toMatchObject({ anniversaryNumber: 2, previousAnnualPremium: 1000 * payments,
        annualPremium: 1100 * payments, paymentPremium: 1100, anniversaryDate: "2025-05-03" });
  });

  it.each([false, true])("uses the previous anniversary payment and ignores later installments in the same year (%s)", reverse => {
    const rows = [row("C101", 92.84), row("C102", 106.51), row("C103", 101.28), row("C104", 76.98)];
    const contract = source(reverse ? [...rows].reverse() : rows);
    expect(statementKooperativaPremiumChange(contract, system)).toMatchObject({
      anniversaryNumber: 2, previousAnnualPremium: 2200, annualPremium: 2400, paymentPremium: 1200,
    });
  });

  it("derives a decrease even when the reported base is higher than the original premium", () => {
    expect(statementKooperativaPremiumChange(source([row("C101", 75.96, 1500)]), system))
      .toMatchObject({ previousAnnualPremium: 2000, annualPremium: 1800, paymentPremium: 900 });
  });

  it.each([
    [row("C102", 101.28)],
    [row("C101", -101.28)],
    [row("C101", 92.84), row("B101", 101.28)],
    [{ ...row("C101", 101.28), career: "8" }],
  ])("requires one positive anniversary payment with the applicable career position", (...rows) => {
    expect(statementKooperativaPremiumChange(source(rows), system)).toBeNull();
  });

  it("uses the previous saved premium and ignores future history", () => {
    expect(statementKooperativaPremiumChange(source([row("C103", 101.28)]), { ...system, effectiveInputAmount: 1500,
      premiumStatementHistory: [
        { premiumKind: "auto_change", anniversaryDate: "2024-05-03", previousAnnualPremium: 2000, newAnnualPremium: 2200 },
        { premiumKind: "auto_change", anniversaryDate: "2026-05-03", previousAnnualPremium: 2400, newAnnualPremium: 3000 },
      ],
    })).toMatchObject({ previousAnnualPremium: 2200, annualPremium: 2400 });
  });

  it("uses the saved policy start and clamps a leap-day anniversary", () => {
    expect(statementKooperativaPremiumChange(source([row("C101", 92.84)]), { ...system, policyStartDate: "2024-02-29" }))
      .toMatchObject({ anniversaryDate: "2025-02-28" });
  });

  it("uses the frequency applicable at the anniversary", () => {
    expect(statementKooperativaPremiumChange(source([row("C103", 92.84)]), { ...system,
      paymentFrequencyChanges: [{ effectiveDate: "2025-05-03", frequency: "annual" }],
    })).toMatchObject({ anniversaryDate: "2025-05-03", annualPremium: 1100 });
  });
});
