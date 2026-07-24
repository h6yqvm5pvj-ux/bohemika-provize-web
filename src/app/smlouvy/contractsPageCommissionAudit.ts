import { toDate } from "@/app/lib/formatters";
import type {
  CommissionAuditItem,
  CommissionAuditSummary,
} from "@/app/lib/commissionAudit";

export function formatCommissionAuditDate(ms: number | null): string {
  if (ms == null) return "termín nezjištěn";
  const date = toDate(ms);
  return date ? date.toLocaleDateString("cs-CZ") : "termín nezjištěn";
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatCzechMonthCount(months: number): string {
  const normalized = Math.max(1, Math.round(months));
  if (normalized === 1) return "1 měsíc";
  if (normalized >= 2 && normalized <= 4) return `${normalized} měsíce`;
  return `${normalized} měsíců`;
}

export function commissionAuditMonthDistance(
  item: CommissionAuditItem
): number | null {
  if (item.daysUntilDue == null) return null;
  if (item.daysUntilDue === 0) return 0;

  if (item.expectedDateMs != null) {
    const expectedDate = toDate(item.expectedDateMs);
    if (expectedDate) {
      const today = startOfLocalDay(new Date());
      const expected = startOfLocalDay(expectedDate);
      const months = Math.abs(
        (today.getFullYear() - expected.getFullYear()) * 12 +
          (today.getMonth() - expected.getMonth())
      );
      return Math.max(1, months);
    }
  }

  return Math.max(1, Math.ceil(Math.abs(item.daysUntilDue) / 31));
}

export function commissionAuditTimingLabel(item: CommissionAuditItem): string {
  if (item.status === "career_mismatch") return "jiný kariérní stupeň";
  if (item.status === "difference") return "rozdíl ve výpisu";
  if (item.daysUntilDue === 0) return "výplata dnes";
  const months = commissionAuditMonthDistance(item);
  if (months == null) return item.status === "upcoming" ? "blíží se" : "po termínu";
  const formatted = formatCzechMonthCount(months);
  return item.status === "upcoming"
    ? `za ${formatted}`
    : `po termínu ${formatted}`;
}

export function commissionAuditStatusLabel(item: CommissionAuditItem): string {
  if (item.status === "career_mismatch") return "Jiný kariérní stupeň";
  const label = commissionAuditTimingLabel(item);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function normalizedAuditCode(code: string | null | undefined): string {
  return String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function commissionAuditKindLabel(item: CommissionAuditItem): string {
  const code = normalizedAuditCode(item.code);

  if (code === "ATP") return "Provize z tipu";
  if (code === "B0301" || code === "B301") {
    return "Provize po 3 měsících (Karta klienta)";
  }
  if (code === "B36" || code === "B036" || code === "B3601") {
    return "Provize po 36 měsících";
  }
  if (
    code === "B36_HALF" ||
    code === "B036_HALF" ||
    code === "B3601_HALF"
  ) {
    return "Provize 50% z B36";
  }
  if (code === "B48" || code === "B048" || code === "B4801") {
    return "Provize po 48 měsících";
  }
  if (code === "B101-B104" || /^B1\d+$/.test(code)) {
    return "Následná provize";
  }
  if (code === "B201-B206" || /^B20[1-6]$/.test(code)) {
    return "Pečovatelská provize";
  }

  const aMatch = code.match(/^A(\d+)$/);
  if (aMatch) {
    const numeric = Number(aMatch[1]);
    const part = numeric >= 101 && numeric <= 112 ? numeric - 100 : 1;
    return part <= 1 ? "Vzniková provize" : `Vzniková provize ${part}. část`;
  }

  if (!code) return String(item.label ?? "").trim() || "Provize";

  const cleanedLabel = String(item.label ?? "")
    .replace(new RegExp(`\\b${code}\\b`, "i"), "")
    .replace(/^provize\s*/i, "")
    .trim();
  return cleanedLabel || "Provize";
}

export function commissionAuditCompactLabel(item: CommissionAuditItem): string {
  const code = normalizedAuditCode(item.code);
  const kind = commissionAuditKindLabel(item);
  return code ? `${code} ${kind}` : kind;
}

export function commissionAuditSummaryLabel(
  summary: CommissionAuditSummary
): string {
  const parts = [
    summary.overdueCount > 0 ? `${summary.overdueCount} nevypl.` : null,
    summary.upcomingCount > 0 ? `${summary.upcomingCount} brzy` : null,
    summary.careerMismatchCount > 0 ? `${summary.careerMismatchCount} stupeň` : null,
    summary.differenceCount > 0 ? `${summary.differenceCount} rozdíl` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function commissionAuditToneClasses(item: CommissionAuditItem): {
  compact: string;
  card: string;
} {
  if (item.status === "career_mismatch") {
    return {
      compact: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
      card: "border-fuchsia-300/45 bg-fuchsia-300/12 text-fuchsia-100",
    };
  }
  if (item.status === "difference") {
    return {
      compact: "border-amber-200 bg-amber-50 text-amber-800",
      card: "border-amber-300/45 bg-amber-300/12 text-amber-100",
    };
  }
  if (item.status === "upcoming") {
    return {
      compact: "border-sky-200 bg-sky-50 text-sky-800",
      card: "border-sky-300/45 bg-sky-300/12 text-sky-100",
    };
  }
  return {
    compact: "border-rose-200 bg-rose-50 text-rose-800",
    card: "border-rose-300/45 bg-rose-300/12 text-rose-100",
  };
}
