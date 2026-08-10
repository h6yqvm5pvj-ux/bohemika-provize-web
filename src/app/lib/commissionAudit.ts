import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { isNeonInvestmentLifeA201Payout } from "@/app/lib/commissionPayoutRules";
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
  | "difference"
  | "career_mismatch";

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
  | "difference"
  | "career_mismatch";

export type CommissionAuditItem = {
  status: CommissionAuditItemStatus;
  code: string | null;
  label: string;
  amount: number;
  expectedDateMs: number | null;
  daysUntilDue: number | null;
  statementPeriod?: string | null;
  difference?: number | null;
  differenceReason?: string | null;
  career?: string | null;
  detail?: string | null;
};

export type CommissionAuditSummary = {
  overdueCount: number;
  upcomingCount: number;
  differenceCount: number;
  careerMismatchCount: number;
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
  "career_mismatch",
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
const COMMISSION_PAYOUT_AMOUNT_TOLERANCE = 1;
const FIRST_YEAR_A_COMMISSION_CODES = Array.from(
  { length: 12 },
  (_, index) => `A${String(101 + index)}`
);
const POSITION_VALUES: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];
const POSITION_SET = new Set<Position>(POSITION_VALUES);

type CommissionAuditPayout = NonNullable<
  CommissionAuditContract["commissionPayouts"]
>[number];

type IndexedCommissionAuditPayout = {
  payout: CommissionAuditPayout;
  index: number;
  key: string;
  chronologyMs: number;
};

const emptyCommissionAuditSummary = (): CommissionAuditSummary => ({
  overdueCount: 0,
  upcomingCount: 0,
  differenceCount: 0,
  careerMismatchCount: 0,
  items: [],
});

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

function finiteMoney(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : null;
}

function amountsClose(
  left: number | null | undefined,
  right: number | null | undefined,
  tolerance = COMMISSION_PAYOUT_AMOUNT_TOLERANCE
): boolean {
  if (left == null || right == null) return false;
  return Math.abs(Math.abs(left) - Math.abs(right)) <= tolerance;
}

function normalizePayoutText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePositionValue(value: unknown): Position | null {
  return typeof value === "string" && POSITION_SET.has(value as Position)
    ? (value as Position)
    : null;
}

