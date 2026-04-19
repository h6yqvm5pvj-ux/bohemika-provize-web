import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- SLAVIA Auto ----------

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
    { title: "🚗 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}


