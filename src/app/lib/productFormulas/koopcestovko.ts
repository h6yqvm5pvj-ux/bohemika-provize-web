import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";

// ---------- Kooperativa Cestovko ----------

export function koopCestovkoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.03;
    case "poradce2":
      return 0.0335;
    case "poradce3":
      return 0.0364;
    case "poradce4":
      return 0.0454;
    case "poradce5":
      return 0.0511;
    case "poradce6":
      return 0.0546;
    case "poradce7":
      return 0.061;
    case "poradce8":
      return 0.0646;
    case "poradce9":
      return 0.0674;
    case "poradce10":
      return 0.0693;
    // Manažeři 4–10
    case "manazer4":
      return 0.0546;
    case "manazer5":
      return 0.061;
    case "manazer6":
      return 0.0669;
    case "manazer7":
      return 0.0728;
    case "manazer8":
      return 0.0792;
    case "manazer9":
      return 0.0846;
    case "manazer10":
      return 0.091;
  }
}

export function calculateKoopCestovko(
  amount: number,
  position: Position
): CommissionResultDTO {
  const coef = koopCestovkoCoefficient(position);
  const provize = amount * coef;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: provize },
  ];
  return { items, total: provize };
}
