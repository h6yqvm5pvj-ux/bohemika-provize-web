// src/app/lib/productFormulas.ts
import {
  type Product,
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../types/domain";

// pomocná funkce pro procenta (u FLEXI apod.)
const pct = (v: number) => v / 100;

// pomocná funkce pro přepočet frekvencí na počet plateb za rok
function periodsPerYear(f: PaymentFrequency): number {
  switch (f) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
      return 1;
  }
}

// ---------- NEON ----------

type NeonK = {
  okamzita: number;
  po3: number;
  po4: number;
  n2to5: number;
  n5to10: number;
};

function neonCoefficients(position: Position, mode: CommissionMode): NeonK {
  if (mode === "accelerated") {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 0.020885,
          po3: 0.004445,
          po4: 0.00133,
          n2to5: 0.00218,
          n5to10: 0.01524,
        };
      case "poradce2":
        return {
          okamzita: 0.02385,
          po3: 0.00489,
          po4: 0.00154,
          n2to5: 0.00243,
          n5to10: 0.01702,
        };
      case "poradce3":
        return {
          okamzita: 0.025685,
          po3: 0.005335,
          po4: 0.00168,
          n2to5: 0.00264,
          n5to10: 0.01848,
        };
      case "poradce4":
        return {
          okamzita: 0.03471,
          po3: 0.00689,
          po4: 0.00241,
          n2to5: 0.0033,
          n5to10: 0.02307,
        };
      case "poradce5":
        return {
          okamzita: 0.03806,
          po3: 0.00761,
          po4: 0.00267,
          n2to5: 0.00371,
          n5to10: 0.02594,
        };
      case "poradce6":
        return {
          okamzita: 0.04045,
          po3: 0.008,
          po4: 0.00287,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "poradce7":
        return {
          okamzita: 0.042275,
          po3: 0.008385,
          po4: 0.00302,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "poradce8":
        return {
          okamzita: 0.04468,
          po3: 0.00877,
          po4: 0.00319,
          n2to5: 0.00469,
          n5to10: 0.03281,
        };
      case "poradce9":
        return {
          okamzita: 0.046485,
          po3: 0.009165,
          po4: 0.00334,
          n2to5: 0.00489,
          n5to10: 0.0342,
        };
      case "poradce10":
        return {
          okamzita: 0.04829,
          po3: 0.00955,
          po4: 0.00347,
          n2to5: 0.00503,
          n5to10: 0.03518,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 0.037945,
          po3: 0.007575,
          po4: 0.00267,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "manazer5":
        return {
          okamzita: 0.042125,
          po3: 0.008395,
          po4: 0.00299,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "manazer6":
        return {
          okamzita: 0.046295,
          po3: 0.009205,
          po4: 0.0033,
          n2to5: 0.00485,
          n5to10: 0.03398,
        };
      case "manazer7":
        return {
          okamzita: 0.050515,
          po3: 0.010015,
          po4: 0.0036,
          n2to5: 0.00528,
          n5to10: 0.03696,
        };
      case "manazer8":
        return {
          okamzita: 0.05468,
          po3: 0.01083,
          po4: 0.00392,
          n2to5: 0.00574,
          n5to10: 0.0402,
        };
      case "manazer9":
        return {
          okamzita: 0.058855,
          po3: 0.011633,
          po4: 0.00423,
          n2to5: 0.00614,
          n5to10: 0.04296,
        };
      case "manazer10":
        return {
          okamzita: 0.063134,
          po3: 0.012445,
          po4: 0.00455,
          n2to5: 0.0066,
          n5to10: 0.0462,
        };
    }
  } else {
    // standard režim
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 0.01644,
          po3: 0.00889,
          po4: 0.00133,
          n2to5: 0.00218,
          n5to10: 0.01524,
        };
      case "poradce2":
        return {
          okamzita: 0.01869,
          po3: 0.00978,
          po4: 0.00154,
          n2to5: 0.00243,
          n5to10: 0.01702,
        };
      case "poradce3":
        return {
          okamzita: 0.02035,
          po3: 0.01067,
          po4: 0.00168,
          n2to5: 0.00264,
          n5to10: 0.01848,
        };
      case "poradce4":
        return {
          okamzita: 0.02782,
          po3: 0.01378,
          po4: 0.00241,
          n2to5: 0.0033,
          n5to10: 0.02307,
        };
      case "poradce5":
        return {
          okamzita: 0.03045,
          po3: 0.01522,
          po4: 0.00267,
          n2to5: 0.00371,
          n5to10: 0.02594,
        };
      case "poradce6":
        return {
          okamzita: 0.03245,
          po3: 0.016,
          po4: 0.00287,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "poradce7":
        return {
          okamzita: 0.03389,
          po3: 0.01677,
          po4: 0.00302,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "poradce8":
        return {
          okamzita: 0.03591,
          po3: 0.01754,
          po4: 0.00319,
          n2to5: 0.00469,
          n5to10: 0.03281,
        };
      case "poradce9":
        return {
          okamzita: 0.03732,
          po3: 0.01833,
          po4: 0.00334,
          n2to5: 0.00489,
          n5to10: 0.0342,
        };
      case "poradce10":
        return {
          okamzita: 0.03874,
          po3: 0.0191,
          po4: 0.00347,
          n2to5: 0.00503,
          n5to10: 0.03518,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 0.03037,
          po3: 0.01515,
          po4: 0.00267,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "manazer5":
        return {
          okamzita: 0.03373,
          po3: 0.01679,
          po4: 0.00299,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "manazer6":
        return {
          okamzita: 0.03709,
          po3: 0.01841,
          po4: 0.0033,
          n2to5: 0.00485,
          n5to10: 0.03398,
        };
      case "manazer7":
        return {
          okamzita: 0.0405,
          po3: 0.02003,
          po4: 0.0036,
          n2to5: 0.00528,
          n5to10: 0.03696,
        };
      case "manazer8":
        return {
          okamzita: 0.04385,
          po3: 0.02166,
          po4: 0.00392,
          n2to5: 0.00574,
          n5to10: 0.0402,
        };
      case "manazer9":
        return {
          okamzita: 0.04722,
          po3: 0.02327,
          po4: 0.00423,
          n2to5: 0.00614,
          n5to10: 0.04296,
        };
      case "manazer10":
        return {
          okamzita: 0.05061,
          po3: 0.02489,
          po4: 0.00455,
          n2to5: 0.0066,
          n5to10: 0.0462,
        };
    }
  }
}

// NEON – veřejná funkce
export function calculateNeon(
  monthly: number,
  position: Position,
  years = 15,
  mode: CommissionMode = "accelerated"
): CommissionResultDTO {
  const k = neonCoefficients(position, mode);
  const y = Math.max(1, Math.min(15, years));
  const annual = monthly * 12;

  const okamzita = annual * y * k.okamzita;
  const po3 = annual * y * k.po3;
  const po4 = annual * y * k.po4;
  const nasl25 = annual * k.n2to5;
  const nasl510 = annual * k.n5to10;

  const total = okamzita + po3 + po4 + nasl25 * 4 + nasl510 * 6;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: okamzita },
    { title: "📅 Provize po 3 letech", amount: po3 },
    { title: "📅 Provize po 4 letech", amount: po4 },
    { title: "🔁 Následná provize (2.–5. rok)", amount: nasl25 },
    { title: "🔁 Následná provize (5.–10. rok)", amount: nasl510 },
    { title: "💰 Celkem", amount: total },
  ];

  return { items, total };
}

// ---------- FLEXI ----------

type FlexiK = {
  okamzita: number;
  po3: number;
  po4: number;
  naslednaOd6: number;
};

function flexiCoefficients(position: Position, mode: CommissionMode): FlexiK {
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
  mode: CommissionMode = "accelerated"
): CommissionResultDTO {
  const k = flexiCoefficients(position, mode);
  const annual = monthly * 12;

  const okamzita = annual * pct(k.okamzita);
  const po3 = annual * pct(k.po3);
  const po4 = annual * pct(k.po4);
  const n6 = annual * pct(k.naslednaOd6);

  const total = okamzita + po3 + po4 + n6;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: okamzita },
    { title: "📅 Provize po 3 letech", amount: po3 },
    { title: "📅 Provize po 4 letech", amount: po4 },
    { title: "🔁 Následná provize (od 6. roku)", amount: n6, note: "ročně" },
    { title: "💰 Celkem", amount: total },
  ];

  return { items, total };
}

