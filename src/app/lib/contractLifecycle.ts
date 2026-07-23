import { toDate } from "@/app/lib/formatters";
import { type Product } from "@/app/types/domain";

export type ContractLifecycleStatus = "active" | "storno" | "dozita";

type ContractLifecycleInput = {
  status?: string | null;
  productKey?: Product | null;
  policyStartDate?: unknown;
  policyEndDate?: unknown;
  durationYears?: number | null;
  durationMonths?: number | null;
};

const DOZITA_YEAR_PRODUCTS = new Set<Product>(["flexi"]);
const DOZITA_MONTH_PRODUCTS = new Set<Product>(["maxcizinkomplex"]);

const startOfDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const normalizeStatusToken = (value: unknown): string =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    : "";

export function contractMaturityDate(
  contract: ContractLifecycleInput | null | undefined
): Date | null {
  if (!contract) return null;

  const explicitEndDate = toDate(contract.policyEndDate);
  if (explicitEndDate) return explicitEndDate;

  if (!contract.productKey) return null;

  const startDate = toDate(contract.policyStartDate);
  if (!startDate) return null;

  if (DOZITA_YEAR_PRODUCTS.has(contract.productKey)) {
    const yearsRaw = Number(contract.durationYears);
    if (!Number.isFinite(yearsRaw) || yearsRaw <= 0) return null;

    const years = Math.floor(yearsRaw);
    const maturityDate = new Date(
      startDate.getFullYear() + years,
      startDate.getMonth(),
      startDate.getDate()
    );
    return Number.isNaN(maturityDate.getTime()) ? null : maturityDate;
  }

  if (DOZITA_MONTH_PRODUCTS.has(contract.productKey)) {
    const monthsRaw = Number(contract.durationMonths);
    if (!Number.isFinite(monthsRaw) || monthsRaw <= 0) return null;

    const months = Math.floor(monthsRaw);
    const maturityDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + months,
      startDate.getDate()
    );
    return Number.isNaN(maturityDate.getTime()) ? null : maturityDate;
  }

  return null;
}

export function isContractDozita(
  contract: ContractLifecycleInput | null | undefined,
  now: Date = new Date()
): boolean {
  const explicitEndDate = toDate(contract?.policyEndDate);
  if (explicitEndDate) {
    // Smlouva je "dožitá" až po uplynutí dne "Pojištění do".
    return startOfDay(now).getTime() > startOfDay(explicitEndDate).getTime();
  }

  const maturityDate = contractMaturityDate(contract);
  if (!maturityDate) return false;
  return startOfDay(now).getTime() >= startOfDay(maturityDate).getTime();
}

export function contractLifecycleStatus(
  contract: ContractLifecycleInput | null | undefined,
  now: Date = new Date()
): ContractLifecycleStatus {
  const rawStatus = normalizeStatusToken(contract?.status);
  if (
    rawStatus === "storno" ||
    rawStatus === "stornovana"
  ) {
    return "storno";
  }
  if (
    rawStatus === "dozita" ||
    rawStatus === "dozite" ||
    rawStatus === "dozito"
  ) {
    return "dozita";
  }
  if (isContractDozita(contract, now)) return "dozita";
  return "active";
}
