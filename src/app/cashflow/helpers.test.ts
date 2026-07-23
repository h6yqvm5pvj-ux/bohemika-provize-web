import { describe, expect, it } from "vitest";

import {
  applyStatementMissingPayoutShifts,
  calculateStornoFund,
  matchesProductFilter,
  productLabel,
} from "./helpers";
import type { CashflowItem } from "./types";

const subscriptionPayment = (): CashflowItem => ({
  id: "subscription-user@example.com___payment-1",
  date: new Date("2026-07-20T10:00:00.000Z"),
  amount: 1590,
  productKey: "subscription",
  note: "Pololetní předplatné",
  frequency: null,
  source: "own",
  contractNumber: null,
  clientName: "Jan Novák",
  ownerEmail: null,
  entryId: null,
  commissionLabel: "Platba předplatného",
  isSubscriptionPayment: true,
  subscriptionPlan: "semiannual",
  subscriptionUserEmail: "jan.novak@example.com",
  subscriptionUserName: "Jan Novák",
  subscriptionPeriodFrom: "2026-07-01",
  subscriptionPeriodUntil: "2026-12-31",
  payoutStatus: "paid",
});

describe("cashflow subscription payments", () => {
  it("labels and filters subscription payments separately from insurance products", () => {
    expect(productLabel("subscription")).toBe("Platba předplatného");
    expect(matchesProductFilter("subscription", "subscription")).toBe(true);
    expect(matchesProductFilter("subscription", "all")).toBe(true);
    expect(matchesProductFilter("subscription", "life")).toBe(false);
    expect(matchesProductFilter("neon", "subscription")).toBe(false);
  });

  it("keeps subscription payments out of the STORNO fund", () => {
    const items: CashflowItem[] = [
      subscriptionPayment(),
      {
        ...subscriptionPayment(),
        id: "neon-commission",
        amount: 1000,
        productKey: "neon",
        isSubscriptionPayment: false,
        payoutStatus: "predicted",
      },
    ];

    expect(calculateStornoFund(items)).toBe(150);
  });

  it("does not shift subscription payments by missing commission statements", () => {
    const item = subscriptionPayment();
    const shifted = applyStatementMissingPayoutShifts({
      cashflowItems: [item],
      statementsByMonthKey: {
        "2026-7": [{
          id: "statement-1",
          fileName: "statement.html",
          statementNumber: "1",
          statementDate: "2026-07-31",
          period: "07/2026",
          advisorNumber: null,
          periodStartMs: null,
          periodEndMs: null,
          statementDateMs: null,
          payoutMonthKey: "2026-7",
          paidContractNumbers: ["SML-1"],
          paidCommissionKeys: [],
          commissionTotal: 1000,
          payoutTotal: 1000,
          otherPaymentsTotal: 0,
          managerCommissionTotal: 0,
          createdAtMs: null,
          updatedAtMs: null,
        }],
      },
      enabled: true,
    });

    expect(shifted).toEqual([item]);
  });
});
