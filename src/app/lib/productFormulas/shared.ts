import { type PaymentFrequency } from "../../types/domain";

export const pct = (v: number): number => v / 100;

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeIsoDay(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!ISO_DAY_RE.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

export function periodsPerYear(f: PaymentFrequency): number {
  switch (f) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
      return 1;
  }
}
