import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";

// ---------- ČPP Cestovko ----------

export const CPP_CESTOVKO_COEFFICIENT_VALID_FROM = "2019-09-01";

export function cppCestovkoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.058;
    case "poradce2":
      return 0.064;
    case "poradce3":
      return 0.07;
    case "poradce4":
      return 0.087;
    case "poradce5":
      return 0.098;
    case "poradce6":
      return 0.105;
    case "poradce7":
      return 0.117;
    case "poradce8":
      return 0.124;
    case "poradce9":
      return 0.13;
    case "poradce10":
      return 0.133;
    // Manažeři 4–10
    case "manazer4":
      return 0.105;
    case "manazer5":
      return 0.117;
    case "manazer6":
      return 0.129;
    case "manazer7":
      return 0.14;
    case "manazer8":
      return 0.152;
    case "manazer9":
      return 0.163;
    case "manazer10":
      return 0.175;
  }
}

export function calculateCppCestovko(
  amount: number,
  position: Position
): CommissionResultDTO {
  const coef = cppCestovkoCoefficient(position);
  const provize = amount * coef;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: provize, code: "A101" },
  ];
  return { items, total: provize };
}
