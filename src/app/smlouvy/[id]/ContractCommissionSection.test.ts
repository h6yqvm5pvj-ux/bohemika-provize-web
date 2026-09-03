import { describe, expect, it } from "vitest";

import {
  payoutDifferenceAmountFromRecords,
  payoutStatusForCodes,
  stornoPayoutAmountFromRecords,
} from "./ContractCommissionSection";
import type { ContractCommissionPayout } from "./contractDetailTypes";

describe("contract commission payout display helpers", () => {
  it("keeps a small commission pending when no payout was recorded", () => {
    const state = payoutStatusForCodes([], ["A101"], 9.12);

    expect(state.status).toBe("pending");
    expect(state.paidAmount).toBe(0);
    expect(state.records).toEqual([]);
  });

  it("marks a small commission as paid when its payout was recorded", () => {
    const payouts: ContractCommissionPayout[] = [
      {
        code: "A101",
        amount: 9.12,
        expectedAmount: 9.12,
        difference: 0,
        status: "paid",
      },
    ];

    const state = payoutStatusForCodes(payouts, ["A101"], 9.12);

    expect(state.status).toBe("paid");
    expect(state.paidAmount).toBe(9.12);
  });

  it("does not compare multiple matching installments with one installment amount", () => {
    const payouts: ContractCommissionPayout[] = [
      {
        code: "A101",
        amount: 175.18,
        expectedAmount: 175.18,
        difference: 0,
        status: "paid",
      },
      {
        code: "A102",
        amount: 175.18,
        expectedAmount: 175.18,
        difference: 0,
        status: "paid",
      },
    ];

    const state = payoutStatusForCodes(
      payouts,
      ["A101", "A102"],
      175.18
    );

    expect(state.status).toBe("paid");
    expect(state.paidAmount).toBe(350.36);
    expect(
      payoutDifferenceAmountFromRecords({
        expectedAmount: 175.18,
        paidAmount: state.paidAmount,
        records: state.records,
      })
    ).toBeNull();
  });

  it("keeps the total of real installment differences visible", () => {
    const payouts: ContractCommissionPayout[] = [
      {
        code: "A101",
        amount: 150,
        expectedAmount: 175.18,
        difference: -25.18,
        differenceReason: "commission_amount_mismatch",
        status: "difference",
      },
      {
        code: "A102",
        amount: 175.18,
        expectedAmount: 175.18,
        difference: 0,
        status: "paid",
      },
    ];

    const state = payoutStatusForCodes(
      payouts,
      ["A101", "A102"],
      175.18
    );

    expect(
      payoutDifferenceAmountFromRecords({
        expectedAmount: 175.18,
        paidAmount: state.paidAmount,
        records: state.records,
      })
    ).toBe(-25.18);
  });

  it("does not turn a later storno payout into a missing commission difference", () => {
    const payouts: ContractCommissionPayout[] = [
      {
        code: "A101",
        amount: 1384.94,
        expectedAmount: 1384.94,
        difference: 0,
        status: "paid",
        statementNumber: "64",
        statementPeriod: "01.08.2025 - 31.08.2025",
      },
      {
        code: "A101",
        amount: -170.47,
        expectedAmount: 1384.94,
        difference: -1555.41,
        differenceReason: "storno",
        status: "storno",
        statementNumber: "68",
        statementPeriod: "01.01.2026 - 31.01.2026",
      },
    ];

    const state = payoutStatusForCodes(payouts, ["A101"], 1384.94);

    expect(state.status).toBe("paid");
    expect(state.paidAmount).toBe(1384.94);
    expect(stornoPayoutAmountFromRecords(state.records)).toBe(-170.47);
    expect(
      payoutDifferenceAmountFromRecords({
        expectedAmount: 1384.94,
        paidAmount: state.paidAmount,
        records: state.records,
      })
    ).toBeNull();
  });

  it("keeps real non-storno commission differences visible", () => {
    const payouts: ContractCommissionPayout[] = [
      {
        code: "A101",
        amount: 1000,
        expectedAmount: 1384.94,
        difference: -384.94,
        differenceReason: "commission_amount_mismatch",
        status: "difference",
      },
    ];

    const state = payoutStatusForCodes(payouts, ["A101"], 1384.94);

    expect(state.status).toBe("partial");
    expect(
      payoutDifferenceAmountFromRecords({
        expectedAmount: 1384.94,
        paidAmount: state.paidAmount,
        records: state.records,
      })
    ).toBe(-384.94);
  });

  it("counts a corrected payout from the replacement after the original is fully deducted", () => {
    const payouts: ContractCommissionPayout[] = [
      {
        code: "A101",
        amount: 1501.38,
        expectedAmount: 1643.81,
        difference: -142.43,
        differenceReason: "career_mismatch",
        status: "difference",
        career: "Kar. 106",
        statementNumber: "65",
      },
      {
        code: "A101",
        amount: -1501.38,
        expectedAmount: 1643.81,
        difference: -3145.19,
        differenceReason: "storno",
        status: "storno",
        career: "Kar. 106",
        statementNumber: "75",
      },
      {
        code: "A101",
        amount: 1643.81,
        expectedAmount: 1643.81,
        difference: 0,
        status: "paid",
        career: "Kar. 107",
        statementNumber: "75",
      },
    ];

    const state = payoutStatusForCodes(payouts, ["A101"], 1643.81);

    expect(state.status).toBe("paid");
    expect(state.paidAmount).toBe(1643.81);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]?.amount).toBe(1643.81);
    expect(stornoPayoutAmountFromRecords(state.records)).toBeNull();
    expect(
      payoutDifferenceAmountFromRecords({
        expectedAmount: 1643.81,
        paidAmount: state.paidAmount,
        records: state.records,
      })
    ).toBeNull();
  });
});
