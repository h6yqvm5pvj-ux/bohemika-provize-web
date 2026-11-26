import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyIntelligentCashflowPrediction,
  applyStatementAutoPayouts,
  applyStatementMissingPayoutShifts,
  applyStatementPayoutTotalsToMonths,
  groupItemsByMonth,
  calculateStornoFund,
  dedupeCashflowCommissionStatements,
  filterPastItems,
  filterPastStatementMonths,
  INTELLIGENT_PREDICTION_CONFIG,
  matchesProductFilter,
  productLabel,
  statementPayoutTotal,
} from "./helpers";
import { buildCashflowView, type CashflowViewOptions } from "./buildCashflowView";
import type { CashflowCommissionStatementSummary, CashflowItem } from "./types";

const commissionStatement = (
  overrides: Partial<CashflowCommissionStatementSummary> = {}
): CashflowCommissionStatementSummary => ({
  id: "statement-first-hash",
  fileName: "vypis-15.html",
  statementNumber: "15",
  statementDate: "24.08.2026",
  period: "01.07.2026 - 31.07.2026",
  advisorNumber: "8680070421",
  periodStartMs: Date.UTC(2026, 6, 1),
  periodEndMs: Date.UTC(2026, 6, 31),
  statementDateMs: Date.UTC(2026, 7, 24),
  payoutMonthKey: "2026-8",
  paidContractNumbers: ["809801005"],
  paidCommissionKeys: ["809801005:A101"],
  commissionTotal: 2194,
  payoutTotal: 2194,
  otherPaymentsTotal: 0,
  managerCommissionTotal: 0,
  createdAtMs: 1,
  updatedAtMs: 1,
  ...overrides,
});

describe("cashflow calendar period", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5));
  });
  afterEach(() => vi.useRealTimers());

  it("retains past months of the current year while hiding older years", () => {
    const items: CashflowItem[] = [
      new Date(2025, 11, 31, 23, 59), new Date(2026, 0, 1),
      new Date(2026, 7, 25), new Date(2026, 8, 25), new Date(2027, 0, 1),
    ].map((date, index) => ({ id: String(index), date, amount: index * 100, productKey: "neon", ownerEmail: null, entryId: null }));
    expect(filterPastItems(items, false)).toEqual(items.slice(1));
    expect(filterPastItems(items, true)).toBe(items);
    vi.setSystemTime(new Date(2027, 0, 1));
    expect(filterPastItems(items, false)).toEqual([items[4]]);
  });

  it("retains January and previous monthly statements so their actual payouts remain available", () => {
    const statements = Object.fromEntries(["2025-12", "2026-1", "2026-8", "2026-9", "2027-1"].map((key) => [
      key, [commissionStatement({ id: key, payoutMonthKey: key })],
    ]));
    expect(Object.keys(filterPastStatementMonths(statements, false))).toEqual(["2026-1", "2026-8", "2026-9", "2027-1"]);
    expect(filterPastStatementMonths(statements, true)).toBe(statements);
    vi.setSystemTime(new Date(2027, 0, 1));
    expect(Object.keys(filterPastStatementMonths(statements, false))).toEqual(["2027-1"]);
  });
});

