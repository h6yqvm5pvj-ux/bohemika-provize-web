import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- Allianz Auto ----------

export function allianzAutoCoefficient(position: Position): number {
  return cppAutoCoefficient(position);
}

export function calculateAllianzAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const annual = amount * periodsPerYear(frequency);
  const coef = allianzAutoCoefficient(position);
  const immediate = annual * coef;

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: immediate },
  ];
  return { items, total: immediate };
}


