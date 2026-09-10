import type { ToolCatalogEntry } from "./toolCatalog";

export const TOOL_HUB_TOOL_KEYS = [
  "argumenty",
  "kontakty",
  "dokumenty",
  "zaznam",
  "vypoved-smlouvy",
  "jak-stiham-vypoved-smlouvy",
  "nahrada-smlouvy",
  "radar-vyroci",
  "tvorba",
  "online-vizitka",
  "hypoteka-vlastni-zdroje",
  "statistika",
  "export-produkce",
  "plan-produkce",
  "tipar",
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
  "neon-life-vs-metlife-oneguard",
] as const;

export type ToolHubToolKey = (typeof TOOL_HUB_TOOL_KEYS)[number];

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

const CATEGORY_RANK: Record<ToolCatalogEntry["category"], number> = {
  "Životní pojištění": 0,
  "Pojištění majetku": 1,
  "Pojištění vozidel": 2,
  "Cestovní pojištění": 3,
  Finance: 4,
  Investice: 5,
  Obecné: 6,
};

export const compareToolHubTools = (
  left: Pick<ToolCatalogEntry, "key" | "category" | "title">,
  right: Pick<ToolCatalogEntry, "key" | "category" | "title">,
  usageByKey: Partial<Record<ToolHubToolKey, ToolHubUsageMetric>>
): number => {
  return (
    Number(usageByKey[right.key]?.favorite === true) -
      Number(usageByKey[left.key]?.favorite === true) ||
    CATEGORY_RANK[left.category] - CATEGORY_RANK[right.category] ||
    left.title.localeCompare(right.title, "cs")
  );
};
