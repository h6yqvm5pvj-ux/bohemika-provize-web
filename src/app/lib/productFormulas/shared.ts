import { type PaymentFrequency } from "../../types/domain";

export const pct = (v: number): number => v / 100;

export function periodsPerYear(f: PaymentFrequency): number {
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
