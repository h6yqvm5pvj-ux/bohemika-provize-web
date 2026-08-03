import {
  type CommissionCoefficientSet,
  type Product,
} from "../../types/domain";
import {
  ALLIANZ_MUJ_DOMOV_COEFFICIENT_VALID_FROM,
} from "./allianzMujDomov";
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
  CPP_BYTEX_COEFFICIENT_VALID_FROM,
} from "./cppbytex";
import {
  CPP_CESTOVKO_COEFFICIENT_VALID_FROM,
} from "./cppcestovko";
import {
  CPP_PPR_BEZ_COEFFICIENT_VALID_FROM,
} from "./cppPPRbez";
import {
  CPP_PPRS_COEFFICIENT_VALID_FROM,
} from "./cppPPRs";
import {
  CPP_SIMPLEX_COEFFICIENT_VALID_FROM,
} from "./cppsimplex";
import {
  CSOB_AUTO_CURRENT_VALID_FROM,
  CSOB_AUTO_HISTORICAL_VALID_FROM,
  isCsobAutoHistoricalPeriod,
} from "./csobAuto";
import {
  DOMEX_CURRENT_VALID_FROM,
  DOMEX_EARLY_HISTORICAL_VALID_FROM,
  DOMEX_HISTORICAL_VALID_FROM,
  isDomexEarlyHistoricalPeriod,
  isDomexHistoricalPeriod,
} from "./domex";
import {
  AXA_CESTOVKO_COEFFICIENT_VALID_FROM,
} from "./axacestovko";
import {
  KOOP_CESTOVKO_COEFFICIENT_VALID_FROM,
} from "./koopcestovko";
import {
  KOOPERATIVA_AUTO_CURRENT_VALID_FROM,
  KOOPERATIVA_AUTO_HISTORICAL_VALID_FROM,
  KOOP_FLOTILA_COEFFICIENT_VALID_FROM,
  isKooperativaAutoHistoricalPeriod,
} from "./kooperativaAuto";
import {
  KOOP_PMOP_COEFFICIENT_VALID_FROM,
} from "./kooppmop";
import {
  MAXEFEKT5_VALID_FROM,
} from "./maximaMaxEfekt";
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
  PILLOW_INJURY_COEFFICIENT_VALID_FROM,
} from "./pillowInjury";
import {
  PILLOW_MAJETEK_COEFFICIENT_VALID_FROM,
} from "./pillowMajetek";
import {
  SLAVIA_AUTO_COEFFICIENT_VALID_FROM,
  SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM,
} from "./slaviaAuto";
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
import {
  ZAMEX_COEFFICIENT_VALID_FROM,
} from "./zamex";

const PRODUCT_MINIMUM_COEFFICIENT_VALID_FROM: Partial<Record<Product, string>> = {
  neon: NEON_HISTORICAL_VALID_FROM,
  maximaMaxEfekt: MAXEFEKT5_VALID_FROM,
  pillowInjury: PILLOW_INJURY_COEFFICIENT_VALID_FROM,
  domex: DOMEX_EARLY_HISTORICAL_VALID_FROM,
  pillowmajetek: PILLOW_MAJETEK_COEFFICIENT_VALID_FROM,
  kooppmop: KOOP_PMOP_COEFFICIENT_VALID_FROM,
  cppsimplex: CPP_SIMPLEX_COEFFICIENT_VALID_FROM,
  cppAuto: CPP_AUTO_HISTORICAL_VALID_FROM,
  slaviaauto: SLAVIA_AUTO_COEFFICIENT_VALID_FROM,
  slaviaflotila: SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM,
  allianzAuto: ALLIANZ_AUTO_HISTORICAL_VALID_FROM,
  allianzmujdomov: ALLIANZ_MUJ_DOMOV_COEFFICIENT_VALID_FROM,
  csobAuto: CSOB_AUTO_HISTORICAL_VALID_FROM,
  uniqaAuto: UNIQA_AUTO_EARLY_HISTORICAL_VALID_FROM,
  uniqaflotila: UNIQA_FLOTILA_HISTORICAL_VALID_FROM,
  pillowAuto: PILLOW_AUTO_HISTORICAL_VALID_FROM,
  kooperativaAuto: KOOPERATIVA_AUTO_HISTORICAL_VALID_FROM,
  koopflotila: KOOP_FLOTILA_COEFFICIENT_VALID_FROM,
  zamex: ZAMEX_COEFFICIENT_VALID_FROM,
  cppbytex: CPP_BYTEX_COEFFICIENT_VALID_FROM,
  cppPPRbez: CPP_PPR_BEZ_COEFFICIENT_VALID_FROM,
  cppPPRs: CPP_PPRS_COEFFICIENT_VALID_FROM,
  cppcestovko: CPP_CESTOVKO_COEFFICIENT_VALID_FROM,
  axacestovko: AXA_CESTOVKO_COEFFICIENT_VALID_FROM,
  koopcestovko: KOOP_CESTOVKO_COEFFICIENT_VALID_FROM,
};

const formatIsoDayForCoefficientMessage = (isoDay: string): string => {
  const match = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDay;
  return `${match[3]}. ${match[2]}. ${match[1]}`;
};

export const normalizeCommissionCoefficientSet = (
  value: unknown
): CommissionCoefficientSet | null =>
  value === "earlyHistorical" || value === "historical" || value === "current"
    ? value
    : null;

export const productSupportsCoefficientSetOverride = (
  product: Product | null | undefined
): boolean => candidateCoefficientSetsForProduct(product).length > 0;

export const minimumSupportedContractSignedDateForProduct = (
  product: Product | null | undefined
): string | null => (product ? PRODUCT_MINIMUM_COEFFICIENT_VALID_FROM[product] ?? null : null);

export const productCoefficientValidityError = (
  product: Product | null | undefined,
  contractSignedDateIso: string | null | undefined
): string | null => {
  const minimumDate = minimumSupportedContractSignedDateForProduct(product);
  const signedDate = typeof contractSignedDateIso === "string" ? contractSignedDateIso.trim() : "";
  if (!minimumDate || !/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) return null;
  if (signedDate >= minimumDate) return null;

  return `Smlouvu nelze uložit, protože pro datum sjednání ${formatIsoDayForCoefficientMessage(
    signedDate
  )} nemáme v systému bohemka.app koeficienty pro tento produkt. Nejstarší dostupné koeficienty platí od ${formatIsoDayForCoefficientMessage(
    minimumDate
  )}. Tohle pravidlo má zabránit uložení smlouvy se špatně zadaným datem sjednání.`;
};

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
      if (isDomexEarlyHistoricalPeriod(contractSignedDateIso)) return "earlyHistorical";
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
      if (coefficientSet === "earlyHistorical") return DOMEX_EARLY_HISTORICAL_VALID_FROM;
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
