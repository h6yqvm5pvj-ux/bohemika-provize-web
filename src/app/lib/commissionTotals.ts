import { type CommissionResultItemDTO } from "../types/domain";

function normalizeTitle(title: string | undefined | null): string {
  if (!title) return "";
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(code: string | undefined | null): string {
  return (code ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function compactCode(code: string): string {
  return code.replace(/[^A-Z0-9]/g, "");
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

export function isImmediateCommissionCode(code: string | undefined | null): boolean {
  const normalized = normalizeCode(code);
  if (!normalized || normalized === "TOTAL") return false;

  if (/^A1(?:0[1-9]|1[0-2])$/.test(normalized)) return true;
  if (normalized === "APZ101" || normalized === "B0301" || normalized === "B301") return true;

  const compact = compactCode(normalized);
  return compact === "B36HALF" || compact === "B036HALF" || compact === "B3601HALF";
}

export function isImmediateCommissionTitle(title: string | undefined | null): boolean {
  const normalized = normalizeTitle(title);
  if (!normalized || normalized.includes("celkem")) return false;
  return (
    normalized.includes("okamzita") ||
    normalized.includes("ziskatelska") ||
    normalized.includes("provize a101") ||
    normalized.includes("provize b0301") ||
    normalized.includes("provize 50% z b3601") ||
    normalized.includes("provize 50% z b36")
  );
}

export function isImmediateCommissionItem(item: CommissionResultItemDTO): boolean {
  if (item.excludeFromTotal) return false;
  if (isTotalRow(item.title)) return false;
  if (isImmediateCommissionCode(item.code)) return true;
  return isImmediateCommissionTitle(item.title);
}

export function sumImmediateCommissionItems(
  items: CommissionResultItemDTO[] | null | undefined
): number {
  return (items ?? []).reduce((sum, item) => {
    if (!isImmediateCommissionItem(item)) return sum;
    return sum + (Number.isFinite(item.amount) ? item.amount : 0);
  }, 0);
}
