import type {
  CommissionCoefficientSet,
  CommissionMode,
  CommissionResultDTO,
  CommissionResultItemDTO,
  MaxCizinKomplexVariant,
  NeonCoefficientSet,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";
import {
  calculateAllianzAuto,
  calculateAllianzMujDomov,
  calculateAxaCestovko,
  calculateComfortCC,
  calculateCppAuto,
  calculateCppBytex,
  calculateCppCestovko,
  calculateCppHafan,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateCsobAuto,
  calculateDomex,
  calculateDomexNeuron,
  calculateFlexi,
  calculateKoopCestovko,
  calculateKoopFlotila,
  calculateKoopMajetekObcan,
  calculateKoopOdzam,
  calculateKoopPmop,
  calculateKooperativaAuto,
  calculateMaxCizinKomplex,
  calculateMaxdomov,
  calculateMaxEfekt,
  calculateNeon,
  calculatePillowAuto,
  calculatePillowInjury,
  calculatePillowMajetek,
  calculateSlaviaAuto,
  calculateSlaviaFlotila,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  calculateZamex,
} from "@/app/lib/productFormulas";
import {
  normalizeCommissionCoefficientSet,
  signedDateForCoefficientSetOverride,
} from "@/app/lib/productFormulas/coefficientSets";
import { normalizeNeonDurationYears } from "@/app/lib/productFormulas/neon";

export type CommissionCalculationInput = {
  productKey: Product;
  position: Position | null;
  commissionMode: CommissionMode;
  contractSignedDateIso: string | null;
  commissionCoefficientSetOverride?: CommissionCoefficientSet | null;
  neonCoefficientSetOverride?: NeonCoefficientSet | null;
  inputAmount: number;
  frequencyRaw: PaymentFrequency;
  durationYears: number | null;
  durationMonths: number | null;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  comfortPayment: number | null;
  comfortGradual: boolean | null;
  comfortTargetAmount: number | null;
};

const paymentsPerYear = (frequency: PaymentFrequency): number =>
  frequency === "monthly"
    ? 12
    : frequency === "quarterly"
      ? 4
      : frequency === "semiannual"
        ? 2
        : 1;

const durationRange = (product: Product): [number, number] => {
  switch (product) {
    case "neon":
      return [1, 99];
    case "flexi":
    case "maximaMaxEfekt":
      return [1, 80];
    default:
      return [1, 1];
  }
};

const durationFallback = (product: Product): number => {
  switch (product) {
    case "neon":
      return 15;
    case "flexi":
    case "maximaMaxEfekt":
      return 30;
    default:
      return 1;
  }
};

const normalizedDurationYears = (
  product: Product,
  years: number | null | undefined
): number => {
  const [min, max] = durationRange(product);
  const raw =
    typeof years === "number" && Number.isFinite(years)
      ? years
      : durationFallback(product);
  return Math.min(max, Math.max(min, Math.floor(raw)));
};

const allowedFrequenciesForProduct = (product: Product): PaymentFrequency[] => {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return ["monthly"];
    case "domex":
    case "domexneuron":
    case "cppbytex":
    case "cpphafan":
      return ["quarterly", "semiannual", "annual"];
    case "pillowmajetek":
    case "koopmajetekobcan":
    case "koopfit":
    case "koopodzam":
    case "kooppmop":
    case "pillowAuto":
    case "maxdomov":
    case "allianzmujdomov":
    case "kooperativaAuto":
    case "koopflotila":
    case "allianzAuto":
    case "slaviaflotila":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "cppAuto":
    case "slaviaauto":
    case "csobAuto":
    case "uniqaAuto":
    case "uniqaflotila":
    case "zamex":
    case "cppsimplex":
    case "cppPPRbez":
    case "cppPPRs":
      return ["quarterly", "semiannual", "annual"];
    case "cppcestovko":
    case "axacestovko":
    case "koopcestovko":
    case "maxcizinkomplex":
    case "comfortcc":
      return ["annual"];
  }
};

const paymentBasedTotals = (
  items: CommissionResultItemDTO[],
  multiplier: number
): { immediate: number; subsequent: number } => {
  let immediate = 0;
  let subsequent = 0;

  items.forEach((item) => {
    const title = (item.title ?? "").toLowerCase();
    if (title.includes("okamžitá")) {
      immediate += item.amount ?? 0;
    } else if (title.includes("následná")) {
      subsequent += item.amount ?? 0;
    }
  });

  return {
    immediate: immediate * multiplier,
    subsequent: subsequent * multiplier,
  };
};

/**
 * The only product-to-formula mapping used by both the calculator preview and
 * the server-side contract save. The caller is responsible for providing
 * trusted position and commission-mode values when persisting a contract.
 */
