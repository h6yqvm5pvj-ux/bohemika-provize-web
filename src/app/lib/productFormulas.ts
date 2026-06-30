import {
  type Product,
  type Position,
  type CommissionMode,
  type MaxCizinKomplexVariant,
} from "../types/domain";

import {
  calculateNeon,
  neonCoefficients,
  isNeonHistoricalPeriod,
  neonMaxDurationYears,
  normalizeNeonDurationYears,
  NEON_IMMEDIATE_A101_COEFFICIENTS,
  NEON_IMMEDIATE_B0301_COEFFICIENTS,
  NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS,
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
  maxEfektCoefficients,
} from "./productFormulas/maximaMaxEfekt";
import {
  calculateMaxCizinKomplex,
  maxCizinKomplexCoefficient,
  maxCizinKomplexVariantLabel,
} from "./productFormulas/maxcizinkomplex";
import {
  calculatePillowInjury,
  pillowInjuryCoefficients,
} from "./productFormulas/pillowInjury";
import {
  calculateDomex,
  domexCoefficient,
  domexSubsequentCoefficient,
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
  calculateMaxdomov,
  maxdomovImmediateCoefficient,
  maxdomovSubsequentCoefficient,
} from "./productFormulas/maxdomov";
import {
  calculateCppAuto,
  cppAutoCoefficient,
} from "./productFormulas/cppAuto";
import {
  calculateSlaviaAuto,
  slaviaAutoCoefficient,
} from "./productFormulas/slaviaAuto";
import {
  calculateCppSimplex,
  cppSimplexCoefficient,
} from "./productFormulas/cppsimplex";
import {
  calculateCppPPRbez,
  cppPPRbezImmediateCoefficient,
  cppPPRbezSubsequentCoefficient,
} from "./productFormulas/cppPPRbez";
import {
  calculateCppPPRs,
  cppPPRsCoefficient,
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
} from "./productFormulas/csobAuto";
import {
  calculateUniqaAuto,
  uniqaAutoCoefficient,
} from "./productFormulas/uniqaAuto";
import {
  calculatePillowAuto,
  pillowAutoCoefficient,
} from "./productFormulas/pillowAuto";
import {
  calculateKooperativaAuto,
  kooperativaAutoCoefficient,
} from "./productFormulas/kooperativaAuto";
import {
  calculateZamex,
  zamexCoefficient,
} from "./productFormulas/zamex";
import {
  calculateCppCestovko,
  cppCestovkoCoefficient,
} from "./productFormulas/cppcestovko";
import {
  calculateAxaCestovko,
  axaCestovkoCoefficient,
} from "./productFormulas/axacestovko";
import {
  calculateKoopCestovko,
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
  calculateMaxCizinKomplex,
  calculatePillowInjury,
  calculateDomex,
  calculateCppHafan,
  calculatePillowMajetek,
  calculateKoopMajetekObcan,
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateCppSimplex,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateAllianzAuto,
  isAllianzAutoHistoricalPeriod,
  calculateAllianzMujDomov,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateKoopCestovko,
  calculateComfortCCSimple,
  calculateComfortCCOneOff,
  calculateComfortCCGradual,
  calculateComfortCC,
};

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
  "maxdomov",
  "cppsimplex",
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "allianzmujdomov",
  "zamex",
  "cppPPRbez",
  "cppPPRs",
  "cppcestovko",
  "axacestovko",
  "koopcestovko",
  "comfortcc",
];

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
      const immediateItems = [
        { label: "Provize A101", value: NEON_IMMEDIATE_A101_COEFFICIENTS[position] / 100 },
        { label: "Provize B0301", value: NEON_IMMEDIATE_B0301_COEFFICIENTS[position] / 100 },
        ...(m === "accelerated"
          ? [
              {
                label: "Provize 50% z B3601",
                value: NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position] / 100,
              },
            ]
          : []),
      ];
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
      const k = maxEfektCoefficients(position, m);
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
        {
          label: "Následná provize (z platby)",
          value: domexSubsequentCoefficient(position),
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
    case "maxdomov": {
      return [
        { label: "Okamžitá provize", value: maxdomovImmediateCoefficient(position) },
        { label: "Následná provize", value: maxdomovSubsequentCoefficient(position) },
      ];
    }
    case "cppsimplex":
      return [{ label: "Koeficient (z platby)", value: cppSimplexCoefficient(position) }];
    case "cppAuto":
      return [{ label: "Koeficient (z platby)", value: cppAutoCoefficient(position) }];
    case "slaviaauto":
      return [{ label: "Koeficient (z platby)", value: slaviaAutoCoefficient(position) }];
    case "cppPPRbez":
      return [
        {
          label: "Okamžitá provize (z platby)",
          value: cppPPRbezImmediateCoefficient(position),
        },
        {
          label: "Následná provize (z platby)",
          value: cppPPRbezSubsequentCoefficient(position),
        },
      ];
    case "cppPPRs":
      return [{ label: "Koeficient (z platby)", value: cppPPRsCoefficient(position) }];
    case "allianzAuto": {
      const isHistorical = isAllianzAutoHistoricalPeriod(contractSignedDateIso);
      return [
        {
          label: isHistorical
            ? "Historický koeficient (01.08.2019-31.03.2026)"
            : "Koeficient (z platby)",
          value: allianzAutoCoefficient(position, contractSignedDateIso),
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
    case "csobAuto":
      return [{ label: "Koeficient (z platby)", value: csobAutoCoefficient(position) }];
    case "uniqaAuto":
    case "uniqaflotila":
      return [{ label: "Koeficient (z platby)", value: uniqaAutoCoefficient(position) }];
    case "pillowAuto":
      return [{ label: "Koeficient (z platby)", value: pillowAutoCoefficient(position) }];
    case "kooperativaAuto":
      return [
        {
          label: "Koeficient (z platby)",
          value: kooperativaAutoCoefficient(position),
        },
      ];
    case "zamex":
      return [{ label: "Koeficient (z platby)", value: zamexCoefficient(position) }];
    case "cppcestovko":
      return [{ label: "Koeficient", value: cppCestovkoCoefficient(position) }];
    case "axacestovko":
      return [{ label: "Koeficient", value: axaCestovkoCoefficient(position) }];
    case "koopcestovko":
      return [{ label: "Koeficient", value: koopCestovkoCoefficient(position) }];
    case "comfortcc":
      return [
        { label: "Okamžitá provize", value: comfortCCImmediateCoefficient(position) },
        { label: "Následná provize", value: comfortCCSubsequentCoefficient(position) },
      ];
    default:
      return [];
  }
}
