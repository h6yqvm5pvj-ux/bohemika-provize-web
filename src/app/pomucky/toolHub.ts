export const TOOL_HUB_TOOL_KEYS = [
  "argumenty",
  "dokumenty",
  "zaznam",
  "vypoved-smlouvy",
  "jak-stiham-vypoved-smlouvy",
  "nahrada-smlouvy",
  "radar-vyroci",
  "tvorba",
  "ai-asistent",
  "online-vizitka",
  "hypoteka-vlastni-zdroje",
  "statistika",
  "export-produkce",
  "plan-produkce",
  "zlato",
  "katastr",
  "proklepka-vozidla",
  "nahrat-tachometr",
  "odkazy-instituce",
  "ares",
  "projekce-vykonu",
  "cestovni-pojisteni-cpp-vs-kooperativa",
  "nastaveni-zivotniho-pojisteni",
  "srovnavac-trvalych-nasledku",
  "srovnavac-pracovni-neschopnosti",
  "srovnavac-zivotniho-pojisteni",
  "neon-life-vs-metlife-oneguard",
] as const;

export type ToolHubToolKey = (typeof TOOL_HUB_TOOL_KEYS)[number];
export type ToolHubSortMode = "personal" | "popular" | "alphabetical";

export type ToolHubUsageMetric = {
  personalOpens: number;
  globalOpens: number;
  lastOpenedAtMs: number | null;
  favorite: boolean;
};

const TOOL_HUB_TOOL_KEY_SET = new Set<string>(TOOL_HUB_TOOL_KEYS);

export const isToolHubToolKey = (value: unknown): value is ToolHubToolKey =>
  typeof value === "string" && TOOL_HUB_TOOL_KEY_SET.has(value);

const finiteNonNegative = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const normalizeToolHubUsageMetric = (
  value: Partial<ToolHubUsageMetric> | null | undefined
): ToolHubUsageMetric => ({
  personalOpens: finiteNonNegative(value?.personalOpens),
  globalOpens: finiteNonNegative(value?.globalOpens),
  lastOpenedAtMs:
    typeof value?.lastOpenedAtMs === "number" &&
    Number.isFinite(value.lastOpenedAtMs) &&
    value.lastOpenedAtMs > 0
      ? Math.round(value.lastOpenedAtMs)
      : null,
  favorite: value?.favorite === true,
});

export const compareToolHubUsage = (
  leftRaw: ToolHubUsageMetric | undefined,
  rightRaw: ToolHubUsageMetric | undefined,
  mode: ToolHubSortMode,
  prioritizeFavorites = mode === "personal"
): number => {
  const left = normalizeToolHubUsageMetric(leftRaw);
  const right = normalizeToolHubUsageMetric(rightRaw);
  const favoriteDiff = prioritizeFavorites
    ? Number(right.favorite) - Number(left.favorite)
    : 0;
  if (favoriteDiff !== 0) return favoriteDiff;

  if (mode === "alphabetical") return 0;

  if (mode === "popular") {
    return (
      right.globalOpens - left.globalOpens ||
      right.personalOpens - left.personalOpens ||
      (right.lastOpenedAtMs ?? 0) - (left.lastOpenedAtMs ?? 0)
    );
  }

  return (
    (right.lastOpenedAtMs ?? 0) - (left.lastOpenedAtMs ?? 0) ||
    right.personalOpens - left.personalOpens ||
    right.globalOpens - left.globalOpens
  );
};
