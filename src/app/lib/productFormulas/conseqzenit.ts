import type { CommissionResultDTO, Position } from "../../types/domain";

export const CONSEQ_ZENIT_COEFFICIENT_VALID_FROM = "2024-08-01";

export const CONSEQ_ZENIT_BANDS = ["100–299 Kč", "300–999 Kč", "1 000 Kč a více"] as const;

// Fixed CZK amounts in every band, as explicitly requested by the product owner.
// Values transcribed from the supplied advisor and manager screenshots.
export const CONSEQ_ZENIT_COMMISSIONS: Record<Position, readonly [number, number, number]> = {
  poradce1: [23.086, 46.172, 686],
  poradce2: [25.788, 51.576, 766],
  poradce3: [28, 56, 832],
  poradce4: [34.951, 69.902, 1038],
  poradce5: [39.298, 78.596, 1167],
  poradce6: [42, 84, 1247],
  poradce7: [46.914, 93.828, 1393],
  poradce8: [49.714, 99.428, 1477],
  poradce9: [51.828, 103.656, 1539],
  poradce10: [53.298, 106.596, 1583],
  manazer4: [42, 84, 1247],
  manazer5: [46.914, 93.828, 1393],
  manazer6: [51.478, 102.956, 1529],
  manazer7: [56, 112, 1663],
  manazer8: [60.914, 121.828, 1809],
  manazer9: [65.086, 130.172, 1933],
  manazer10: [70, 140, 2079],
};

export function calculateConseqZenit(amount: number, position: Position): CommissionResultDTO {
  const band = amount < 300 ? 0 : amount < 1000 ? 1 : 2;
  const commission = Number.isFinite(amount) && amount >= 100
    ? CONSEQ_ZENIT_COMMISSIONS[position][band]
    : 0;
  return {
    items: [{ title: "💸 Okamžitá provize", amount: commission, code: "A101" }],
    total: commission,
  };
}
