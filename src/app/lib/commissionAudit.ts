import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { toDate } from "@/app/lib/formatters";
import type {
  CommissionResultItemDTO,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";

export type CommissionAuditMode =
  | "off"
  | "all"
  | "overdue"
  | "upcoming"
  | "difference";

export type CommissionAuditCodeFilter =
  | "all"
  | "a101"
  | "b0301"
  | "b36"
  | "b48"
  | "subsequent";

export type CommissionAuditItemStatus =
  | "overdue"
  | "upcoming"
  | "difference";

export type CommissionAuditItem = {
  status: CommissionAuditItemStatus;
  code: string | null;
  label: string;
  amount: number;
  expectedDateMs: number | null;
  daysUntilDue: number | null;
  statementPeriod?: string | null;
  difference?: number | null;
};

export type CommissionAuditSummary = {
  overdueCount: number;
  upcomingCount: number;
  differenceCount: number;
  items: CommissionAuditItem[];
};

export type CommissionAuditContract = {
  id?: string | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: unknown;
  productKey?: Product;
  position?: Position | null;
  inputAmount?: number | null;
  frequencyRaw?: PaymentFrequency | null;
  total?: number | null;
  items?: CommissionResultItemDTO[] | null;
  result?: {
    items?: CommissionResultItemDTO[] | null;
    total?: number | null;
  } | null;
  commissionPayouts?: EntryDoc["commissionPayouts"];
  userEmail?: string | null;
  adviserEmail?: string | null;
  contractSignedDate?: unknown;
  policyStartDate?: unknown;
  policyEndDate?: unknown;
  createdAt?: unknown;
  contractNumber?: string | null;
  clientName?: string | null;
  commissionMode?: EntryDoc["commissionMode"] | string | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: EntryDoc["managerModeSnapshot"] | string | null;
  managerChain?: {
    email?: string | null;
    position?: Position | null;
    commissionMode?: string | null;
  }[] | null;
  managerOverrides?: {
    email?: string | null;
    position?: Position | null;
    commissionMode?: string | null;
    items?: CommissionResultItemDTO[] | null;
    total?: number | null;
  }[] | null;
  durationYears?: number | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: EntryDoc["maxCizinKomplexVariant"];
};

export const COMMISSION_AUDIT_UPCOMING_DAYS = 90;
export const COMMISSION_AUDIT_OVERDUE_DAYS = 180;

const COMMISSION_AUDIT_MODES = new Set<CommissionAuditMode>([
  "off",
  "all",
  "overdue",
  "upcoming",
  "difference",
]);

const COMMISSION_AUDIT_CODE_FILTERS = new Set<CommissionAuditCodeFilter>([
  "all",
  "a101",
  "b0301",
  "b36",
  "b48",
  "subsequent",
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FIRST_YEAR_A_COMMISSION_CODES = Array.from(
  { length: 12 },
  (_, index) => `A${String(101 + index)}`
);

export function parseCommissionAuditMode(
  value: string | null | undefined
): CommissionAuditMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  return COMMISSION_AUDIT_MODES.has(normalized as CommissionAuditMode)
    ? (normalized as CommissionAuditMode)
    : "off";
}

export function parseCommissionAuditCodeFilter(
  value: string | null | undefined
): CommissionAuditCodeFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  return COMMISSION_AUDIT_CODE_FILTERS.has(normalized as CommissionAuditCodeFilter)
    ? (normalized as CommissionAuditCodeFilter)
    : "all";
}

export function isCommissionAuditFilterActive({
  mode,
}: {
  mode: CommissionAuditMode;
  codeFilter?: CommissionAuditCodeFilter;
}): boolean {
  return mode !== "off";
}

export function normalizeCommissionAuditCode(
  code: string | null | undefined
): string {
  return String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function commissionCodeAliases(code: string): string[] {
  const normalized = normalizeCommissionAuditCode(code);
  if (!normalized || normalized === "TOTAL") return [];

  const installmentRangeMatch = normalized.match(/^([AB])(\d{3})-\1(\d{3})$/);
  if (installmentRangeMatch) {
    const prefix = installmentRangeMatch[1] ?? "";
    const start = Number(installmentRangeMatch[2]);
    const end = Number(installmentRangeMatch[3]);
    if (
      prefix &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start <= 24
    ) {
      return [
        normalized,
        ...Array.from({ length: end - start + 1 }, (_, index) =>
          `${prefix}${String(start + index).padStart(3, "0")}`
        ),
      ];
    }
  }

  const closingRoleMatch = normalized.match(/^(?:APZ|AP|AZ)(\d+)$/);
  if (closingRoleMatch) return [normalized, `A${closingRoleMatch[1]}`];
  if (/^A\d+$/.test(normalized)) return [normalized];
  if (normalized === "B301") return ["B0301", "B301"];
  if (normalized === "B101-B104") {
    return ["B101-B104", "B101", "B102", "B103", "B104"];
  }
  if (/^B1\d+$/.test(normalized)) return [normalized];
  if (normalized === "B201-B206") {
    return ["B201-B206", "B201", "B202", "B203", "B204", "B205", "B206"];
  }
  if (/^B20[1-6]$/.test(normalized)) return [normalized, "B201-B206"];
  if (
    normalized === "B36_HALF" ||
    normalized === "B036_HALF" ||
    normalized === "B3601_HALF"
  ) {
    return ["B36_HALF", "B036_HALF", "B3601_HALF"];
  }
  if (normalized === "B36" || normalized === "B036" || normalized === "B3601") {
    return ["B36", "B036", "B3601"];
  }
  if (normalized === "B48" || normalized === "B048" || normalized === "B4801") {
    return ["B48", "B048", "B4801"];
  }
  return [normalized];
}

function uniqueCommissionCodes(codes: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const code of codes) {
    const normalized = normalizeCommissionAuditCode(code);
    if (!normalized || normalized === "TOTAL") continue;
    for (const alias of commissionCodeAliases(normalized)) {
      if (alias && alias !== "TOTAL") out.add(alias);
    }
  }
  return [...out];
}

function codeFilterAliases(filter: CommissionAuditCodeFilter): string[] {
  switch (filter) {
    case "a101":
      return FIRST_YEAR_A_COMMISSION_CODES;
    case "b0301":
      return ["B0301", "B301"];
    case "b36":
      return ["B36", "B036", "B3601", "B36_HALF", "B036_HALF", "B3601_HALF"];
    case "b48":
      return ["B48", "B048", "B4801"];
    case "subsequent":
      return ["B101-B104", "B201-B206", "B201", "B202", "B203", "B204", "B205", "B206"];
    default:
      return [];
  }
}

function codesMatchFilter(
  codes: Array<string | null | undefined>,
  filter: CommissionAuditCodeFilter
): boolean {
  if (filter === "all") return true;
  const itemCodes = new Set(uniqueCommissionCodes(codes));
  if (itemCodes.size === 0) return false;
  if (filter === "subsequent") {
    return [...itemCodes].some(
      (code) =>
        code === "B101-B104" ||
        /^B1\d+$/.test(code) ||
        code === "B201-B206" ||
        /^B20[1-6]$/.test(code)
    );
  }
  return codeFilterAliases(filter).some((code) => itemCodes.has(code));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

function dateFromPayoutMonthKey(value: string | null | undefined): Date | null {
  const match = String(value ?? "").match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 25);
}

function auditEntryForContract(
  contract: CommissionAuditContract,
  viewerEmail?: string | null
): EntryDoc {
  const items =
    Array.isArray(contract.items) && contract.items.length > 0
      ? contract.items
      : Array.isArray(contract.result?.items)
        ? contract.result.items
        : [];

  return {
    ...(contract as EntryDoc),
    id: String(contract.id ?? ""),
    items,
    total:
      typeof contract.total === "number"
        ? contract.total
        : typeof contract.result?.total === "number"
          ? contract.result.total
          : undefined,
    userEmail: contract.userEmail ?? contract.adviserEmail ?? viewerEmail ?? null,
  };
}

function commissionAuditItemMatchesMode(
  item: CommissionAuditItem,
  mode: CommissionAuditMode
): boolean {
  if (mode === "off") return false;
  if (mode === "all") return true;
  return item.status === mode;
}

export function commissionAuditSummaryForContract(
  contract: CommissionAuditContract,
  {
    mode,
    codeFilter = "all",
    viewerEmail,
    now = new Date(),
    upcomingDays = COMMISSION_AUDIT_UPCOMING_DAYS,
    overdueDays = COMMISSION_AUDIT_OVERDUE_DAYS,
  }: {
    mode: CommissionAuditMode;
    codeFilter?: CommissionAuditCodeFilter;
    viewerEmail?: string | null;
    now?: Date;
    upcomingDays?: number;
    overdueDays?: number;
  }
): CommissionAuditSummary {
  const today = startOfDay(now);
  const upcomingEnd = new Date(today);
  upcomingEnd.setDate(upcomingEnd.getDate() + upcomingDays);
  const overdueStart = new Date(today);
  overdueStart.setDate(overdueStart.getDate() - overdueDays);
  const items: CommissionAuditItem[] = [];

  if (mode === "off") {
    return { overdueCount: 0, upcomingCount: 0, differenceCount: 0, items };
  }

  if (contractLifecycleStatus(contract, now) === "storno") {
    return { overdueCount: 0, upcomingCount: 0, differenceCount: 0, items };
  }

  if (contract.productKey === "comfortcc") {
    return { overdueCount: 0, upcomingCount: 0, differenceCount: 0, items };
  }

  const entry = auditEntryForContract(contract, viewerEmail);
  const generated = generateCashflow([entry], 10, entry.userEmail ?? viewerEmail);

  for (const item of generated) {
    if (item.isStatementOnly || item.isTipPayout) continue;
    if (item.payoutStatus === "paid") continue;
    if (
      !codesMatchFilter(
        [item.commissionCode, ...(item.commissionCodeAliases ?? [])],
        codeFilter
      )
    ) {
      continue;
    }

    const dueDate = startOfDay(item.date);
    const daysUntilDue = daysBetween(today, dueDate);
    const status: CommissionAuditItemStatus | null =
      dueDate < today && dueDate >= overdueStart
        ? "overdue"
        : dueDate >= today && dueDate <= upcomingEnd
          ? "upcoming"
          : null;
    if (!status) continue;

    const auditItem: CommissionAuditItem = {
      status,
      code: item.commissionCode ?? null,
      label: item.commissionLabel ?? item.note ?? "Provize",
      amount: Number.isFinite(Number(item.predictedAmount ?? item.amount))
        ? Number(item.predictedAmount ?? item.amount)
        : 0,
      expectedDateMs: dueDate.getTime(),
      daysUntilDue,
    };

    if (commissionAuditItemMatchesMode(auditItem, mode)) {
      items.push(auditItem);
    }
  }

  for (const payout of contract.commissionPayouts ?? []) {
    const status = String(payout?.status ?? "").trim().toLowerCase();
    if (status !== "difference") continue;
    if (!codesMatchFilter([payout.code], codeFilter)) continue;
    const payoutDate =
      dateFromPayoutMonthKey(payout.payoutMonthKey) ??
      toDate(payout.writtenAtMs) ??
      now;
    const auditItem: CommissionAuditItem = {
      status: "difference",
      code: normalizeCommissionAuditCode(payout.code) || null,
      label: payout.title || "Rozdíl ve výpisu",
      amount: Number.isFinite(Number(payout.amount)) ? Number(payout.amount) : 0,
      expectedDateMs: payoutDate ? startOfDay(payoutDate).getTime() : null,
      daysUntilDue: payoutDate ? daysBetween(today, payoutDate) : null,
      statementPeriod: payout.statementPeriod ?? null,
      difference:
        typeof payout.difference === "number" && Number.isFinite(payout.difference)
          ? payout.difference
          : null,
    };
    if (commissionAuditItemMatchesMode(auditItem, mode)) {
      items.push(auditItem);
    }
  }

  const sortedItems = items.sort((a, b) => {
    const statusRank: Record<CommissionAuditItemStatus, number> = {
      overdue: 0,
      difference: 1,
      upcoming: 2,
    };
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    return (a.expectedDateMs ?? Number.POSITIVE_INFINITY) -
      (b.expectedDateMs ?? Number.POSITIVE_INFINITY);
  });

  return {
    overdueCount: sortedItems.filter((item) => item.status === "overdue").length,
    upcomingCount: sortedItems.filter((item) => item.status === "upcoming").length,
    differenceCount: sortedItems.filter((item) => item.status === "difference").length,
    items: sortedItems,
  };
}

export function contractMatchesCommissionAuditFilter(
  contract: CommissionAuditContract,
  {
    mode,
    codeFilter = "all",
    viewerEmail,
    now,
  }: {
    mode: CommissionAuditMode;
    codeFilter?: CommissionAuditCodeFilter;
    viewerEmail?: string | null;
    now?: Date;
  }
): boolean {
  if (!isCommissionAuditFilterActive({ mode, codeFilter })) return true;
  return (
    commissionAuditSummaryForContract(contract, {
      mode,
      codeFilter,
      viewerEmail,
      now,
    }).items.length > 0
  );
}
