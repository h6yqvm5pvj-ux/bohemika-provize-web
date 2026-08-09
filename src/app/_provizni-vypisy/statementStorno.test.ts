import { describe, expect, it } from "vitest";

import {
  groupStornoItemsByContract,
  groupStornoRowsByContract,
  stornoSystemUncertainty,
} from "./statementStorno";
import type {
  OtherPayment,
  StornoCommissionRow,
} from "./statementTypes";

const stornoRow = (overrides: Partial<StornoCommissionRow> = {}): StornoCommissionRow => ({
  id: "row-1",
  detailUrl: null,
  contractNumber: "123 456",
  signedAt: "01. 05. 2026",
  client: "Jana Nováková",
  role: "",
  product: "KOO_AUTO",
  type: "A101",
  statusCode: "STORNO",
  base: 1_000,
  percent: "10",
  career: "Kar. 3",
  commission: -10.111,
  reserveFund: 1.111,
  ...overrides,
});

const otherPayment = (overrides: Partial<OtherPayment> = {}): OtherPayment => ({
  description: "Vratka provize",
  contractNumber: "123456",
  amount: -3.333,
  isB36Half: false,
  isStorno: true,
  ...overrides,
});

describe("storno helpers", () => {
  it("groups statement rows by normalized contract number and rounds their totals", () => {
    const groups = groupStornoRowsByContract([
      stornoRow(),
      stornoRow({ id: "row-2", contractNumber: "123456", commission: -2.222, reserveFund: -0.222 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      contractNumber: "123 456",
      totalCommission: -12.33,
      totalReserveFund: 0.89,
    });
  });

  it("merges statement stornos and other payments for the same contract", () => {
    const groups = groupStornoItemsByContract([stornoRow()], [otherPayment()]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      totalCommission: -10.11,
      totalOtherPayments: -3.33,
      totalAmount: -13.44,
    });
    expect(groups[0].payments[0]).toMatchObject({ index: 0, description: "Vratka provize" });
  });

  it("keeps no-contract rows separate and flags unavailable or active system matches", () => {
    const groups = groupStornoItemsByContract(
      [stornoRow({ id: "first", contractNumber: "" }), stornoRow({ id: "second", contractNumber: "" })],
      []
    );

    expect(groups).toHaveLength(2);
    expect(stornoSystemUncertainty({ status: "not_found", contracts: [] })).toBe(true);
    expect(
      stornoSystemUncertainty({
        status: "matched",
        contracts: [{ id: "active", adviserEmail: "a@example.com", status: "active" }],
      })
    ).toBe(true);
    expect(
      stornoSystemUncertainty({
        status: "matched",
        contracts: [{ id: "storno", adviserEmail: "a@example.com", status: "storno" }],
      })
    ).toBe(false);
  });
});
