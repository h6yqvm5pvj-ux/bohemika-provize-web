import {
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";

// ---------- MAXIMA ŽP MaxEfekt ----------

type MaxEfektK = {
  okamzita: number; // měsíční × 12 × roky × k
  po3: number; // měsíční × 12 × roky × k
  po4: number; // měsíční × 12 × roky × k
  n5plus: number; // následná od 5. roku: měsíční × 12 × k (ročně)
};

export function maxEfektCoefficients(position: Position, mode: CommissionMode): MaxEfektK {
  if (mode === "accelerated") {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return { okamzita: 0.016186, po3: 0.002555, po4: 0.00085, n5plus: 0.0198 };
      case "poradce2":
        return { okamzita: 0.018085, po3: 0.002855, po4: 0.00095, n5plus: 0.0218 };
      case "poradce3":
        return { okamzita: 0.01963, po3: 0.0031, po4: 0.00103, n5plus: 0.0238 };
      case "poradce4":
        return { okamzita: 0.0245, po3: 0.00387, po4: 0.00129, n5plus: 0.031 };
      case "poradce5":
        return { okamzita: 0.02755, po3: 0.00435, po4: 0.00145, n5plus: 0.035 };
      case "poradce6":
        return { okamzita: 0.02944, po3: 0.00465, po4: 0.00155, n5plus: 0.0389 };
      case "poradce7":
        return { okamzita: 0.032885, po3: 0.005195, po4: 0.00173, n5plus: 0.0429 };
      case "poradce8":
        return { okamzita: 0.034855, po3: 0.005505, po4: 0.00183, n5plus: 0.0475 };
      case "poradce9":
        return { okamzita: 0.03633, po3: 0.00574, po4: 0.00191, n5plus: 0.0521 };
      case "poradce10":
        return { okamzita: 0.03736, po3: 0.0059, po4: 0.00196, n5plus: 0.0568 };
      // Manažeři 4–10
      case "manazer4":
        return { okamzita: 0.02944, po3: 0.00465, po4: 0.00155, n5plus: 0.0389 };
      case "manazer5":
        return { okamzita: 0.032865, po3: 0.005195, po4: 0.00173, n5plus: 0.0429 };
      case "manazer6":
        return { okamzita: 0.03609, po3: 0.0057, po4: 0.0019, n5plus: 0.0475 };
      case "manazer7":
        return { okamzita: 0.03926, po3: 0.0062, po4: 0.00206, n5plus: 0.0521 };
      case "manazer8":
        return { okamzita: 0.042695, po3: 0.006745, po4: 0.00224, n5plus: 0.0568 };
      case "manazer9":
        return { okamzita: 0.04563, po3: 0.00721, po4: 0.0024, n5plus: 0.0614 };
      case "manazer10":
        return { okamzita: 0.04907, po3: 0.00775, po4: 0.00258, n5plus: 0.066 };
    }
  } else {
    // standard režim – jiné okamžité + po 3 letech, zbytek jako ve zrychleném
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return { okamzita: 0.01363, po3: 0.00511, po4: 0.00085, n5plus: 0.0198 };
      case "poradce2":
        return { okamzita: 0.01523, po3: 0.00571, po4: 0.00095, n5plus: 0.0218 };
      case "poradce3":
        return { okamzita: 0.01653, po3: 0.0062, po4: 0.00103, n5plus: 0.0238 };
      case "poradce4":
        return { okamzita: 0.02063, po3: 0.00774, po4: 0.00129, n5plus: 0.031 };
      case "poradce5":
        return { okamzita: 0.0232, po3: 0.0087, po4: 0.00145, n5plus: 0.035 };
      case "poradce6":
        return { okamzita: 0.02479, po3: 0.0093, po4: 0.00155, n5plus: 0.0389 };
      case "poradce7":
        return { okamzita: 0.02769, po3: 0.01039, po4: 0.00173, n5plus: 0.0429 };
      case "poradce8":
        return { okamzita: 0.02935, po3: 0.01101, po4: 0.00183, n5plus: 0.0475 };
      case "poradce9":
        return { okamzita: 0.03059, po3: 0.01148, po4: 0.00191, n5plus: 0.0521 };
      case "poradce10":
        return { okamzita: 0.03146, po3: 0.0118, po4: 0.00196, n5plus: 0.0568 };
      // Manažeři 4–10
      case "manazer4":
        return { okamzita: 0.02479, po3: 0.0093, po4: 0.00155, n5plus: 0.0389 };
      case "manazer5":
        return { okamzita: 0.02767, po3: 0.01039, po4: 0.00173, n5plus: 0.0429 };
      case "manazer6":
        return { okamzita: 0.03039, po3: 0.0114, po4: 0.0019, n5plus: 0.0475 };
      case "manazer7":
        return { okamzita: 0.03306, po3: 0.0124, po4: 0.00206, n5plus: 0.0521 };
      case "manazer8":
        return { okamzita: 0.03595, po3: 0.01349, po4: 0.00224, n5plus: 0.0568 };
      case "manazer9":
        return { okamzita: 0.03842, po3: 0.01442, po4: 0.0024, n5plus: 0.0614 };
      case "manazer10":
        return { okamzita: 0.04132, po3: 0.0155, po4: 0.00258, n5plus: 0.066 };
    }
  }
}

export function calculateMaxEfekt(
  monthly: number,
  years: number,
  position: Position,
  mode: CommissionMode = "accelerated"
): CommissionResultDTO {
  const k = maxEfektCoefficients(position, mode);
  const y = Math.max(1, Math.min(20, years));
  const annual = monthly * 12;

  const okamzita = annual * y * k.okamzita;
  const po3 = annual * y * k.po3;
  const po4 = annual * y * k.po4;

  const tailYears = Math.max(0, y - 4);
  const naslRocne = annual * k.n5plus;
  const naslTotal = naslRocne * tailYears;

  const total = okamzita + po3 + po4 + naslTotal;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: okamzita },
    { title: "📅 Provize po 3 letech", amount: po3 },
    { title: "📅 Provize po 4 letech", amount: po4 },
    {
      title: "🔁 Následná provize (od 5. roku)",
      amount: naslRocne,
      note: `ročně × ${tailYears}`,
    },
    { title: "💰 Celkem", amount: total },
  ];

  return { items, total };
}


