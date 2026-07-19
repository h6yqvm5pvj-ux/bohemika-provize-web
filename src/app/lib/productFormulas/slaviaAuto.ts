import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- SLAVIA Auto ----------

export const SLAVIA_AUTO_COEFFICIENT_VALID_FROM = "2026-04-01";
export const SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM = "2025-08-01";
export const SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE =
  "Pro toto období sjednání nejsou v systému koeficienty (Technicky není možné je přidat).";

export function isSlaviaAutoSupportedForSignedDate(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return true;
  return signedDateIso >= SLAVIA_AUTO_COEFFICIENT_VALID_FROM;
}

export function isSlaviaFlotilaSupportedForSignedDate(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return true;
  return signedDateIso >= SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM;
}

export function slaviaAutoCoefficient(position: Position): number {
  return cppAutoCoefficient(position);
}

export function slaviaFlotilaCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return 0.03463;
    case "poradce2":
      return 0.03868;
    case "poradce3":
      return 0.042;
    case "poradce4":
      return 0.05243;
    case "poradce5":
      return 0.05895;
    case "poradce6":
      return 0.063;
    case "poradce7":
      return 0.07037;
    case "poradce8":
      return 0.07457;
    case "poradce9":
      return 0.07774;
    case "poradce10":
      return 0.07995;
    case "manazer4":
      return 0.0633;
    case "manazer5":
      return 0.07037;
    case "manazer6":
      return 0.07722;
    case "manazer7":
      return 0.084;
    case "manazer8":
      return 0.09137;
    case "manazer9":
      return 0.09763;
    case "manazer10":
      return 0.105;
  }
}

export function slaviaFlotilaSubsequentCoefficient(position: Position): number {
  return slaviaFlotilaCoefficient(position);
}

export function calculateSlaviaAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = slaviaAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚗 Okamžitá provize", amount: perPayment, code: "A101" },
    {
      title: "🔁 Následná provize",
      amount: perPayment,
      code: "B101",
      excludeFromTotal: true,
    },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

export function calculateSlaviaFlotila(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = slaviaFlotilaCoefficient(position);
  const subsequentCoef = slaviaFlotilaSubsequentCoefficient(position);
  const perPayment = amount * coef;
  const subsequent = amount * subsequentCoef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚗 Okamžitá provize", amount: perPayment, code: "A101" },
    {
      title: "🔁 Následná provize",
      amount: subsequent,
      code: "B101",
      excludeFromTotal: true,
    },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}
