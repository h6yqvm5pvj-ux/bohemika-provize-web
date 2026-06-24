import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  calculateAllianzAuto,
  calculateAxaCestovko,
  calculateCppAuto,
  calculateCppCestovko,
  calculateCppSimplex,
  calculateDomex,
  calculateMaxdomov,
  calculateNeon,
} from "@/app/lib/productFormulas";
import { productLabel } from "@/app/lib/productCatalog";

type PremiumUnit = "monthly" | "annual";

export type GoalSuggestionItem = {
  id: string;
  product: Product;
  productLabel: string;
  premium: number;
  premiumUnit: PremiumUnit;
  immediate: number;
};

export type GoalSuggestionPlan = {
  items: GoalSuggestionItem[];
  targetImmediate: number;
  totalImmediate: number;
  missingAfterPlan: number;
  overshoot: number;
};

type SuggestionTemplate = {
  product: Product;
  label: string;
  premiumUnit: PremiumUnit;
  minPremium: number;
  maxPremium: number;
  premiumStep: number;
  weight: number;
  evaluateImmediate: (
    premium: number,
    position: Position,
    mode: CommissionMode
  ) => number;
};

const ANNUAL_FREQUENCY: PaymentFrequency = "annual";

const LOW_REMAINING_NON_LIFE_THRESHOLD = 7_000;
const HIGH_REMAINING_NEON_PRIORITY_THRESHOLD = 12_000;
const MAX_ALLOWED_OVERSHOOT = 1_500;

const NEON_TEMPLATE: SuggestionTemplate = {
  product: "neon",
  label: productLabel("neon"),
  premiumUnit: "monthly",
  minPremium: 1_000,
  maxPremium: 1_700,
  premiumStep: 50,
  weight: 3.5,
  evaluateImmediate: (premium, position, mode) =>
    immediateFromItems(calculateNeon(premium, position, 15, mode).items),
};

const NON_LIFE_TEMPLATES: SuggestionTemplate[] = [
  {
    product: "cppAuto",
    label: productLabel("cppAuto"),
    premiumUnit: "annual",
    minPremium: 5_000,
    maxPremium: 15_000,
    premiumStep: 500,
    weight: 2.6,
    evaluateImmediate: (premium, position) =>
      immediateFromItems(calculateCppAuto(premium, ANNUAL_FREQUENCY, position).items),
  },
  {
    product: "allianzAuto",
    label: productLabel("allianzAuto"),
    premiumUnit: "annual",
    minPremium: 5_000,
    maxPremium: 15_000,
    premiumStep: 500,
    weight: 2.4,
    evaluateImmediate: (premium, position) =>
      immediateFromItems(calculateAllianzAuto(premium, ANNUAL_FREQUENCY, position).items),
  },
  {
    product: "domex",
    label: productLabel("domex"),
    premiumUnit: "annual",
    minPremium: 2_000,
    maxPremium: 10_000,
    premiumStep: 500,
    weight: 2.3,
    evaluateImmediate: (premium, position) =>
      immediateFromItems(calculateDomex(premium, ANNUAL_FREQUENCY, position).items),
  },
  {
    product: "maxdomov",
    label: productLabel("maxdomov"),
    premiumUnit: "annual",
    minPremium: 2_000,
    maxPremium: 10_000,
    premiumStep: 500,
    weight: 1.9,
    evaluateImmediate: (premium, position) =>
      immediateFromItems(calculateMaxdomov(premium, ANNUAL_FREQUENCY, position).items),
  },
  {
    product: "cppsimplex",
    label: productLabel("cppsimplex"),
    premiumUnit: "annual",
    minPremium: 3_000,
    maxPremium: 7_000,
    premiumStep: 500,
    weight: 2.2,
    evaluateImmediate: (premium, position) =>
      immediateFromItems(calculateCppSimplex(premium, ANNUAL_FREQUENCY, position).items),
  },
  {
    product: "cppcestovko",
    label: productLabel("cppcestovko"),
    premiumUnit: "annual",
    minPremium: 300,
    maxPremium: 1_000,
    premiumStep: 50,
    weight: 1.2,
    evaluateImmediate: (premium, position) =>
      immediateFromItems(calculateCppCestovko(premium, position).items),
  },
  {
    product: "axacestovko",
    label: productLabel("axacestovko"),
    premiumUnit: "annual",
    minPremium: 300,
    maxPremium: 1_000,
    premiumStep: 50,
    weight: 1.2,
    evaluateImmediate: (premium, position) =>
      immediateFromItems(calculateAxaCestovko(premium, position).items),
  },
];