// ---------- MAXIMA ŽP MaxEfekt ----------

type MaxEfektK = {
  okamzita: number; // měsíční × 12 × roky × k
  po3: number; // měsíční × 12 × roky × k
  po4: number; // měsíční × 12 × roky × k
  n5plus: number; // následná od 5. roku: měsíční × 12 × k (ročně)
};

function maxEfektCoefficients(position: Position, mode: CommissionMode): MaxEfektK {
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

// ---------- Pillow Úraz / Nemoc ----------

type PillowInjuryK = { okamzita: number; po3: number; po4: number };

function pillowInjuryCoefficients(position: Position, mode: CommissionMode): PillowInjuryK {
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

// ---------- DOMEX ----------

function domexCoefficient(position: Position): number {
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

function domexSubsequentCoefficient(position: Position): number {
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
    { title: "🔁 Následná provize (z platby)", amount: naslednaPlatba },
    {
      title: "📅 Okamžitá provize za rok",
      amount: okamzitaRok,
      note: `×${multiplier} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: naslednaRok,
      note: `×${multiplier} plateb/rok`,
    },
  ];

  const total = okamzitaRok + naslednaRok;
  return { items, total };
}

// ---------- MAXDOMOV ----------

function maxdomovImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 11.54;
    case "poradce2":
      return 12.89;
    case "poradce3":
      return 14.0;
    case "poradce4":
      return 17.48;
    case "poradce5":
      return 19.65;
    case "poradce6":
      return 21.0;
    case "poradce7":
      return 23.46;
    case "poradce8":
      return 24.86;
    case "poradce9":
      return 25.91;
    case "poradce10":
      return 26.65;
    // Manažeři
    case "manazer4":
      return 21.0;
    case "manazer5":
      return 23.46;
    case "manazer6":
      return 25.74;
    case "manazer7":
      return 28.0;
    case "manazer8":
      return 30.46;
    case "manazer9":
      return 32.54;
    case "manazer10":
      return 35.0;
  }
}

function maxdomovSubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 3.46;
    case "poradce2":
      return 3.87;
    case "poradce3":
      return 4.2;
    case "poradce4":
      return 5.24;
    case "poradce5":
      return 5.89;
    case "poradce6":
      return 6.3;
    case "poradce7":
      return 7.04;
    case "poradce8":
      return 7.46;
    case "poradce9":
      return 7.77;
    case "poradce10":
      return 7.99;
    // Manažeři
    case "manazer4":
      return 6.3;
    case "manazer5":
      return 7.04;
    case "manazer6":
      return 7.72;
    case "manazer7":
      return 8.4;
    case "manazer8":
      return 9.14;
    case "manazer9":
      return 9.76;
    case "manazer10":
      return 10.5;
  }
}

export function calculateMaxdomov(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const kZ = maxdomovImmediateCoefficient(position) / 100;
  const kN = maxdomovSubsequentCoefficient(position) / 100;

  const perPaymentImmediate = amount * kZ;
  const perPaymentSubsequent = amount * kN;

  const paymentsPerYear = periodsPerYear(frequency);

  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize (z platby)",
      amount: perPaymentImmediate,
    },
    {
      title: "📅 Získatelská za rok",
      amount: annualImmediate,
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: perPaymentSubsequent,
    },
  ];

  const total = annualImmediate + annualSubsequent;
  return { items, total };
}

// ---------- ČPP Auto ----------

function cppAutoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
    case "poradce2":
    case "poradce3":
      return 0.08;
    case "poradce4":
      return 0.104;
    case "poradce5":
      return 0.106;
    case "poradce6":
      return 0.108;
    case "poradce7":
      return 0.112;
    case "poradce8":
      return 0.116;
    case "poradce9":
      return 0.118;
    case "poradce10":
      return 0.119;
    // Manažeři 4–10
    case "manazer4":
      return 0.11;
    case "manazer5":
      return 0.112;
    case "manazer6":
      return 0.12;
    case "manazer7":
      return 0.127;
    case "manazer8":
      return 0.128;
    case "manazer9":
      return 0.129;
    case "manazer10":
      return 0.13;
  }
}

export function calculateCppAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = cppAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚗 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

// ---------- ČPP Pojištění majetku a odpovědnosti podnikatelů (bez ÚPIS) ----------

function cppPPRbezImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(10.39);
    case "poradce2":
      return pct(11.6);
    case "poradce3":
      return pct(12.6);
    case "poradce4":
      return pct(15.73);
    case "poradce5":
      return pct(17.68);
    case "poradce6":
      return pct(18.9);
    case "poradce7":
      return pct(21.11);
    case "poradce8":
      return pct(22.71);
    case "poradce9":
      return pct(23.32);
    case "poradce10":
      return pct(23.98);
    // Manažeři 4–10
    case "manazer4":
      return pct(18.9);
    case "manazer5":
      return pct(21.11);
    case "manazer6":
      return pct(23.17);
    case "manazer7":
      return pct(25.2);
    case "manazer8":
      return pct(27.41);
    case "manazer9":
      return pct(29.29);
    case "manazer10":
      return pct(31.5);
  }
}

function cppPPRbezSubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(3.46);
    case "poradce2":
      return pct(3.67);
    case "poradce3":
      return pct(4.2);
    case "poradce4":
      return pct(5.24);
    case "poradce5":
      return pct(5.89);
    case "poradce6":
      return pct(6.3);
    case "poradce7":
      return pct(7.04);
    case "poradce8":
      return pct(7.46);
    case "poradce9":
      return pct(7.77);
    case "poradce10":
      return pct(7.99);
    // Manažeři 4–10
    case "manazer4":
      return pct(6.3);
    case "manazer5":
      return pct(7.04);
    case "manazer6":
      return pct(7.72);
    case "manazer7":
      return pct(8.4);
    case "manazer8":
      return pct(9.14);
    case "manazer9":
      return pct(9.76);
    case "manazer10":
      return pct(10.5);
  }
}

export function calculateCppPPRbez(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coefImmediate = cppPPRbezImmediateCoefficient(position);
  const coefSub = cppPPRbezSubsequentCoefficient(position);

  const perPaymentImmediate = amount * coefImmediate;
  const perPaymentSub = amount * coefSub;
  const paymentsPerYear = periodsPerYear(frequency);

  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSub = perPaymentSub * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize (z platby)", amount: perPaymentImmediate },
    { title: "🔁 Následná provize (z platby)", amount: perPaymentSub },
    {
      title: "📅 Okamžitá provize za rok",
      amount: annualImmediate,
      note: `×${paymentsPerYear} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: annualSub,
      note: `×${paymentsPerYear} plateb/rok`,
    },
  ];

  const total = annualImmediate + annualSub;
  return { items, total };
}

// ---------- ČPP Pojištění majetku a odpovědnosti podnikatelů (ÚPIS) ----------

function cppPPRsCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(3.46);
    case "poradce2":
      return pct(3.67);
    case "poradce3":
      return pct(4.2);
    case "poradce4":
      return pct(5.24);
    case "poradce5":
      return pct(5.89);
    case "poradce6":
      return pct(6.3);
    case "poradce7":
      return pct(7.04);
    case "poradce8":
      return pct(7.46);
    case "poradce9":
      return pct(7.77);
    case "poradce10":
      return pct(7.99);
    // Manažeři 4–10
    case "manazer4":
      return pct(6.3);
    case "manazer5":
      return pct(7.04);
    case "manazer6":
      return pct(7.72);
    case "manazer7":
      return pct(8.4);
    case "manazer8":
      return pct(9.14);
    case "manazer9":
      return pct(9.76);
    case "manazer10":
      return pct(10.5);
  }
}

