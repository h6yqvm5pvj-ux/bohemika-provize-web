import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { toDate } from "@/app/lib/formatters";
import { isAutoProduct } from "@/app/lib/productCatalog";
import { type Product } from "@/app/types/domain";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

type DateValue = string | number | FirestoreTimestamp | Date | null;

export type AutoAnniversaryEntry = {
  id: string;
  userEmail?: string | null;
  adviserEmail?: string | null;
  productKey?: Product | null;
  clientName?: string | null;
  contractNumber?: string | null;
  status?: string | null;
  stornoDate?: DateValue;
  policyStartDate?: DateValue;
  contractSignedDate?: DateValue;
  createdAt?: DateValue;
  contractStartDate?: DateValue;
  policyEndDate?: DateValue;
  durationYears?: number | null;
  durationMonths?: number | null;
};

export type AutoAnniversaryRow = {
  id: string;
  href: string;
  client: string;
  contractNumber: string;
  product: Product;
  daysToAnniversary: number;
};

export const AUTO_ANNIVERSARY_WINDOW_DAYS = 60;

export const normalizeAutoAnniversaryEmail = (email?: string | null): string =>
  (email ?? "").trim().toLowerCase();

export function nextAutoAnniversary(start: Date, now: Date): Date {
  const ann = new Date(start);
  ann.setFullYear(ann.getFullYear() + 1);
  while (ann < now) {
    ann.setFullYear(ann.getFullYear() + 1);
  }
  return ann;
}

export const contractDetailHref = (ownerEmail: string, entryId: string) =>
  `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}?from=anniversary`;

export function buildAutoAnniversaryRows(
  entries: AutoAnniversaryEntry[],
  now: Date,
  fallbackOwnerEmail?: string | null
): AutoAnniversaryRow[] {
  const fallbackOwner = normalizeAutoAnniversaryEmail(fallbackOwnerEmail);
  const results: AutoAnniversaryRow[] = [];

  entries.forEach((data) => {
    const product = data.productKey;
    if (!product || !isAutoProduct(product)) return;
    if (contractLifecycleStatus(data, now) !== "active") return;

    const start =
      toDate(data.policyStartDate) ??
      toDate(data.contractSignedDate) ??
      toDate(data.createdAt) ??
      toDate(data.contractStartDate);
    if (!start) return;

    const ann = nextAutoAnniversary(start, now);
    const diffDays = Math.ceil(
      (ann.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays < 0 || diffDays > AUTO_ANNIVERSARY_WINDOW_DAYS) return;

    const ownerEmail =
      normalizeAutoAnniversaryEmail(data.userEmail) ||
      normalizeAutoAnniversaryEmail(data.adviserEmail) ||
      fallbackOwner;
    const entryId = String(data.id ?? "").trim();
    if (!ownerEmail || !entryId) return;

    results.push({
      id: `${ownerEmail}___${entryId}`,
      href: contractDetailHref(ownerEmail, entryId),
      client: data.clientName ?? "Neznámý klient",
      contractNumber: data.contractNumber ?? "—",
      product,
      daysToAnniversary: diffDays,
    });
  });

  return results.sort((a, b) => a.daysToAnniversary - b.daysToAnniversary);
}
