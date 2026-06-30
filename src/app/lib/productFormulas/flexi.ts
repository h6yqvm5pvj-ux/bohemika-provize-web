import {
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";
import { pct } from "./shared";

// ---------- FLEXI ----------

type FlexiK = {
  okamzita: number;
  po3: number;
  po4: number;
  naslednaOd6: number;
};

type FlexiImmediateBreakdownPart = {
  label: string;
  amount: number;
};

export type FlexiImmediateBreakdown = {
  position: Position;
  totalCoefficient: number;
  a101Coefficient: number;
  b0301Coefficient: number;
  b36HalfCoefficient: number;
  includeB36: boolean;
  parts: FlexiImmediateBreakdownPart[];
  total: number;
};

export const FLEXI_IMMEDIATE_A101_COEFFICIENTS: Partial<Record<Position, number>> = {
  poradce1: 21.207,
  poradce2: 23.6887,
  poradce3: 25.7191,
  poradce4: 32.1038,
  poradce5: 36.097,
  poradce6: 38.5787,
  poradce7: 43.0908,
  poradce8: 45.6627,
  poradce9: 47.6029,
  poradce10: 48.9566,
  manazer4: 38.5787,
  manazer5: 43.0908,
  manazer6: 47.2871,
  manazer7: 51.4382,
  manazer8: 55.9504,
  manazer9: 59.7857,
  manazer10: 64.2978,
};

export const FLEXI_IMMEDIATE_B0301_COEFFICIENTS: Partial<Record<Position, number>> = {
  poradce1: 5.0742,
  poradce2: 5.668,
  poradce3: 6.1538,
  poradce4: 7.6815,
  poradce5: 8.637,
  poradce6: 9.2308,
  poradce7: 10.3104,
  poradce8: 10.9258,
  poradce9: 11.39,
  poradce10: 11.7139,
  manazer4: 9.2308,
  manazer5: 10.3104,
  manazer6: 11.3144,
  manazer7: 12.3077,
  manazer8: 13.3873,
  manazer9: 14.305,
  manazer10: 15.3846,
};

export const FLEXI_IMMEDIATE_B36_HALF_COEFFICIENTS: Partial<Record<Position, number>> = {
  poradce1: 6.46015,
  poradce2: 7.21615,
  poradce3: 7.8347,
  poradce4: 9.7796,
  poradce5: 10.99605,
  poradce6: 11.752,
  poradce7: 13.12655,
  poradce8: 13.91,
  poradce9: 14.50105,
  poradce10: 14.9134,
  manazer4: 11.752,
  manazer5: 13.12655,
  manazer6: 14.4048,
  manazer7: 15.66935,
  manazer8: 17.04385,
  manazer9: 18.2122,
  manazer10: 19.5867,
};

const FLEXI_B0301_IMMEDIATE_NOTE =
  "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!";

const roundToCents = (value: number): number => Math.round(value * 100) / 100;
const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (value: number): number => value / 100;

const isAcceleratedMode = (mode: CommissionMode | null | undefined): boolean =>
  mode === "accelerated";

export const hasFlexiImmediateCoefficient = (
  position: Position | null | undefined
): position is Position =>
  !!position &&
  Number.isFinite(FLEXI_IMMEDIATE_A101_COEFFICIENTS[position]) &&
  Number.isFinite(FLEXI_IMMEDIATE_B0301_COEFFICIENTS[position]) &&
  Number.isFinite(FLEXI_IMMEDIATE_B36_HALF_COEFFICIENTS[position]);

export const buildFlexiImmediateBreakdown = (
  amount: number,
  position: Position | null | undefined,
  mode: CommissionMode | null | undefined
): FlexiImmediateBreakdown | null => {
  if (!hasFlexiImmediateCoefficient(position)) return null;

  const includeB36 = isAcceleratedMode(mode);
  const a101Coefficient = FLEXI_IMMEDIATE_A101_COEFFICIENTS[position] ?? 0;
  const b0301Coefficient = FLEXI_IMMEDIATE_B0301_COEFFICIENTS[position] ?? 0;
  const b36HalfCoefficient = includeB36
    ? FLEXI_IMMEDIATE_B36_HALF_COEFFICIENTS[position] ?? 0
    : 0;
  const totalCoefficient =
    a101Coefficient + b0301Coefficient + b36HalfCoefficient;

  if (!Number.isFinite(totalCoefficient) || totalCoefficient <= 0) return null;
  if (!Number.isFinite(a101Coefficient) || a101Coefficient < 0) return null;
  if (!Number.isFinite(b0301Coefficient) || b0301Coefficient < 0) return null;
  if (!Number.isFinite(b36HalfCoefficient) || b36HalfCoefficient < 0) return null;

  const total = Number(amount);
  if (!Number.isFinite(total) || total <= 0) return null;

  const baseAmount = total / totalCoefficient;
  const partDefs: { label: string; raw: number }[] = [
    { label: "Provize A101", raw: baseAmount * a101Coefficient },
    { label: "Provize B0301", raw: baseAmount * b0301Coefficient },
    ...(includeB36
      ? [
          {
            label: "Provize 50% z B36",
            raw: baseAmount * b36HalfCoefficient,
          },
        ]
      : []),
  ];

  const partCents = partDefs.map((part) => ({
    label: part.label,
    cents: Math.max(0, toCents(part.raw)),
  }));
  const totalCents = toCents(total);
  const lastIdx = partCents.length - 1;
  const roundedSumCents = partCents.reduce((sum, part) => sum + part.cents, 0);
  partCents[lastIdx].cents += totalCents - roundedSumCents;

  if (partCents[lastIdx].cents < 0) {
    let deficit = -partCents[lastIdx].cents;
    partCents[lastIdx].cents = 0;
    for (let idx = lastIdx - 1; idx >= 0 && deficit > 0; idx -= 1) {
      const reduceBy = Math.min(partCents[idx].cents, deficit);
      partCents[idx].cents -= reduceBy;
      deficit -= reduceBy;
    }
    if (deficit > 0) return null;
  }

  return {
    position,
    totalCoefficient,
    a101Coefficient,
    b0301Coefficient,
    b36HalfCoefficient,
    includeB36,
    total,
    parts: partCents.map((part) => ({
      label: part.label,
      amount: roundToCents(fromCents(part.cents)),
    })),
  };
};

const flexiImmediateItems = (
  amount: number,
  position: Position,
  mode: CommissionMode
): CommissionResultItemDTO[] => {
  const breakdown = buildFlexiImmediateBreakdown(amount, position, mode);
  if (!breakdown) return [{ title: "💸 Okamžitá provize", amount, code: "A101" }];

  return breakdown.parts.map((part) => ({
    title: `💸 ${part.label}`,
    amount: part.amount,
    code:
      part.label === "Provize A101"
        ? "A101"
        : part.label === "Provize B0301"
          ? "B0301"
          : part.label.includes("B36")
            ? "B36_HALF"
            : null,
    ...(part.label === "Provize B0301"
      ? { note: FLEXI_B0301_IMMEDIATE_NOTE }
      : {}),
  }));
};

export function flexiCoefficients(position: Position, mode: CommissionMode): FlexiK {
  if (mode === "accelerated") {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 32.74135,
          po3: 6.46015,
          po4: 2.3563,
          naslednaOd6: 0.4618,
        };
      case "poradce2":
        return {
          okamzita: 36.57285,
          po3: 7.21615,
          po4: 2.6321,
          naslednaOd6: 0.5158,
        };
      case "poradce3":
        return {
          okamzita: 39.7076,
          po3: 7.8347,
          po4: 2.8577,
          naslednaOd6: 0.56,
        };
      case "poradce4":
        return {
          okamzita: 49.5649,
          po3: 9.7796,
          po4: 3.5671,
          naslednaOd6: 0.699,
        };
      case "poradce5":
        return {
          okamzita: 55.73005,
          po3: 10.99605,
          po4: 4.0108,
          naslednaOd6: 0.786,
        };
      case "poradce6":
        return {
          okamzita: 59.5615,
          po3: 11.752,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "poradce7":
        return {
          okamzita: 66.52775,
          po3: 13.12655,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "poradce8":
        return {
          okamzita: 70.4985,
          po3: 13.91,
          po4: 5.0736,
          naslednaOd6: 0.9942,
        };
      case "poradce9":
        return {
          okamzita: 73.49395,
          po3: 14.50105,
          po4: 5.2892,
          naslednaOd6: 1.0365,
        };
      case "poradce10":
        return {
          okamzita: 75.5839,
          po3: 14.9134,
          po4: 5.4396,
          naslednaOd6: 1.066,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 59.5615,
          po3: 11.752,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "manazer5":
        return {
          okamzita: 66.52775,
          po3: 13.12655,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "manazer6":
        return {
          okamzita: 73.0063,
          po3: 14.4048,
          po4: 5.2541,
          naslednaOd6: 1.0296,
        };
      case "manazer7":
        return {
          okamzita: 79.41525,
          po3: 15.66935,
          po4: 5.7154,
          naslednaOd6: 1.12,
        };
      case "manazer8":
        return {
          okamzita: 86.38155,
          po3: 17.04383,
          po4: 6.2167,
          naslednaOd6: 1.2182,
        };
      case "manazer9":
        return {
          okamzita: 92.3029,
          po3: 18.2122,
          po4: 6.6429,
          naslednaOd6: 1.3018,
        };
      case "manazer10":
        return {
          okamzita: 99.2691,
          po3: 19.5867,
          po4: 7.1442,
          naslednaOd6: 1.4,
        };
    }
  } else {
    // standard režim
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 26.2812,
          po3: 12.9203,
          po4: 2.3563,
          naslednaOd6: 0.4618,
        };
      case "poradce2":
        return {
          okamzita: 29.3567,
          po3: 14.4323,
          po4: 2.6321,
          naslednaOd6: 0.5158,
        };
      case "poradce3":
        return {
          okamzita: 31.8729,
          po3: 15.6694,
          po4: 2.8577,
          naslednaOd6: 0.56,
        };
      case "poradce4":
        return {
          okamzita: 39.7853,
          po3: 19.5592,
          po4: 3.5671,
          naslednaOd6: 0.699,
        };
      case "poradce5":
        return {
          okamzita: 44.734,
          po3: 21.9921,
          po4: 4.0108,
          naslednaOd6: 0.786,
        };
      case "poradce6":
        return {
          okamzita: 47.8095,
          po3: 23.504,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "poradce7":
        return {
          okamzita: 53.4012,
          po3: 26.2531,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "poradce8":
        return {
          okamzita: 56.5885,
          po3: 27.82,
          po4: 5.0736,
          naslednaOd6: 0.9942,
        };
      case "poradce9":
        return {
          okamzita: 58.9929,
          po3: 29.0021,
          po4: 5.2892,
          naslednaOd6: 1.0365,
        };
      case "poradce10":
        return {
          okamzita: 60.6705,
          po3: 29.8268,
          po4: 5.4396,
          naslednaOd6: 1.066,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 47.8095,
          po3: 23.504,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "manazer5":
        return {
          okamzita: 53.4012,
          po3: 26.2531,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "manazer6":
        return {
          okamzita: 58.6015,
          po3: 28.8096,
          po4: 5.2541,
          naslednaOd6: 1.0296,
        };
      case "manazer7":
        return {
          okamzita: 63.7459,
          po3: 31.3387,
          po4: 5.7154,
          naslednaOd6: 1.12,
        };
      case "manazer8":
        return {
          okamzita: 69.3377,
          po3: 34.0877,
          po4: 6.2167,
          naslednaOd6: 1.2182,
        };
      case "manazer9":
        return {
          okamzita: 74.0907,
          po3: 36.4244,
          po4: 6.6429,
          naslednaOd6: 1.3018,
        };
      case "manazer10":
        return {
          okamzita: 79.6824,
          po3: 39.1734,
          po4: 7.1442,
          naslednaOd6: 1.4,
        };
    }
  }
}

export function calculateFlexi(
  monthly: number,
  position: Position,
  mode: CommissionMode = "accelerated",
  years = 6
): CommissionResultDTO {
  const k = flexiCoefficients(position, mode);
  const y = Math.max(1, Math.min(80, years));
  const annual = monthly * 12;

  const okamzita = annual * pct(k.okamzita);
  const po3 = annual * pct(k.po3);
  const po4 = annual * pct(k.po4);
  const n6 = annual * pct(k.naslednaOd6);
  const tailYears = Math.max(0, y - 5);

  const total = okamzita + po3 + po4 + n6 * tailYears;

  const items: CommissionResultItemDTO[] = [
    ...flexiImmediateItems(okamzita, position, mode),
    { title: "📅 Provize po 3 letech", amount: po3, code: "B36" },
    { title: "📅 Provize po 4 letech", amount: po4, code: "B48" },
    {
      title: "🔁 Následná provize (od 6. roku)",
      amount: n6,
      code: "B201-B206",
      note: `ročně × ${tailYears}`,
    },
    { title: "💰 Celkem", amount: total, code: "TOTAL" },
  ];

  return { items, total };
}