export function calculateCppPPRs(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = cppPPRsCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [{ title: "💼 Okamžitá provize", amount: perPayment }];

  // pro roční frekvenci je roční provize shodná s okamžitou, proto ji neukládáme duplicitně
  if (frequency !== "annual") {
    items.push({ title: "📅 Provize za rok", amount: annualTotal });
  }

  return { items, total: annualTotal };
}

// ---------- Allianz Auto ----------

function allianzAutoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 4.16;
    case "poradce2":
      return 4.64;
    case "poradce3":
      return 5.04;
    case "poradce4":
      return 6.29;
    case "poradce5":
      return 7.07;
    case "poradce6":
      return 7.56;
    case "poradce7":
      return 8.44;
    case "poradce8":
      return 8.95;
    case "poradce9":
      return 9.33;
    case "poradce10":
      return 9.59;
    // Manažeři 4–10
    case "manazer4":
      return 7.56;
    case "manazer5":
      return 8.44;
    case "manazer6":
      return 9.27;
    case "manazer7":
      return 10.08;
    case "manazer8":
      return 10.96;
    case "manazer9":
      return 11.72;
    case "manazer10":
      return 12.6;
  }
}

export function calculateAllianzAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const annual = amount * periodsPerYear(frequency);
  const coef = allianzAutoCoefficient(position) / 100;
  const immediate = annual * coef;

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: immediate },
  ];
  return { items, total: immediate };
}

