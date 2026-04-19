import {
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";
import { pct } from "./shared";

// ---------- FLEXI ----------

type FlexiK = {
  okamzita: number;
  po3: number;
  po4: number;
  naslednaOd6: number;
};

export function flexiCoefficients(position: Position, mode: CommissionMode): FlexiK {
  if (mode === "accelerated") {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 32.74135,
          po3: 6.46015,
          po4: 2.3563,
          naslednaOd6: 0.4618,
        };
      case "poradce2":
        return {
          okamzita: 36.57285,
          po3: 7.21615,
          po4: 2.6321,
          naslednaOd6: 0.5158,
        };
      case "poradce3":
        return {
          okamzita: 39.7076,
          po3: 7.8347,
          po4: 2.8577,
          naslednaOd6: 0.56,
        };
      case "poradce4":
        return {
          okamzita: 49.5649,
          po3: 9.7796,
          po4: 3.5671,
          naslednaOd6: 0.699,
        };
      case "poradce5":
        return {
          okamzita: 55.73005,
          po3: 10.99605,
          po4: 4.0108,
          naslednaOd6: 0.786,
        };
      case "poradce6":
        return {
          okamzita: 59.5615,
          po3: 11.752,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "poradce7":
        return {
          okamzita: 66.52775,
          po3: 13.12655,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "poradce8":
        return {
          okamzita: 70.4985,
          po3: 13.91,
          po4: 5.0736,
          naslednaOd6: 0.9942,
        };
      case "poradce9":
        return {
          okamzita: 73.49395,
          po3: 14.50105,
          po4: 5.2892,
          naslednaOd6: 1.0365,
        };
      case "poradce10":
        return {
          okamzita: 75.5839,
          po3: 14.9134,
          po4: 5.4396,
          naslednaOd6: 1.066,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 59.5615,
          po3: 11.752,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "manazer5":
        return {
          okamzita: 66.52775,
          po3: 13.12655,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "manazer6":
        return {
          okamzita: 73.0063,
          po3: 14.4048,
          po4: 5.2541,
          naslednaOd6: 1.0296,
        };
      case "manazer7":
        return {
          okamzita: 79.41525,
          po3: 15.66935,
          po4: 5.7154,
          naslednaOd6: 1.12,
        };
      case "manazer8":
        return {
          okamzita: 86.38155,
          po3: 17.04383,
          po4: 6.2167,
          naslednaOd6: 1.2182,
        };
      case "manazer9":
        return {
          okamzita: 92.3029,
          po3: 18.2122,
          po4: 6.6429,
          naslednaOd6: 1.3018,
        };
      case "manazer10":
        return {
          okamzita: 99.2691,
          po3: 19.5867,
          po4: 7.1442,
          naslednaOd6: 1.4,
        };
    }
  } else {
    // standard režim
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 26.2812,
          po3: 12.9203,
          po4: 2.3563,
          naslednaOd6: 0.4618,
        };
      case "poradce2":
        return {
          okamzita: 29.3567,
          po3: 14.4323,
          po4: 2.6321,
          naslednaOd6: 0.5158,
        };
      case "poradce3":
        return {
          okamzita: 31.8729,
          po3: 15.6694,
          po4: 2.8577,
          naslednaOd6: 0.56,
        };
      case "poradce4":
        return {
          okamzita: 39.7853,
          po3: 19.5592,
          po4: 3.5671,
          naslednaOd6: 0.699,
        };
      case "poradce5":
        return {
          okamzita: 44.734,
          po3: 21.9921,
          po4: 4.0108,
          naslednaOd6: 0.786,
        };
      case "poradce6":
        return {
          okamzita: 47.8095,
          po3: 23.504,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "poradce7":
        return {
          okamzita: 53.4012,
          po3: 26.2531,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "poradce8":
        return {
          okamzita: 56.5885,
          po3: 27.82,
          po4: 5.0736,
          naslednaOd6: 0.9942,
        };
      case "poradce9":
        return {
          okamzita: 58.9929,
          po3: 29.0021,
          po4: 5.2892,
          naslednaOd6: 1.0365,
        };
      case "poradce10":
        return {
          okamzita: 60.6705,
          po3: 29.8268,
          po4: 5.4396,
          naslednaOd6: 1.066,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 47.8095,
          po3: 23.504,
          po4: 4.2865,
          naslednaOd6: 0.84,
        };
      case "manazer5":
        return {
          okamzita: 53.4012,
          po3: 26.2531,
          po4: 4.7879,
          naslednaOd6: 0.9382,
        };
      case "manazer6":
        return {
          okamzita: 58.6015,
          po3: 28.8096,
          po4: 5.2541,
          naslednaOd6: 1.0296,
        };
      case "manazer7":
        return {
          okamzita: 63.7459,
          po3: 31.3387,
          po4: 5.7154,
          naslednaOd6: 1.12,
        };
      case "manazer8":
        return {
          okamzita: 69.3377,
          po3: 34.0877,
          po4: 6.2167,
          naslednaOd6: 1.2182,
        };
      case "manazer9":
        return {
          okamzita: 74.0907,
          po3: 36.4244,
          po4: 6.6429,
          naslednaOd6: 1.3018,
        };
      case "manazer10":
        return {
          okamzita: 79.6824,
          po3: 39.1734,
          po4: 7.1442,
          naslednaOd6: 1.4,
        };
    }
  }
}

export function calculateFlexi(
  monthly: number,
  position: Position,
  mode: CommissionMode = "accelerated",
  years = 6
): CommissionResultDTO {
  const k = flexiCoefficients(position, mode);
  const y = Math.max(1, Math.min(80, years));
  const annual = monthly * 12;

  const okamzita = annual * pct(k.okamzita);
  const po3 = annual * pct(k.po3);
  const po4 = annual * pct(k.po4);
  const n6 = annual * pct(k.naslednaOd6);
  const tailYears = Math.max(0, y - 5);

  const total = okamzita + po3 + po4 + n6 * tailYears;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: okamzita },
    { title: "📅 Provize po 3 letech", amount: po3 },
    { title: "📅 Provize po 4 letech", amount: po4 },
    { title: "🔁 Následná provize (od 6. roku)", amount: n6, note: `ročně × ${tailYears}` },
    { title: "💰 Celkem", amount: total },
  ];

  return { items, total };
}


