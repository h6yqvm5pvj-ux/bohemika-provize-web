import { toDate } from "@/app/lib/formatters";
import { type Product } from "@/app/types/domain";

export type ContractLifecycleStatus = "active" | "storno" | "dozita";

type ContractLifecycleInput = {
  status?: string | null;
  productKey?: Product | null;
  policyStartDate?: unknown;
  durationYears?: number | null;
};

const DOZITA_PRODUCTS = new Set<Product>(["flexi"]);

const startOfDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

export function contractMaturityDate(
  contract: ContractLifecycleInput | null | undefined
): Date | null {
  if (!contract?.productKey || !DOZITA_PRODUCTS.has(contract.productKey)) return null;

  const startDate = toDate(contract.policyStartDate);
  if (!startDate) return null;

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

export function isContractDozita(
  contract: ContractLifecycleInput | null | undefined,
  now: Date = new Date()
): boolean {
  const maturityDate = contractMaturityDate(contract);
  if (!maturityDate) return false;
  return startOfDay(now).getTime() >= startOfDay(maturityDate).getTime();
}

export function contractLifecycleStatus(
  contract: ContractLifecycleInput | null | undefined,
  now: Date = new Date()
): ContractLifecycleStatus {
  const rawStatus = (contract?.status ?? "").toString().trim().toLowerCase();
  if (rawStatus === "storno") return "storno";
  if (isContractDozita(contract, now)) return "dozita";
  return "active";
}
