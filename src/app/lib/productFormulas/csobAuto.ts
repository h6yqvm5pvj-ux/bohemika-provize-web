import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- ČSOB Auto ----------

export function csobAutoCoefficient(position: Position): number {
  return cppAutoCoefficient(position);
}

export function calculateCsobAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = csobAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚙 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}