const HIGH_REMAINING_TEMPLATES: SuggestionTemplate[] = [
  {
    ...NEON_TEMPLATE,
    weight: 8.5,
  },
  ...NON_LIFE_TEMPLATES.map((template) => ({
    ...template,
    weight: Math.max(0.7, template.weight * 0.55),
  })),
];

function templatesForRemaining(remainingImmediate: number): SuggestionTemplate[] {
  if (remainingImmediate >= HIGH_REMAINING_NEON_PRIORITY_THRESHOLD) {
    // vyšší deficit: ŽP NEON musí dominovat, ale vedlejší produkty jsou povolené
    return HIGH_REMAINING_TEMPLATES;
  }

  if (remainingImmediate <= LOW_REMAINING_NON_LIFE_THRESHOLD) {
    // nižší deficit: primárně vedlejší (neživotní) produkty
    return NON_LIFE_TEMPLATES;
  }

  // střední deficit: mix, ale stále s rozumným zastoupením neživotních produktů
  return [NEON_TEMPLATE, ...NON_LIFE_TEMPLATES];
}

function normalizeTitle(title: string | undefined | null): string {
  if (!title) return "";
  return title.toLowerCase().trim();
}

function isImmediateTitle(title: string | undefined | null): boolean {
  const normalized = normalizeTitle(title);
  return (
    normalized.includes("okamžitá provize") ||
    normalized.includes("získatelská") ||
    normalized.includes("provize a101") ||
    normalized.includes("provize b0301") ||
    normalized.includes("50% z b3601") ||
    normalized.includes("50% z b36") ||
    normalized.includes("okamžitá")
  );
}