export function calculateCommission({
  productKey,
  position,
  commissionMode,
  contractSignedDateIso,
  commissionCoefficientSetOverride = null,
  neonCoefficientSetOverride = null,
  inputAmount,
  frequencyRaw,
  durationYears,
  maxCizinKomplexVariant,
  comfortPayment,
  comfortGradual,
  comfortTargetAmount,
}: CommissionCalculationInput): CommissionResultDTO | null {
  if (!position) return null;

  const safeAmount = Number.isFinite(inputAmount) ? Math.max(0, inputAmount) : 0;
  const allowedFrequencies = allowedFrequenciesForProduct(productKey);
  const usedFrequency = allowedFrequencies.includes(frequencyRaw)
    ? frequencyRaw
    : allowedFrequencies[0];
  const normalizedCoefficientSetOverride = normalizeCommissionCoefficientSet(
    commissionCoefficientSetOverride
  );
  const normalizedNeonCoefficientSetOverride =
    neonCoefficientSetOverride === "historical" || neonCoefficientSetOverride === "current"
      ? neonCoefficientSetOverride
      : normalizedCoefficientSetOverride === "historical" ||
          normalizedCoefficientSetOverride === "current"
        ? normalizedCoefficientSetOverride
        : null;
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso,
    coefficientSetOverride: normalizedCoefficientSetOverride,
  });

  switch (productKey) {
    case "neon": {
      const years = normalizeNeonDurationYears(
        durationYears,
        contractSignedDateIso,
        normalizedNeonCoefficientSetOverride
      );
      return calculateNeon(
        safeAmount,
        position,
        years,
        commissionMode,
        contractSignedDateIso,
        normalizedNeonCoefficientSetOverride
      );
    }
    case "flexi":
      return calculateFlexi(
        safeAmount,
        position,
        commissionMode,
        normalizedDurationYears("flexi", durationYears)
      );
    case "maximaMaxEfekt":
      return calculateMaxEfekt(
        safeAmount,
        normalizedDurationYears("maximaMaxEfekt", durationYears),
        position,
        commissionMode,
        coefficientSignedDateIso
      );
    case "maxcizinkomplex":
      return calculateMaxCizinKomplex(
        safeAmount,
        position,
        maxCizinKomplexVariant ?? "exclusiveStandard"
      );
    case "pillowInjury":
      return calculatePillowInjury(safeAmount, position, commissionMode);
    case "domex":
    case "domexneuron":
    case "cppbytex":
    case "cpphafan":
    case "koopmajetekobcan":
    case "koopfit":
    case "koopodzam":
    case "kooppmop":
    case "zamex": {
      const result =
        productKey === "domexneuron"
          ? calculateDomexNeuron(safeAmount, usedFrequency, position)
          : productKey === "domex"
          ? calculateDomex(safeAmount, usedFrequency, position, coefficientSignedDateIso)
          : productKey === "cppbytex"
            ? calculateCppBytex(safeAmount, usedFrequency, position)
            : productKey === "cpphafan"
              ? calculateCppHafan(safeAmount, usedFrequency, position)
              : productKey === "koopodzam"
                ? calculateKoopOdzam(safeAmount, usedFrequency, position)
                : productKey === "kooppmop"
                  ? calculateKoopPmop(safeAmount, usedFrequency, position)
                  : productKey === "zamex"
                    ? calculateZamex(safeAmount, usedFrequency, position)
                    : calculateKoopMajetekObcan(safeAmount, usedFrequency, position);
      const items = result.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      return { items, total: paymentBasedTotals(items, paymentsPerYear(usedFrequency)).immediate };
    }
    case "pillowmajetek":
      return calculatePillowMajetek(safeAmount, usedFrequency, position);
    case "maxdomov": {
      const result = calculateMaxdomov(safeAmount, usedFrequency, position);
      const items = result.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      return { items, total: paymentBasedTotals(items, paymentsPerYear(usedFrequency)).immediate };
    }
    case "allianzmujdomov":
      return calculateAllianzMujDomov(safeAmount, usedFrequency, position);
    case "cppAuto":
      return calculateCppAuto(safeAmount, usedFrequency, position, coefficientSignedDateIso);
    case "slaviaauto":
      return calculateSlaviaAuto(safeAmount, usedFrequency, position);
    case "slaviaflotila":
      return calculateSlaviaFlotila(safeAmount, usedFrequency, position);
    case "cppsimplex": {
      const result = calculateCppSimplex(safeAmount, usedFrequency, position);
      const items = result.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      return { items, total: paymentBasedTotals(items, paymentsPerYear(usedFrequency)).immediate };
    }
    case "cppPPRbez": {
      const result = calculateCppPPRbez(safeAmount, usedFrequency, position);
      const items = result.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      return { items, total: paymentBasedTotals(items, paymentsPerYear(usedFrequency)).immediate };
    }
    case "cppPPRs": {
      const result = calculateCppPPRs(safeAmount, usedFrequency, position);
      const items = result.items.filter((item) =>
        (item.title ?? "").toLowerCase().includes("(z platby)")
      );
      return { items, total: paymentBasedTotals(items, paymentsPerYear(usedFrequency)).immediate };
    }
    case "allianzAuto":
      return calculateAllianzAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "csobAuto":
      return calculateCsobAuto(safeAmount, usedFrequency, position, coefficientSignedDateIso);
    case "uniqaAuto":
      return calculateUniqaAuto(safeAmount, usedFrequency, position, coefficientSignedDateIso);
    case "uniqaflotila":
      return calculateUniqaFlotila(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "pillowAuto":
      return calculatePillowAuto(safeAmount, usedFrequency, position, coefficientSignedDateIso);
    case "kooperativaAuto":
      return calculateKooperativaAuto(
        safeAmount,
        usedFrequency,
        position,
        coefficientSignedDateIso
      );
    case "koopflotila":
      return calculateKoopFlotila(safeAmount, usedFrequency, position);
    case "cppcestovko":
      return calculateCppCestovko(safeAmount, position);
    case "axacestovko":
      return calculateAxaCestovko(safeAmount, position);
    case "koopcestovko":
      return calculateKoopCestovko(safeAmount, position);
    case "comfortcc":
      return calculateComfortCC({
        fee: safeAmount,
        payment:
          typeof comfortPayment === "number" && Number.isFinite(comfortPayment)
            ? Math.max(0, comfortPayment)
            : 0,
        targetAmount:
          comfortGradual &&
          typeof comfortTargetAmount === "number" &&
          Number.isFinite(comfortTargetAmount)
            ? Math.max(0, comfortTargetAmount)
            : 0,
        isSavings: Boolean(comfortGradual),
        isGradualFee: Boolean(comfortGradual),
        position,
      });
  }
}
