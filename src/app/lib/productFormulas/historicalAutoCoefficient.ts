import { type Position } from "../../types/domain";
import { pct } from "./shared";

// Historicka auto sada pouzivana pred podminkami platnymi od 01.04.2026.
export function historicalAutoCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return pct(4.16);
    case "poradce2":
      return pct(4.64);
    case "poradce3":
      return pct(5.04);
    case "poradce4":
      return pct(6.29);
    case "poradce5":
      return pct(7.07);
    case "poradce6":
      return pct(7.56);
    case "poradce7":
      return pct(8.44);
    case "poradce8":
      return pct(8.95);
    case "poradce9":
      return pct(9.33);
    case "poradce10":
      return pct(9.59);
    case "manazer4":
      return pct(7.56);
    case "manazer5":
      return pct(8.44);
    case "manazer6":
      return pct(9.27);
    case "manazer7":
      return pct(10.08);
    case "manazer8":
      return pct(10.96);
    case "manazer9":
      return pct(11.72);
    case "manazer10":
      return pct(12.6);
  }
}

export function historicalAutoSubsequentCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return pct(3.46);
    case "poradce2":
      return pct(3.87);
    case "poradce3":
      return pct(4.2);
    case "poradce4":
      return pct(5.24);
    case "poradce5":
      return pct(5.89);
    case "poradce6":
      return pct(6.29);
    case "poradce7":
      return pct(7.04);
    case "poradce8":
      return pct(7.46);
    case "poradce9":
      return pct(7.77);
    case "poradce10":
      return pct(7.99);
    case "manazer4":
      return pct(6.29);
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
