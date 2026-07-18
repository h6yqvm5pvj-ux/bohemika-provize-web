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
export const SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE =
  "Pro toto období sjednání nejsou v systému koeficienty (Technicky není možné je přidat).";

export function isSlaviaAutoSupportedForSignedDate(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return true;
  return signedDateIso >= SLAVIA_AUTO_COEFFICIENT_VALID_FROM;
}

export function slaviaAutoCoefficient(position: Position): number {
  return cppAutoCoefficient(position);
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
