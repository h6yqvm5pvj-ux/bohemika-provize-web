import type { Position } from "@/app/types/domain";
import { paymentFrequencyAtDate, type PaymentFrequencyContract } from "./autoPaymentFrequency";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "./commissionPeriodForCode";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { isKooperativaAutoRenewalPayout } from "./kooperativaCPayoutMeaning";
import { installmentPaymentsPerYear } from "./productFormulas/autoCommission";
import {
  defaultCoefficientSetForProduct,
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} from "./productFormulas/coefficientSets";
import { kooperativaAutoSubsequentCoefficient } from "./productFormulas/kooperativaAuto";

/** Kooperativa's renewal rows can carry the acquisition base. Derive the
 * premium per payment by reversing the contractual subsequent commission. */
export function kooperativaAutoRenewalPremium(
  contract: PaymentFrequencyContract & {
    contractSignedDate?: unknown;
    commissionCoefficientSetOverride?: unknown;
  },
  row: { commissionCode: string; commission?: number | null },
  position: Position | null | undefined,
) {
  if (!isKooperativaAutoRenewalPayout(contract.productKey, row.commissionCode) ||
    !position || typeof row.commission !== "number" || !Number.isFinite(row.commission) || row.commission <= 0) {
    return null;
  }

  const signedDate = endorsementCommissionDay(contract.contractSignedDate);
  const policyStart = endorsementCommissionDay(contract.policyStartDate);
  const anniversaryDate = commissionPeriodForCode(contract, row.commissionCode);
  if (!signedDate || !policyStart || !anniversaryDate) return null;
  const anniversaryNumber = Number(anniversaryDate.slice(0, 4)) - Number(policyStart.slice(0, 4));
  if (anniversaryNumber < 1 || commissionPeriodAfterMonths(policyStart, anniversaryNumber * 12) !== anniversaryDate) {
    return null;
  }

  const frequency = paymentFrequencyAtDate(contract, anniversaryDate);
  if (!frequency) return null;
  const coefficientDate = signedDateForCoefficientSetOverride({
    product: "kooperativaAuto",
    contractSignedDateIso: signedDate,
    coefficientSetOverride: normalizeCommissionCoefficientSet(contract.commissionCoefficientSetOverride) ??
      defaultCoefficientSetForProduct("kooperativaAuto", signedDate),
  });
  const coefficient = kooperativaAutoSubsequentCoefficient(position, coefficientDate);
  if (!Number.isFinite(coefficient) || coefficient <= 0) return null;

  const paymentCents = Math.round(row.commission * 100 / coefficient);
  const paymentsPerYear = installmentPaymentsPerYear(frequency);
  const annualCents = paymentCents * paymentsPerYear;
  if (!Number.isSafeInteger(annualCents) || annualCents <= 0) return null;
  return { anniversaryDate, anniversaryNumber, paymentPremium: paymentCents / 100, annualPremium: annualCents / 100, paymentsPerYear, frequency };
}
