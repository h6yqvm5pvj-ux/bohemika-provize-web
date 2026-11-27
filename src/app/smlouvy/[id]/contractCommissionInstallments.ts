import { autoFrequencyCommissionPeriods, autoFrequencyCommissionMultiplier, cppPaymentCommissionMultiplier, type PaymentFrequencyChange } from "@/app/lib/autoPaymentFrequency";
import { commissionPeriodAfterMonths } from "@/app/lib/commissionPeriodForCode";
import { isFrequencyAutoPayoutProduct } from "@/app/lib/productCatalog";
import { isPerPaymentSeparatedPeriodProduct } from "@/app/lib/separatedPeriodCommissions";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { projectConfirmedCommissionCodes } from "@/app/lib/commissionPayoutCodeAdjustment";
import { enrichCommissionStatementPayouts, indexCommissionStatementPayouts } from "@/app/lib/commissionStatementPayoutEvidence";
import type { CommissionResultItemDTO, PaymentFrequency, Product } from "@/app/types/domain";
import { cleanResultTitle, toDate } from "./contractDetailHelpers";
import type { ContractCommissionPayout, ContractCommissionStatementSummary, ContractDoc } from "./contractDetailTypes";

export function projectContractCommissionPayouts(
  contract: ContractDoc | null,
  statements: readonly ContractCommissionStatementSummary[],
  viewerEmail?: string | null,
  ownerEmail?: string | null,
): ContractCommissionPayout[] {
  const payouts = contract?.commissionPayouts ?? [];
  if (contract?.productKey === "neon") return projectConfirmedCommissionCodes(contract, payouts);
  if (!contract?.frequencyRaw || contract.frequencyRaw === "annual" ||
      !contract.productKey || !isFrequencyAutoPayoutProduct(contract.productKey)) return payouts;
  const viewer = viewerEmail?.trim().toLowerCase();
  if (!viewer || !contract.contractNumber || !payouts.length) return projectConfirmedCommissionCodes(contract, payouts);
  const productKey = contract.productKey;
  const source = viewer === (contract.userEmail ?? ownerEmail)?.trim().toLowerCase() ? "own" : "manager";
  const statementIds = new Set(payouts.map(payout => payout.statementId));
  const evidence = indexCommissionStatementPayouts(statements, statement => {
    if (!statementIds.has(statement.id)) return;
    return statement.autoPremiumRows.flatMap(row => row.productKey === productKey && row.commission != null
      ? [{ contractNumber: row.contractNumber, productKey, source: row.source, code: row.commissionCode,
          amount: row.commission, sourceBaseAmount: row.basePremium }]
      : []);
  });
  const enriched = enrichCommissionStatementPayouts(payouts, evidence, {
    contractNumber: contract.contractNumber, productKey, source, viewerEmail: viewer,
  });
  return projectConfirmedCommissionCodes(contract, enriched);
}

export type AcquisitionCommissionInstallment = {
  code: string;
  codes: string[];
  label: string;
  period: string | null;
  commissionPeriod?: string;
  amount: number;
};

export function acquisitionCommissionInstallments({
  item, product, frequency, policyStartDate, paymentFrequencyChanges,
}: {
  item: CommissionResultItemDTO;
  product?: Product;
  frequency?: PaymentFrequency | null;
  policyStartDate?: unknown;
  paymentFrequencyChanges?: PaymentFrequencyChange[] | null;
}): AcquisitionCommissionInstallment[] {
  // Premium frequency does not split products whose commission is paid annually
  // or upfront (including life insurance). Older items may only carry A101.
  if (!frequency || !(isPerPaymentSeparatedPeriodProduct(product) || isFrequencyAutoPayoutProduct(product))) return [];
  const count = periodsPerYear(frequency);
  if (count <= 1 && !paymentFrequencyChanges?.length) return [];
  const title = cleanResultTitle(item.title).toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ");
  if (!/^(?:okamžitá|získatelská) provize\b/.test(title) || title.includes("za rok")) return [];

  if (paymentFrequencyChanges?.length) {
    const end = commissionPeriodAfterMonths(policyStartDate, 12);
    const contract = { productKey: product, frequencyRaw: frequency, policyStartDate, paymentFrequencyChanges };
    const schedule = end ? autoFrequencyCommissionPeriods(contract, end) : [];
    const acquisition = schedule.filter(period => period.code.startsWith("A"));
    if (product === "domex" && count === 1 && acquisition.length === 1) return [];
    if (schedule.length > 0) return acquisition.map((period, index) => ({
      commissionPeriod: period.period, code: period.code, codes: [period.code, `A${Number(period.code.slice(1)) - 100}`, `AC${period.code.slice(1)}`, `AC${Number(period.code.slice(1)) - 100}`], label: `${index + 1}. splátka`,
      period: new Date(`${period.period}T00:00:00Z`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" }),
      amount: !Number.isFinite(item.amount) ? 0 : product === "domex"
        ? Math.round(item.amount * cppPaymentCommissionMultiplier(contract, period.period) * 100) / 100
        : item.amount * (product === "cppPPRs" ? 1 : autoFrequencyCommissionMultiplier(contract, period.period)),
    }));
  }

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
      commissionPeriod: commissionPeriodAfterMonths(policyStartDate, index * (12 / count)) ?? undefined,
      amount: Number.isFinite(item.amount) ? item.amount : 0,
    };
  });
}

export function payoutsForAcquisitionInstallment(
  payouts: ContractCommissionPayout[],
  installment: AcquisitionCommissionInstallment,
): ContractCommissionPayout[] {
  return payouts.filter((payout) => {
    // Prefer the statement code. A generic title, range, date or similar amount
    // must never mark several different installments as paid.
    const code = baseCommissionCodeForPayoutComparison(payout.code || payout.key || payout.title);
    return installment.codes.includes(code);
  });
}
