import type { Category, ContractStats } from "@/app/api/team-overview/teamOverview.types";

type ProductionCategory = Exclude<Category, "other">;

export const PRODUCTION_CATEGORY_TABS: { key: ProductionCategory; label: string }[] = [
  { key: "life", label: "Životní pojištění" },
  { key: "auto", label: "Auta" },
  { key: "property", label: "Majetek a odpovědnost občanů" },
  { key: "business", label: "Podnikatelé" },
  { key: "comfort", label: "Zlato" },
  { key: "foreigners", label: "Cizinci" },
  { key: "travel", label: "Cestovko" },
];

export function insurerLogoPath(insurer: string): string | null {
  const normalized = insurer.toLowerCase();
  if (normalized.includes("čpp") || normalized.includes("cpp")) return "/icons/cpp.png";
  if (normalized.includes("kooperativa")) return "/icons/koop-v2.png";
  if (normalized.includes("maxima")) return "/icons/maxima.png";
  if (normalized.includes("allianz")) return "/icons/allianz.png";
  if (normalized.includes("slavia")) return "/icons/slavialogo.png";
  if (normalized.includes("comfort") || normalized.includes("commodity")) {
    return "/icons/cclogo.png";
  }
  if (normalized.includes("uniqa")) return "/icons/uniqa.png";
  if (normalized.includes("čsob") || normalized.includes("csob")) return "/icons/csb.png";
  if (normalized.includes("pillow")) return "/icons/pillow.png";
  if (normalized.includes("generali")) return "/icons/generali.png";
  if (normalized.includes("metlife")) return "/icons/metlife.png";
  if (normalized.includes("nn")) return "/icons/nn.png";
  return null;
}

export function productionRowsForStats(stats: ContractStats | null, category: Category | "all") {
  const raw = category === "all" ? stats?.institutionMetrics ?? {} : stats?.institutionByCategory?.[category] ?? {};
  return Object.entries(raw)
    .map(([name, row]) => ({
      name,
      contracts: row?.contracts ?? 0,
      annualPremium: row?.annualPremium ?? 0,
      monthlyPremium: row?.monthlyPremium ?? (row?.annualPremium ?? 0) / 12,
    }))
    .filter(row => row.contracts > 0 || row.annualPremium > 0 || row.monthlyPremium > 0)
    .sort((a, b) => b.annualPremium - a.annualPremium || b.contracts - a.contracts || a.name.localeCompare(b.name, "cs"));
}
