import { describe, expect, it } from "vitest";

import type { ContractCommissionPayout } from "./contractDetailTypes";
import { simplifyCorrectedCommissionPayouts } from "./contractCommissionHistoryRules";

const payout = (
  overrides: Partial<ContractCommissionPayout>
): ContractCommissionPayout => ({
  key: "payout",
  code: "A101",
  amount: 708.56,
  expectedAmount: 708.56,
  difference: 0,
  differenceReason: null,
  status: "paid",
  statementId: "statement",
  statementChronologyMs: 1,
  writtenBy: "jakub.rauscher@bohemika.eu",
  ...overrides,
});

const correctedContractPayouts = (): ContractCommissionPayout[] => [
  payout({
    key: "wrong-a101",
    amount: 651.36,
    difference: -57.2,
    differenceReason: "career_mismatch",
    status: "difference",
    statementId: "statement-65",
    statementChronologyMs: 1_761_177_600_000,
  }),
  payout({
    key: "paid-a102",
    code: "A102",
    statementId: "statement-73",
    statementChronologyMs: 1_779_408_000_000,
  }),
  payout({
    key: "storno-wrong-a101",
    amount: -651.36,
    difference: -1_359.92,
    differenceReason: "storno",
    status: "storno",
    statementId: "statement-75",
    statementChronologyMs: 1_784_764_800_000,
  }),
  payout({
    key: "correct-a101",
    statementId: "statement-75",
    statementChronologyMs: 1_784_764_800_000,
  }),
];

describe("simplifyCorrectedCommissionPayouts", () => {
  it("collapses the resolved correction from contract 0034388834", () => {
    const result = simplifyCorrectedCommissionPayouts(correctedContractPayouts());

    expect(result.map((row) => row.key)).toEqual(["paid-a102", "correct-a101"]);
    expect(result.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)).toBeCloseTo(
      1_417.12,
      2
    );
  });

  it("keeps the audit trail when the replacement payment is missing", () => {
    const rows = correctedContractPayouts().filter(
      (row) => row.key !== "correct-a101"
    );

    expect(simplifyCorrectedCommissionPayouts(rows)).toEqual(rows);
  });

  it("keeps the audit trail when the reversal is missing", () => {
    const rows = correctedContractPayouts().filter(
      (row) => row.key !== "storno-wrong-a101"
    );

    expect(simplifyCorrectedCommissionPayouts(rows)).toEqual(rows);
  });

  it("does not use a reversal with a different amount", () => {
    const rows = correctedContractPayouts().map((row) =>
      row.key === "storno-wrong-a101" ? { ...row, amount: -500 } : row
    );

    expect(simplifyCorrectedCommissionPayouts(rows)).toEqual(rows);
  });

  it("does not use a correct amount paid under another commission code", () => {
    const rows = correctedContractPayouts().map((row) =>
      row.key === "correct-a101" ? { ...row, code: "B101" } : row
    );

    expect(simplifyCorrectedCommissionPayouts(rows)).toEqual(rows);
  });

  it("does not use a payment made before the reversal", () => {
    const rows = correctedContractPayouts().map((row) =>
      row.key === "correct-a101"
        ? {
            ...row,
            statementId: "statement-70",
            statementChronologyMs: 1_770_000_000_000,
          }
        : row
    );

    expect(simplifyCorrectedCommissionPayouts(rows)).toEqual(rows);
  });
});
