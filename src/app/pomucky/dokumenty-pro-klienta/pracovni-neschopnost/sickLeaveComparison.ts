import { INJURY_PRODUCT_GROUPS } from "../../srovnavac-trvalych-nasledku/productCatalog";

export const PRODUCT_GROUPS = INJURY_PRODUCT_GROUPS.map(({ insurerName, options }) => ({
  insurerName,
  options: options.map(({ value, productName, badges }) => ({
    value,
    label: [productName, ...badges].join(" · "),
    fullLabel: [`${insurerName} ${productName}`, ...badges].join(" · "),
  })),
}));

const productLabels = new Map(
  PRODUCT_GROUPS.flatMap(({ options }) => options.map(({ value, fullLabel }) => [value, fullLabel] as const)),
);

export const START_DAYS = [15, 29, 60];
export const MAX_DAYS = 3650;
export const MAX_DAILY_KC = 1_000_000;

export const MODEL_NOTE = "Modelové plnění podle zadaného nastavení. Skutečné plnění závisí na podmínkách smlouvy, zejména na čekací době, výlukách a maximální době plnění.";

export const PAYOUT_RULES = "Zpětně se po dosažení sjednaného dne počítá plnění od 1. dne. Nezpětně se počítá od sjednaného dne včetně.";

export type CoverageInput = {
  product: string;
  startDay: string;
  mode: "retroactive" | "prospective";
  dailyAmount: string;
};

export type Coverage = {
  product: string;
  startDay: number;
  retroactive: boolean;
  dailyCents: number;
};

export type Payout = {
  paidDays: number;
  amountCents: number;
};

export function parseStartDay(input: string): number | null {
  const value = Number(input);
  return /^\d+$/.test(input) && value >= 1 && value <= MAX_DAYS ? value : null;
}

export function parseDailyCents(input: string): number | null {
  const match = input.trim().match(/^(\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[,.](\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1].replace(/\s/g, "")) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 && cents <= MAX_DAILY_KC * 100 ? cents : null;
}

export function readCoverage(input: CoverageInput): Coverage | null {
  const product = productLabels.get(input.product);
  const startDay = parseStartDay(input.startDay);
  const dailyCents = parseDailyCents(input.dailyAmount);
  if (!product || startDay === null || dailyCents === null) return null;
  if (input.mode !== "retroactive" && input.mode !== "prospective") return null;

  return { product, startDay, dailyCents, retroactive: input.mode === "retroactive" };
}

export function calculatePayout(coverage: Coverage, duration: number): Payout {
  const paidDays = duration < coverage.startDay ? 0
    : coverage.retroactive ? duration
    : duration - coverage.startDay + 1;
  return { paidDays, amountCents: paidDays * coverage.dailyCents };
}

export function compareSickLeave(current: Coverage, proposed: Coverage) {
  const durations = new Set([15, 28, 29, 30, 60, 90]);
  for (const { startDay } of [current, proposed]) {
    for (const duration of [startDay - 1, startDay, startDay + 1]) {
      if (duration >= 1 && duration !== 7 && duration !== 14) durations.add(duration);
    }
  }
  return {
    current,
    proposed,
    rows: [...durations].sort((a, b) => a - b).map(duration => ({
      duration,
      isStartDay: duration === current.startDay || duration === proposed.startDay,
      current: calculatePayout(current, duration),
      proposed: calculatePayout(proposed, duration),
    })),
  };
}

export type Comparison = ReturnType<typeof compareSickLeave>;

const money = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });
export const formatCents = (cents: number) => `${money.format(cents / 100)}\u00a0Kč`;
export const formatDays = (days: number) => `${money.format(days)} ${days === 1 ? "den" : days <= 4 ? "dny" : "dní"}`;

export const coverageHeading = { current: "Stávající pojištění", proposed: "Nový návrh" };
export const coverageTerms = ({ startDay, retroactive, dailyCents }: Coverage) =>
  `Od ${startDay}. dne · ${retroactive ? "Zpětně" : "Nezpětně"} · ${formatCents(dailyCents)} / den`;
