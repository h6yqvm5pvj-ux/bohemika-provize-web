import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";

// ---------- DOMEX ----------

export function domexCoefficient(position: Position): number {
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
      return 0.3123;
    case "manazer10":
      return 0.336;
  }
}

export function domexSubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0278;
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
      return 0.0622;
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

export function calculateDomex(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = domexCoefficient(position);
  const coefSub = domexSubsequentCoefficient(position);

  // ČPP vyplácí provizi dle platby, částka v kalkulačce je částka platby
  const multiplier =
    frequency === "monthly"
      ? 12
      : frequency === "quarterly"
      ? 4
      : frequency === "semiannual"
      ? 2
      : 1;

  const okamzitaPlatba = amount * coef;
  const naslednaPlatba = amount * coefSub;

  const okamzitaRok = okamzitaPlatba * multiplier;
  const naslednaRok = naslednaPlatba * multiplier;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize (z platby)", amount: okamzitaPlatba },
    {
      title: "🔁 Následná provize (z platby)",
      amount: naslednaPlatba,
      excludeFromTotal: true,
    },
    {
      title: "📅 Okamžitá provize za rok",
      amount: okamzitaRok,
      note: `×${multiplier} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: naslednaRok,
      note: `×${multiplier} plateb/rok`,
      excludeFromTotal: true,
    },
  ];

  const total = okamzitaRok;
  return { items, total };
}

