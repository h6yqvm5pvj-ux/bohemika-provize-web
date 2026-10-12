import { describe, expect, it } from "vitest";
import type { Product, Position, PaymentFrequency } from "@/app/types/domain";
import type { EntryDoc } from "@/app/cashflow/types";
import { generateCashflow } from "@/app/cashflow/generator";
import { applyIntelligentCashflowPrediction } from "@/app/cashflow/helpers";
import { toDate } from "@/app/lib/formatters";
import { estimateCashflowShadowLifeReviewItems, estimateCashflowShadowScheduleItems } from "./cashflowShadowBudget";

// Record completeness makes a new domain product require a schedule test.
const products: Record<Product, true> = {
  conseqzenit: true, neon: true, flexi: true, maximaMaxEfekt: true, maxcizinkomplex: true,
  pillowInjury: true, zamex: true, cppbytex: true, domex: true, domexneuron: true, cpphafan: true,
  pillowmajetek: true, koopmajetekobcan: true, koopfit: true, koopodzam: true, kooppmop: true,
  maxdomov: true, cppsimplex: true, cppAuto: true, slaviaauto: true, slaviaflotila: true,
  allianzAuto: true, allianzmujdomov: true, csobAuto: true, uniqaAuto: true, uniqaflotila: true,
  pillowAuto: true, kooperativaAuto: true, koopflotila: true, koopcestovko: true,
  cppcestovko: true, axacestovko: true, comfortcc: true, cppPPRs: true, cppPPRbez: true,
};
const positions: Record<Position, true> = {
  poradce1: true, poradce2: true, poradce3: true, poradce4: true, poradce5: true,
  poradce6: true, poradce7: true, poradce8: true, poradce9: true, poradce10: true,
  manazer4: true, manazer5: true, manazer6: true, manazer7: true, manazer8: true,
  manazer9: true, manazer10: true,
};
const titles = [
  "Okamžitá provize", "Provize A101", "Provize B0301", "50% z B3601",
  "Provize po 3 letech", "Provize po 4 letech", "Následná provize (2.–5. rok)",
  "Pečovatelská provize (5.–10. rok)", "Následná provize (od 6. roku)",
  "Následná provize (od 5. roku)", "Následná provize (z platby)", "Následná provize",
];
const viewer = "viewer@example.test";
const asOf = new Date(2026, 9, 8, 12);
const fixture = (productKey: Product, parts: number): EntryDoc => ({
  id: "synthetic-schedule", userEmail: viewer, productKey, inputAmount: 1_000,
  policyStartDate: "2026-12-01", contractSignedDate: "2026-10-08", durationYears: 100,
  items: Array.from({ length: parts }, (_, index) => ({
    title: titles[index % titles.length], amount: 100, code: index === 0 ? "A101" : undefined,
  })),
});
const monthBudget = (entry: EntryDoc, today: Date) => {
  const serial = (date: Date) => date.getFullYear() * 12 + date.getMonth();
  const earliest = Math.min(serial(today), ...[entry.policyStartDate, entry.contractSignedDate, entry.createdAt]
    .filter(value => value != null).map(value => serial(toDate(value, { calendar: today })!)));
  return serial(today) + 120 - earliest + 3;
};

