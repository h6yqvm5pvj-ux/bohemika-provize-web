import { type PaymentFrequency, type Position } from "@/app/types/domain";
import { formatMoney, toDate } from "@/app/lib/formatters";
export { formatMoney, toDate };

export const MONTH_LABELS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

export function entrySignedDate(entry: { contractSignedDate?: any; createdAt?: any }): Date | null {
  return toDate(entry.contractSignedDate) ?? toDate(entry.createdAt) ?? null;
}

export function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

export function normalizeToMonthly(amount: number, frequency?: PaymentFrequency | null): number {
  switch (frequency) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "semiannual":
      return amount / 6;
    case "annual":
    default:
      return amount / 12;
  }
}

export function normalizeToAnnual(amount: number, frequency?: PaymentFrequency | null): number {
  switch (frequency) {
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "semiannual":
      return amount * 2;
    case "annual":
    default:
      return amount;
  }
}

export function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý poradce";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;

  const cap = (s: string) =>
    s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  return parts.map(cap).join(" ");
}
