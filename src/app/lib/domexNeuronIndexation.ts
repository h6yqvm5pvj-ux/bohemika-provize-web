import type { Position, Product } from "@/app/types/domain";
import { addUtcYearsClamped, anniversaryNumberFromInstallmentCommissionCode, installmentPaymentsPerYear } from "./productFormulas/autoCommission";
import { domexNeuronSubsequentCoefficient } from "./productFormulas/domexNeuron";

export type DomexNeuronIndexationContract = {
  productKey?: Product | null;
  premiumIndexationEnabled?: boolean | null;
  frequencyRaw?: string | null;
  inputAmount?: number | null;
  effectiveInputAmount?: number | null;
  calculationInputAmount?: number | null;
  position?: Position | null;
  policyStartDate?: unknown;
};

export type DomexNeuronIndexationRow = {
  productCode?: string | null;
  productKey?: Product | null;
  commissionCode?: string | null;
  basePremium?: number | null;
  commission?: number | null;
  source?: "own" | "manager";
};

export type DomexNeuronIndexationResult = {
  applicable: boolean;
  status: "not_applicable" | "disabled" | "unproven" | "confirmed";
  basePremiumPeriod?: "annual" | "payment";
  paymentPremium?: number;
  annualPremium?: number;
  expectedCommission?: number;
  anniversaryNumber?: number;
};

const money = (value: number) => Math.round(value * 100) / 100;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function dateMs(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "seconds" in value && typeof value.seconds === "number") return dateMs(value.seconds * 1000);
  if (typeof value !== "string") return null;
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const czech = [...value.matchAll(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/g)].at(-1);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : czech ? [Number(czech[3]), Number(czech[2]), Number(czech[1])] : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null;
}

/** The same DOMEX statement codes also identify Neuron policies. The saved
 * contract, selected under server authorization, determines its variant. */
export function isDomexNeuronStatementProduct(row: Pick<DomexNeuronIndexationRow, "productCode" | "productKey">): boolean {
  const code = String(row.productCode ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return ["CPP_DOMX", "CPP_DOMX+2", "CPP_DOMEX+"].includes(code) || row.productKey === "domexneuron";
}

/** Recognize only an observed anniversary increase. A commission base has no
 * declared unit: resolve it from the known coefficient and actual commission,
 * never its similarity to an older premium or an assumed inflation rate. */
export function resolveDomexNeuronIndexation({
  contract,
  row,
  previousAnnualPremium,
  coefficient,
  confirmedBasePeriod,
  referenceDate,
}: {
  contract: DomexNeuronIndexationContract;
  row: DomexNeuronIndexationRow;
  previousAnnualPremium?: number | null;
  coefficient?: number | null;
  confirmedBasePeriod?: "annual" | "payment" | null;
  referenceDate?: unknown;
}): DomexNeuronIndexationResult {
  const code = String(row.commissionCode ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (contract.productKey !== "domexneuron" || !/^B(?:C)?\d+$/.test(code)) {
    return { applicable: false, status: "not_applicable" };
  }
  if (contract.premiumIndexationEnabled !== true) return { applicable: true, status: "disabled" };
  const unproven: DomexNeuronIndexationResult = { applicable: true, status: "unproven" };
  if (!isDomexNeuronStatementProduct(row) ||
    !["annual", "semiannual", "quarterly", "monthly"].includes(contract.frequencyRaw ?? "")) return unproven;
  const anniversaryNumber = anniversaryNumberFromInstallmentCommissionCode(code, contract.frequencyRaw);
  if (anniversaryNumber == null || !positive(row.basePremium) || !positive(row.commission)) return unproven;
  const start = dateMs(contract.policyStartDate);
  const reference = dateMs(referenceDate);
  const anniversary = start == null ? null : addUtcYearsClamped(start, anniversaryNumber);
  if (anniversary == null || reference == null || reference < anniversary) return unproven;
  // Manager overrides and shared commissions can pass an independently
  // calculated effective coefficient. Never derive it from this statement.
  const rate = coefficient !== undefined ? coefficient : row.source !== "manager" && contract.position
    ? domexNeuronSubsequentCoefficient(contract.position) : null;
  if (!positive(rate)) return unproven;
  const count = installmentPaymentsPerYear(contract.frequencyRaw);
  const base = money(row.basePremium);
  const candidates = (confirmedBasePeriod ? [confirmedBasePeriod] : count === 1 ? ["annual"] : ["annual", "payment"])
    .map(period => {
      const paymentPremium = period === "annual" ? money(base / count) : base;
      return { basePremiumPeriod: period as "annual" | "payment", paymentPremium,
        annualPremium: period === "annual" ? base : money(base * count),
        expectedCommission: money(paymentPremium * rate) };
    }).filter(candidate => candidate.paymentPremium > 0 && candidate.expectedCommission > 0 &&
      Math.abs(candidate.expectedCommission - row.commission!) <= 0.02);
  if (candidates.length !== 1) return unproven;
  const candidate = candidates[0];
  // The original premium remains the fallback baseline on repeated imports;
  // effectiveInputAmount may already contain this same observed increase.
  const originalPaymentPremium = contract.inputAmount ?? contract.calculationInputAmount ?? contract.effectiveInputAmount;
  const previousAnnual = previousAnnualPremium ?? (positive(originalPaymentPremium) ? money(originalPaymentPremium * count) : null);
  if (!positive(previousAnnual) || candidate.annualPremium - previousAnnual <= 0.01) return unproven;
  return { applicable: true, status: "confirmed", ...candidate, anniversaryNumber };
}
