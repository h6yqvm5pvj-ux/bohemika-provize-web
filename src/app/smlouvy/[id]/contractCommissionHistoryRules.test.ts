import { describe, expect, it } from "vitest";

import type { ContractCommissionPayout } from "./contractDetailTypes";
import {
  partitionSettledCommissionPayouts,
  simplifyCorrectedCommissionPayouts,
} from "./contractCommissionHistoryRules";

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

  it("collapses an exact payout and reversal without a same-code replacement", () => {
    const rows = correctedContractPayouts().filter(
      (row) => row.key !== "correct-a101"
    );

    expect(simplifyCorrectedCommissionPayouts(rows).map((row) => row.key)).toEqual([
      "paid-a102",
    ]);
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

  it("keeps a replacement under another commission code active", () => {
    const rows = correctedContractPayouts().map((row) =>
      row.key === "correct-a101" ? { ...row, code: "B101" } : row
    );

    expect(simplifyCorrectedCommissionPayouts(rows).map((row) => row.key)).toEqual([
      "paid-a102",
      "correct-a101",
    ]);
  });

  it("does not consume an unrelated payment made before the reversal", () => {
    const rows = correctedContractPayouts().map((row) =>
      row.key === "correct-a101"
        ? {
            ...row,
            statementId: "statement-70",
            statementChronologyMs: 1_770_000_000_000,
          }
        : row
    );

    expect(simplifyCorrectedCommissionPayouts(rows).map((row) => row.key)).toEqual([
      "paid-a102",
      "correct-a101",
    ]);
  });

  it("reduces contract 3259608168 to its final A102 payout", () => {
    const rows: ContractCommissionPayout[] = [
      payout({
        key: "first-a101",
        amount: 106.79,
        expectedAmount: 106.85,
        difference: -0.06,
        statementChronologyMs: 1,
      }),
      payout({
        key: "reverse-first-a101",
        amount: -106.79,
        differenceReason: "storno",
        status: "storno",
        statementChronologyMs: 2,
      }),
      payout({
        key: "replacement-a101",
        amount: 213.58,
        differenceReason: "premium_base_mismatch",
        status: "difference",
        statementChronologyMs: 2,
      }),
      payout({
        key: "reverse-replacement-a101",
        amount: -213.58,
        differenceReason: "storno",
        status: "storno",
        statementChronologyMs: 3,
      }),
      payout({
        key: "final-a102",
        code: "A102",
        amount: 74.26,
        differenceReason: "premium_base_mismatch",
        status: "difference",
        statementChronologyMs: 3,
      }),
    ];

    const result = partitionSettledCommissionPayouts(rows);

    expect(result.activePayouts.map((row) => row.key)).toEqual(["final-a102"]);
    expect(result.settledCorrections).toHaveLength(2);
    expect(
      result.settledCorrections.map(({ payment, reversal }) => [
        payment.key,
        reversal.key,
      ])
    ).toEqual([
      ["first-a101", "reverse-first-a101"],
      ["replacement-a101", "reverse-replacement-a101"],
    ]);
  });

  it("keeps a partial reversal visible", () => {
    const rows = [
      payout({ key: "payment", amount: 100, statementChronologyMs: 1 }),
      payout({
        key: "partial-reversal",
        amount: -40,
        differenceReason: "storno",
        status: "storno",
        statementChronologyMs: 2,
      }),
    ];

    expect(partitionSettledCommissionPayouts(rows)).toEqual({
      activePayouts: rows,
      settledCorrections: [],
    });
  });
});