// ---------- ČSOB Auto ----------

function csobAutoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0393;
    case "poradce2":
      return 0.0438;
    case "poradce3":
      return 0.0476;
    case "poradce4":
      return 0.0594;
    case "poradce5":
      return 0.0668;
    case "poradce6":
      return 0.0714;
    case "poradce7":
      return 0.0798;
    case "poradce8":
      return 0.0845;
    case "poradce9":
      return 0.0881;
    case "poradce10":
      return 0.0906;
    // Manažeři 4–10
    case "manazer4":
      return 0.0714;
    case "manazer5":
      return 0.0798;
    case "manazer6":
      return 0.0875;
    case "manazer7":
      return 0.0952;
    case "manazer8":
      return 0.1036;
    case "manazer9":
      return 0.1107;
    case "manazer10":
      return 0.119;
  }
}

export function calculateCsobAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = csobAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚙 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

// ---------- UNIQA Auto ----------

function uniqaAutoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0416;
    case "poradce2":
      return 0.0464;
    case "poradce3":
      return 0.0504;
    case "poradce4":
      return 0.0629;
    case "poradce5":
      return 0.0707;
    case "poradce6":
      return 0.0756;
    case "poradce7":
      return 0.0844;
    case "poradce8":
      return 0.0895;
    case "poradce9":
      return 0.0933;
    case "poradce10":
      return 0.096;
    // Manažeři 4–10
    case "manazer4":
      return 0.0756;
    case "manazer5":
      return 0.0877;
    case "manazer6":
      return 0.0927;
    case "manazer7":
      return 0.1008;
    case "manazer8":
      return 0.1096;
    case "manazer9":
      return 0.1172;
    case "manazer10":
      return 0.126;
  }
}

