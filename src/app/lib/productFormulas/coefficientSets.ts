import {
  type CommissionCoefficientSet,
  type Product,
} from "../../types/domain";
import {
  ALLIANZ_AUTO_CURRENT_VALID_FROM,
  ALLIANZ_AUTO_HISTORICAL_VALID_FROM,
  isAllianzAutoHistoricalPeriod,
} from "./allianzAuto";
import {
  CPP_AUTO_CURRENT_VALID_FROM,
  CPP_AUTO_HISTORICAL_VALID_FROM,
  isCppAutoHistoricalPeriod,
} from "./cppAuto";
import {
  CSOB_AUTO_CURRENT_VALID_FROM,
  CSOB_AUTO_HISTORICAL_VALID_FROM,
  isCsobAutoHistoricalPeriod,
} from "./csobAuto";
import {
  DOMEX_CURRENT_VALID_FROM,
  DOMEX_HISTORICAL_VALID_FROM,
  isDomexHistoricalPeriod,
} from "./domex";
import {
  KOOPERATIVA_AUTO_CURRENT_VALID_FROM,
  KOOPERATIVA_AUTO_HISTORICAL_VALID_FROM,
  isKooperativaAutoHistoricalPeriod,
} from "./kooperativaAuto";
import {
  NEON_CURRENT_VALID_FROM,
  NEON_HISTORICAL_VALID_FROM,
  isNeonHistoricalPeriod,
} from "./neon";
import {
  PILLOW_AUTO_CURRENT_VALID_FROM,
  PILLOW_AUTO_HISTORICAL_VALID_FROM,
  isPillowAutoHistoricalPeriod,
} from "./pillowAuto";
import {
  UNIQA_AUTO_CURRENT_VALID_FROM,
  UNIQA_AUTO_EARLY_HISTORICAL_VALID_FROM,
  UNIQA_AUTO_HISTORICAL_VALID_FROM,
  UNIQA_FLOTILA_CURRENT_VALID_FROM,
  UNIQA_FLOTILA_HISTORICAL_VALID_FROM,
  isUniqaAutoEarlyHistoricalPeriod,
  isUniqaAutoHistoricalPeriod,
  isUniqaFlotilaHistoricalPeriod,
} from "./uniqaAuto";

export const normalizeCommissionCoefficientSet = (
  value: unknown
): CommissionCoefficientSet | null =>
  value === "earlyHistorical" || value === "historical" || value === "current"
    ? value
    : null;

export const productSupportsCoefficientSetOverride = (
  product: Product | null | undefined
): boolean => candidateCoefficientSetsForProduct(product).length > 0;

export function candidateCoefficientSetsForProduct(
  product: Product | null | undefined
): CommissionCoefficientSet[] {
  switch (product) {
    case "uniqaAuto":
      return ["earlyHistorical", "historical", "current"];
    case "neon":
    case "cppAuto":
    case "allianzAuto":
    case "csobAuto":
    case "uniqaflotila":
    case "pillowAuto":
    case "kooperativaAuto":
      return ["historical", "current"];
    default:
      return [];
  }
}

export function defaultCoefficientSetForProduct(
  product: Product | null | undefined,
  contractSignedDateIso: string | null | undefined
): CommissionCoefficientSet | null {
  switch (product) {
    case "neon":
      return isNeonHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    case "cppAuto":
      return isCppAutoHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    case "allianzAuto":
      return isAllianzAutoHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    case "csobAuto":
      return isCsobAutoHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    case "uniqaAuto":
      if (isUniqaAutoEarlyHistoricalPeriod(contractSignedDateIso)) {
        return "earlyHistorical";
      }
      return isUniqaAutoHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    case "uniqaflotila":
      return isUniqaFlotilaHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    case "pillowAuto":
      return isPillowAutoHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    case "kooperativaAuto":
      return isKooperativaAutoHistoricalPeriod(contractSignedDateIso)
        ? "historical"
        : "current";
    case "domex":
      return isDomexHistoricalPeriod(contractSignedDateIso) ? "historical" : "current";
    default:
      return null;
  }
}

export function coefficientSetSignedDateForProduct(
  product: Product | null | undefined,
  coefficientSet: CommissionCoefficientSet | null | undefined
): string | null {
  switch (product) {
    case "neon":
      if (coefficientSet === "historical") return NEON_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return NEON_CURRENT_VALID_FROM;
      return null;
    case "cppAuto":
      if (coefficientSet === "historical") return CPP_AUTO_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return CPP_AUTO_CURRENT_VALID_FROM;
      return null;
    case "allianzAuto":
      if (coefficientSet === "historical") return ALLIANZ_AUTO_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return ALLIANZ_AUTO_CURRENT_VALID_FROM;
      return null;
    case "csobAuto":
      if (coefficientSet === "historical") return CSOB_AUTO_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return CSOB_AUTO_CURRENT_VALID_FROM;
      return null;
    case "uniqaAuto":
      if (coefficientSet === "earlyHistorical") {
        return UNIQA_AUTO_EARLY_HISTORICAL_VALID_FROM;
      }
      if (coefficientSet === "historical") return UNIQA_AUTO_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return UNIQA_AUTO_CURRENT_VALID_FROM;
      return null;
    case "uniqaflotila":
      if (coefficientSet === "historical") return UNIQA_FLOTILA_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return UNIQA_FLOTILA_CURRENT_VALID_FROM;
      return null;
    case "pillowAuto":
      if (coefficientSet === "historical") return PILLOW_AUTO_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return PILLOW_AUTO_CURRENT_VALID_FROM;
      return null;
    case "kooperativaAuto":
      if (coefficientSet === "historical") {
        return KOOPERATIVA_AUTO_HISTORICAL_VALID_FROM;
      }
      if (coefficientSet === "current") return KOOPERATIVA_AUTO_CURRENT_VALID_FROM;
      return null;
    case "domex":
      if (coefficientSet === "historical") return DOMEX_HISTORICAL_VALID_FROM;
      if (coefficientSet === "current") return DOMEX_CURRENT_VALID_FROM;
      return null;
    default:
      return null;
  }
}

export function signedDateForCoefficientSetOverride({
  product,
  contractSignedDateIso,
  coefficientSetOverride,
}: {
  product: Product | null | undefined;
  contractSignedDateIso: string | null | undefined;
  coefficientSetOverride?: CommissionCoefficientSet | null;
}): string | null {
  return (
    coefficientSetSignedDateForProduct(product, coefficientSetOverride) ??
    contractSignedDateIso ??
    null
  );
}

export function coefficientSetLabel(
  coefficientSet: CommissionCoefficientSet | null | undefined
): string {
  switch (coefficientSet) {
    case "earlyHistorical":
      return "nejstarší historické koeficienty";
    case "historical":
      return "historické koeficienty";
    case "current":
      return "nové koeficienty";
    default:
      return "koeficienty";
  }
}
