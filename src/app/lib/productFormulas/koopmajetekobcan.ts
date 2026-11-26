import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, normalizeIsoDay, periodsPerYear } from "./shared";

// ---------- Kooperativa majetek + odpovědnost občanů ----------

export const KOOP_MAJETEK_OBCAN_CURRENT_VALID_FROM = "2026-09-01";

export function isKoopMajetekObcanHistoricalPeriod(contractSignedDateIso?: string | null): boolean {
  const signedDate = normalizeIsoDay(contractSignedDateIso);
  return signedDate !== null && signedDate < KOOP_MAJETEK_OBCAN_CURRENT_VALID_FROM;
}

export function koopMajetekObcanImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.1108;
    case "poradce2":
      return 0.1238;
    case "poradce3":
      return 0.1344;
    case "poradce4":
      return 0.1678;
    case "poradce5":
      return 0.1886;
    case "poradce6":
      return 0.2016;
    case "poradce7":
      return 0.2252;
    case "poradce8":
      return 0.2386;
    case "poradce9":
      return 0.2488;
    case "poradce10":
      return 0.2558;
    // Manažeři 4–10
    case "manazer4":
      return 0.2016;
    case "manazer5":
      return 0.2252;
    case "manazer6":
      return 0.2471;
    case "manazer7":
      return 0.2688;
    case "manazer8":
      return 0.2924;
    case "manazer9":
      return 0.3124;
    case "manazer10":
      return 0.336;
  }
}

function originalKoopPropertySubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0277;
    case "poradce2":
      return 0.0309;
    case "poradce3":
      return 0.0336;
    case "poradce4":
      return 0.0419;
    case "poradce5":
      return 0.0472;
    case "poradce6":
      return 0.0504;
    case "poradce7":
      return 0.0563;
    case "poradce8":
      return 0.0597;
    case "poradce9":
      return 0.0662;
    case "poradce10":
      return 0.064;
    // Manažeři 4–10
    case "manazer4":
      return 0.0504;
    case "manazer5":
      return 0.0563;
    case "manazer6":
      return 0.0618;
    case "manazer7":
      return 0.0672;
    case "manazer8":
      return 0.0731;
    case "manazer9":
      return 0.0781;
    case "manazer10":
      return 0.084;
  }
}

export const koopFitSubsequentCoefficient = originalKoopPropertySubsequentCoefficient;

export function koopMajetekObcanSubsequentCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (position === "poradce9" && !isKoopMajetekObcanHistoricalPeriod(contractSignedDateIso)) {
    return 0.0622;
  }
  return originalKoopPropertySubsequentCoefficient(position);
}

export function calculateKoopMajetekObcan(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  return calculateKoopPropertyCommission(
    amount,
    frequency,
    position,
    koopMajetekObcanSubsequentCoefficient(position, contractSignedDateIso)
  );
}

export function calculateKoopFit(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  return calculateKoopPropertyCommission(amount, frequency, position, koopFitSubsequentCoefficient(position));
}

function calculateKoopPropertyCommission(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  coefSubsequent: number
): CommissionResultDTO {
  const coefImmediate = koopMajetekObcanImmediateCoefficient(position);
  const multiplier = periodsPerYear(frequency);

  const immediateByPayment = amount * coefImmediate;
  const subsequentByPayment = amount * coefSubsequent;

  const immediatePerYear = immediateByPayment * multiplier;
  const subsequentPerYear = subsequentByPayment * multiplier;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize (z platby)",
      amount: immediateByPayment,
      code: commissionInstallmentCodeRange("A", frequency),
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: subsequentByPayment,
      code: commissionInstallmentCodeRange("B", frequency),
      excludeFromTotal: true,
    },
    {
      title: "📅 Okamžitá provize za rok",
      amount: immediatePerYear,
      note: `×${multiplier} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: subsequentPerYear,
      note: `×${multiplier} plateb/rok`,
      excludeFromTotal: true,
    },
  ];

  const total = immediatePerYear;
  return { items, total };
}
