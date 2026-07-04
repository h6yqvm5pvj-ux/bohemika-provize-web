import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- Kooperativa Auto ----------

export function kooperativaAutoCoefficient(position: Position): number {
  return cppAutoCoefficient(position);
}

export function calculateKooperativaAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = kooperativaAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚙 Okamžitá provize", amount: perPayment, code: "A101" },
    {
      title: "🔁 Následná provize",
      amount: perPayment,
      code: "B101",
      excludeFromTotal: true,
    },
    { title: "Celkem za rok", amount: annualTotal },
  ];

  return { items, total: annualTotal };
}

