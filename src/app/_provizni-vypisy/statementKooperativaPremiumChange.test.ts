import { describe, expect, it } from "vitest";
import { statementKooperativaPremiumChange } from "./statementKooperativaPremiumChange";
import type { CommissionRow, MatchedSystemContract, OtherProductContractPreview } from "./statementTypes";

const row = (type: string, base: number, commission = 100): CommissionRow => ({
  id: `${type}-${base}`, type, base, commission, product: "KOO_NAMIRU", career: "7", percent: "60 %",
  contractNumber: "SYNTHETIC", client: "Testovací klient", signedAt: "01.05.2023", validFrom: "03.05.2023",
  role: "Z", reserveFund: 0, detailUrl: null, lifeSplitKind: "unknown", lifeSplitLabel: "",
});
const system: MatchedSystemContract = { id: "synthetic", adviserEmail: "owner@example.test", productKey: "kooperativaAuto",
  frequencyRaw: "semiannual", policyStartDate: "2023-05-03", inputAmount: 1000 };
const source = (rows: CommissionRow[]): OtherProductContractPreview => ({ key: "synthetic", contractNumber: "SYNTHETIC",
  client: "Testovací klient", signedAt: "01.05.2023", validFrom: "03.05.2023", rows, b36Payments: [] });

describe("Kooperativa C premium changes by policy year", () => {
  it.each([
    ["annual", "C102", 1], ["semiannual", "C103", 2], ["quarterly", "C105", 4], ["monthly", "C113", 12],
  ] as const)("assigns %s %s to the second annual anniversary and annualizes the payment base", (frequencyRaw, code, payments) => {
    const result = statementKooperativaPremiumChange(source([row(code, 1100)]), { ...system, frequencyRaw });
    expect(result).toMatchObject({ status: "resolved", confirmedAnniversary: true, anniversaryNumber: 2,
      previousAnnualPremium: 1000 * payments, annualPremium: 1100 * payments, paymentPremium: 1100, warning: null });
    if (result?.status === "resolved") expect(result.anniversaryDate.getFullYear()).toBe(2025);
  });

  it.each([false, true])("compares consecutive policy years independently of source row order (%s)", reverse => {
    const rows = [row("C101", 1100), row("C102", 1100), row("C103", 1200), row("C104", 1200)];
    const contract = source(reverse ? [...rows].reverse() : rows);
    const before = structuredClone(contract);
    expect(statementKooperativaPremiumChange(contract, system)).toMatchObject({ status: "resolved", confirmedAnniversary: true,
      anniversaryNumber: 2, previousAnnualPremium: 2200, annualPremium: 2400, paymentPremium: 1200, warning: null });
    expect(contract).toEqual(before);
  });

  it("normalizes an annual quoted base and a per-payment base to the same change", () => {
    for (const base of [1100, 2200]) {
      expect(statementKooperativaPremiumChange(source([row("C101", base)]), system)).toMatchObject({
        status: "resolved", annualPremium: 2200, paymentPremium: 1100, previousAnnualPremium: 2000, confirmedAnniversary: true,
      });
    }
  });

  it("does not infer an increase from a higher commission with an unchanged premium base", () => {
    expect(statementKooperativaPremiumChange(source([row("C101", 1000, 999)]), system)).toMatchObject({
      status: "resolved", previousAnnualPremium: 2000, annualPremium: 2000, warning: null,
    });
  });

  it.each([["semiannual", "C102"], ["quarterly", "C104"], ["monthly", "C112"]] as const)(
    "does not label the %s %s midyear installment as a new anniversary price", (frequencyRaw, code) => {
      expect(statementKooperativaPremiumChange(source([row(code, 1100)]), { ...system, frequencyRaw }))
        .toMatchObject({ status: "resolved", confirmedAnniversary: false, anniversaryNumber: 1, warning: expect.stringContaining("uvnitř pojistného roku") });
    });

  it("flags conflicting bases in one policy year instead of inventing two annual increases", () => {
    expect(statementKooperativaPremiumChange(source([row("C101", 1100), row("C102", 1200)]), system))
      .toMatchObject({ status: "resolved", confirmedAnniversary: false, warning: expect.stringContaining("jednom pojistném roce") });
  });

  it("retains the original increase after processing and corroborates later installments with saved history", () => {
    expect(statementKooperativaPremiumChange(source([row("C104", 1200)]), { ...system, effectiveInputAmount: 1200,
      premiumStatementHistory: [{ premiumKind: "auto_change", anniversaryDate: "2025-05-03", previousAnnualPremium: 2200,
        newAnnualPremium: 2400, basePremiumPeriod: "payment", previousPremium: 1100, newPremium: 1200 }],
    })).toMatchObject({ status: "resolved", confirmedAnniversary: true, previousAnnualPremium: 2200, annualPremium: 2400 });
  });

  it("uses historical prices for the relevant anniversary rather than a newer price", () => {
    expect(statementKooperativaPremiumChange(source([row("C103", 1200)]), { ...system, effectiveInputAmount: 1500,
      premiumStatementHistory: [
        { premiumKind: "auto_change", anniversaryDate: "2024-05-03", previousAnnualPremium: 2000, newAnnualPremium: 2200 },
        { premiumKind: "auto_change", anniversaryDate: "2026-05-03", previousAnnualPremium: 2400, newAnnualPremium: 3000 },
      ],
    })).toMatchObject({ status: "resolved", previousAnnualPremium: 2200, annualPremium: 2400 });
  });

  it("ignores commission reversals and requires a known product, frequency and policy start", () => {
    expect(statementKooperativaPremiumChange(source([row("C103", 9999, -100)]), system)).toBeNull();
    expect(statementKooperativaPremiumChange(source([row("C103", 1100)]), { ...system, productKey: "cppAuto" })).toBeNull();
    expect(statementKooperativaPremiumChange(source([row("C103", 1100)]), { ...system, frequencyRaw: null }))
      .toMatchObject({ status: "unavailable", warning: expect.any(String) });
    expect(statementKooperativaPremiumChange({ ...source([row("C103", 1100)]), validFrom: "" }, { ...system, policyStartDate: null }))
      .toMatchObject({ status: "unavailable" });
  });

  it("clamps the anniversary of a leap-day policy", () => {
    const result = statementKooperativaPremiumChange(source([row("C101", 1100)]), { ...system, policyStartDate: "2024-02-29" });
    if (result?.status !== "resolved") throw new Error("Expected a resolved schedule");
    expect([result.anniversaryDate.getFullYear(), result.anniversaryDate.getMonth() + 1, result.anniversaryDate.getDate()]).toEqual([2025, 2, 28]);
  });
});
