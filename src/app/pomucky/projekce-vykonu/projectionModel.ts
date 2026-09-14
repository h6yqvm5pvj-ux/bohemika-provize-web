import { POSITION_LABELS } from "@/app/lib/formatters";
import { calculateCppAuto, calculateDomex } from "@/app/lib/productFormulas";
import type { CommissionMode, Position } from "@/app/types/domain";
import { projectNeonPayouts, type ProjectionPayout } from "./projectionLogic";

export const PRODUCTS = ["life", "auto", "property"] as const;
export type ProductKey = (typeof PRODUCTS)[number];
export type Production = Record<ProductKey, number>;
export type Storno = 0 | 3 | 5 | 10;
export type Member = { id: string; name: string; position: Position; production: Production };
export type ProjectionSettings = {
  mode: "individual" | "team";
  position: Position;
  managerPosition: Position;
  production: Production;
  managerProduction: Production;
  members: Member[];
  storno: Record<ProductKey, Storno>;
  growth: number;
  care: boolean;
  commissionMode: CommissionMode;
  startMonth: string;
  horizon: 5 | 10 | 15;
  target: number;
};
export type ProjectionMonth = Production & {
  date: Date;
  own: number;
  team: number;
  total: number;
  cumulative: number;
};
export type ProjectionYear = Production & {
  index: number;
  start: Date;
  end: Date;
  own: number;
  team: number;
  total: number;
  cumulative: number;
  months: ProjectionMonth[];
};
export type ProjectionResult = { months: ProjectionMonth[]; years: ProjectionYear[]; total: number };
export type SavedScenario = { name: string; settings: ProjectionSettings };
export type PlannerDraft = { settings: ProjectionSettings; baseline: SavedScenario | null };

export function emptyProduction(): Production {
  return { life: 0, auto: 0, property: 0 };
}

export function monthValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultSettings(position: Position = "poradce1", now = new Date()): ProjectionSettings {
  return {
    mode: "individual", position,
    managerPosition: position.startsWith("manazer") ? position : "manazer4",
    production: emptyProduction(), managerProduction: emptyProduction(), members: [],
    storno: { life: 0, auto: 0, property: 0 }, growth: 0, care: false,
    commissionMode: "accelerated", startMonth: monthValue(now), horizon: 10, target: 50000,
  };
}

export function finiteNumber(value: unknown, max = 10000000, min = 0): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/\s/g, "").replace(",", ".")) : 0;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validPosition(value: unknown, fallback: Position): Position {
  return typeof value === "string" && Object.hasOwn(POSITION_LABELS, value) ? value as Position : fallback;
}

function normalizeProduction(value: unknown): Production {
  const source = record(value);
  return { life: finiteNumber(source.life), auto: finiteNumber(source.auto), property: finiteNumber(source.property) };
}

export function normalizeSettings(value: unknown, defaults = defaultSettings()): ProjectionSettings {
  const source = record(value);
  const storno = record(source.storno);
  const rate = (key: ProductKey): Storno => [0, 3, 5, 10].includes(Number(storno[key])) ? Number(storno[key]) as Storno : 0;
  const managerPosition = validPosition(source.managerPosition, defaults.managerPosition);
  return {
    mode: source.mode === "team" ? "team" : "individual",
    position: validPosition(source.position, defaults.position),
    managerPosition: managerPosition.startsWith("manazer") ? managerPosition : defaults.managerPosition,
    production: normalizeProduction(source.production),
    managerProduction: normalizeProduction(source.managerProduction),
    members: Array.isArray(source.members) ? source.members.slice(0, 20).map((value, index) => {
      const member = record(value);
      return { id: `member-${index}`, name: typeof member.name === "string" ? member.name.slice(0, 60) : "", position: validPosition(member.position, "poradce1"), production: normalizeProduction(member.production) };
    }) : [],
    storno: { life: rate("life"), auto: rate("auto"), property: rate("property") },
    growth: finiteNumber(source.growth, 30, -20), care: source.care === true,
    commissionMode: source.commissionMode === "standard" ? "standard" : "accelerated",
    startMonth: typeof source.startMonth === "string" && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(source.startMonth) ? source.startMonth : defaults.startMonth,
    horizon: source.horizon === 5 || source.horizon === 15 ? source.horizon : 10,
    target: source.target == null ? defaults.target : finiteNumber(source.target),
  };
}

export function readDraft(raw: string | null, defaults: ProjectionSettings): PlannerDraft {
  try {
    const source = record(JSON.parse(raw || "null"));
    if (source.version !== 1 || !source.settings) return { settings: defaults, baseline: null };
    const baseline = record(source.baseline);
    return {
      settings: normalizeSettings(source.settings, defaults),
      baseline: baseline.settings ? { name: typeof baseline.name === "string" ? baseline.name.slice(0, 60) : "Výchozí scénář", settings: normalizeSettings(baseline.settings, defaults) } : null,
    };
  } catch {
    return { settings: defaults, baseline: null };
  }
}

