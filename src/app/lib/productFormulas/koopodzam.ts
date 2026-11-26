import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, normalizeIsoDay, pct, periodsPerYear } from "./shared";

// ---------- Kooperativa Pojištění odpovědnosti zaměstnance ----------

export const KOOP_ODZAM_CURRENT_VALID_FROM = "2026-09-01";

const HISTORICAL_PERCENTAGES: Record<Position, number> = {
  poradce1: 3.24,
  poradce2: 3.53,
  poradce3: 3.82,
  poradce4: 4.10,
  poradce5: 4.39,
  poradce6: 4.68,
  poradce7: 5.83,
  poradce8: 6.12,
  poradce9: 6.41,
  poradce10: 6.70,
  manazer4: 5.83,
  manazer5: 6.12,
  manazer6: 6.41,
  manazer7: 6.70,
  manazer8: 6.98,
  manazer9: 7.27,
  manazer10: 7.56,
};

const CURRENT_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.02493,
  poradce2: 0.02785,
  poradce3: 0.03024,
  poradce4: 0.03775,
  poradce5: 0.04244,
  poradce6: 0.04536,
  poradce7: 0.05067,
  poradce8: 0.05369,
  poradce9: 0.05597,
  poradce10: 0.05756,
  manazer4: 0.04536,
  manazer5: 0.05067,
  manazer6: 0.05560,
  manazer7: 0.06048,
  manazer8: 0.06579,
  manazer9: 0.07029,
  manazer10: 0.07560,
};

export function isKoopOdzamHistoricalPeriod(contractSignedDateIso?: string | null): boolean {
  const signedDate = normalizeIsoDay(contractSignedDateIso);
  return signedDate !== null && signedDate < KOOP_ODZAM_CURRENT_VALID_FROM;
}

export function koopOdzamCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  return isKoopOdzamHistoricalPeriod(contractSignedDateIso)
    ? pct(HISTORICAL_PERCENTAGES[position])
    : CURRENT_COEFFICIENTS[position];
}

export const koopOdzamImmediateCoefficient = koopOdzamCoefficient;
export const koopOdzamSubsequentCoefficient = koopOdzamCoefficient;

export function calculateKoopOdzam(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const coefficient = koopOdzamCoefficient(position, contractSignedDateIso);
  const perPaymentImmediate = amount * coefficient;
  const perPaymentSubsequent = amount * coefficient;
  const paymentsPerYear = periodsPerYear(frequency);

  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize (z platby)",
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
