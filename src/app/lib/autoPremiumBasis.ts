import type { PaymentFrequency, Product } from "@/app/types/domain";
import { isAnnualAutoPayoutProduct, isAutoProduct } from "./productCatalog";
import { installmentPaymentsPerYear, installmentCommissionScheduleFromCode } from "./productFormulas/autoCommission";
import { commissionStatementIdentityKey } from "@/app/api/commission-statements/statementIdentity";

export type PremiumBasePeriod = "annual" | "payment";
export type PremiumBaseSource = {
  statementId?: string | null;
  statementNumber?: string | null;
  statementPeriod?: string | null;
  statementDate?: string | null;
  statementOwnerEmail?: string | null;
  validFrom?: string | null;
  signedAt?: string | null;
  contractNumber: string;
  rowId: string;
  productCode: string;
  commissionCode: string;
  source: "own" | "manager";
  basePremium: number;
};
export type PremiumBaseResolution = PremiumBaseSource & {
  key: string;
  productKey: Product;
  frequencyRaw: PaymentFrequency;
  period: PremiumBasePeriod;
  confirmedAtMs: number;
  confirmedBy: string;
  writtenBy: string;
  statementChronologyMs: number | null;
  payoutMonthKey: string | null;
};
export type PremiumBaseContract = {
  productKey?: Product | null;
  frequencyRaw?: string | null;
  premiumStatementBaseResolutions?: PremiumBaseResolution[] | null;
};

/** Identity includes the original amount and frequency: a replaced statement
 * or changed payment schedule must not reuse an old confirmation. */
export function premiumBaseSourceKey(source: PremiumBaseSource, contract: PremiumBaseContract): string {
  return JSON.stringify([
    commissionStatementIdentityKey(source), source.statementOwnerEmail ?? "", source.contractNumber.replace(/\D/g, ""),
    source.rowId, source.productCode, source.commissionCode.trim().toUpperCase(), source.source,
    Math.round(source.basePremium * 100), contract.productKey, contract.frequencyRaw,
  ]);
}

/** Even a non-anniversary installment is evidence of the previous premium;
 * it must not itself be presented as an anniversary price change. */
export function previousConfirmedAutoAnnualPremium(source: PremiumBaseSource, contract: PremiumBaseContract): number | null {
  const paymentIndex = (code: string) => {
    const schedule = installmentCommissionScheduleFromCode(code, contract.frequencyRaw);
    return schedule ? schedule.paymentIndex + (schedule.phase === "subsequent" ? schedule.paymentsPerYear : 0) : null;
  };
  const currentIndex = paymentIndex(source.commissionCode);
  if (currentIndex == null) return null;
  const candidates = (contract.premiumStatementBaseResolutions ?? []).flatMap(item => {
    if (item.contractNumber !== source.contractNumber || item.productCode !== source.productCode ||
      item.source !== source.source || item.statementOwnerEmail !== source.statementOwnerEmail ||
      item.productKey !== contract.productKey || item.frequencyRaw !== contract.frequencyRaw) return [];
    const index = paymentIndex(item.commissionCode);
    const basis = resolveAutoPremiumBasis(item, contract);
    return index != null && index < currentIndex && basis.status === "resolved" ? [{ index, annual: basis.annualPremium }] : [];
  });
  const latestIndex = Math.max(...candidates.map(item => item.index));
  const amounts = new Set(candidates.filter(item => item.index === latestIndex).map(item => item.annual));
  return amounts.size === 1 ? [...amounts][0] : null;
}

export function resolveAutoPremiumBasis(source: PremiumBaseSource, contract: PremiumBaseContract) {
  const { productKey, frequencyRaw } = contract;
  if (!isAutoProduct(productKey) || !Number.isFinite(source.basePremium) || source.basePremium <= 0 ||
    !["annual", "semiannual", "quarterly", "monthly"].includes(frequencyRaw ?? "")) {
    return { status: "invalid" as const };
  }
  const base = Math.round(source.basePremium * 100) / 100;
  const paymentCount = installmentPaymentsPerYear(frequencyRaw);
  const key = premiumBaseSourceKey(source, contract);
  const confirmation = contract.premiumStatementBaseResolutions?.find(item =>
    item.key === key && premiumBaseSourceKey(item, item) === key &&
    (item.period === "annual" || item.period === "payment"));
  const period = confirmation?.period ??
    (paymentCount === 1 || isAnnualAutoPayoutProduct(productKey) ? "annual" : null);
  if (!period) {
    return { status: "ambiguous" as const, key, annualIfAnnual: base,
      annualIfPayment: Math.round(base * paymentCount * 100) / 100 };
  }
  const annualPremium = period === "annual" ? base : Math.round(base * paymentCount * 100) / 100;
  return { status: "resolved" as const, key, period, annualPremium, annualIfAnnual: base,
    annualIfPayment: Math.round(base * paymentCount * 100) / 100,
    paymentPremium: Math.round(annualPremium / paymentCount * 100) / 100 };
}
