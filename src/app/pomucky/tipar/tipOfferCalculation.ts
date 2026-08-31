import { calculateCommission } from "@/app/lib/calculateCommission";
import { productLabel } from "@/app/lib/productCatalog";
import type {
  CommissionResultItemDTO,
  Position,
  Product,
} from "@/app/types/domain";

export type TipOfferProductId = Product | "auto" | "life" | "travel";

export type TipOfferGroupId =
  | "life"
  | "property"
  | "auto"
  | "business"
  | "travel"
  | "other";

export type TipOfferProductDefinition = {
  id: TipOfferProductId;
  calculatorProduct: Product;
  averageCalculatorProducts?: readonly Product[];
  commissionCode?: string;
  label: string;
  premiumLabel: string;
  premiumPeriodLabel: string;
  supportsDuration: boolean;
};

export type TipOfferGroup = {
  id: TipOfferGroupId;
  label: string;
  products: readonly TipOfferProductDefinition[];
};

const product = (
  id: Product,
  options?: Partial<
    Pick<
      TipOfferProductDefinition,
      "label" | "premiumLabel" | "premiumPeriodLabel" | "supportsDuration"
    >
  >
): TipOfferProductDefinition => ({
  id,
  calculatorProduct: id,
  label: options?.label ?? productLabel(id),
  premiumLabel: options?.premiumLabel ?? "Roční pojistné",
  premiumPeriodLabel: options?.premiumPeriodLabel ?? "ročně",
  supportsDuration: options?.supportsDuration ?? false,
});

export const TIP_OFFER_GROUPS: readonly TipOfferGroup[] = [
  {
    id: "life",
    label: "Životní pojištění",
    products: [
      {
        id: "life",
        calculatorProduct: "neon",
        averageCalculatorProducts: ["neon", "flexi"],
        label: "Životní pojištění",
        premiumLabel: "Měsíční pojistné",
        premiumPeriodLabel: "měsíčně",
        supportsDuration: true,
      },
    ],
  },
  {
    id: "auto",
    label: "Pojištění vozidel",
    products: [
      {
        id: "auto",
        calculatorProduct: "cppAuto",
        label: "Auta",
        premiumLabel: "Roční pojistné",
        premiumPeriodLabel: "ročně",
        supportsDuration: false,
      },
    ],
  },
  {
    id: "property",
    label: "Majetek a odpovědnost",
    products: [
      product("zamex"),
      product("domex"),
      product("cppbytex"),
      product("cpphafan"),
      product("pillowmajetek"),
      product("koopmajetekobcan"),
      product("koopfit"),
      product("koopodzam"),
      product("maxdomov"),
      product("allianzmujdomov"),
    ],
  },
  {
    id: "business",
    label: "Podnikatelé",
    products: [
      product("cppPPRbez"),
      product("cppPPRs"),
      product("cppsimplex"),
      product("kooppmop"),
    ],
  },
  {
    id: "travel",
    label: "Cestovní pojištění",
    products: [
      {
        id: "travel",
        calculatorProduct: "cppcestovko",
        averageCalculatorProducts: [
          "cppcestovko",
          "axacestovko",
          "koopcestovko",
        ],
        label: "Cestovní pojištění",
        premiumLabel: "Roční pojistné",
        premiumPeriodLabel: "ročně",
        supportsDuration: false,
      },
    ],
  },
  {
    id: "other",
    label: "Pojištění cizinců",
    products: [
      {
        ...product("maxcizinkomplex"),
        commissionCode: "A501",
      },
    ],
  },
] as const;

export const TIP_OFFER_PRODUCTS: readonly TipOfferProductDefinition[] =
  TIP_OFFER_GROUPS.flatMap((group) => group.products);

const normalizedCommissionCode = (value: unknown): string =>
  typeof value === "string"
    ? value.trim().toUpperCase().replace(/\s+/g, "")
    : "";

const normalizedTitle = (value: unknown): string =>
  typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";

export const sumA101Commission = (
  items: readonly CommissionResultItemDTO[]
): number => sumCommissionByCode(items, "A101");

export const sumCommissionByCode = (
  items: readonly CommissionResultItemDTO[],
  commissionCode: string
): number => {
  const expectedCode = normalizedCommissionCode(commissionCode);
  const total = items.reduce((sum, item) => {
    const code = normalizedCommissionCode(item.code);
    const title = normalizedTitle(item.title);
    const isExpectedCommission =
      code === expectedCode ||
      (!code && title.includes(`provize ${expectedCode.toLowerCase()}`));
    return isExpectedCommission
      ? sum + Math.max(0, Number(item.amount) || 0)
      : sum;
  }, 0);

  return Math.round(total * 100) / 100;
};

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

const normalizedDuration = (value: number | null | undefined): number => {
  if (!Number.isFinite(value)) return 30;
  return Math.min(80, Math.max(1, Math.round(value ?? 30)));
};

export type TipOfferCalculation = {
  baseCommission: number;
  tipCommission: number;
  adviserCommission: number;
  hasCommission: boolean;
};

export function calculateTipOfferProduct({
  definition,
  position,
  premium,
  tipPercent,
  durationYears,
  signedDateIso,
}: {
  definition: TipOfferProductDefinition;
  position: Position | null;
  premium: number;
  tipPercent: number;
  durationYears?: number | null;
  signedDateIso: string;
}): TipOfferCalculation {
  if (!position || !Number.isFinite(premium) || premium <= 0) {
    return {
      baseCommission: 0,
      tipCommission: 0,
      adviserCommission: 0,
      hasCommission: false,
    };
  }

  const calculationProducts =
    definition.averageCalculatorProducts?.length
      ? definition.averageCalculatorProducts
      : [definition.calculatorProduct];
  const commissionCode = definition.commissionCode ?? "A101";
  const commissionValues = calculationProducts.map((productKey) => {
    const result = calculateCommission({
      productKey,
      position,
      commissionMode: "accelerated",
      contractSignedDateIso: signedDateIso,
      inputAmount: premium,
      frequencyRaw: "annual",
      durationYears: definition.supportsDuration
        ? normalizedDuration(durationYears)
        : null,
      durationMonths: null,
      maxCizinKomplexVariant: "exclusiveStandard",
      comfortPayment: null,
      comfortGradual: false,
      comfortTargetAmount: null,
    });
    return sumCommissionByCode(result?.items ?? [], commissionCode);
  });
  const baseCommission =
    Math.round(
      (commissionValues.reduce((sum, value) => sum + value, 0) /
        calculationProducts.length) *
        100
    ) / 100;
  const usedPercent = clampPercent(tipPercent);
  const tipCommission =
    Math.round(baseCommission * (usedPercent / 100) * 100) / 100;

  return {
    baseCommission,
    tipCommission,
    adviserCommission:
      Math.round(Math.max(0, baseCommission - tipCommission) * 100) / 100,
    hasCommission: baseCommission > 0,
  };
}
