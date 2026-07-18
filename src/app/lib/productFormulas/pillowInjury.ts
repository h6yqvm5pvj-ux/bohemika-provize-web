import {
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";
import { pct } from "./shared";

// ---------- Pillow Úraz / Nemoc ----------

type PillowInjuryK = { okamzita: number; po3: number; po4: number };

type PillowInjuryBaseK = {
  a101: number;
  b0301: number;
  b36: number;
  b48: number;
};

export type PillowInjuryCoefficientParts = {
  a101: number;
  b0301: number;
  b36Immediate: number;
  b36Deferred: number;
  b48: number;
  okamzita: number;
  po3: number;
  po4: number;
};

export const PILLOW_INJURY_COEFFICIENT_VALID_FROM = "2023-10-01";

const PILLOW_INJURY_B0301_IMMEDIATE_NOTE =
  "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!";

const PILLOW_INJURY_BASE_COEFFICIENTS: Record<Position, PillowInjuryBaseK> = {
  poradce1: { a101: 24.741, b0301: 5.92, b36: 15.074, b48: 2.749 },
  poradce2: { a101: 27.637, b0301: 6.613, b36: 16.838, b48: 3.071 },
  poradce3: { a101: 30.006, b0301: 7.179, b36: 18.281, b48: 3.334 },
  poradce4: { a101: 37.454, b0301: 8.962, b36: 22.819, b48: 4.162 },
  poradce5: { a101: 42.113, b0301: 10.076, b36: 25.657, b48: 4.679 },
  poradce6: { a101: 45.008, b0301: 10.769, b36: 27.421, b48: 5.001 },
  poradce7: { a101: 50.273, b0301: 12.029, b36: 30.629, b48: 5.586 },
  poradce8: { a101: 53.273, b0301: 12.747, b36: 32.457, b48: 5.919 },
  poradce9: { a101: 55.537, b0301: 13.288, b36: 33.836, b48: 6.171 },
  poradce10: { a101: 57.116, b0301: 13.666, b36: 34.798, b48: 6.346 },
  manazer4: { a101: 45.008, b0301: 10.769, b36: 27.421, b48: 5.001 },
  manazer5: { a101: 50.273, b0301: 12.029, b36: 30.629, b48: 5.586 },
  manazer6: { a101: 55.168, b0301: 13.2, b36: 33.611, b48: 6.13 },
  manazer7: { a101: 60.011, b0301: 14.359, b36: 36.562, b48: 6.668 },
  manazer8: { a101: 65.275, b0301: 15.619, b36: 39.769, b48: 7.253 },
  manazer9: { a101: 69.75, b0301: 16.689, b36: 42.495, b48: 7.75 },
  manazer10: { a101: 75.014, b0301: 17.949, b36: 45.702, b48: 8.335 },
};

const isAcceleratedMode = (mode: CommissionMode | null | undefined): boolean =>
  mode === "accelerated";

export function pillowInjuryCoefficientParts(
  position: Position | null | undefined,
  mode: CommissionMode | null | undefined
): PillowInjuryCoefficientParts | null {
  if (!position) return null;
  const base = PILLOW_INJURY_BASE_COEFFICIENTS[position];
  if (!base) return null;

  const b36Immediate = isAcceleratedMode(mode) ? base.b36 / 2 : 0;
  const b36Deferred = isAcceleratedMode(mode) ? base.b36 / 2 : base.b36;
  const okamzita = base.a101 + base.b0301 + b36Immediate;

  return {
    a101: base.a101,
    b0301: base.b0301,
    b36Immediate,
    b36Deferred,
    b48: base.b48,
    okamzita,
    po3: b36Deferred,
    po4: base.b48,
  };
}

export function pillowInjuryCoefficients(
  position: Position,
  mode: CommissionMode
): PillowInjuryK {
  const parts = pillowInjuryCoefficientParts(position, mode);
  if (!parts) return { okamzita: 0, po3: 0, po4: 0 };
  return {
    okamzita: parts.okamzita,
    po3: parts.po3,
    po4: parts.po4,
  };
}

export function calculatePillowInjury(
  monthly: number,
  position: Position,
  mode: CommissionMode = "accelerated"
): CommissionResultDTO {
  const annual = monthly * 12;
  const parts = pillowInjuryCoefficientParts(position, mode);
  if (!parts) return { items: [], total: 0 };

  const a101 = annual * pct(parts.a101);
  const b0301 = annual * pct(parts.b0301);
  const b36Immediate = annual * pct(parts.b36Immediate);
  const po3 = annual * pct(parts.po3);
  const po4 = annual * pct(parts.po4);
  const total = a101 + b0301 + b36Immediate + po3 + po4;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Provize A101", amount: a101, code: "A101" },
    {
      title: "💸 Provize B0301",
      amount: b0301,
      code: "B0301",
      note: PILLOW_INJURY_B0301_IMMEDIATE_NOTE,
    },
    ...(b36Immediate > 0
      ? [
          {
            title: "💸 Provize 50% z B36",
            amount: b36Immediate,
            code: "B36_HALF",
          },
        ]
      : []),
    { title: "📅 Provize po 3 letech", amount: po3, code: "B36" },
    { title: "📅 Provize po 4 letech", amount: po4, code: "B48" },
    { title: "🧮 Celková provize", amount: total, code: "TOTAL" },
  ];
  return { items, total };
}
