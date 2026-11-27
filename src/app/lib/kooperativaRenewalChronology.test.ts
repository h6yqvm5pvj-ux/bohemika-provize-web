import { describe, expect, it } from "vitest";
import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";
import { projectConfirmedCommissionCodes } from "./commissionPayoutCodeAdjustment";
import { projectConfirmedPremiumHistory } from "./commissionPremiumCodeAdjustment";
import { filterStatementDerivedContractDataForViewer } from "@/app/api/contracts/_lib/contractsApi.statementVisibility";

const owner = "owner@example.test";
const entry = { id: "synthetic", productKey: "kooperativaAuto", source: "own", userEmail: owner,
  policyStartDate: "2022-02-15", frequencyRaw: "semiannual", entryType: "contract",
  items: [{ title: "Okamžitá provize", amount: 100, code: "A101" }, { title: "Následná provize", amount: 100, code: "B101", excludeFromTotal: true }],
} satisfies EntryDoc;
const receipt = (code: string, period: string, amount: number) => ({ code, statementPeriod: period, amount,
  key: `${code}-${period}-${amount}`, statementId: period.replace(/\D/g, ""), writtenBy: owner, status: amount < 0 ? "storno" : "paid",
  payoutMonthKey: period.slice(-4) + "-" + Number(period.slice(-7, -5)), expectedAmount: amount });
const rows = [
  receipt("A101", "01.02.2022 - 28.02.2022", 20), receipt("A102", "01.08.2022 - 31.08.2022", 30),
  receipt("C101", "01.02.2023 - 28.02.2023", 40), receipt("C102", "01.07.2023 - 31.07.2023", 41),
  receipt("C103", "01.02.2024 - 29.02.2024", 42), receipt("B101", "01.08.2024 - 31.08.2024", 43),
];
const codes = (payouts: typeof rows) => projectConfirmedCommissionCodes(entry, payouts).map(row => row.code);

describe("Kooperativa Auto chronological renewal installments", () => {
  it("allocates six actual payments to six contractual periods, preserving immutable statement identity", () => {
    const input = structuredClone(rows);
    const plan = projectConfirmedCommissionCodes(entry, rows);
    expect(plan.map(r => r.code)).toEqual(["A101", "A102", "C101", "C102", "C103", "B104"]);
    expect(plan.at(-1)).toMatchObject({ ...rows[5], code: "B104", statementCode: "B101" });
    expect(codes([...rows].reverse()).reverse()).toEqual(plan.map(r => r.code));
    expect(projectConfirmedCommissionCodes(entry, plan)).toEqual(plan);
    expect(rows).toEqual(input);
    const contract = { ...entry, commissionPayouts: rows };
    const viewer = (viewerEmail: string) => filterStatementDerivedContractDataForViewer({ contract, viewerEmail, teamEmails: [], ownerEmail: owner });
    expect(viewer("unrelated@example.test").commissionPayouts).toEqual([]);
    for (const c of [contract, viewer(owner)]) {
      const paid = generateCashflow([c], 1, owner, new Date(2024, 11, 1)).filter(r => r.payoutStatus === "paid");
      expect(paid.map(r => [r.commissionPeriodStart, r.amount])).toEqual([
        ["2022-02-15", 20], ["2022-08-15", 30], ["2023-02-15", 40], ["2023-08-15", 41], ["2024-02-15", 42], ["2024-08-15", 43],
      ]);
    }
  });
  it("keeps missing installments open, follows another restart and reads the statement period before the payout month", () => {
    const later = { ...rows[5], payoutMonthKey: "2025-2" };
    const restart = receipt("C101", "01.02.2025 - 28.02.2025", 44);
    expect(codes([rows[2], later, restart])).toEqual(["C101", "B104", "B105"]);
    expect(codes([later])).toEqual(["B101"]);
    expect(codes([rows[2], { ...later, statementPeriod: "invalid" }])).toEqual(["C101", "B101"]);
  });
  it("assigns a two-month-late restart to the next half year when both preceding installments are documented", () => {
    const later = receipt("B101", "01.04.2024 - 30.04.2024", 53);
    const sequence = [rows[2], rows[3], later];
    expect(codes(sequence)).toEqual(["C101", "C102", "B103"]);
    expect(codes([...sequence].reverse())).toEqual(["B103", "C102", "C101"]);
    const settled = generateCashflow([{ ...entry, commissionPayouts: sequence }], 1, owner, new Date(2024, 11, 1))
      .filter(row => row.payoutStatus === "paid");
    expect(settled.map(row => [row.commissionPeriodStart, row.amount])).toEqual([
      ["2023-02-15", 40], ["2023-08-15", 41], ["2024-02-15", 53],
    ]);
    const reversal = receipt("B101", "01.09.2024 - 30.09.2024", -53);
    expect(codes([...sequence, reversal]).at(-1)).toBe("B103");
  });
  it("requires a dated statement and a unique half-year period for the longer delay", () => {
    const later = receipt("B101", "01.04.2024 - 30.04.2024", 53);
    expect(codes([rows[2], later]).at(-1)).toBe("B101");
    expect(codes([rows[3], later]).at(-1)).toBe("B101");
    expect(codes([rows[2], rows[3], { ...later, statementPeriod: "" }]).at(-1)).toBe("B101");
    expect(codes([rows[2], rows[3], receipt("B101", "01.05.2024 - 31.05.2024", 53)]).at(-1)).toBe("B101");
    const changed = { ...entry, paymentFrequencyChanges: [{ effectiveDate: "2024-06-15", frequency: "quarterly" as const }] };
    expect(projectConfirmedCommissionCodes(changed, [rows[2], rows[3], later]).at(-1)?.code).toBe("B101");
  });
  it("requires independent evidence for the same recipient and leaves competing same-period rows alone", () => {
    expect(codes([{ ...rows[2], writtenBy: "other@example.test" }, rows[5]])).toEqual(["C101", "B101"]);
    expect(codes([...rows, { ...rows[5], code: "C104" }]).slice(-2)).toEqual(["B101", "C104"]);
    for (const patch of [{ entryType: "endorsement" }, { productKey: "cppAuto" as const }]) {
      expect(projectConfirmedCommissionCodes({ ...entry, ...patch }, rows)).toEqual(rows);
    }
  });
  it("keeps a reversal with its original payment, even when the correction arrives much later", () => {
    const reversal = receipt("B101", "01.02.2025 - 28.02.2025", -43);
    expect(codes([...rows, reversal]).at(-1)).toBe("B104");
    const sameAmountElsewhere = receipt("B101", "01.02.2023 - 28.02.2023", 43);
    expect(codes([...rows, sameAmountElsewhere, reversal]).at(-1)).toBe("B101");
  });
  it("uses actual frequency changes and excludes a midyear reset from anniversary premium history", () => {
    const changed = { ...entry, paymentFrequencyChanges: [{ effectiveDate: "2023-08-15", frequency: "quarterly" as const }] };
    const after = receipt("B101", "01.11.2023 - 30.11.2023", 43);
    expect(projectConfirmedCommissionCodes(changed, [rows[2], after]).at(-1)?.code).toBe("B103");
    const record = { premiumKind: "auto_change", commissionCode: after.code, statementPeriod: after.statementPeriod,
      writtenBy: owner, newAnnualPremium: 1000, anniversaryDate: "2023-02-15", anniversaryNumber: 1 };
    expect(projectConfirmedPremiumHistory(changed, [record], [rows[2], after])).toEqual([]);
  });
});
