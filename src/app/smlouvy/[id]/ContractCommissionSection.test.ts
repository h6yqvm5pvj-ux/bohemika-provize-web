import { describe, expect, it } from "vitest";

import {
  payoutDifferenceAmountFromRecords,
  payoutStatusForCodes,
  stornoPayoutAmountFromRecords,
} from "./ContractCommissionSection";
import type { ContractCommissionPayout } from "./contractDetailTypes";

describe("contract commission payout display helpers", () => {
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
});
