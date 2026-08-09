import { describe, expect, it } from "vitest";

import {
  lifeSplitCardSummary,
  otherProductCardSummary,
} from "./statementCardMath";
import type { CommissionRow } from "./statementTypes";

const row = (overrides: Partial<CommissionRow> = {}): CommissionRow => ({
  id: "row-1",
  detailUrl: null,
  contractNumber: "1234/AB",
  signedAt: "01. 01. 2026",
  validFrom: "01. 02. 2026",
  client: "Jana Nováková",
  role: "",
  product: "CPP_NRF_LF",
  type: "A101",
  base: 12_000,
  percent: "10",
  career: "Kar. 3",
  commission: 100,
  reserveFund: 5,
  lifeSplitKind: "a101",
  lifeSplitLabel: "A101",
  ...overrides,
});

describe("statement card math", () => {
  it("summarizes life split commissions, TIP and premium increases", () => {
    const summary = lifeSplitCardSummary({
      productCode: "CPP_NRF_LF",
      productLabel: "ČPP ŽP NEON",
      contractNumber: "1234/AB",
      client: "Jana Nováková",
      signedAt: "01. 01. 2026",
      validFrom: "01. 02. 2026",
      annualPremium: 24_000,
      rows: [
        row(),
        row({ id: "increase", lifeSplitKind: "increase", base: 3_600, commission: 35 }),
        row({ id: "tip", lifeSplitKind: "tip", base: 0, commission: 20 }),
      ],
      b36Payments: [
        {
          description: "B36",
          contractNumber: "1234/AB",
          amount: 15,
          isB36Half: true,
          isStorno: false,
        },
      ],
    });

    expect(summary).toEqual({
      total: 170,
      monthlyPremium: 2_000,
      tipCommission: 20,
      hasPremiumIncrease: true,
      premiumIncreaseAnnualBase: 3_600,
    });
  });

  it("summarizes general product card amounts and unknown commission codes", () => {
    const summary = otherProductCardSummary({
      key: "other-1",
      contractNumber: "5678/AB",
      client: "Petr Novák",
      signedAt: "01. 01. 2026",
      validFrom: "01. 02. 2026",
      rows: [
        row({ commission: 75, reserveFund: 3 }),
        row({
          id: "unknown",
          product: "NEZNAMY_PRODUKT",
          type: "XYZ",
          base: 0,
          commission: -5,
          reserveFund: 2,
        }),
      ],
      b36Payments: [
        {
          description: "B36",
          contractNumber: "5678/AB",
          amount: 10,
          isB36Half: true,
          isStorno: false,
        },
      ],
    });

    expect(summary).toEqual({
      totalCommission: 80,
      totalReserve: 5,
      hasUnknownCommissionCode: true,
      annualBase: 12_000,
      monthlyBase: 1_000,
    });
  });
});
