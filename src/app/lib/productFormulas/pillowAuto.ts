import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- Pillow Auto ----------

export function pillowAutoCoefficient(position: Position): number {
  return cppAutoCoefficient(position);
}

export function calculatePillowAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = pillowAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}


