import { type Position } from "@/app/types/domain";

type DateLike = {
  seconds: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

type ToDateOptions = {
  parseCzechDate?: boolean;
};

type FormatMoneyOptions = {
  locale?: string;
  currencyLabel?: string;
  minFractionDigits?: number;
  maxFractionDigits?: number;
  emptyValueLabel?: string;
  nonPositiveAsEmpty?: boolean;
};

type PositionLabelOptions = {
  emptyLabel?: string;
};

export const POSITION_LABELS: Record<Position, string> = {
  poradce1: "Poradce 1",
  poradce2: "Poradce 2",
  poradce3: "Poradce 3",
  poradce4: "Poradce 4",
  poradce5: "Poradce 5",
  poradce6: "Poradce 6",
  poradce7: "Poradce 7",
  poradce8: "Poradce 8",
  poradce9: "Poradce 9",
  poradce10: "Poradce 10",
  manazer4: "Manažer 4",
  manazer5: "Manažer 5",
  manazer6: "Manažer 6",
  manazer7: "Manažer 7",
  manazer8: "Manažer 8",
  manazer9: "Manažer 9",
  manazer10: "Manažer 10",
};

export function toDate(value: unknown, options?: ToDateOptions): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  const parseCzechDate = options?.parseCzechDate ?? true;

  if (parseCzechDate && typeof value === "string") {
    const trimmed = value.trim();
    const cz = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (cz) {
      const day = Number(cz[1]);
      const month = Number(cz[2]);
      const year = Number(cz[3]);
      const d = new Date(year, month - 1, day);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as DateLike).toDate === "function"
  ) {
    const d = (value as DateLike).toDate?.();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as DateLike).seconds === "number"
  ) {
    const ts = value as DateLike;
    const ms =
      ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMoney(
  value: number | undefined | null,
  options?: FormatMoneyOptions
): string {
  const currencyLabel = options?.currencyLabel ?? "Kč";
  const emptyValueLabel = options?.emptyValueLabel ?? `0 ${currencyLabel}`;
  if (value == null || !Number.isFinite(value)) return emptyValueLabel;
  if (options?.nonPositiveAsEmpty && value <= 0) return emptyValueLabel;

  return (
    value.toLocaleString(options?.locale ?? "cs-CZ", {
      minimumFractionDigits: options?.minFractionDigits,
      maximumFractionDigits: options?.maxFractionDigits ?? 0,
    }) + ` ${currencyLabel}`
  );
}

export function positionLabel(
  pos?: Position | null,
  options?: PositionLabelOptions
): string {
  if (!pos) return options?.emptyLabel ?? "—";
  return POSITION_LABELS[pos] ?? pos;
}