describe("schedule resource bounds against actual generator output", () => {
  it.each(Object.keys(products) as Product[])("bounds every generated item for %s", productKey => {
    for (const frequencyRaw of ["monthly", "quarterly", "semiannual", "annual", null, "invalid"] as (PaymentFrequency | null)[]) {
      for (const policyStartDate of ["1900-01-01", "2024-02-29", "2026-12-01"]) {
        for (const parts of [12, 128]) {
          for (const reduction of [{}, { status: "storno", stornoDate: "2027-01-01" }, {
            acquisitionType: "inherited" as const, transferEffectiveDate: "2026-10-01",
          }]) {
            const entry = { ...fixture(productKey, parts), frequencyRaw, policyStartDate, ...reduction };
            const before = structuredClone(entry);
            const output = generateCashflow([entry], 10, viewer, asOf);
            const upperBound = estimateCashflowShadowScheduleItems(entry, monthBudget(entry, asOf), parts);
            expect(output.length, JSON.stringify({ productKey, frequencyRaw, policyStartDate, parts, reduction })).toBeLessThanOrEqual(upperBound);
            expect(entry).toEqual(before);
          }
        }
      }
    }
  });

  it.each([new Date(2028, 1, 29, 12), new Date(2026, 11, 31, 12)])("covers inclusive horizon and leap-year endpoints %s", today => {
    for (const productKey of Object.keys(products) as Product[]) {
      const entry = { ...fixture(productKey, 128), frequencyRaw: "monthly" as const,
        policyStartDate: new Date(today.getFullYear(), today.getMonth(), 1), contractSignedDate: today };
      expect(generateCashflow([entry], 10, viewer, today).length).toBeLessThanOrEqual(
        estimateCashflowShadowScheduleItems(entry, monthBudget(entry, today), 128));
    }
  });

  it("includes each unmatched historical statement payout separately", () => {
    const entry = fixture("neon", 128);
    entry.commissionPayouts = Array.from({ length: 500 }, (_, index) => ({
      key: `synthetic-payout-${index}`, code: `SYN${index}`, status: "paid", amount: 1,
      payoutMonthKey: "2026-09", writtenBy: viewer,
    }));
    const output = generateCashflow([entry], 10, viewer, asOf);
    expect(output.filter(item => item.isStatementOnly)).toHaveLength(500);
    expect(output.length).toBeLessThanOrEqual(estimateCashflowShadowScheduleItems(entry, monthBudget(entry, asOf), 128) + 500);
  });

  it.each(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"] as const)("bounds life reviews for every career/mode and own/manager path of %s", productKey => {
    let maximumAdditions = 0;
    for (const predictionPosition of Object.keys(positions) as Position[]) {
      for (const predictionCommissionMode of ["standard", "accelerated"] as const) {
        for (const source of ["own", "manager"] as const) {
          const entry = { ...fixture(productKey, 128), source, predictionPosition, predictionCommissionMode,
            predictionBaselinePosition: source === "manager" ? "poradce1" as const : null,
            policyStartDate: "2020-01-01", contractSignedDate: "2020-01-01" };
          const original = generateCashflow([entry], 10, viewer, asOf);
          const predicted = applyIntelligentCashflowPrediction({ cashflowItems: original, enabled: true, today: asOf });
          const additions = predicted.length - original.length;
          maximumAdditions = Math.max(maximumAdditions, additions);
          expect(additions).toBeLessThanOrEqual(estimateCashflowShadowLifeReviewItems(entry, original.length));
          expect(applyIntelligentCashflowPrediction({ cashflowItems: original, enabled: false, today: asOf })).toBe(original);
        }
      }
    }
    expect(maximumAdditions).toBeGreaterThan(0);
  });

  it.each(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"] as const)("bounds review horizons, anniversaries and durations for %s", productKey => {
    for (const today of [asOf, new Date(2028, 1, 29, 12), new Date(2026, 11, 31, 12), new Date(2026, 0, 31, 12)]) {
      for (const baseDate of [new Date(1900, 0, 1), new Date(today.getFullYear() - 3, today.getMonth(), today.getDate() - 1),
        new Date(today.getFullYear() - 3, today.getMonth(), today.getDate()),
        new Date(today.getFullYear() - 3, today.getMonth(), today.getDate() + 1),
        new Date(today.getFullYear() + 8, today.getMonth(), today.getDate())]) {
        for (const durationYears of [null, 1, 6, 15, 100]) {
          for (const predictionPosition of Object.keys(positions) as Position[]) {
            for (const predictionCommissionMode of ["standard", "accelerated"] as const) {
              for (const source of ["own", "manager"] as const) {
                const entry = { ...fixture(productKey, 1), policyStartDate: baseDate, contractSignedDate: baseDate,
                  durationYears, source, predictionPosition, predictionCommissionMode,
                  predictionBaselinePosition: source === "manager" ? "poradce1" as const : null };
                const original = generateCashflow([entry], 10, viewer, today);
                const predicted = applyIntelligentCashflowPrediction({ cashflowItems: original, enabled: true, today });
                const bound = estimateCashflowShadowLifeReviewItems(entry, original.length);
                expect(predicted.length - original.length, JSON.stringify({ productKey, today, baseDate,
                  durationYears, predictionPosition, predictionCommissionMode, source })).toBeLessThanOrEqual(bound);
              }
            }
          }
        }
      }
    }
  }, 30_000);

  it("covers review candidates that fall back to individual item IDs when a legacy original ID is empty", () => {
    for (const productKey of ["neon", "flexi", "maximaMaxEfekt", "pillowInjury"] as const) {
      const entry = { ...fixture(productKey, 128), originalEntryId: "", contractNumber: null,
        policyStartDate: "2020-01-01", contractSignedDate: "2020-01-01", predictionPosition: "manazer10" as const,
        predictionCommissionMode: "accelerated" as const };
      const original = generateCashflow([entry], 10, viewer, asOf);
      const predicted = applyIntelligentCashflowPrediction({ cashflowItems: original, enabled: true, today: asOf });
      const scheduledItems = estimateCashflowShadowScheduleItems(entry, monthBudget(entry, asOf), 128);
      expect(predicted.length - original.length).toBeLessThanOrEqual(estimateCashflowShadowLifeReviewItems(entry, scheduledItems));
      expect(predicted.length - original.length).toBeGreaterThan(estimateCashflowShadowLifeReviewItems({ ...entry, originalEntryId: "group" }, scheduledItems));
    }
  });
});
