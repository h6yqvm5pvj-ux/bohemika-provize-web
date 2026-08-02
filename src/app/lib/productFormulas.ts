import {
  type Product,
  type Position,
  type CommissionMode,
  type MaxCizinKomplexVariant,
} from "../types/domain";

import {
  calculateNeon,
  neonCoefficients,
  neonImmediateCoefficientParts,
  isNeonHistoricalPeriod,
  neonMaxDurationYears,
  normalizeNeonDurationYears,
} from "./productFormulas/neon";
import {
  calculateFlexi,
  flexiCoefficients,
  FLEXI_IMMEDIATE_A101_COEFFICIENTS,
  FLEXI_IMMEDIATE_B0301_COEFFICIENTS,
  FLEXI_IMMEDIATE_B36_HALF_COEFFICIENTS,
  hasFlexiImmediateCoefficient,
} from "./productFormulas/flexi";
import {
  calculateMaxEfekt,
  isMaxEfekt5Period,
  isMaxEfekt7Period,
  MAXEFEKT5_VALID_FROM,
  MAXEFEKT7_VALID_FROM,
  maxEfektCoefficientParts,
  maxEfektCoefficients,
} from "./productFormulas/maximaMaxEfekt";
import {
  calculateMaxCizinKomplex,
  maxCizinKomplexCoefficient,
  maxCizinKomplexVariantLabel,
} from "./productFormulas/maxcizinkomplex";
import {
  calculatePillowInjury,
  PILLOW_INJURY_COEFFICIENT_VALID_FROM,
  pillowInjuryCoefficientParts,
  pillowInjuryCoefficients,
} from "./productFormulas/pillowInjury";
import {
  calculateDomex,
  DOMEX_CURRENT_VALID_FROM,
  DOMEX_HISTORICAL_VALID_FROM,
  domexCoefficient,
  domexSubsequentCoefficient,
  isDomexHistoricalPeriod,
} from "./productFormulas/domex";
import {
  calculateCppHafan,
  cppHafanImmediateCoefficient,
  cppHafanSubsequentCoefficient,
} from "./productFormulas/cpphafan";
import {
  calculatePillowMajetek,
  pillowMajetekImmediateCoefficient,
  pillowMajetekSubsequentCoefficient,
  PILLOW_MAJETEK_COEFFICIENT_VALID_FROM,
} from "./productFormulas/pillowMajetek";
import {
  calculateKoopMajetekObcan,
  koopMajetekObcanImmediateCoefficient,
  koopMajetekObcanSubsequentCoefficient,
} from "./productFormulas/koopmajetekobcan";
import {
  calculateKoopOdzam,
  koopOdzamImmediateCoefficient,
  koopOdzamSubsequentCoefficient,
} from "./productFormulas/koopodzam";
import {
  calculateKoopPmop,
  KOOP_PMOP_COEFFICIENT_VALID_FROM,
  koopPmopImmediateCoefficient,
  koopPmopSubsequentCoefficient,
} from "./productFormulas/kooppmop";
import {
  calculateMaxdomov,
  maxdomovImmediateCoefficient,
  maxdomovSubsequentCoefficient,
} from "./productFormulas/maxdomov";
import {
  calculateCppAuto,
  cppAutoCoefficient,
  isCppAutoHistoricalPeriod,
} from "./productFormulas/cppAuto";
import { autoSubsequentCoefficientForProduct } from "./productFormulas/autoCommission";
import {
  calculateSlaviaAuto,
  calculateSlaviaFlotila,
  isSlaviaAutoSupportedForSignedDate,
  isSlaviaFlotilaSupportedForSignedDate,
  SLAVIA_AUTO_COEFFICIENT_VALID_FROM,
  SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM,
  SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE,
  slaviaAutoCoefficient,
  slaviaFlotilaCoefficient,
  slaviaFlotilaSubsequentCoefficient,
} from "./productFormulas/slaviaAuto";
import {
  calculateCppSimplex,
  CPP_SIMPLEX_COEFFICIENT_VALID_FROM,
  cppSimplexImmediateCoefficient,
  cppSimplexSubsequentCoefficient,
} from "./productFormulas/cppsimplex";
import {
  calculateCppPPRbez,
  CPP_PPR_BEZ_COEFFICIENT_VALID_FROM,
  cppPPRbezImmediateCoefficient,
  cppPPRbezSubsequentCoefficient,
} from "./productFormulas/cppPPRbez";
import {
  calculateCppPPRs,
  CPP_PPRS_COEFFICIENT_VALID_FROM,
  cppPPRsImmediateCoefficient,
  cppPPRsSubsequentCoefficient,
} from "./productFormulas/cppPPRs";
import {
  calculateAllianzAuto,
  allianzAutoCoefficient,
  isAllianzAutoHistoricalPeriod,
} from "./productFormulas/allianzAuto";
import {
  calculateAllianzMujDomov,
  allianzMujDomovImmediateCoefficient,
  allianzMujDomovSubsequentCoefficient,
  ALLIANZ_MUJ_DOMOV_COEFFICIENT_VALID_FROM,
} from "./productFormulas/allianzMujDomov";
import {
  calculateCsobAuto,
  csobAutoCoefficient,
  isCsobAutoHistoricalPeriod,
} from "./productFormulas/csobAuto";
import {
  calculateUniqaAuto,
  calculateUniqaFlotila,
  uniqaFlotilaCoefficient,
  uniqaFlotilaSubsequentCoefficient,
  uniqaAutoCoefficient,
  uniqaAutoImmediateCoefficient,
  uniqaAutoSubsequentCoefficient,
  isUniqaAutoEarlyHistoricalPeriod,
  isUniqaAutoHistoricalPeriod,
  isUniqaFlotilaHistoricalPeriod,
} from "./productFormulas/uniqaAuto";
import {
  calculatePillowAuto,
  pillowAutoCoefficient,
  isPillowAutoHistoricalPeriod,
} from "./productFormulas/pillowAuto";
import {
  calculateKooperativaAuto,
  calculateKoopFlotila,
  KOOP_FLOTILA_COEFFICIENT_VALID_FROM,
  kooperativaAutoCoefficient,
  koopFlotilaCoefficient,
  koopFlotilaSubsequentCoefficient,
  isKooperativaAutoHistoricalPeriod,
} from "./productFormulas/kooperativaAuto";
import {
  calculateZamex,
  ZAMEX_COEFFICIENT_VALID_FROM,
  zamexCoefficient,
} from "./productFormulas/zamex";
import {
  calculateCppBytex,
  CPP_BYTEX_COEFFICIENT_VALID_FROM,
  cppBytexImmediateCoefficient,
  cppBytexSubsequentCoefficient,
  cppBytexSubsequentPayoutYears,
} from "./productFormulas/cppbytex";
import {
  calculateCppCestovko,
  CPP_CESTOVKO_COEFFICIENT_VALID_FROM,
  cppCestovkoCoefficient,
} from "./productFormulas/cppcestovko";
import {
  calculateAxaCestovko,
  AXA_CESTOVKO_COEFFICIENT_VALID_FROM,
  axaCestovkoCoefficient,
} from "./productFormulas/axacestovko";
import {
  calculateKoopCestovko,
  KOOP_CESTOVKO_COEFFICIENT_VALID_FROM,
  koopCestovkoCoefficient,
} from "./productFormulas/koopcestovko";
import {
  calculateComfortCCSimple,
  calculateComfortCCOneOff,
  calculateComfortCCGradual,
  calculateComfortCC,
  comfortCCImmediateCoefficient,
  comfortCCSubsequentCoefficient,
} from "./productFormulas/comfortcc";

