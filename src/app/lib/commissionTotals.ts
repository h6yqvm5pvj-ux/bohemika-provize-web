import { type CommissionResultItemDTO } from "../types/domain";

function normalizeTitle(title: string | undefined | null): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function isTotalRow(title: string | undefined | null): boolean {
  return normalizeTitle(title).includes("celkem");
}

function itemMultiplier(title: string | undefined | null): number {
  const norm = normalizeTitle(title);
  if (norm.includes("2.–5.")) return 4; // roky 2–5
  if (norm.includes("5.–10.")) return 6; // roky 5–10
  return 1;
}

export function totalWithMultipliers(
  items: CommissionResultItemDTO[] | null | undefined
): number {
  const cleaned = (items ?? []).filter((it) => !it.excludeFromTotal && !isTotalRow(it.title));

  const hasYearly = cleaned.some((it) =>
    normalizeTitle(it.title).includes("provize za rok")
  );
  const source = hasYearly
    ? cleaned.filter((it) =>
        normalizeTitle(it.title).includes("provize za rok")
      )
    : cleaned;

  return source.reduce((sum, it) => {
    const amt = it.amount ?? 0;
    return sum + amt * itemMultiplier(it.title);
  }, 0);
}