function immediateFromItems(items: CommissionResultItemDTO[]): number {
  return items.reduce((sum, item) => {
    if (!isImmediateTitle(item.title)) return sum;
    return sum + (item.amount ?? 0);
  }, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function steppedValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  if (!Number.isFinite(step) || step <= 0) return out;
  const start = roundToStep(min, step);
  const end = roundToStep(max, step);
  for (let v = start; v <= end; v += step) {
    const clamped = Math.min(max, Math.max(min, v));
    if (out[out.length - 1] !== clamped) {
      out.push(clamped);
    }
  }
  return out;
}

function randomSteppedValue(
  min: number,
  max: number,
  step: number,
  rng: () => number
): number {
  const span = Math.max(0, max - min);
  const steps = Math.floor(span / step);
  const pickedStep = Math.floor(rng() * (steps + 1));
  return min + pickedStep * step;
}

function pickWeightedTemplate(
  templates: SuggestionTemplate[],
  rng: () => number
): SuggestionTemplate {
  const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * totalWeight;

  for (const template of templates) {
    roll -= template.weight;
    if (roll <= 0) return template;
  }

  return templates[templates.length - 1];
}

function estimateRate(
  template: SuggestionTemplate,
  position: Position,
  mode: CommissionMode
): number {
  const samplePremium =
    template.minPremium + Math.max(template.premiumStep, (template.maxPremium - template.minPremium) / 3);
  const immediate = template.evaluateImmediate(samplePremium, position, mode);
  if (!Number.isFinite(immediate) || immediate <= 0) return 0;
  return immediate / samplePremium;
}

function pickPremiumForRemaining(
  template: SuggestionTemplate,
  remainingImmediate: number,
  position: Position,
  mode: CommissionMode,
  rng: () => number,
  existingItems: GoalSuggestionItem[] = []
): number {
  const rate = estimateRate(template, position, mode);
  if (!Number.isFinite(rate) || rate <= 0) {
    return randomSteppedValue(
      template.minPremium,
      template.maxPremium,
      template.premiumStep,
      rng
    );
  }

  const noise = 0.82 + rng() * 0.36;
  const rawPremium = (remainingImmediate / rate) * noise;
  const clamped = clamp(rawPremium, template.minPremium, template.maxPremium);
  const rounded = roundToStep(clamped, template.premiumStep);
  let premium = clamp(rounded, template.minPremium, template.maxPremium);

  const productPremiums = new Set(
    existingItems
      .filter((it) => it.product === template.product)
      .map((it) => it.premium)
  );
  const options = steppedValues(
    template.minPremium,
    template.maxPremium,
    template.premiumStep
  );
  const hasVariability = options.length > 1;

  // Pokud výpočet tlačí na horní limit, rozhoď premium v horním pásmu i u dalších produktů.
  if (hasVariability && premium >= template.maxPremium && remainingImmediate > 1_500) {
    const upperBandMin = Math.max(
      template.minPremium,
      template.maxPremium - 6 * template.premiumStep
    );
    const upperBand = options.filter((v) => v >= upperBandMin);
    const upperBandUnused = upperBand.filter((v) => !productPremiums.has(v));
    const pool = upperBandUnused.length > 0 ? upperBandUnused : upperBand;
    if (pool.length > 0) {
      premium = pool[Math.floor(rng() * pool.length)];
    }
  }

  // Nenech stejné premium opakovat u stejného produktu v jednom návrhu.
  if (hasVariability && productPremiums.has(premium)) {
    const unusedClosest = options
      .filter((v) => !productPremiums.has(v))
      .sort((a, b) => Math.abs(a - premium) - Math.abs(b - premium))
      .slice(0, 4);
    if (unusedClosest.length > 0) {
      premium = unusedClosest[Math.floor(rng() * unusedClosest.length)];
    }
  }

  return premium;
}

function findBestFitItem(
  remainingImmediate: number,
  position: Position,
  mode: CommissionMode,
  index: number,
  templates: SuggestionTemplate[],
  maxOvershoot: number,
  existingItems: GoalSuggestionItem[] = []
): GoalSuggestionItem | null {
  type ScoredCandidate = GoalSuggestionItem & { score: number };
  const factors = [0.8, 0.92, 1, 1.08, 1.2];
  const candidates: ScoredCandidate[] = [];
  const uniquePremiumOptionsByProduct = new Map<Product, number>();

  for (const template of templates) {
    if (!uniquePremiumOptionsByProduct.has(template.product)) {
      uniquePremiumOptionsByProduct.set(
        template.product,
        steppedValues(template.minPremium, template.maxPremium, template.premiumStep).length
      );
    }
  }

  for (const template of templates) {
    const rate = estimateRate(template, position, mode);
    if (!Number.isFinite(rate) || rate <= 0) continue;

    for (const factor of factors) {
      const guessedPremium = remainingImmediate / rate;
      const adjusted = guessedPremium * factor;
      const clamped = clamp(adjusted, template.minPremium, template.maxPremium);
      const premium = clamp(
        roundToStep(clamped, template.premiumStep),
        template.minPremium,
        template.maxPremium
      );
      const immediate = template.evaluateImmediate(premium, position, mode);
      if (!Number.isFinite(immediate) || immediate <= 0) continue;
      const overshoot = immediate - remainingImmediate;
      if (overshoot > maxOvershoot) continue;
      const existingPremiumsForProduct = new Set(
        existingItems
          .filter((it) => it.product === template.product)
          .map((it) => it.premium)
      );
      const hasSameProductAndPremium = existingPremiumsForProduct.has(premium);
      const uniqueOptions = uniquePremiumOptionsByProduct.get(template.product) ?? 1;
      if (hasSameProductAndPremium && existingPremiumsForProduct.size < uniqueOptions) {
        continue;
      }

      let score = Math.abs(immediate - remainingImmediate) * (overshoot >= 0 ? 0.95 : 1);
      if (premium === template.maxPremium) {
        score *= 1.14;
      }
      if (existingItems.some((it) => it.product === template.product && it.premium === premium)) {
        score *= 1.35;
      }
      const sameProductCount = existingItems.filter((it) => it.product === template.product).length;
      if (sameProductCount > 0) {
        score *= 1 + Math.min(0.2, sameProductCount * 0.05);
      }

      candidates.push({
        id: `goal-plan-${index}-${template.product}-${premium}`,
        product: template.product,
        productLabel: template.label,
        premium,
        premiumUnit: template.premiumUnit,
        immediate,
        score,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);

  const bestScore = candidates[0].score;
  const pool = candidates
    .filter((c) => c.score <= bestScore * 1.32 + 250)
    .slice(0, 8);
  const totalWeight = pool.reduce((sum, c) => sum + 1 / Math.max(1, c.score), 0);
  let roll = Math.random() * totalWeight;

  for (const c of pool) {
    roll -= 1 / Math.max(1, c.score);
    if (roll <= 0) {
      return {
        id: c.id,
        product: c.product,
        productLabel: c.productLabel,
        premium: c.premium,
        premiumUnit: c.premiumUnit,
        immediate: c.immediate,
      };
    }
  }

  const fallback = pool[0];
  return {
    id: fallback.id,
    product: fallback.product,
    productLabel: fallback.productLabel,
    premium: fallback.premium,
    premiumUnit: fallback.premiumUnit,
    immediate: fallback.immediate,
  };
}

export function generateMonthlyGoalPlan({
  remainingImmediate,
  position,
  mode,
  maxItems = 7,
}: {
  remainingImmediate: number;
  position: Position;
  mode?: CommissionMode | null;
  maxItems?: number;
}): GoalSuggestionPlan {
  const targetImmediate = Math.max(0, Number(remainingImmediate) || 0);
  if (targetImmediate <= 0) {
    return {
      items: [],
      targetImmediate: 0,
      totalImmediate: 0,
      missingAfterPlan: 0,
      overshoot: 0,
    };
  }

  const usedMode: CommissionMode = mode ?? "accelerated";
  const safeMaxItems = clamp(Math.round(maxItems), 1, 12);
  const requireNeon =
    targetImmediate >= HIGH_REMAINING_NEON_PRIORITY_THRESHOLD;
  const activeTemplates = templatesForRemaining(targetImmediate);
  if (activeTemplates.length === 0) {
    return {
      items: [],
      targetImmediate,
      totalImmediate: 0,
      missingAfterPlan: targetImmediate,
      overshoot: 0,
    };
  }

  const rng = Math.random;
  const items: GoalSuggestionItem[] = [];

  let totalImmediate = 0;
  let attempts = 0;

  if (requireNeon && items.length < safeMaxItems) {
    const firstNeon = findBestFitItem(
      targetImmediate,
      position,
      usedMode,
      1,
      [NEON_TEMPLATE],
      MAX_ALLOWED_OVERSHOOT,
      items
    );
    if (firstNeon) {
      items.push({
        ...firstNeon,
        id: `goal-plan-${items.length + 1}-${firstNeon.product}-${firstNeon.premium}`,
      });
      totalImmediate += firstNeon.immediate;
    }
  }

  while (
    totalImmediate < targetImmediate &&
    items.length < safeMaxItems &&
    attempts < safeMaxItems * 10
  ) {
    attempts += 1;
    const remaining = targetImmediate - totalImmediate;
    const template = pickWeightedTemplate(activeTemplates, rng);
    const premium = pickPremiumForRemaining(
      template,
      remaining,
      position,
      usedMode,
      rng,
      items
    );
    const immediate = template.evaluateImmediate(premium, position, usedMode);
    if (!Number.isFinite(immediate) || immediate <= 0) continue;
    const projectedOvershoot = totalImmediate + immediate - targetImmediate;
    if (projectedOvershoot > MAX_ALLOWED_OVERSHOOT) continue;

    items.push({
      id: `goal-plan-${items.length + 1}-${template.product}-${premium}`,
      product: template.product,
      productLabel: template.label,
      premium,
      premiumUnit: template.premiumUnit,
      immediate,
    });
    totalImmediate += immediate;
  }

  while (totalImmediate < targetImmediate && items.length < safeMaxItems) {
    const remaining = targetImmediate - totalImmediate;
    const bestFit = findBestFitItem(
      remaining,
      position,
      usedMode,
      items.length + 1,
      activeTemplates,
      MAX_ALLOWED_OVERSHOOT,
      items
    );
    if (!bestFit) break;

    items.push(bestFit);
    totalImmediate += bestFit.immediate;
  }

  return {
    items,
    targetImmediate,
    totalImmediate,
    missingAfterPlan: Math.max(0, targetImmediate - totalImmediate),
    overshoot: Math.max(0, totalImmediate - targetImmediate),
  };
}