describe("cashflow commission statements", () => {
  it("keeps an unknown scheduled FLEXI amount open until an actual contract receipt is available", () => {
    const pending: CashflowItem = {
      id: "flexi-b0301", date: new Date(2026, 7, 25), amount: 0, amountUnknown: true,
      productKey: "flexi", ownerEmail: "owner@example.test", entryId: "renovation",
      contractNumber: "11111111", commissionCode: "B0301", payoutStatus: "predicted",
    };
    const items = applyStatementMissingPayoutShifts({
      cashflowItems: [pending], enabled: true,
      statementsByMonthKey: { "2026-8": [commissionStatement({
        paidContractNumbers: ["11111111"], paidCommissionKeys: ["11111111:B0301"],
      })] },
    });
    expect(items).toEqual([expect.objectContaining({
      amountUnknown: true, date: new Date(2026, 8, 25), originalDate: pending.date, payoutStatus: "shifted",
    })]);
  });

  it("keeps a partial payout balance pending when the statement already contains the paid portion", () => {
    const balance: CashflowItem = {
      id: "balance", date: new Date(2025, 2, 25), amount: 75, productKey: "neon",
      ownerEmail: "adviser@example.test", entryId: "root", contractNumber: "11111111",
      commissionCode: "B3601", isPartialPayoutBalance: true, payoutStatus: "predicted",
    };
    const result = applyStatementMissingPayoutShifts({
      cashflowItems: [balance], enabled: true,
      statementsByMonthKey: { "2025-3": [commissionStatement({
        paidContractNumbers: ["11111111"], paidCommissionKeys: ["11111111:B3601"],
        payoutMonthKey: "2025-3",
      })] },
    });
    expect(result).toEqual([expect.objectContaining({
      amount: 75, date: new Date(2025, 3, 25), originalDate: balance.date, payoutStatus: "shifted",
    })]);
  });

  it.each(["B101", "B102", null])("reconciles a NEON recurring line only with its matching statement code (%s)", code => {
    const forecast: CashflowItem = {
      id: "neon-follow-up", date: new Date(2026, 7, 25), amount: 35, productKey: "neon",
      ownerEmail: "adviser@example.test", entryId: "root", contractNumber: "11111111",
      policyStartDate: new Date(2024, 6, 1), commissionPeriodStart: "2026-07-01", commissionCode: "B101-B104",
      commissionCodeAliases: ["B101", "B102", "B103", "B104"],
    };
    const result = applyStatementMissingPayoutShifts({
      cashflowItems: [forecast], enabled: true,
      statementsByMonthKey: { "2026-8": [commissionStatement({
        paidContractNumbers: ["11111111"], paidCommissionKeys: code ? [`11111111:${code}`] : [],
      })] },
    });
    expect(result[0].payoutStatus).toBe(code === "B102" ? "paid" : "shifted");
  });

  it("counts a re-uploaded statement only once", () => {
    const statements = [
      commissionStatement(),
      commissionStatement({
        id: "statement-second-hash",
        fileName: "vypis-15-znovu.html",
        createdAtMs: 2,
        updatedAtMs: 2,
      }),
    ];

    expect(dedupeCashflowCommissionStatements(statements)).toEqual([statements[1]]);
    expect(statementPayoutTotal(statements)).toBe(2194);
  });

  it("keeps two different statement periods separate", () => {
    const statements = [
      commissionStatement(),
      commissionStatement({
        id: "statement-next-month",
        period: "01.08.2026 - 31.08.2026",
        statementDate: "24.09.2026",
        payoutTotal: 2500,
      }),
    ];

    expect(dedupeCashflowCommissionStatements(statements)).toHaveLength(2);
    expect(statementPayoutTotal(statements)).toBe(4694);
  });
});

