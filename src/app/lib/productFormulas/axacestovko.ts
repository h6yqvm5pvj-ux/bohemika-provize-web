import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";

// ---------- AXA Cestovko ----------

export const AXA_CESTOVKO_COEFFICIENT_VALID_FROM = "2021-04-15";

export function axaCestovkoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0461;
    case "poradce2":
      return 0.0516;
    case "poradce3":
      return 0.056;
    case "poradce4":
      return 0.0699;
    case "poradce5":
      return 0.0786;
    case "poradce6":
      return 0.084;
    case "poradce7":
      return 0.0938;
    case "poradce8":
      return 0.0994;
    case "poradce9":
      return 0.1036;
    case "poradce10":
      return 0.1066;
    // Manažeři 4–10
    case "manazer4":
      return 0.084;
    case "manazer5":
      return 0.0938;
    case "manazer6":
      return 0.103;
    case "manazer7":
      return 0.112;
    case "manazer8":
      return 0.1218;
    case "manazer9":
      return 0.1302;
    case "manazer10":
      return 0.14;
  }
}

export function calculateAxaCestovko(
  amount: number,
  position: Position
): CommissionResultDTO {
  const coef = axaCestovkoCoefficient(position);
  const provize = amount * coef;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: provize, code: "A101" },
  ];
  return { items, total: provize };
}
