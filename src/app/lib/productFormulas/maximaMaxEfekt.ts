import {
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";
import { normalizeIsoDay } from "./shared";

// ---------- MAXIMA ŽP MaxEfekt ----------

type MaxEfektK = {
  okamzita: number; // měsíční × 12 × roky × k
  po3: number; // měsíční × 12 × roky × k
  po4: number; // měsíční × 12 × roky × k
  n5plus: number; // následná od 5. roku: měsíční × 12 × k (ročně)
};

type MaxEfektBaseK = {
  a101: number;
  b0301: number;
  b3601: number;
  b4801: number;
  n5plus: number;
};

type MaxEfektCoefficientVersion = "maxEfekt5" | "maxEfekt7";

export type MaxEfektCoefficientParts = {
  version: MaxEfektCoefficientVersion;
  isMaxEfekt5: boolean;
  isMaxEfekt7: boolean;
  a101: number;
  b0301: number;
  b3601Immediate: number;
  b3601Deferred: number;
  b4801: number;
  n5plus: number;
  okamzita: number;
  po3: number;
  po4: number;
};

export const MAXEFEKT5_VALID_FROM = "2023-04-21";
export const MAXEFEKT7_VALID_FROM = "2026-04-23";
export const MAXEFEKT5_7_MAX_DURATION_YEARS = 80;
const MAXEFEKT_LEGACY_MAX_DURATION_YEARS = 20;

const MAXEFEKT5_BASE_COEFFICIENTS: Record<Position, MaxEfektBaseK> = {
  poradce1: { a101: 0.01097, b0301: 0.00266, b3601: 0.00511, b4801: 0.00085, n5plus: 0.0198 },
  poradce2: { a101: 0.01226, b0301: 0.00297, b3601: 0.00571, b4801: 0.00095, n5plus: 0.0218 },
  poradce3: { a101: 0.01331, b0301: 0.00322, b3601: 0.0062, b4801: 0.00103, n5plus: 0.0238 },
  poradce4: { a101: 0.01661, b0301: 0.00402, b3601: 0.00774, b4801: 0.00129, n5plus: 0.031 },
  poradce5: { a101: 0.01868, b0301: 0.00452, b3601: 0.0087, b4801: 0.00145, n5plus: 0.035 },
  poradce6: { a101: 0.01996, b0301: 0.00483, b3601: 0.0093, b4801: 0.00155, n5plus: 0.0389 },
  poradce7: { a101: 0.0223, b0301: 0.00539, b3601: 0.01039, b4801: 0.00173, n5plus: 0.0429 },
  poradce8: { a101: 0.02363, b0301: 0.00572, b3601: 0.01101, b4801: 0.00183, n5plus: 0.0475 },
  poradce9: { a101: 0.02463, b0301: 0.00596, b3601: 0.01148, b4801: 0.00191, n5plus: 0.0521 },
  poradce10: { a101: 0.02533, b0301: 0.00613, b3601: 0.0118, b4801: 0.00196, n5plus: 0.0568 },
  manazer4: { a101: 0.01996, b0301: 0.00483, b3601: 0.0093, b4801: 0.00155, n5plus: 0.0389 },
  manazer5: { a101: 0.02228, b0301: 0.00539, b3601: 0.01039, b4801: 0.00173, n5plus: 0.0429 },
  manazer6: { a101: 0.02447, b0301: 0.00592, b3601: 0.0114, b4801: 0.0019, n5plus: 0.0475 },
  manazer7: { a101: 0.02662, b0301: 0.00644, b3601: 0.0124, b4801: 0.00206, n5plus: 0.0521 },
  manazer8: { a101: 0.02895, b0301: 0.007, b3601: 0.01349, b4801: 0.00224, n5plus: 0.0568 },
  manazer9: { a101: 0.03094, b0301: 0.00748, b3601: 0.01442, b4801: 0.0024, n5plus: 0.0614 },
  manazer10: { a101: 0.03327, b0301: 0.00805, b3601: 0.0155, b4801: 0.00258, n5plus: 0.066 },
};

const MAXEFEKT7_BASE_COEFFICIENTS = MAXEFEKT5_BASE_COEFFICIENTS;

const isAcceleratedMode = (mode: CommissionMode | null | undefined): boolean =>
  mode === "accelerated";

export function isMaxEfekt5Period(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= MAXEFEKT5_VALID_FROM &&
    signedDateIso < MAXEFEKT7_VALID_FROM
  );
}

export function isMaxEfekt7Period(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return true;
  return signedDateIso >= MAXEFEKT7_VALID_FROM;
}

function maxEfektCoefficientVersion(
  contractSignedDateIso: string | null | undefined
): MaxEfektCoefficientVersion | null {
  if (isMaxEfekt7Period(contractSignedDateIso)) return "maxEfekt7";
  if (isMaxEfekt5Period(contractSignedDateIso)) return "maxEfekt5";
  return null;
}

