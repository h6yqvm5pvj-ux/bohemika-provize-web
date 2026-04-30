import { type Condition, type Damage, type Equipment, type Origin, type ServiceHistory, type Usage } from "./types";

export type VehicleValuationSummary = {
  brand: string;
  year: number | null;
  firstRegistration: Date | null;
  fuel: string;
  powerKw: number | null;
  category: string;
  body: string;
  ownerCount: number | null;
};

export type ValuationAdjustment = {
  label: string;
  multiplier: number;
  note: string;
};

export type VehicleValuationEstimate = {
  ageYears: number;
  baseNewPrice: number;
  baseAfterAge: number;
  expectedMileage: number;
  recommended: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: "vysoká" | "střední" | "nižší";
  confidenceScore: number;
  adjustments: ValuationAdjustment[];
};

export function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function yearsSince(date: Date | null, fallbackYear: number | null): number {
  if (date) {
    const now = new Date();
    const years = now.getFullYear() - date.getFullYear();
    const beforeAnniversary =
      now.getMonth() < date.getMonth() ||
      (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
    return Math.max(0, years - (beforeAnniversary ? 1 : 0));
  }
  if (fallbackYear && Number.isFinite(fallbackYear)) {
    return Math.max(0, new Date().getFullYear() - fallbackYear);
  }
  return 6;
}

function depreciationMultiplier(ageYears: number): number {
  const points = [
    [0, 0.9],
    [1, 0.76],
    [2, 0.66],
    [3, 0.58],
    [4, 0.51],
    [5, 0.45],
    [6, 0.4],
    [7, 0.36],
    [8, 0.32],
    [9, 0.29],
    [10, 0.26],
    [12, 0.2],
    [15, 0.14],
    [18, 0.1],
  ] as const;

  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (ageYears >= x1 && ageYears <= x2) {
      const t = (ageYears - x1) / (x2 - x1);
      return y1 + (y2 - y1) * t;
    }
  }
  return 0.08;
}

function brandTier(brand: string): "budget" | "mainstream" | "premium" | "luxury" {
  const normalized = brand
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(porsche|maserati|ferrari|bentley|rolls|aston|lamborghini)/.test(normalized)) return "luxury";
  if (/(audi|bmw|mercedes|lexus|volvo|tesla|jaguar|land rover|mini)/.test(normalized)) return "premium";
  if (/(dacia|lada|ssangyong|mg)/.test(normalized)) return "budget";
  return "mainstream";
}

function estimateNewPrice(summary: VehicleValuationSummary | null): number {
  if (!summary) return 750_000;

  const tier = brandTier(summary.brand);
  const tierBase = {
    budget: 390_000,
    mainstream: 560_000,
    premium: 980_000,
    luxury: 1_900_000,
  }[tier];

  const power = summary.powerKw ?? 95;
  const fuel = summary.fuel.toLowerCase();
  const electricBonus = fuel.includes("elekt") ? 280_000 : 0;
  const hybridBonus = fuel.includes("hybrid") ? 120_000 : 0;
  const powerBonus = clamp(power - 70, 0, 250) * (tier === "premium" || tier === "luxury" ? 8_500 : 5_200);
  const category = `${summary.category} ${summary.body}`.toLowerCase();
  const suvBonus = /(suv|terenn|mpv|kombi)/.test(category) ? 85_000 : 0;

  return roundTo(tierBase + powerBonus + electricBonus + hybridBonus + suvBonus, 10_000);
}

function expectedMileagePerYear(summary: VehicleValuationSummary | null): number {
  const fuel = summary?.fuel.toLowerCase() ?? "";
  if (fuel.includes("diesel") || fuel.includes("nafta")) return 20_000;
  if (fuel.includes("elekt")) return 15_000;
  if (fuel.includes("hybrid")) return 16_000;
  return 14_000;
}

export function formatMultiplierLabel(multiplier: number): string {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct > 0) return `+${pct} %`;
  return `${pct} %`;
}

