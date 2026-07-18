import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type MaxCizinKomplexVariant,
} from "../../types/domain";

const MAX_CIZIN_KOMPLEX_COEFFICIENTS: Record<
  MaxCizinKomplexVariant,
  Record<Position, number>
> = {
  exclusiveStandard: {
    poradce1: 0.0693,
    poradce2: 0.0774,
    poradce3: 0.084,
    poradce4: 0.1049,
    poradce5: 0.1179,
    poradce6: 0.126,
    poradce7: 0.1407,
    poradce8: 0.1491,
    poradce9: 0.1555,
    poradce10: 0.1599,
    manazer4: 0.126,
    manazer5: 0.1407,
    manazer6: 0.1544,
    manazer7: 0.168,
    manazer8: 0.1827,
    manazer9: 0.1953,
    manazer10: 0.21,
  },
  premium: {
    poradce1: 0.0231,
    poradce2: 0.0258,
    poradce3: 0.028,
    poradce4: 0.035,
    poradce5: 0.0393,
    poradce6: 0.042,
    poradce7: 0.0469,
    poradce8: 0.0497,
    poradce9: 0.0518,
    poradce10: 0.0533,
    manazer4: 0.042,
    manazer5: 0.0469,
    manazer6: 0.0515,
    manazer7: 0.056,
    manazer8: 0.0609,
    manazer9: 0.0651,
    manazer10: 0.07,
  },
};

export const MAX_CIZIN_KOMPLEX_DEFAULT_VARIANT: MaxCizinKomplexVariant =
  "exclusiveStandard";

export function maxCizinKomplexCoefficient(
  position: Position,
  variant: MaxCizinKomplexVariant = MAX_CIZIN_KOMPLEX_DEFAULT_VARIANT
): number {
  return MAX_CIZIN_KOMPLEX_COEFFICIENTS[variant][position];
}

export function maxCizinKomplexVariantLabel(
  variant: MaxCizinKomplexVariant
): string {
  return variant === "premium" ? "PREMIUM" : "EXCLUSIVE / STANDARD";
}

export function calculateMaxCizinKomplex(
  amount: number,
  position: Position,
  variant: MaxCizinKomplexVariant = MAX_CIZIN_KOMPLEX_DEFAULT_VARIANT
): CommissionResultDTO {
  const coef = maxCizinKomplexCoefficient(position, variant);
  const provize = amount * coef;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize",
      amount: provize,
      code: "A101",
      note: `Varianta ${maxCizinKomplexVariantLabel(variant)}`,
    },
  ];

  return { items, total: provize };
}
