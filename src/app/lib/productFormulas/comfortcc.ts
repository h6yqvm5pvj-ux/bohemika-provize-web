import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";

// ---------- Comfort Commodity ----------

export function comfortCCImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.1478;
    case "poradce2":
      return 0.1551;
    case "poradce3":
      return 0.1792;
    case "poradce4":
      return 0.2237;
    case "poradce5":
      return 0.2515;
    case "poradce6":
      return 0.2688;
    case "poradce7":
      return 0.3002;
    case "poradce8":
      return 0.3182;
    case "poradce9":
      return 0.3317;
    case "poradce10":
      return 0.3411;
    // Manažeři 4–10
    case "manazer4":
      return 0.2688;
    case "manazer5":
      return 0.3002;
    case "manazer6":
      return 0.3295;
    case "manazer7":
      return 0.3584;
    case "manazer8":
      return 0.3898;
    case "manazer9":
      return 0.4166;
    case "manazer10":
      return 0.448;
  }
}

export function comfortCCSubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0074;
    case "poradce2":
      return 0.0083;
    case "poradce3":
      return 0.009;
    case "poradce4":
      return 0.0112;
    case "poradce5":
      return 0.0126;
    case "poradce6":
      return 0.0134;
    case "poradce7":
      return 0.015;
    case "poradce8":
      return 0.0159;
    case "poradce9":
      return 0.0166;
    case "poradce10":
      return 0.0171;
    // Manažeři 4–10
    case "manazer4":
      return 0.0134;
    case "manazer5":
      return 0.015;
    case "manazer6":
      return 0.0165;
    case "manazer7":
      return 0.0179;
    case "manazer8":
      return 0.0195;
    case "manazer9":
      return 0.0208;
    case "manazer10":
      return 0.0224;
  }
}

export function calculateComfortCCSimple(
  amount: number,
  position: Position
): CommissionResultDTO {
  const k = comfortCCImmediateCoefficient(position);
  const immediate = amount * k;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: immediate },
  ];
  return { items, total: immediate };
}

export function calculateComfortCCOneOff(
  fee: number,
  payment: number,
  position: Position
): CommissionResultDTO {
  const kImmediate = comfortCCImmediateCoefficient(position);
  const kSubsequent = comfortCCSubsequentCoefficient(position);

  const immediate = fee * kImmediate;
  const subsequent = payment > 0 ? payment * kSubsequent : 0;
  const total = immediate + subsequent;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: immediate },
  ];

  if (subsequent > 0) {
    items.push({ title: "🔁 Následná provize", amount: subsequent });
  }

  return { items, total };
}

export function calculateComfortCCGradual(
  initialFee: number,
  payment: number,
  position: Position,
  targetAmount = 0
): CommissionResultDTO {
  const kImmediate = comfortCCImmediateCoefficient(position);
  const kSubsequent = comfortCCSubsequentCoefficient(position);

  const baseImmediate = initialFee * kImmediate;
  const baseSubsequent = payment * kSubsequent;
  const immediate = baseImmediate + baseSubsequent;
  const subsequent = baseSubsequent;
  const payoutCount =
    targetAmount > 0 && payment > 0
      ? Math.max(1, Math.ceil(targetAmount / payment))
      : 1;
  const total = immediate + subsequent * Math.max(0, payoutCount - 1);
  const subsequentTitle =
    targetAmount > 0 && payment > 0
      ? `🔁 Následná provize z platby (x${payoutCount})`
      : "🔁 Následná provize z platby";

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: immediate },
    { title: subsequentTitle, amount: subsequent },
  ];

  return { items, total };
}

type ComfortCCInput = {
  fee: number;
  payment?: number;
  targetAmount?: number;
  isSavings?: boolean;
  isGradualFee?: boolean;
  position: Position;
};

export function calculateComfortCC({
  fee,
  payment = 0,
  targetAmount = 0,
  isSavings = false,
  isGradualFee = false,
  position,
}: ComfortCCInput): CommissionResultDTO {
  // prázdný vstup → nic
  if (fee <= 0 && (!isGradualFee || payment <= 0)) {
    return { items: [], total: 0 };
  }

  // Jednorázový nákup nebo spoření s jednorázovým poplatkem
  if (!isSavings || (isSavings && !isGradualFee)) {
    return calculateComfortCCOneOff(fee, payment, position);
  }

  // Spoření s postupným poplatkem
  return calculateComfortCCGradual(fee, payment, position, targetAmount);
}


