import {
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";
import { pct } from "./shared";

// ---------- Pillow Úraz / Nemoc ----------

type PillowInjuryK = { okamzita: number; po3: number; po4: number };

export function pillowInjuryCoefficients(position: Position, mode: CommissionMode): PillowInjuryK {
  if (mode === "accelerated") {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return { okamzita: 38.198, po3: 8.637, po4: 6.346 };
      case "poradce2":
        return { okamzita: 42.669, po3: 8.419, po4: 3.071 };
      case "poradce3":
        return { okamzita: 46.3255, po3: 9.1405, po4: 3.334 };
      case "poradce4":
        return { okamzita: 57.8255, po3: 11.4095, po4: 4.162 };
      case "poradce5":
        return { okamzita: 65.0173, po3: 12.8285, po4: 4.679 };
      case "poradce6":
        return { okamzita: 69.4875, po3: 13.7105, po4: 5.001 };
      case "poradce7":
        return { okamzita: 77.6163, po3: 15.3145, po4: 5.586 };
      case "poradce8":
        return { okamzita: 82.2485, po3: 16.2285, po4: 5.919 };
      case "poradce9":
        return { okamzita: 84.743, po3: 16.918, po4: 6.171 };
      case "poradce10":
        return { okamzita: 88.181, po3: 17.399, po4: 6.346 };
      // Manažeři 4–10
      case "manazer4":
        return { okamzita: 69.4875, po3: 13.7105, po4: 5.001 };
      case "manazer5":
        return { okamzita: 77.6165, po3: 15.3145, po4: 5.586 };
      case "manazer6":
        return { okamzita: 85.1735, po3: 16.8055, po4: 6.13 };
      case "manazer7":
        return { okamzita: 92.651, po3: 18.281, po4: 6.668 };
      case "manazer8":
        return { okamzita: 100.7785, po3: 19.8845, po4: 7.253 };
      case "manazer9":
        return { okamzita: 107.6865, po3: 21.2475, po4: 7.75 };
      case "manazer10":
        return { okamzita: 115.814, po3: 22.851, po4: 8.335 };
    }
  } else {
    // standard režim – jiné okamžité + po3, po4 stejné jako zrychlené
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return { okamzita: 30.661, po3: 15.074, po4: 6.346 };
      case "poradce2":
        return { okamzita: 34.25, po3: 16.838, po4: 3.071 };
      case "poradce3":
        return { okamzita: 37.185, po3: 18.281, po4: 3.334 };
      case "poradce4":
        return { okamzita: 46.416, po3: 22.819, po4: 4.162 };
      case "poradce5":
        return { okamzita: 52.189, po3: 25.657, po4: 4.679 };
      case "poradce6":
        return { okamzita: 55.777, po3: 27.421, po4: 5.001 };
      case "poradce7":
        return { okamzita: 62.302, po3: 30.629, po4: 5.586 };
      case "poradce8":
        return { okamzita: 66.02, po3: 32.457, po4: 5.919 };
      case "poradce9":
        return { okamzita: 68.825, po3: 33.836, po4: 6.171 };
      case "poradce10":
        return { okamzita: 70.782, po3: 34.798, po4: 6.346 };
      // Manažeři 4–10
      case "manazer4":
        return { okamzita: 55.777, po3: 13.7105, po4: 5.001 };
      case "manazer5":
        return { okamzita: 62.302, po3: 15.3145, po4: 5.586 };
      case "manazer6":
        return { okamzita: 68.368, po3: 16.8055, po4: 6.13 };
      case "manazer7":
        return { okamzita: 74.37, po3: 18.281, po4: 6.668 };
      case "manazer8":
        return { okamzita: 80.894, po3: 19.8845, po4: 7.253 };
      case "manazer9":
        return { okamzita: 86.439, po3: 21.2475, po4: 7.75 };
      case "manazer10":
        return { okamzita: 92.963, po3: 22.851, po4: 8.335 };
    }
  }
}

export function calculatePillowInjury(
  monthly: number,
  position: Position,
  mode: CommissionMode = "accelerated"
): CommissionResultDTO {
  const annual = monthly * 12;
  const k = pillowInjuryCoefficients(position, mode);

  const okamzita = annual * pct(k.okamzita);
  const po3 = annual * pct(k.po3);
  const po4 = annual * pct(k.po4);
  const total = okamzita + po3 + po4;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: okamzita },
    { title: "📅 Provize po 3 letech", amount: po3 },
    { title: "📅 Provize po 4 letech", amount: po4 },
    { title: "🧮 Celková provize", amount: total },
  ];
  return { items, total };
}