export function calculateUniqaAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = uniqaAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

// ---------- Pillow Auto ----------

function pillowAutoCoefficient(position: Position): number {
  // stejné jako Allianz/UNIQA v procentech
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 4.16;
    case "poradce2":
      return 4.64;
    case "poradce3":
      return 5.04;
    case "poradce4":
      return 6.29;
    case "poradce5":
      return 7.07;
    case "poradce6":
      return 7.56;
    case "poradce7":
      return 8.44;
    case "poradce8":
      return 8.95;
    case "poradce9":
      return 9.33;
    case "poradce10":
      return 9.59;
    // Manažeři 4–10
    case "manazer4":
      return 7.56;
    case "manazer5":
      return 8.44;
    case "manazer6":
      return 9.27;
    case "manazer7":
      return 10.08;
    case "manazer8":
      return 10.96;
    case "manazer9":
      return 11.72;
    case "manazer10":
      return 12.6;
  }
}

export function calculatePillowAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = pillowAutoCoefficient(position) / 100;
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

// ---------- Kooperativa Auto ----------

function kooperativaAutoCoefficient(position: Position): number {
  // stejné koeficienty jako Pillow/Allianz auto (v procentech)
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 4.16;
    case "poradce2":
      return 4.64;
    case "poradce3":
      return 5.04;
    case "poradce4":
      return 6.29;
    case "poradce5":
      return 7.07;
    case "poradce6":
      return 7.56;
    case "poradce7":
      return 8.44;
    case "poradce8":
      return 8.95;
    case "poradce9":
      return 9.33;
    case "poradce10":
      return 9.59;
    // Manažeři 4–10
    case "manazer4":
      return 7.56;
    case "manazer5":
      return 8.44;
    case "manazer6":
      return 9.27;
    case "manazer7":
      return 10.08;
    case "manazer8":
      return 10.96;
    case "manazer9":
      return 11.72;
    case "manazer10":
      return 12.6;
  }
}