describe("exact auto installments in cashflow statements", () => {
  const first: CashflowItem = {
    id: "b105", date: new Date(2026, 3, 25), amount: 570, productKey: "cppAuto",
    ownerEmail: "advisor@example.test", entryId: "policy", contractNumber: "123-456",
    source: "own", commissionCode: "B105", commissionPeriodStart: "2026-03-01",
  };
  const next: CashflowItem = {
    ...first, id: "b106", date: new Date(2026, 9, 25), commissionCode: "B106", commissionPeriodStart: "2026-09-01",
  };
  const receipt = { contractNumber: "123456", productKey: "cppAuto", source: "own", code: "B105", amount: 573.41 } as const;
  const statement = commissionStatement({
    payoutMonthKey: "2026-11", paidContractNumbers: ["123456"], paidCommissionKeys: ["123456:B105"],
    paidAutoInstallments: [receipt],
  });
  const options: CashflowViewOptions = { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
    showPastYears: false, intelligentPredictionEnabled: false, contractNumberQuery: "" };
  const asOf = new Date(2026, 10, 23);

  it("settles a late B105 across missing statements and keeps B106 pending in normal and filtered views", () => {
    const october = commissionStatement({ id: "october", payoutMonthKey: "2026-10" });
    const items = [first, next];
    const statements = [october, statement];
    const months = buildCashflowView(items, statements, options, asOf);
    expect(months.flatMap(month => month.items)).toEqual([
      expect.objectContaining({ commissionCode: "B105", date: new Date(2026, 10, 25), originalDate: first.date,
        payoutStatus: "paid", amount: 573.41, predictedAmount: 570, commissionPeriodStart: first.commissionPeriodStart }),
      expect.objectContaining({ commissionCode: "B106", date: new Date(2026, 11, 25), payoutStatus: "shifted" }),
    ]);
    const searched = buildCashflowView(items, statements, { ...options, scopeFilter: "own", productFilter: "auto", contractNumberQuery: "123456" }, asOf);
    expect(searched.flatMap(month => month.items).find(item => item.commissionCode === "B105")).toMatchObject({
      payoutStatus: "paid", amount: 573.41,
    });
    const shifted = buildCashflowView(items, statements, { ...options, shiftedOnly: true }, asOf);
    expect(shifted.flatMap(month => month.items).map(item => item.commissionCode)).toEqual(["B106"]);
  });

  it("does not reuse a linked receipt or settle a competing schedule or partial balance", () => {
    const paid: CashflowItem = { ...first, id: "linked", date: new Date(2026, 10, 25), payoutStatus: "paid", amount: 573.41 };
    for (const items of [[first, paid], [first, { ...first, id: "duplicate", entryId: "other" }],
      [{ ...first, isPartialPayoutBalance: true }]]) {
      expect(applyStatementAutoPayouts(items, [statement])).toBe(items);
    }
    const items = [first];
    expect(applyStatementAutoPayouts(items, [statement, { ...statement, id: "another" }])).toBe(items);
  });

  it("requires the same product and recipient scope, even in the legacy monthly reconciliation", () => {
    const own = { ...first, date: new Date(2026, 10, 25) };
    const manager: CashflowItem = { ...own, source: "manager", id: "manager" };
    const otherProduct: CashflowItem = { ...own, productKey: "kooperativaAuto", id: "other-product" };
    const items = buildCashflowView([own, manager, otherProduct], [statement], options, asOf).flatMap(month => month.items);
    expect(items.filter(item => item.payoutStatus === "paid").map(item => item.id)).toEqual([own.id]);
    expect(items.filter(item => item.payoutStatus === "shifted")).toHaveLength(2);
  });
});

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

  it("adds only received subscriptions to statement payouts and preserves the statement itself", () => {
    const received = subscriptionPayment();
    const forecast = { ...received, id: "subscription-forecast", amount: 500, payoutStatus: "predicted" as const };
    const commission = { ...received, id: "commission", productKey: "neon" as const, isSubscriptionPayment: false, amount: 1000 };
    const months = groupItemsByMonth([received, forecast, commission]);
    const statementsByMonthKey = { "2026-7": [commissionStatement({ payoutTotal: 800 })] };
    const before = structuredClone(months);
    const adjusted = applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey, enabled: true });
    expect(adjusted[0]).toMatchObject({ total: 2390, statementPayoutTotal: 800, predictedTotal: 3090, totalSource: "paid" });
    expect(adjusted[0].items).toEqual(months[0].items);
    expect(months).toEqual(before);
    expect(applyStatementPayoutTotalsToMonths({ monthGroups: adjusted, statementsByMonthKey, enabled: true })).toEqual(adjusted);
  });

  it("adds receipts once when there are multiple statements, including a re-upload", () => {
    const months = groupItemsByMonth([subscriptionPayment()]);
    const statementsByMonthKey = { "2026-7": [
      commissionStatement({ payoutTotal: 800 }),
      commissionStatement({ id: "re-upload", payoutTotal: 850, updatedAtMs: 2 }),
      commissionStatement({ id: "second", statementNumber: "16", payoutTotal: 250 }),
    ] };
    const [month] = applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey, enabled: true });
    expect(month.statementPayoutTotal).toBe(1100);
    expect(month.total).toBe(2690);
  });

  it.each([0, -500.25, 33_381.15])("supports zero and negative statements and rounds the combined income: %s", payoutTotal => {
    const months = groupItemsByMonth([{ ...subscriptionPayment(), amount: 350.1 }, { ...subscriptionPayment(), id: "second-receipt", amount: 250.2 }]);
    const [month] = applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey: { "2026-7": [commissionStatement({ payoutTotal })] }, enabled: true });
    expect(month.total).toBe(Math.round((payoutTotal + 600.3) * 100) / 100);
    expect(month.statementPayoutTotal).toBe(payoutTotal);
  });

  it("recognizes a subscription by its product key and excludes unpaid or invalid amounts", () => {
    const receipt = { ...subscriptionPayment(), isSubscriptionPayment: false };
    const months = groupItemsByMonth([receipt, { ...receipt, id: "unpaid", payoutStatus: undefined }, { ...receipt, id: "invalid", amount: NaN }]);
    const [month] = applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey: { "2026-7": [commissionStatement({ payoutTotal: 800 })] }, enabled: true });
    expect(month.total).toBe(2390);
  });

  it("keeps forecasts and standalone subscription months unchanged when there is no statement total or a filter is active", () => {
    const months = groupItemsByMonth([subscriptionPayment(), { ...subscriptionPayment(), id: "forecast", payoutStatus: "predicted" }]);
    const statementsByMonthKey = { "2026-7": [commissionStatement({ payoutTotal: 800 })] };
    expect(applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey, enabled: false })).toBe(months);
    expect(applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey: {}, enabled: true })).toEqual(months);
    expect(applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey: { "2026-7": [commissionStatement({ payoutTotal: null })] }, enabled: true })).toEqual(months);
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
