import {
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
} from "../../types/domain";
import { commissionInstallmentCodeRange, periodsPerYear } from "./shared";

// ---------- ČPP DOMEX NEURON ----------

export const DOMEX_NEURON_COEFFICIENT_VALID_FROM = "2026-09-01";

const DOMEX_NEURON_IMMEDIATE_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.1108,
  poradce2: 0.1238,
  poradce3: 0.1344,
  poradce4: 0.1678,
  poradce5: 0.1886,
  poradce6: 0.2016,
  poradce7: 0.2252,
  poradce8: 0.2386,
  poradce9: 0.2488,
  poradce10: 0.2558,
  manazer4: 0.2016,
  manazer5: 0.2252,
  manazer6: 0.2471,
  manazer7: 0.2688,
  manazer8: 0.2924,
  manazer9: 0.3124,
  manazer10: 0.336,
};

const DOMEX_NEURON_SUBSEQUENT_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.0278,
  poradce2: 0.0309,
  poradce3: 0.0336,
  poradce4: 0.0419,
  poradce5: 0.0472,
  poradce6: 0.0504,
  poradce7: 0.0563,
  poradce8: 0.0597,
  poradce9: 0.0622,
  poradce10: 0.064,
  manazer4: 0.0504,
  manazer5: 0.0563,
  manazer6: 0.0618,
  manazer7: 0.0672,
  manazer8: 0.0731,
  manazer9: 0.0781,
  manazer10: 0.084,
};

export function domexNeuronImmediateCoefficient(position: Position): number {
  return DOMEX_NEURON_IMMEDIATE_COEFFICIENTS[position];
}

export function domexNeuronSubsequentCoefficient(position: Position): number {
  return DOMEX_NEURON_SUBSEQUENT_COEFFICIENTS[position];
}

export function calculateDomexNeuron(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const paymentsPerYear = periodsPerYear(frequency);
  const perPaymentImmediate = amount * domexNeuronImmediateCoefficient(position);
  const perPaymentSubsequent = amount * domexNeuronSubsequentCoefficient(position);
  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize A101 (z platby)",
      amount: perPaymentImmediate,
      code: commissionInstallmentCodeRange("A", frequency),
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: perPaymentSubsequent,
      code: commissionInstallmentCodeRange("B", frequency),
      excludeFromTotal: true,
    },
    {
      title: "📅 Okamžitá provize za rok",
      amount: annualImmediate,
      note: `×${paymentsPerYear} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: annualSubsequent,
      note: `×${paymentsPerYear} plateb/rok`,
      excludeFromTotal: true,
    },
  ];

  return { items, total: annualImmediate };
}