function policyPayouts(product: ProductKey, premium: number, position: Position, start: Date, settings: ProjectionSettings): ProjectionPayout[] {
  const storno = settings.storno[product];
  if (product === "life") {
    return projectNeonPayouts(premium, position, settings.commissionMode, start, storno).map(payout => {
      const age = Math.floor(((payout.date.getFullYear() - start.getFullYear()) * 12 + payout.date.getMonth() - start.getMonth()) / 12);
      return { ...payout, amount: payout.amount * (settings.care ? Math.pow(1.02, age) : 1) };
    });
  }
  const auto = product === "auto" ? calculateCppAuto(premium, "annual", position).total : 0;
  const property = product === "property" ? calculateDomex(premium, "annual", position).items : [];
  const immediate = property.find(item => item.title.toLowerCase().includes("okamžitá"))?.amount ?? 0;
  const subsequent = property.find(item => item.title.toLowerCase().includes("následná"))?.amount ?? 0;
  return Array.from({ length: 15 }, (_, age) => {
    const growth = !settings.care ? 1 : product === "auto" ? Math.pow(1.05, age) : age < 3 ? 1 : 1.2 * Math.pow(1.03, age - 3);
    return {
      date: new Date(start.getFullYear(), start.getMonth() + 1 + age * 12, 1),
      amount: (product === "auto" ? auto : age === 0 ? immediate : subsequent) * growth * Math.pow(1 - storno / 100, age),
    };
  });
}

/** Full 12-month periods from the chosen start, including the initial payout delay. */
export function calculateProjection(settings: ProjectionSettings): ProjectionResult {
  const [year, month] = settings.startMonth.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const months: ProjectionMonth[] = Array.from({ length: settings.horizon * 12 }, (_, index) => ({
    ...emptyProduction(), date: new Date(year, month - 1 + index, 1), own: 0, team: 0, total: 0, cumulative: 0,
  }));
  const managerPosition = settings.mode === "team" ? settings.managerPosition : settings.position;
  const ownProduction = settings.mode === "team" ? settings.managerProduction : settings.production;
  const addProduction = (production: Production, subordinatePosition?: Position) => {
    for (const product of PRODUCTS) {
      const premium = finiteNumber(production[product]);
      if (!premium) continue;
      const schedule = new Map<number, number>();
      const addSchedule = (payouts: ProjectionPayout[], sign: number) => payouts.forEach(payout => {
        const offset = (payout.date.getFullYear() - year) * 12 + payout.date.getMonth() - (month - 1);
        schedule.set(offset, (schedule.get(offset) ?? 0) + sign * payout.amount);
      });
      addSchedule(policyPayouts(product, premium, managerPosition, start, settings), 1);
      if (subordinatePosition) addSchedule(policyPayouts(product, premium, subordinatePosition, start, settings), -1);
      for (let cohort = 0; cohort < months.length; cohort++) {
        const productionFactor = Math.pow(1 + settings.growth / 100, Math.floor(cohort / 12));
        schedule.forEach((baseAmount, offset) => {
          const target = months[cohort + offset];
          if (!target || baseAmount <= 0) return;
          const amount = baseAmount * productionFactor;
          target[product] += amount;
          target[subordinatePosition ? "team" : "own"] += amount;
          target.total += amount;
        });
      }
    }
  };
  addProduction(ownProduction);
  if (settings.mode === "team") settings.members.forEach(member => addProduction(member.production, member.position));
  let total = 0;
  months.forEach(month => { total += month.total; month.cumulative = total; });
  const years: ProjectionYear[] = Array.from({ length: settings.horizon }, (_, index) => {
    const period = months.slice(index * 12, index * 12 + 12);
    const sum = (key: ProductKey | "own" | "team" | "total") => period.reduce((total, month) => total + month[key], 0);
    return { index, start: period[0].date, end: period[11].date, months: period,
      life: sum("life"), auto: sum("auto"), property: sum("property"), own: sum("own"), team: sum("team"), total: sum("total"), cumulative: period[11].cumulative };
  });
  return { months, years, total };
}

export function goalProgress(result: ProjectionResult, target: number) {
  // A rolling year prevents an exceptional one-off payout from appearing as a lasting monthly income.
  const averages = result.months.map((_, index) => index < 11 ? null :
    result.months.slice(index - 11, index + 1).reduce((sum, month) => sum + month.total, 0) / 12);
  const reachedIndex = target > 0 ? averages.findIndex(value => value !== null && value >= target) : -1;
  const finalAverage = averages.at(-1) ?? 0;
  return { reached: reachedIndex < 0 ? null : result.months[reachedIndex].date, finalAverage,
    percent: target > 0 ? Math.min(100, finalAverage / target * 100) : 0,
    requiredScale: target > 0 && finalAverage > 0 ? Math.max(1, target / finalAverage) : null };
}

export function projectionCsv(result: ProjectionResult, baseline?: ProjectionResult | null): string {
  const header = ["Měsíc", "Životní pojištění (Kč)", "Auto (Kč)", "Majetek (Kč)", "Vlastní provize (Kč)", "Provize ze struktury (Kč)", "Celkem (Kč)", "Kumulativně (Kč)"];
  if (baseline) header.push("Srovnávací scénář (Kč)", "Rozdíl (Kč)");
  const rows = result.months.map((month, index) => {
    const amounts = [month.life, month.auto, month.property, month.own, month.team, month.total, month.cumulative];
    if (baseline) amounts.push(baseline.months[index].total, month.total - baseline.months[index].total);
    return [monthValue(month.date), ...amounts.map(value => value.toFixed(2).replace(".", ","))].join(";");
  });
  return "\uFEFF" + [header.join(";"), ...rows].join("\r\n");
}