export {
  calculateNeon,
  isNeonHistoricalPeriod,
  neonMaxDurationYears,
  normalizeNeonDurationYears,
  calculateFlexi,
  calculateMaxEfekt,
  isMaxEfekt5Period,
  isMaxEfekt7Period,
  MAXEFEKT5_VALID_FROM,
  MAXEFEKT7_VALID_FROM,
  PILLOW_INJURY_COEFFICIENT_VALID_FROM,
  DOMEX_CURRENT_VALID_FROM,
  DOMEX_HISTORICAL_VALID_FROM,
  calculateMaxCizinKomplex,
  calculatePillowInjury,
  calculateDomex,
  isDomexHistoricalPeriod,
  calculateCppHafan,
  calculatePillowMajetek,
  calculateKoopMajetekObcan,
  calculateKoopOdzam,
  calculateKoopPmop,
  KOOP_PMOP_COEFFICIENT_VALID_FROM,
  calculateMaxdomov,
  calculateCppAuto,
  isCppAutoHistoricalPeriod,
  calculateSlaviaAuto,
  calculateSlaviaFlotila,
  isSlaviaAutoSupportedForSignedDate,
  isSlaviaFlotilaSupportedForSignedDate,
  SLAVIA_AUTO_COEFFICIENT_VALID_FROM,
  SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM,
  SLAVIA_AUTO_UNSUPPORTED_SIGNED_DATE_MESSAGE,
  calculateCppSimplex,
  CPP_SIMPLEX_COEFFICIENT_VALID_FROM,
  calculateCppPPRbez,
  calculateCppPPRs,
  CPP_PPRS_COEFFICIENT_VALID_FROM,
  calculateAllianzAuto,
  isAllianzAutoHistoricalPeriod,
  calculateAllianzMujDomov,
  calculateCsobAuto,
  isCsobAutoHistoricalPeriod,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  isUniqaAutoEarlyHistoricalPeriod,
  isUniqaAutoHistoricalPeriod,
  isUniqaFlotilaHistoricalPeriod,
  calculatePillowAuto,
  isPillowAutoHistoricalPeriod,
  calculateKooperativaAuto,
  calculateKoopFlotila,
  isKooperativaAutoHistoricalPeriod,
  calculateZamex,
  ZAMEX_COEFFICIENT_VALID_FROM,
  calculateCppBytex,
  CPP_BYTEX_COEFFICIENT_VALID_FROM,
  cppBytexSubsequentPayoutYears,
  calculateCppCestovko,
  CPP_CESTOVKO_COEFFICIENT_VALID_FROM,
  calculateAxaCestovko,
  AXA_CESTOVKO_COEFFICIENT_VALID_FROM,
  calculateKoopCestovko,
  KOOP_CESTOVKO_COEFFICIENT_VALID_FROM,
  calculateComfortCCSimple,
  calculateComfortCCOneOff,
  calculateComfortCCGradual,
  calculateComfortCC,
};

