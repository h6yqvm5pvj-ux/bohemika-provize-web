import {
  type Position,
  type CommissionMode,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";

// ---------- NEON ----------

type NeonK = {
  okamzita: number;
  po3: number;
  po4: number;
  n2to5: number;
  n5to10: number;
};

export function neonCoefficients(position: Position, mode: CommissionMode): NeonK {
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