function payoutCareerValue(payout: CommissionAuditPayout): string | null {
  const value = (payout as { career?: unknown }).career;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statementCareerPositionFromValue(value: string | null | undefined): Position | null {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const code = Number(match[0]);
  if (!Number.isFinite(code)) return null;
  const candidate =
    code >= 1 && code <= 10
      ? `poradce${code}`
      : code >= 104 && code <= 110
        ? `manazer${code - 100}`
        : null;
  return normalizePositionValue(candidate);
}

function referencePositionForPayout(
  contract: CommissionAuditContract,
  payout: CommissionAuditPayout
): Position | null {
  const writtenBy = payoutWrittenByKey(payout);
  if (writtenBy) {
    const managerOverride = (contract.managerOverrides ?? []).find(
      (override) => normalizePayoutText(override?.email) === writtenBy
    );
    const managerPosition = normalizePositionValue(managerOverride?.position);
    if (managerPosition) return managerPosition;
  }
  return normalizePositionValue(contract.position);
}

function payoutChronologyMs(payout: CommissionAuditPayout, index: number): number {
  const direct = finiteMoney(payout.statementChronologyMs);
  if (direct != null) return direct;
  const payoutDate =
    dateFromPayoutMonthKey(payout.payoutMonthKey) ??
    toDate(payout.statementDate ?? null) ??
    toDate(payout.writtenAtMs ?? null);
  return (payoutDate?.getTime() ?? 0) + index / 1000;
}

function indexCommissionPayouts(
  payouts: CommissionAuditPayout[]
): IndexedCommissionAuditPayout[] {
  return payouts
    .map((payout, index) => ({
      payout,
      index,
      key: payout.key ?? `${payout.statementId ?? "statement"}:${index}`,
      chronologyMs: payoutChronologyMs(payout, index),
    }))
    .sort((a, b) => {
      const diff = a.chronologyMs - b.chronologyMs;
      return diff !== 0 ? diff : a.index - b.index;
    });
}

function payoutCodesOverlap(
  left: CommissionAuditPayout,
  right: CommissionAuditPayout
): boolean {
  const leftCodes = new Set(uniqueCommissionCodes([left.code]));
  if (leftCodes.size === 0) return false;
  return uniqueCommissionCodes([right.code]).some((code) => leftCodes.has(code));
}

function payoutWrittenByKey(payout: CommissionAuditPayout): string {
  return normalizePayoutText(payout.writtenBy);
}

function payoutsBelongTogether(
  left: CommissionAuditPayout,
  right: CommissionAuditPayout
): boolean {
  return payoutCodesOverlap(left, right) && payoutWrittenByKey(left) === payoutWrittenByKey(right);
}

function payoutStatus(payout: CommissionAuditPayout): string {
  return normalizePayoutText(payout.status);
}

function payoutHasCareerMismatch(
  contract: CommissionAuditContract,
  payout: CommissionAuditPayout
): boolean {
  if (normalizePayoutText(payout.differenceReason) === "career_mismatch") {
    return true;
  }
  const statementPosition = statementCareerPositionFromValue(payoutCareerValue(payout));
  const referencePosition = referencePositionForPayout(contract, payout);
  return Boolean(
    statementPosition &&
      referencePosition &&
      statementPosition !== referencePosition
  );
}

function isCareerMismatchPayout(
  contract: CommissionAuditContract,
  payout: CommissionAuditPayout
): boolean {
  const status = payoutStatus(payout);
  return (
    (status === "difference" || status === "paid") &&
    payoutHasCareerMismatch(contract, payout) &&
    (finiteMoney(payout.amount) ?? 0) > 0
  );
}

function isCorrectionStornoPayout(payout: CommissionAuditPayout): boolean {
  return (
    payoutStatus(payout) === "storno" ||
    normalizePayoutText(payout.differenceReason) === "storno" ||
    (finiteMoney(payout.amount) ?? 0) < 0
  );
}

function isCorrectPaidPayout(
  contract: CommissionAuditContract,
  payout: CommissionAuditPayout
): boolean {
  return (
    payoutStatus(payout) === "paid" &&
    normalizePayoutText(payout.differenceReason) === "" &&
    !payoutHasCareerMismatch(contract, payout) &&
    (finiteMoney(payout.amount) ?? 0) > 0
  );
}

function isLaterPayout(
  candidate: IndexedCommissionAuditPayout,
  source: IndexedCommissionAuditPayout
): boolean {
  return (
    candidate.chronologyMs > source.chronologyMs ||
    (candidate.chronologyMs === source.chronologyMs && candidate.index > source.index)
  );
}

function correctionStornoMatchesMismatch(
  correction: CommissionAuditPayout,
  mismatch: CommissionAuditPayout
): boolean {
  return (
    payoutsBelongTogether(correction, mismatch) &&
    isCorrectionStornoPayout(correction) &&
    amountsClose(finiteMoney(correction.amount), finiteMoney(mismatch.amount))
  );
}

function correctPaidPayoutMatchesMismatch(
  paid: CommissionAuditPayout,
  mismatch: CommissionAuditPayout,
  contract: CommissionAuditContract
): boolean {
  const expected = finiteMoney(mismatch.expectedAmount);
  return (
    expected != null &&
    payoutsBelongTogether(paid, mismatch) &&
    isCorrectPaidPayout(contract, paid) &&
    (amountsClose(finiteMoney(paid.amount), expected) ||
      amountsClose(finiteMoney(paid.expectedAmount), expected))
  );
}

function unresolvedCareerMismatchPayoutKeys(
  contract: CommissionAuditContract,
  payouts: CommissionAuditPayout[]
): Set<string> {
  const indexedPayouts = indexCommissionPayouts(payouts);
  const consumedCorrectionKeys = new Set<string>();
  const consumedPaidKeys = new Set<string>();
  const unresolved = new Set<string>();

  for (const mismatch of indexedPayouts) {
    if (!isCareerMismatchPayout(contract, mismatch.payout)) continue;

    const laterPayouts = indexedPayouts.filter((candidate) =>
      isLaterPayout(candidate, mismatch)
    );
    const correction = laterPayouts.find(
      (candidate) =>
        !consumedCorrectionKeys.has(candidate.key) &&
        correctionStornoMatchesMismatch(candidate.payout, mismatch.payout)
    );
    const correctPayment = laterPayouts.find(
      (candidate) =>
        !consumedPaidKeys.has(candidate.key) &&
        correctPaidPayoutMatchesMismatch(candidate.payout, mismatch.payout, contract)
    );

    if (correction && correctPayment) {
      consumedCorrectionKeys.add(correction.key);
      consumedPaidKeys.add(correctPayment.key);
      continue;
    }

    unresolved.add(mismatch.key);
  }

  return unresolved;
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
  if (mode === "difference") {
    return item.status === "difference" || item.status === "career_mismatch";
  }
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
    return emptyCommissionAuditSummary();
  }

  if (contractLifecycleStatus(contract, now) === "storno") {
    return emptyCommissionAuditSummary();
  }

  if (contract.productKey === "comfortcc") {
    return emptyCommissionAuditSummary();
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

  const commissionPayouts = contract.commissionPayouts ?? [];
  const unresolvedCareerMismatchKeys =
    unresolvedCareerMismatchPayoutKeys(contract, commissionPayouts);

  for (let payoutIndex = 0; payoutIndex < commissionPayouts.length; payoutIndex += 1) {
    const payout = commissionPayouts[payoutIndex];
    if (
      isNeonInvestmentLifeA201Payout({
        product: contract.productKey,
        commissionCode: payout.code,
      })
    ) {
      continue;
    }
    const status = String(payout?.status ?? "").trim().toLowerCase();
    const indexedKey = payout.key ?? `${payout.statementId ?? "statement"}:${payoutIndex}`;
    const differenceReason = String(payout.differenceReason ?? "")
      .trim()
      .toLowerCase();
    const isCareerMismatch = isCareerMismatchPayout(contract, payout);
    if (status !== "difference" && !isCareerMismatch) continue;
    if (isCareerMismatch && !unresolvedCareerMismatchKeys.has(indexedKey)) {
      continue;
    }
    if (!codesMatchFilter([payout.code], codeFilter)) continue;
    const payoutDate =
      dateFromPayoutMonthKey(payout.payoutMonthKey) ??
      toDate(payout.writtenAtMs) ??
      now;
    const auditItem: CommissionAuditItem = {
      status: isCareerMismatch ? "career_mismatch" : "difference",
      code: normalizeCommissionAuditCode(payout.code) || null,
      label:
        payout.title ||
        (isCareerMismatch ? "Jiný kariérní stupeň" : "Rozdíl ve výpisu"),
      amount: Number.isFinite(Number(payout.amount)) ? Number(payout.amount) : 0,
      expectedDateMs: payoutDate ? startOfDay(payoutDate).getTime() : null,
      daysUntilDue: payoutDate ? daysBetween(today, payoutDate) : null,
      statementPeriod: payout.statementPeriod ?? null,
      difference:
        typeof payout.difference === "number" && Number.isFinite(payout.difference)
          ? payout.difference
          : null,
      differenceReason: isCareerMismatch ? "career_mismatch" : differenceReason || null,
      career: payoutCareerValue(payout),
      detail:
        typeof (payout as { detail?: unknown }).detail === "string"
          ? (payout as { detail?: string }).detail?.trim() || null
          : null,
    };
    if (commissionAuditItemMatchesMode(auditItem, mode)) {
      items.push(auditItem);
    }
  }

  const sortedItems = items.sort((a, b) => {
    const statusRank: Record<CommissionAuditItemStatus, number> = {
      overdue: 0,
      career_mismatch: 1,
      difference: 2,
      upcoming: 3,
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
    careerMismatchCount: sortedItems.filter((item) => item.status === "career_mismatch")
      .length,
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