export {
  minimumSupportedContractSignedDateForProduct,
  productCoefficientValidityError,
} from "./productFormulas/coefficientSets";

export const SUPPORTED_PRODUCTS: Product[] = [
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "maxcizinkomplex",
  "pillowInjury",
  "domex",
  "cpphafan",
  "pillowmajetek",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "cppsimplex",
  "cppAuto",
  "slaviaauto",
  "slaviaflotila",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "koopflotila",
  "allianzmujdomov",
  "zamex",
  "cppbytex",
  "cppPPRbez",
  "cppPPRs",
  "cppcestovko",
  "axacestovko",
  "koopcestovko",
  "comfortcc",
];

const AUTO_ACQUISITION_COEFFICIENT_LABEL =
  "Získatelská provize - koeficient";
const AUTO_SUBSEQUENT_COEFFICIENT_LABEL =
  "Následná provize - koeficient";

export function getCoefficientSummary(
  product: Product | null,
  position: Position | null,
  mode: CommissionMode | null,
  maxCizinKomplexVariant: MaxCizinKomplexVariant = "exclusiveStandard",
  contractSignedDateIso: string | null = null
): { label: string; value: number }[] {
  if (!product || !position) return [];
  const m = mode ?? "accelerated";

  switch (product) {
    case "neon": {
      const k = neonCoefficients(position, m, contractSignedDateIso);
      const immediate = neonImmediateCoefficientParts(position, m, contractSignedDateIso);
      const immediateItems = immediate
        ? [
            { label: "Provize A101", value: immediate.a101Coefficient / 100 },
            { label: "Provize B0301", value: immediate.b0301Coefficient / 100 },
            ...(immediate.includeB3601
              ? [
                  {
                    label: "Provize 50% z B3601",
                    value: immediate.b3601HalfCoefficient / 100,
                  },
                ]
              : []),
          ]
        : [{ label: "Okamžitá provize", value: k.okamzita }];
      return [
        ...immediateItems,
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
        { label: "Následná provize (2.–5. rok)", value: k.n2to5 },
        { label: "Pečovatelská provize (5.–10. rok)", value: k.n5to10 },
      ];
    }
    case "flexi": {
      const k = flexiCoefficients(position, m);
      if (hasFlexiImmediateCoefficient(position)) {
        const immediateItems = [
          { label: "Provize A101", value: (FLEXI_IMMEDIATE_A101_COEFFICIENTS[position] ?? 0) / 100 },
          { label: "Provize B0301", value: (FLEXI_IMMEDIATE_B0301_COEFFICIENTS[position] ?? 0) / 100 },
          ...(m === "accelerated"
            ? [
                {
                  label: "Provize 50% z B36",
                  value: (FLEXI_IMMEDIATE_B36_HALF_COEFFICIENTS[position] ?? 0) / 100,
                },
              ]
            : []),
        ];
        return [
          ...immediateItems,
          { label: "Provize po 3 letech", value: k.po3 },
          { label: "Provize po 4 letech", value: k.po4 },
          { label: "Následná provize (od 6. roku)", value: k.naslednaOd6 },
        ];
      }
      return [
        { label: "Okamžitá provize", value: k.okamzita },
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
        { label: "Následná provize (od 6. roku)", value: k.naslednaOd6 },
      ];
    }
    case "maximaMaxEfekt": {
      const parts = maxEfektCoefficientParts(position, m, contractSignedDateIso);
      if (parts) {
        return [
          { label: "Provize A101", value: parts.a101 },
          { label: "Provize B0301", value: parts.b0301 },
          ...(parts.b3601Immediate > 0
            ? [
                {
                  label: "Provize 50% z B3601",
                  value: parts.b3601Immediate,
                },
              ]
            : []),
          { label: "Provize po 3 letech", value: parts.po3 },
          { label: "Provize po 4 letech", value: parts.po4 },
          { label: "Následná provize (od 5. roku)", value: parts.n5plus },
        ];
      }
      const k = maxEfektCoefficients(position, m, contractSignedDateIso);
      return [
        { label: "Okamžitá provize", value: k.okamzita },
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
        { label: "Následná provize (od 5. roku)", value: k.n5plus },
      ];
    }
    case "maxcizinkomplex":
      return [
        {
          label: `Koeficient (${maxCizinKomplexVariantLabel(maxCizinKomplexVariant)})`,
          value: maxCizinKomplexCoefficient(position, maxCizinKomplexVariant),
        },
      ];
    case "pillowInjury": {
      const parts = pillowInjuryCoefficientParts(position, m);
      if (parts) {
        return [
          { label: "Provize A101", value: parts.a101 },
          { label: "Provize B0301", value: parts.b0301 },
          ...(parts.b36Immediate > 0
            ? [
                {
                  label: "Provize 50% z B36",
                  value: parts.b36Immediate,
                },
              ]
            : []),
          { label: "Provize po 3 letech (B36)", value: parts.po3 },
          { label: "Provize po 4 letech (B48)", value: parts.po4 },
        ];
      }
      const k = pillowInjuryCoefficients(position, m);
      return [
        { label: "Okamžitá provize", value: k.okamzita },
        { label: "Provize po 3 letech", value: k.po3 },
        { label: "Provize po 4 letech", value: k.po4 },
      ];
    }
    case "domex": {
      const historical = isDomexHistoricalPeriod(contractSignedDateIso);
      const validFrom = new Date(
        `${historical ? DOMEX_HISTORICAL_VALID_FROM : DOMEX_CURRENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá provize (z platby, platné od ${validFrom})`,
          value: domexCoefficient(position, contractSignedDateIso),
        },
        {
          label: historical
            ? "Následná provize (z platby, max. 4 roky)"
            : "Následná provize (z platby)",
          value: domexSubsequentCoefficient(position, contractSignedDateIso),
        },
      ];
    }
    case "cpphafan":
      return [
        {
          label: "Okamžitá provize (z platby)",
          value: cppHafanImmediateCoefficient(position),
        },
        {
          label: "Následná provize (z platby)",
          value: cppHafanSubsequentCoefficient(position),
        },
      ];
    case "pillowmajetek": {
      const validFrom = new Date(
        `${PILLOW_MAJETEK_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá provize (platné od ${validFrom})`,
          value: pillowMajetekImmediateCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${validFrom})`,
          value: pillowMajetekSubsequentCoefficient(position),
        },
      ];
    }
    case "koopmajetekobcan":
    case "koopfit": {
      return [
        {
          label: "Okamžitá provize (z platby)",
          value: koopMajetekObcanImmediateCoefficient(position),
        },
        {
          label: "Následná provize (z platby)",
          value: koopMajetekObcanSubsequentCoefficient(position),
        },
      ];
    }
    case "koopodzam": {
      return [
        {
          label: "Okamžitá provize (z platby)",
          value: koopOdzamImmediateCoefficient(position),
        },
        {
          label: "Následná provize (z platby)",
          value: koopOdzamSubsequentCoefficient(position),
        },
      ];
    }
    case "kooppmop": {
      const validFrom = new Date(
        `${KOOP_PMOP_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá provize (platné od ${validFrom})`,
          value: koopPmopImmediateCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${validFrom})`,
          value: koopPmopSubsequentCoefficient(position),
        },
      ];
    }
    case "maxdomov": {
      return [
        { label: "Okamžitá provize", value: maxdomovImmediateCoefficient(position) },
        { label: "Následná provize", value: maxdomovSubsequentCoefficient(position) },
      ];
    }
    case "cppsimplex": {
      const validFrom = new Date(
        `${CPP_SIMPLEX_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá provize (platné od ${validFrom})`,
          value: cppSimplexImmediateCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${validFrom})`,
          value: cppSimplexSubsequentCoefficient(position),
        },
      ];
    }
    case "cppAuto": {
      return [
        {
          label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
          value: cppAutoCoefficient(position, contractSignedDateIso),
        },
        {
          label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? cppAutoCoefficient(position, contractSignedDateIso),
        },
      ];
    }
    case "slaviaauto":
      return [
        {
          label: `${AUTO_ACQUISITION_COEFFICIENT_LABEL} (platné od ${new Date(
            `${SLAVIA_AUTO_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value: slaviaAutoCoefficient(position),
        },
        {
          label: `${AUTO_SUBSEQUENT_COEFFICIENT_LABEL} (platné od ${new Date(
            `${SLAVIA_AUTO_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? slaviaAutoCoefficient(position),
        },
      ];
    case "slaviaflotila":
      return [
        {
          label: `${AUTO_ACQUISITION_COEFFICIENT_LABEL} (platné od ${new Date(
            `${SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value: slaviaFlotilaCoefficient(position),
        },
        {
          label: `${AUTO_SUBSEQUENT_COEFFICIENT_LABEL} (platné od ${new Date(
            `${SLAVIA_FLOTILA_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? slaviaFlotilaSubsequentCoefficient(position),
        },
      ];
    case "cppPPRbez": {
      const validFrom = new Date(
        `${CPP_PPR_BEZ_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá (získatelská) provize (platné od ${validFrom})`,
          value: cppPPRbezImmediateCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${validFrom})`,
          value: cppPPRbezSubsequentCoefficient(position),
        },
      ];
    }
    case "cppPPRs": {
      const validFrom = new Date(
        `${CPP_PPRS_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá provize (platné od ${validFrom})`,
          value: cppPPRsImmediateCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${validFrom})`,
          value: cppPPRsSubsequentCoefficient(position),
        },
      ];
    }
    case "allianzAuto": {
      return [
        {
          label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
          value: allianzAutoCoefficient(position, contractSignedDateIso),
        },
        {
          label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? allianzAutoCoefficient(position, contractSignedDateIso),
        },
      ];
    }
    case "allianzmujdomov": {
      const validFrom = new Date(
        `${ALLIANZ_MUJ_DOMOV_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá provize (platné od ${validFrom})`,
          value: allianzMujDomovImmediateCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${validFrom})`,
          value: allianzMujDomovSubsequentCoefficient(position),
        },
      ];
    }
    case "csobAuto": {
      return [
        {
          label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
          value: csobAutoCoefficient(position, contractSignedDateIso),
        },
        {
          label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? csobAutoCoefficient(position, contractSignedDateIso),
        },
      ];
    }
    case "uniqaAuto": {
      if (isUniqaAutoEarlyHistoricalPeriod(contractSignedDateIso)) {
        return [
          {
            label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
            value: uniqaAutoImmediateCoefficient(position, contractSignedDateIso),
          },
          {
            label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
            value: uniqaAutoSubsequentCoefficient(position, contractSignedDateIso),
          },
        ];
      }
      return [
        {
          label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
          value: uniqaAutoCoefficient(position, contractSignedDateIso),
        },
        {
          label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? uniqaAutoCoefficient(position, contractSignedDateIso),
        },
      ];
    }
    case "uniqaflotila":
      return [
        {
          label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
          value: uniqaFlotilaCoefficient(position, contractSignedDateIso),
        },
        {
          label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? uniqaFlotilaSubsequentCoefficient(position, contractSignedDateIso),
        },
      ];
    case "pillowAuto": {
      return [
        {
          label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
          value: pillowAutoCoefficient(position, contractSignedDateIso),
        },
        {
          label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? pillowAutoCoefficient(position, contractSignedDateIso),
        },
      ];
    }
    case "kooperativaAuto":
      return [
        {
          label: AUTO_ACQUISITION_COEFFICIENT_LABEL,
          value: kooperativaAutoCoefficient(position, contractSignedDateIso),
        },
        {
          label: AUTO_SUBSEQUENT_COEFFICIENT_LABEL,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? kooperativaAutoCoefficient(position, contractSignedDateIso),
        },
      ];
    case "koopflotila": {
      const validFrom = new Date(
        `${KOOP_FLOTILA_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `${AUTO_ACQUISITION_COEFFICIENT_LABEL} (platné od ${validFrom})`,
          value: koopFlotilaCoefficient(position),
        },
        {
          label: `${AUTO_SUBSEQUENT_COEFFICIENT_LABEL} (platné od ${validFrom})`,
          value:
            autoSubsequentCoefficientForProduct(
              product,
              position,
              contractSignedDateIso
            ) ?? koopFlotilaSubsequentCoefficient(position),
        },
      ];
    }
    case "zamex":
      return [
        {
          label: `Okamžitá (získatelská) provize (platné od ${new Date(
            `${ZAMEX_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value: zamexCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${new Date(
            `${ZAMEX_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value: zamexCoefficient(position),
        },
      ];
    case "cppbytex": {
      const validFrom = new Date(
        `${CPP_BYTEX_COEFFICIENT_VALID_FROM}T00:00:00`
      ).toLocaleDateString("cs-CZ");
      return [
        {
          label: `Okamžitá (získatelská) provize (platné od ${validFrom})`,
          value: cppBytexImmediateCoefficient(position),
        },
        {
          label: `Následná provize (platné od ${validFrom}, max. 4 roky)`,
          value: cppBytexSubsequentCoefficient(position),
        },
      ];
    }
    case "cppcestovko":
      return [
        {
          label: `Koeficient (platné od ${new Date(
            `${CPP_CESTOVKO_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value: cppCestovkoCoefficient(position),
        },
      ];
    case "axacestovko":
      return [
        {
          label: `Koeficient (platné od ${new Date(
            `${AXA_CESTOVKO_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value: axaCestovkoCoefficient(position),
        },
      ];
    case "koopcestovko":
      return [
        {
          label: `Koeficient (platné od ${new Date(
            `${KOOP_CESTOVKO_COEFFICIENT_VALID_FROM}T00:00:00`
          ).toLocaleDateString("cs-CZ")})`,
          value: koopCestovkoCoefficient(position),
        },
      ];
    case "comfortcc":
      return [
        { label: "Okamžitá provize", value: comfortCCImmediateCoefficient(position) },
        { label: "Následná provize", value: comfortCCSubsequentCoefficient(position) },
      ];
    default:
      return [];
  }
}
