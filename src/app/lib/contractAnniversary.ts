import type { Product } from "@/app/types/domain";
import { TRAVEL_PRODUCTS } from "@/app/lib/productCatalog";
import { toDate } from "@/app/lib/formatters";

export type AnniversarySoonInfo = {
  soon: boolean;
  next?: Date;
  daysLeft?: number;
  anniversaryNumber?: number;
};

export const DEFAULT_ANNIVERSARY_WINDOW_DAYS = 90;

const ANNIVERSARY_EXCLUDED_PRODUCTS = new Set<Product>(TRAVEL_PRODUCTS);

export function shouldTrackAnniversary(product?: Product | null): boolean {
  if (!product) return true;
  return !ANNIVERSARY_EXCLUDED_PRODUCTS.has(product);
}

export function nextAnniversaryDate(start: Date, now: Date): Date {
  const candidate = new Date(now.getFullYear(), start.getMonth(), start.getDate());
  if (candidate.getTime() < now.getTime()) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

export function isAnniversarySoon(
  date: Date | null,
  windowDays: number = DEFAULT_ANNIVERSARY_WINDOW_DAYS
): AnniversarySoonInfo {
  if (!date) return { soon: false };
  const nowRaw = new Date();
  const now = new Date(nowRaw.getFullYear(), nowRaw.getMonth(), nowRaw.getDate());
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const next = nextAnniversaryDate(start, now);
  const diffDays = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.ceil(diffDays);
  const anniversaryNumber = next.getFullYear() - start.getFullYear();
  const isRealAnniversary = anniversaryNumber >= 1;
  const soon = diffDays <= windowDays && diffDays >= 0 && isRealAnniversary;
  return {
    soon,
    next,
    daysLeft,
    anniversaryNumber: isRealAnniversary ? anniversaryNumber : undefined,
  };
}

export function getContractDate(contract: {
  contractSignedDate?: unknown;
  createdAt?: unknown;
}): Date | null {
  return toDate(contract.contractSignedDate) ?? toDate(contract.createdAt);
}

export function getAnniversaryStartDate(contract: {
  policyStartDate?: unknown;
  contractSignedDate?: unknown;
  createdAt?: unknown;
}): Date | null {
  return toDate(contract.policyStartDate) ?? getContractDate(contract);
}

export function formatDaysLeft(days: number): string {
  if (days === 1) return "1 den";
  if (days >= 2 && days <= 4) return `${days} dny`;
  return `${days} dnů`;
}

/**
 * Stable ISO date key for the specific upcoming anniversary occurrence a
 * contract is currently pointing at. Used to key "already reviewed" markers
 * so they naturally reset once a new anniversary cycle begins.
 */
export function anniversaryOccurrenceKey(next: Date | null | undefined): string | null {
  if (!next) return null;
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
