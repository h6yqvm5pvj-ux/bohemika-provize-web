import {
  type Product,
  type Position,
  type CommissionMode,
} from "../types/domain";

import {
  calculateNeon,
  neonCoefficients,
} from "./productFormulas/neon";
import {
  calculateFlexi,
  flexiCoefficients,
} from "./productFormulas/flexi";
import {
  calculateMaxEfekt,
  maxEfektCoefficients,
} from "./productFormulas/maximaMaxEfekt";
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
  calculateFlexi,
  calculateMaxEfekt,
  calculatePillowInjury,
  calculateDomex,
  calculatePillowMajetek,
  calculateKoopMajetekObcan,
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateCppSimplex,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateAllianzAuto,
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
  "pillowInjury",
  "domex",
  "pillowmajetek",
  "koopmajetekobcan",
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
        {
          label: "Následná provize (z platby)",
          value: domexSubsequentCoefficient(position),
        },
      ];
    }
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
    case "koopmajetekobcan": {
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
    case "allianzAuto":
      return [{ label: "Koeficient (z platby)", value: allianzAutoCoefficient(position) }];
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