export function maxEfektCoefficientParts(
  position: Position | null | undefined,
  mode: CommissionMode | null | undefined,
  contractSignedDateIso?: string | null
): MaxEfektCoefficientParts | null {
  if (!position) return null;
  const version = maxEfektCoefficientVersion(contractSignedDateIso);
  if (!version) return null;
  const base =
    version === "maxEfekt7"
      ? MAXEFEKT7_BASE_COEFFICIENTS[position]
      : MAXEFEKT5_BASE_COEFFICIENTS[position];
  if (!base) return null;

  const b3601Immediate = isAcceleratedMode(mode) ? base.b3601 / 2 : 0;
  const b3601Deferred = isAcceleratedMode(mode) ? base.b3601 / 2 : base.b3601;
  const okamzita = base.a101 + base.b0301 + b3601Immediate;

  return {
    version,
    isMaxEfekt5: version === "maxEfekt5",
    isMaxEfekt7: version === "maxEfekt7",
    a101: base.a101,
    b0301: base.b0301,
    b3601Immediate,
    b3601Deferred,
    b4801: base.b4801,
    n5plus: base.n5plus,
    okamzita,
    po3: b3601Deferred,
    po4: base.b4801,
  };
}

export function maxEfektCoefficients(
  position: Position,
  mode: CommissionMode,
  contractSignedDateIso?: string | null
): MaxEfektK {
  const maxEfektParts = maxEfektCoefficientParts(
    position,
    mode,
    contractSignedDateIso
  );
  if (maxEfektParts) {
    return {
      okamzita: maxEfektParts.okamzita,
      po3: maxEfektParts.po3,
      po4: maxEfektParts.po4,
      n5plus: maxEfektParts.n5plus,
    };
  }

  if (mode === "accelerated") {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return { okamzita: 0.016186, po3: 0.002555, po4: 0.00085, n5plus: 0.0198 };
      case "poradce2":
        return { okamzita: 0.018085, po3: 0.002855, po4: 0.00095, n5plus: 0.0218 };
      case "poradce3":
        return { okamzita: 0.01963, po3: 0.0031, po4: 0.00103, n5plus: 0.0238 };
      case "poradce4":
        return { okamzita: 0.0245, po3: 0.00387, po4: 0.00129, n5plus: 0.031 };
      case "poradce5":
        return { okamzita: 0.02755, po3: 0.00435, po4: 0.00145, n5plus: 0.035 };
      case "poradce6":
        return { okamzita: 0.02944, po3: 0.00465, po4: 0.00155, n5plus: 0.0389 };
      case "poradce7":
        return { okamzita: 0.032885, po3: 0.005195, po4: 0.00173, n5plus: 0.0429 };
      case "poradce8":
        return { okamzita: 0.034855, po3: 0.005505, po4: 0.00183, n5plus: 0.0475 };
      case "poradce9":
        return { okamzita: 0.03633, po3: 0.00574, po4: 0.00191, n5plus: 0.0521 };
      case "poradce10":
        return { okamzita: 0.03736, po3: 0.0059, po4: 0.00196, n5plus: 0.0568 };
      // Manažeři 4–10
      case "manazer4":
        return { okamzita: 0.02944, po3: 0.00465, po4: 0.00155, n5plus: 0.0389 };
      case "manazer5":
        return { okamzita: 0.032865, po3: 0.005195, po4: 0.00173, n5plus: 0.0429 };
      case "manazer6":
        return { okamzita: 0.03609, po3: 0.0057, po4: 0.0019, n5plus: 0.0475 };
      case "manazer7":
        return { okamzita: 0.03926, po3: 0.0062, po4: 0.00206, n5plus: 0.0521 };
      case "manazer8":
        return { okamzita: 0.042695, po3: 0.006745, po4: 0.00224, n5plus: 0.0568 };
      case "manazer9":
        return { okamzita: 0.04563, po3: 0.00721, po4: 0.0024, n5plus: 0.0614 };
      case "manazer10":
        return { okamzita: 0.04907, po3: 0.00775, po4: 0.00258, n5plus: 0.066 };
    }
  } else {
    // standard režim – jiné okamžité + po 3 letech, zbytek jako ve zrychleném
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return { okamzita: 0.01363, po3: 0.00511, po4: 0.00085, n5plus: 0.0198 };
      case "poradce2":
        return { okamzita: 0.01523, po3: 0.00571, po4: 0.00095, n5plus: 0.0218 };
      case "poradce3":
        return { okamzita: 0.01653, po3: 0.0062, po4: 0.00103, n5plus: 0.0238 };
      case "poradce4":
        return { okamzita: 0.02063, po3: 0.00774, po4: 0.00129, n5plus: 0.031 };
      case "poradce5":
        return { okamzita: 0.0232, po3: 0.0087, po4: 0.00145, n5plus: 0.035 };
      case "poradce6":
        return { okamzita: 0.02479, po3: 0.0093, po4: 0.00155, n5plus: 0.0389 };
      case "poradce7":
        return { okamzita: 0.02769, po3: 0.01039, po4: 0.00173, n5plus: 0.0429 };
      case "poradce8":
        return { okamzita: 0.02935, po3: 0.01101, po4: 0.00183, n5plus: 0.0475 };
      case "poradce9":
        return { okamzita: 0.03059, po3: 0.01148, po4: 0.00191, n5plus: 0.0521 };
      case "poradce10":
        return { okamzita: 0.03146, po3: 0.0118, po4: 0.00196, n5plus: 0.0568 };
      // Manažeři 4–10
      case "manazer4":
        return { okamzita: 0.02479, po3: 0.0093, po4: 0.00155, n5plus: 0.0389 };
      case "manazer5":
        return { okamzita: 0.02767, po3: 0.01039, po4: 0.00173, n5plus: 0.0429 };
      case "manazer6":
        return { okamzita: 0.03039, po3: 0.0114, po4: 0.0019, n5plus: 0.0475 };
      case "manazer7":
        return { okamzita: 0.03306, po3: 0.0124, po4: 0.00206, n5plus: 0.0521 };
      case "manazer8":
        return { okamzita: 0.03595, po3: 0.01349, po4: 0.00224, n5plus: 0.0568 };
      case "manazer9":
        return { okamzita: 0.03842, po3: 0.01442, po4: 0.0024, n5plus: 0.0614 };
      case "manazer10":
        return { okamzita: 0.04132, po3: 0.0155, po4: 0.00258, n5plus: 0.066 };
    }
  }
}