export function buildVehicleValuationEstimate(params: {
  summary: VehicleValuationSummary | null;
  mileageKm: number | null;
  newPrice: number | null;
  condition: Condition;
  serviceHistory: ServiceHistory;
  origin: Origin;
  equipment: Equipment;
  damage: Damage;
  usage: Usage;
}): VehicleValuationEstimate {
  const ageYears = yearsSince(params.summary?.firstRegistration ?? null, params.summary?.year ?? null);
  const baseNewPrice = params.newPrice ?? estimateNewPrice(params.summary);
  const baseAfterAge = baseNewPrice * depreciationMultiplier(ageYears);
  const adjustments: ValuationAdjustment[] = [];

  const expectedMileage = Math.max(10_000, expectedMileagePerYear(params.summary) * Math.max(1, ageYears));
  if (params.mileageKm != null) {
    const diff = (params.mileageKm - expectedMileage) / expectedMileage;
    const mileageMultiplier = clamp(1 - diff * 0.18, 0.78, 1.16);
    adjustments.push({
      label: "Nájezd",
      multiplier: mileageMultiplier,
      note:
        params.mileageKm > expectedMileage
          ? "vyšší než očekávaný nájezd pro stáří vozu"
          : "nižší než očekávaný nájezd pro stáří vozu",
    });
  }

  const conditionMap: Record<Condition, ValuationAdjustment> = {
    excellent: { label: "Stav", multiplier: 1.08, note: "výborný stav bez výrazných investic" },
    good: { label: "Stav", multiplier: 1, note: "běžný dobrý stav" },
    average: { label: "Stav", multiplier: 0.92, note: "průměrný stav s běžným opotřebením" },
    worse: { label: "Stav", multiplier: 0.78, note: "horší stav nebo očekávané investice" },
  };
  adjustments.push(conditionMap[params.condition]);

  const serviceMap: Record<ServiceHistory, ValuationAdjustment> = {
    full: { label: "Servis", multiplier: 1.04, note: "doložená servisní historie" },
    partial: { label: "Servis", multiplier: 0.99, note: "částečně doložený servis" },
    unknown: { label: "Servis", multiplier: 0.95, note: "servisní historie není jasná" },
    none: { label: "Servis", multiplier: 0.88, note: "bez doložené servisní historie" },
  };
  adjustments.push(serviceMap[params.serviceHistory]);

  const originMap: Record<Origin, ValuationAdjustment> = {
    cz: { label: "Původ", multiplier: 1.02, note: "český původ" },
    eu: { label: "Původ", multiplier: 1, note: "doložený EU původ" },
    import: { label: "Původ", multiplier: 0.96, note: "dovoz bez plné lokální historie" },
    unknown: { label: "Původ", multiplier: 0.97, note: "nejasný původ" },
  };
  adjustments.push(originMap[params.origin]);

  const equipmentMap: Record<Equipment, ValuationAdjustment> = {
    basic: { label: "Výbava", multiplier: 0.96, note: "základní výbava" },
    standard: { label: "Výbava", multiplier: 1, note: "běžná výbava" },
    high: { label: "Výbava", multiplier: 1.05, note: "nadstandardní výbava" },
    top: { label: "Výbava", multiplier: 1.1, note: "velmi bohatá výbava" },
  };
  adjustments.push(equipmentMap[params.equipment]);

  const damageMap: Record<Damage, ValuationAdjustment> = {
    none: { label: "Poškození", multiplier: 1, note: "bez známého poškození" },
    cosmetic: { label: "Poškození", multiplier: 0.94, note: "kosmetické vady" },
    repaired: { label: "Poškození", multiplier: 0.9, note: "opravená větší škoda" },
    unresolved: { label: "Poškození", multiplier: 0.75, note: "neopravené nebo významné poškození" },
  };
  adjustments.push(damageMap[params.damage]);

  const usageMap: Record<Usage, ValuationAdjustment> = {
    private: { label: "Užívání", multiplier: 1, note: "běžné soukromé užívání" },
    company: { label: "Užívání", multiplier: 0.97, note: "firemní užívání" },
    taxi: { label: "Užívání", multiplier: 0.82, note: "taxi / intenzivní provoz" },
    unknown: { label: "Užívání", multiplier: 0.98, note: "neznámý režim užívání" },
  };
  adjustments.push(usageMap[params.usage]);

  const ownerCount = params.summary?.ownerCount ?? null;
  if (ownerCount != null && ownerCount > 2) {
    adjustments.push({
      label: "Počet vlastníků",
      multiplier: ownerCount >= 5 ? 0.94 : 0.97,
      note: `${ownerCount} vlastníků v registru`,
    });
  }

  const multiplier = adjustments.reduce((acc, item) => acc * item.multiplier, 1);
  const recommended = roundTo(baseAfterAge * multiplier, 5_000);
  const confidenceScore = [
    params.summary ? 24 : 0,
    params.mileageKm != null ? 22 : 0,
    params.newPrice != null ? 16 : 4,
    params.serviceHistory !== "unknown" ? 12 : 0,
    params.damage !== "unresolved" ? 8 : 0,
    params.condition !== "average" ? 8 : 5,
    params.origin !== "unknown" ? 6 : 0,
    params.equipment !== "standard" ? 4 : 2,
  ].reduce((acc, value) => acc + value, 0);
  const confidence = confidenceScore >= 76 ? "vysoká" : confidenceScore >= 52 ? "střední" : "nižší";
  const rangePct = confidence === "vysoká" ? 0.08 : confidence === "střední" ? 0.13 : 0.2;

  return {
    ageYears,
    baseNewPrice,
    baseAfterAge: roundTo(baseAfterAge, 5_000),
    expectedMileage,
    recommended,
    rangeLow: roundTo(recommended * (1 - rangePct), 5_000),
    rangeHigh: roundTo(recommended * (1 + rangePct), 5_000),
    confidence,
    confidenceScore: clamp(confidenceScore, 0, 100),
    adjustments,
  };
}