export function calculateKooperativaAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = pct(kooperativaAutoCoefficient(position));
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚙 Okamžitá provize", amount: perPayment },
    { title: "Celkem za rok", amount: annualTotal },
  ];

  return { items, total: annualTotal };
}

// ---------- ČPP ZAMEX ----------

function zamexCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0346;
    case "poradce2":
      return 0.0387;
    case "poradce3":
      return 0.042;
    case "poradce4":
      return 0.0524;
    case "poradce5":
      return 0.0589;
    case "poradce6":
      return 0.063;
    case "poradce7":
      return 0.0704;
    case "poradce8":
      return 0.0746;
    case "poradce9":
      return 0.0777;
    case "poradce10":
      return 0.0799;
    // Manažeři 4–10
    case "manazer4":
      return 0.063;
    case "manazer5":
      return 0.0704;
    case "manazer6":
      return 0.0772;
    case "manazer7":
      return 0.084;
    case "manazer8":
      return 0.0914;
    case "manazer9":
      return 0.0976;
    case "manazer10":
      return 0.105;
  }
}

export function calculateZamex(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = zamexCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🧑‍🔧 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

// ---------- ČPP Cestovko ----------

function cppCestovkoCoefficient(position: Position): number {
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
    { title: "💸 Okamžitá provize", amount: provize },
  ];
  return { items, total: provize };
}

// ---------- AXA Cestovko ----------

function axaCestovkoCoefficient(position: Position): number {
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
    { title: "💸 Okamžitá provize", amount: provize },
  ];
  return { items, total: provize };
}

// ---------- Comfort Commodity ----------

function comfortCCImmediateCoefficient(position: Position): number {
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

function comfortCCSubsequentCoefficient(position: Position): number {
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
  position: Position
): CommissionResultDTO {
  return calculateComfortCCSimple(fee, position);
}

export function calculateComfortCCGradual(
  initialFee: number,
  payment: number,
  position: Position
): CommissionResultDTO {
  const kImmediate = comfortCCImmediateCoefficient(position);
  const kSubsequent = comfortCCSubsequentCoefficient(position);

  const immediate = initialFee * kImmediate;
  const subsequent = payment * kSubsequent;
  const total = immediate + subsequent;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: immediate },
    { title: "🔁 Následná provize", amount: subsequent },
  ];

  return { items, total };
}

type ComfortCCInput = {
  fee: number;
  payment?: number;
  isSavings?: boolean;
  isGradualFee?: boolean;
  position: Position;
};

