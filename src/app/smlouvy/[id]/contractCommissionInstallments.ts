import { isFrequencyAutoPayoutProduct } from "@/app/lib/productCatalog";
import { isPerPaymentSeparatedPeriodProduct } from "@/app/lib/separatedPeriodCommissions";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import type { CommissionResultItemDTO, PaymentFrequency, Product } from "@/app/types/domain";
import { cleanResultTitle, toDate } from "./contractDetailHelpers";
import type { ContractCommissionPayout } from "./contractDetailTypes";

export type AcquisitionCommissionInstallment = {
  code: string;
  codes: string[];
  label: string;
  period: string | null;
  amount: number;
};

export function acquisitionCommissionInstallments({
  item, product, frequency, policyStartDate,
}: {
  item: CommissionResultItemDTO;
  product?: Product;
  frequency?: PaymentFrequency | null;
  policyStartDate?: unknown;
}): AcquisitionCommissionInstallment[] {
  // Premium frequency does not split products whose commission is paid annually
  // or upfront (including life insurance). Older items may only carry A101.
  if (!frequency || !(isPerPaymentSeparatedPeriodProduct(product) || isFrequencyAutoPayoutProduct(product))) return [];
  const count = periodsPerYear(frequency);
  if (count <= 1) return [];
  const title = cleanResultTitle(item.title).toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ");
  if (!/^(?:okamžitá|získatelská) provize\b/.test(title) || title.includes("za rok")) return [];

  const start = toDate(policyStartDate);
  const startParts = start && Number.isFinite(start.getTime())
    ? new Intl.DateTimeFormat("en", { year: "numeric", month: "numeric", timeZone: "Europe/Prague" }).formatToParts(start)
    : null;
  const year = Number(startParts?.find((part) => part.type === "year")?.value);
  const month = Number(startParts?.find((part) => part.type === "month")?.value) - 1;
  return Array.from({ length: count }, (_, index) => {
    const code = `A${101 + index}`;
    let period: string | null = null;
    if (startParts) {
      const date = new Date(Date.UTC(year, month + index * (12 / count), 1));
      period = date.toLocaleDateString("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" });
    }
    return {
      code,
      codes: [code, `A${index + 1}`, ...(isFrequencyAutoPayoutProduct(product) ? [`AC${101 + index}`, `AC${index + 1}`] : [])],
      label: `${index + 1}. splátka`,
      period,
      amount: Number.isFinite(item.amount) ? item.amount : 0,
    };
  });
}

export function payoutsForAcquisitionInstallment(
  payouts: ContractCommissionPayout[],
  installment: AcquisitionCommissionInstallment
): ContractCommissionPayout[] {
  return payouts.filter((payout) => {
    // Prefer the statement code. A generic title, range, date or similar amount
    // must never mark several different installments as paid.
    const code = baseCommissionCodeForPayoutComparison(payout.code || payout.key || payout.title);
    return installment.codes.includes(code);
  });
}
