import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import {
  domexCoefficient,
  domexSubsequentCoefficient,
} from "./domex";
import { commissionInstallmentCodeRange, periodsPerYear } from "./shared";

export const PILLOW_MAJETEK_COEFFICIENT_VALID_FROM = "2023-10-01";

export function pillowMajetekImmediateCoefficient(position: Position): number {
  return domexCoefficient(position);
}

export function pillowMajetekSubsequentCoefficient(position: Position): number {
  return domexSubsequentCoefficient(position);
}

export function calculatePillowMajetek(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const annualPremium = amount * periodsPerYear(frequency);
  const immediate = annualPremium * pillowMajetekImmediateCoefficient(position);
  const subsequent = annualPremium * pillowMajetekSubsequentCoefficient(position);

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize",
      amount: immediate,
      code: commissionInstallmentCodeRange("A", frequency),
    },
    {
      title: "🔁 Následná provize",
      amount: subsequent,
      code: commissionInstallmentCodeRange("B", frequency),
      excludeFromTotal: true,
    },
  ];

  return {
    items,
    total: immediate,
  };
}