export function calculateComfortCC({
  fee,
  payment = 0,
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
    return calculateComfortCCOneOff(fee, position);
  }

  // Spoření s postupným poplatkem
  return calculateComfortCCGradual(fee, payment, position);
}

// ---------- Seznam podporovaných produktů na webu ----------

export const SUPPORTED_PRODUCTS: Product[] = [
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
  "domex",
  "maxdomov",
  "cppAuto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
  "zamex",
  "cppPPRbez",
  "cppPPRs",
  "cppcestovko",
  "axacestovko",
  "comfortcc",
];

export function getCoefficientSummary(
  product: Product | null,
  position: Position | null,
  mode: CommissionMode | null
): { label: string; value: number }[] {
  if (!product || !position) return [];
  const m = mode ?? "accelerated";

  switch (product) {
    case "neon": {
      const k = neonCoefficients(position, m);
      return [
        { label: "Okamžitá provize", value: k.okamzita },
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
        { label: "Následná provize (2.–5. rok)", value: k.n2to5 },
        { label: "Následná provize (5.–10. rok)", value: k.n5to10 },
      ];
    }
    case "flexi": {
      const k = flexiCoefficients(position, m);
      return [
        { label: "Okamžitá provize", value: k.okamzita },
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
        { label: "Následná provize (od 6. roku)", value: k.naslednaOd6 },
      ];
    }
    case "maximaMaxEfekt": {
      const k = maxEfektCoefficients(position, m);
      return [
        { label: "Okamžitá provize", value: k.okamzita },
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
        { label: "Následná provize (od 5. roku)", value: k.n5plus },
      ];
    }
    case "pillowInjury": {
      const k = pillowInjuryCoefficients(position, m);
      return [
        { label: "Okamžitá provize", value: k.okamzita },
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
      ];
    }
    case "domex": {
      return [
        { label: "Okamžitá provize (z platby)", value: domexCoefficient(position) },
        { label: "Následná provize (z platby)", value: domexSubsequentCoefficient(position) },
      ];
    }
    case "maxdomov": {
      return [
        { label: "Okamžitá provize", value: maxdomovImmediateCoefficient(position) },
        { label: "Následná provize", value: maxdomovSubsequentCoefficient(position) },
      ];
    }
    case "cppAuto":
      return [{ label: "Koeficient (z platby)", value: cppAutoCoefficient(position) }];
    case "cppPPRbez":
      return [
        { label: "Okamžitá provize (z platby)", value: cppPPRbezImmediateCoefficient(position) },
        { label: "Následná provize (z platby)", value: cppPPRbezSubsequentCoefficient(position) },
      ];
    case "cppPPRs":
      return [{ label: "Koeficient (z platby)", value: cppPPRsCoefficient(position) }];
    case "allianzAuto":
      return [{ label: "Koeficient (z platby)", value: allianzAutoCoefficient(position) / 100 }];
    case "csobAuto":
      return [{ label: "Koeficient (z platby)", value: csobAutoCoefficient(position) }];
    case "uniqaAuto":
      return [{ label: "Koeficient (z platby)", value: uniqaAutoCoefficient(position) }];
    case "pillowAuto":
      return [{ label: "Koeficient (z platby)", value: pillowAutoCoefficient(position) / 100 }];
    case "kooperativaAuto":
      return [{ label: "Koeficient (z platby)", value: kooperativaAutoCoefficient(position) / 100 }];
    case "zamex":
      return [{ label: "Koeficient (z platby)", value: zamexCoefficient(position) }];
    case "cppcestovko":
      return [{ label: "Koeficient", value: cppCestovkoCoefficient(position) }];
    case "axacestovko":
      return [{ label: "Koeficient", value: axaCestovkoCoefficient(position) }];
    case "comfortcc":
      return [
        { label: "Okamžitá provize", value: comfortCCImmediateCoefficient(position) },
        { label: "Následná provize", value: comfortCCSubsequentCoefficient(position) },
      ];
    default:
      return [];
  }
}