export function calculateMaxEfekt(
  monthly: number,
  years: number,
  position: Position,
  mode: CommissionMode = "accelerated",
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const annual = monthly * 12;
  const maxEfektParts = maxEfektCoefficientParts(
    position,
    mode,
    contractSignedDateIso
  );
  const maxDurationYears = maxEfektParts
    ? MAXEFEKT5_7_MAX_DURATION_YEARS
    : MAXEFEKT_LEGACY_MAX_DURATION_YEARS;
  const rawYears = typeof years === "number" && Number.isFinite(years)
    ? Math.floor(years)
    : maxDurationYears;
  const y = Math.max(1, Math.min(maxDurationYears, rawYears));

  if (maxEfektParts) {
    const a101 = annual * y * maxEfektParts.a101;
    const b0301 = annual * y * maxEfektParts.b0301;
    const b3601Immediate = annual * y * maxEfektParts.b3601Immediate;
    const po3 = annual * y * maxEfektParts.po3;
    const po4 = annual * y * maxEfektParts.po4;
    const tailYears = Math.max(0, y - 4);
    const naslRocne = annual * maxEfektParts.n5plus;
    const naslTotal = naslRocne * tailYears;
    const total = a101 + b0301 + b3601Immediate + po3 + po4 + naslTotal;

    const items: CommissionResultItemDTO[] = [
      { title: "💸 Provize A101", amount: a101, code: "A101" },
      {
        title: "💸 Provize B0301",
        amount: b0301,
        code: "B0301",
        note: "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!",
      },
      ...(b3601Immediate > 0
        ? [
            {
              title: "💸 Provize 50% z B3601",
              amount: b3601Immediate,
              code: "B3601_HALF",
            },
          ]
        : []),
      { title: "📅 Provize po 3 letech", amount: po3, code: "B3601" },
      { title: "📅 Provize po 4 letech", amount: po4, code: "B4801" },
      {
        title: "🔁 Následná provize (od 5. roku)",
        amount: naslRocne,
        code: "B101-B104",
        note: `ročně × ${tailYears}`,
      },
      { title: "💰 Celkem", amount: total, code: "TOTAL" },
    ];

    return { items, total };
  }

  const k = maxEfektCoefficients(position, mode, contractSignedDateIso);

  const okamzita = annual * y * k.okamzita;
  const po3 = annual * y * k.po3;
  const po4 = annual * y * k.po4;

  const tailYears = Math.max(0, y - 4);
  const naslRocne = annual * k.n5plus;
  const naslTotal = naslRocne * tailYears;

  const total = okamzita + po3 + po4 + naslTotal;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: okamzita, code: "A101" },
    { title: "📅 Provize po 3 letech", amount: po3, code: "B3601" },
    { title: "📅 Provize po 4 letech", amount: po4, code: "B4801" },
    {
      title: "🔁 Následná provize (od 5. roku)",
      amount: naslRocne,
      code: "B101-B104",
      note: `ročně × ${tailYears}`,
    },
    { title: "💰 Celkem", amount: total },
  ];

  return { items, total };
}
