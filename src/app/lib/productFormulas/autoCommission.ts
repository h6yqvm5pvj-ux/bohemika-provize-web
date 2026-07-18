import { type Position, type Product } from "../../types/domain";
import {
  allianzAutoSubsequentCoefficient,
} from "./allianzAuto";
import {
  cppAutoSubsequentCoefficient,
} from "./cppAuto";
import {
  csobAutoSubsequentCoefficient,
} from "./csobAuto";
import { kooperativaAutoSubsequentCoefficient } from "./kooperativaAuto";
import {
  pillowAutoSubsequentCoefficient,
} from "./pillowAuto";
import { slaviaAutoCoefficient } from "./slaviaAuto";
import {
  uniqaFlotilaSubsequentCoefficient,
  uniqaAutoSubsequentCoefficient,
} from "./uniqaAuto";

export function isAutoInstallmentCommissionCode(code: string): boolean {
  return /^(?:B30|B70|B03|B36|B42)\d*$/.test(code);
}

export function isAutoSubsequentCommissionCode(
  value: string | null | undefined
): boolean {
  const code = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code || isAutoInstallmentCommissionCode(code)) return false;
  return /^BC\d+/.test(code) || /^B\d+/.test(code);
}

export function autoSubsequentCoefficientForProduct(
  product: Product | null | undefined,
  position: Position,
  contractSignedDateIso?: string | null
): number | null {
  switch (product) {
    case "cppAuto":
      return cppAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "allianzAuto":
      return allianzAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "csobAuto":
      return csobAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "uniqaAuto":
      return uniqaAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "uniqaflotila":
      return uniqaFlotilaSubsequentCoefficient(position, contractSignedDateIso);
    case "pillowAuto":
      return pillowAutoSubsequentCoefficient(position, contractSignedDateIso);
    case "slaviaauto":
      return slaviaAutoCoefficient(position);
    case "kooperativaAuto":
      return kooperativaAutoSubsequentCoefficient(position, contractSignedDateIso);
    default:
      return null;
  }
}
