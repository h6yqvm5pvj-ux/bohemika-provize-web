import { describe, expect, it } from "vitest";

import {
  applyIntelligentCashflowPrediction,
  applyStatementMissingPayoutShifts,
  calculateStornoFund,
  INTELLIGENT_PREDICTION_CONFIG,
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

describe("intelligent cashflow prediction", () => {
  const baseCashflowItem = (overrides: Partial<CashflowItem> = {}): CashflowItem => ({
    id: "cashflow-1",
    date: new Date(2027, 6, 25),
    amount: 1000,
    productKey: "cppAuto",
    note: "následná provize",
    frequency: "annual",
    source: "own",
    contractNumber: "AUTO-1",
    clientName: "Jan Novák",
    ownerEmail: "jan.novak@example.com",
    entryId: "entry-1",
    payoutStatus: "predicted",
    policyStartDate: new Date(2026, 6, 1),
    ...overrides,
  });

  it("applies the auto premium growth model only to future predicted payouts", () => {
    const [predicted, paid] = applyIntelligentCashflowPrediction({
      enabled: true,
      today: new Date(2026, 6, 24),
      cashflowItems: [
        baseCashflowItem(),
        baseCashflowItem({
          id: "paid-auto",
          amount: 1000,
          payoutStatus: "paid",
        }),
      ],
    });

    expect(predicted.amount).toBe(
      Math.round(1000 * (1 + INTELLIGENT_PREDICTION_CONFIG.autoAnnualIncreaseRate))
    );
    expect(predicted.predictionAdjustment?.kind).toBe("autoPremiumGrowth");
    expect(paid.amount).toBe(1000);
    expect(paid.predictionAdjustment).toBeUndefined();
  });

  it("treats zamex as property cashflow and applies a revaluation review", () => {
    expect(matchesProductFilter("zamex", "property")).toBe(true);

    const [item] = applyIntelligentCashflowPrediction({
      enabled: true,
      today: new Date(2026, 6, 24),
      cashflowItems: [
        baseCashflowItem({
          productKey: "zamex",
          date: new Date(2028, 7, 25),
          amount: 2000,
          policyStartDate: new Date(2026, 6, 1),
        }),
      ],
    });

    expect(item.amount).toBe(
      Math.round(2000 * (1 + INTELLIGENT_PREDICTION_CONFIG.propertyReviewIncreaseRate))
    );
    expect(item.predictionAdjustment?.kind).toBe("propertyRevaluation");
  });

  it("adds a life review prediction for NEON with the current position and refresh base", () => {
    const items = applyIntelligentCashflowPrediction({
      enabled: true,
      today: new Date(2026, 6, 24),
      cashflowItems: [
        baseCashflowItem({
          id: "neon-life",
          productKey: "neon",
          amount: 1000,
          currentMonthlyPremium: 1000,
          inputAmount: 1000,
          predictionPosition: "manazer7",
          predictionCommissionMode: "standard",
          lifeRevisionBaseDate: new Date(2023, 6, 1),
          contractSignedDate: new Date(2023, 6, 1),
          policyStartDate: new Date(2023, 6, 1),
          durationYears: 15,
        }),
      ],
    });

    const reviewItem = items.find(
      (item) => item.predictionAdjustment?.kind === "lifePremiumReview"
    );

    expect(reviewItem).toBeTruthy();
    expect(reviewItem?.predictionAdjustment?.premiumDeltaMonthly).toBe(200);
    expect(reviewItem?.predictionAdjustment?.calculationMonthlyPremium).toBe(600);
    expect(reviewItem?.predictionAdjustment?.position).toBe("manazer7");
    expect(reviewItem?.note).toContain("predikovaná revize ŽP");
  });

  it("uses stored NEON refresh calculation base for a later predicted refresh", () => {
    const items = applyIntelligentCashflowPrediction({
      enabled: true,
      today: new Date(2026, 6, 24),
      cashflowItems: [
        baseCashflowItem({
          id: "neon-refresh-life",
          productKey: "neon",
          amount: 1000,
          currentMonthlyPremium: 1000,
          lifeStornoBaseMonthlyPremium: 600,
          predictionPosition: "manazer7",
          predictionCommissionMode: "standard",
          lifeRevisionBaseDate: new Date(2023, 6, 1),
          contractSignedDate: new Date(2023, 6, 1),
          policyStartDate: new Date(2023, 6, 1),
          durationYears: 15,
        }),
      ],
    });

    const reviewItem = items.find(
      (item) => item.predictionAdjustment?.kind === "lifePremiumReview"
    );

    expect(reviewItem).toBeTruthy();
    expect(reviewItem?.predictionAdjustment?.premiumDeltaMonthly).toBe(200);
    expect(reviewItem?.predictionAdjustment?.calculationMonthlyPremium).toBe(440);
  });

  it("predicts FLEXI life reviews only from the monthly premium increase", () => {
    const items = applyIntelligentCashflowPrediction({
      enabled: true,
      today: new Date(2026, 6, 24),
      cashflowItems: [
        baseCashflowItem({
          id: "flexi-life",
          productKey: "flexi",
          amount: 1000,
          currentMonthlyPremium: 1000,
          inputAmount: 1000,
          predictionPosition: "manazer7",
          predictionCommissionMode: "standard",
          lifeRevisionBaseDate: new Date(2023, 6, 1),
          contractSignedDate: new Date(2023, 6, 1),
          policyStartDate: new Date(2023, 6, 1),
          durationYears: 6,
        }),
      ],
    });

    const reviewItem = items.find(
      (item) => item.predictionAdjustment?.kind === "lifePremiumReview"
    );

    expect(reviewItem).toBeTruthy();
    expect(reviewItem?.predictionAdjustment?.premiumDeltaMonthly).toBe(200);
    expect(reviewItem?.predictionAdjustment?.calculationMonthlyPremium).toBe(200);
  });
});
