const MONEY_TOLERANCE = 0.01;
const AUTO_FULL_STORNO_MONTHS = 2;
const FULL_STORNO_AMOUNT_TOLERANCE_PERCENT = 0.01;
const FULL_STORNO_AMOUNT_TOLERANCE_MIN = 1;
const FULL_STORNO_AMOUNT_TOLERANCE_MAX = 20;

export type FullAutoStornoDetectionRow = {
  rowId?: string | null;
  productCode?: string | null;
  commissionCode?: string | null;
  commission?: number | null;
  signedAt?: string | null;
  source?: string | null;
  status?: string | null;
};

export type FullAutoStornoDetectionPayout = {
  key?: string | null;
  code?: string | null;
  amount?: number | null;
  status?: string | null;
  statementId?: string | null;
  statementNumber?: string | null;
  statementPeriod?: string | null;
  writtenBy?: string | null;
};

export type FullAutoStornoDetectionItem = {
  title?: string | null;
  code?: string | null;
  amount?: number | null;
  excludeFromTotal?: boolean | null;
};

export type FullAutoStornoDetection = {
  stornoDateMs: number;
  policyStartMs: number;
  fullStornoBoundaryMs: number;
  referenceDateSource: "statement_period" | "statement_period_overlap" | "row_date" | "fallback";
  commissionCode: string | null;
  stornoAmount: number;
  matchedPaidAmount: number;
  matchedSource: "statement_payout" | "contract_item";
  matchedTitle: string | null;
  rowId: string | null;
  productCode: string | null;
  matchedPayoutKey: string | null;
  matchedStatementId: string | null;
  matchedStatementNumber: string | null;
  matchedStatementPeriod: string | null;
};

const normalizeStatus = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const normalizeCommissionCode = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const baseCommissionCode = (value: unknown): string => {
  const code = normalizeCommissionCode(value);
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  return closingRoleMatch ? `A${closingRoleMatch[1]}` : code;
};

const normalizeEmail = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const finiteMoneyOrNull = (value: unknown): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
};

const parseCzechDateMs = (value: string | null | undefined): number | null => {
  const match = value?.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
};

const lastUtcDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const addUtcMonths = (ms: number, months: number): number => {
  const date = new Date(ms);
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + months;
  const targetDay = Math.min(
    date.getUTCDate(),
    lastUtcDayOfMonth(targetYear, targetMonth)
  );
  return Date.UTC(targetYear, targetMonth, targetDay);
};

const sameCommissionCode = (
  left: string | null | undefined,
  right: string | null | undefined
): boolean => {
  const normalizedLeft = baseCommissionCode(left);
  const normalizedRight = baseCommissionCode(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

const isTotalItem = (item: FullAutoStornoDetectionItem): boolean => {
  const code = normalizeCommissionCode(item.code);
  const title = String(item.title ?? "").trim().toLowerCase();
  return code === "TOTAL" || title.includes("celkem");
};

const fullStornoAmountTolerance = (expectedAmount: number): number =>
  Math.min(
    FULL_STORNO_AMOUNT_TOLERANCE_MAX,
    Math.max(
      FULL_STORNO_AMOUNT_TOLERANCE_MIN,
      Math.abs(expectedAmount) * FULL_STORNO_AMOUNT_TOLERANCE_PERCENT
    )
  );

const amountsMatchFullStorno = (expectedAmount: number, stornoAmount: number): boolean =>
  Math.abs(Math.abs(expectedAmount) - Math.abs(stornoAmount)) <=
  fullStornoAmountTolerance(expectedAmount);

type FullAutoStornoReference = {
  key: string;
  code: string | null;
  amount: number;
  source: "statement_payout" | "contract_item";
  title: string | null;
  statementId: string | null;
  statementNumber: string | null;
  statementPeriod: string | null;
};

const stornoReferenceDateMs = ({
  row,
  policyStartMs,
  fullStornoBoundaryMs,
  statementPeriodStartMs,
  statementPeriodEndMs,
  fallbackStornoDateMs,
}: {
  row: FullAutoStornoDetectionRow;
  policyStartMs: number;
  fullStornoBoundaryMs: number;
  statementPeriodStartMs?: number | null;
  statementPeriodEndMs?: number | null;
  fallbackStornoDateMs?: number | null;
}): { dateMs: number | null; source: FullAutoStornoDetection["referenceDateSource"] } => {
  const rowDateMs = parseCzechDateMs(row.signedAt);
  if (
    rowDateMs != null &&
    Number.isFinite(rowDateMs) &&
    rowDateMs >= policyStartMs &&
    rowDateMs <= fullStornoBoundaryMs
  ) {
    return { dateMs: rowDateMs, source: "row_date" };
  }

  const hasPeriodStart = statementPeriodStartMs != null && Number.isFinite(statementPeriodStartMs);
  const hasPeriodEnd = statementPeriodEndMs != null && Number.isFinite(statementPeriodEndMs);
  if (hasPeriodStart && hasPeriodEnd) {
    const overlapStartMs = Math.max(statementPeriodStartMs, policyStartMs);
    const overlapEndMs = Math.min(statementPeriodEndMs, fullStornoBoundaryMs);
    if (overlapStartMs <= overlapEndMs) {
      return {
        dateMs: overlapEndMs,
        source:
          statementPeriodEndMs <= fullStornoBoundaryMs
            ? "statement_period"
            : "statement_period_overlap",
      };
    }
  }

  if (
    hasPeriodEnd &&
    statementPeriodEndMs >= policyStartMs &&
    statementPeriodEndMs <= fullStornoBoundaryMs
  ) {
    return { dateMs: statementPeriodEndMs, source: "statement_period" };
  }

  if (rowDateMs != null && Number.isFinite(rowDateMs)) {
    return { dateMs: rowDateMs, source: "row_date" };
  }

  return {
    dateMs:
      fallbackStornoDateMs != null && Number.isFinite(fallbackStornoDateMs)
        ? fallbackStornoDateMs
        : null,
    source: "fallback",
  };
};

export const detectFullAutoCommissionStorno = ({
  isAutoProduct,
  contractStatus,
  policyStartMs,
  currentRows,
  existingPayouts,
  contractItems = [],
  currentStatementId,
  statementPeriodStartMs = null,
  statementPeriodEndMs = null,
  writtenBy = null,
  fallbackStornoDateMs = null,
}: {
  isAutoProduct: boolean;
  contractStatus?: string | null;
  policyStartMs: number | null;
  currentRows: FullAutoStornoDetectionRow[];
  existingPayouts: FullAutoStornoDetectionPayout[];
  contractItems?: FullAutoStornoDetectionItem[];
  currentStatementId: string;
  statementPeriodStartMs?: number | null;
  statementPeriodEndMs?: number | null;
  writtenBy?: string | null;
  fallbackStornoDateMs?: number | null;
}): FullAutoStornoDetection | null => {
  if (!isAutoProduct || normalizeStatus(contractStatus) === "storno") return null;
  if (policyStartMs == null || !Number.isFinite(policyStartMs)) return null;

  const ownRows = currentRows.filter((row) => normalizeStatus(row.source) !== "manager");
  const hasCurrentPositivePayout = ownRows.some((row) => {
    const amount = finiteMoneyOrNull(row.commission);
    return normalizeStatus(row.status) !== "storno" && amount != null && amount > MONEY_TOLERANCE;
  });
  if (hasCurrentPositivePayout) return null;

  const stornoRows = ownRows.filter((row) => {
    const amount = finiteMoneyOrNull(row.commission);
    return normalizeStatus(row.status) === "storno" && amount != null && amount < -MONEY_TOLERANCE;
  });
  if (stornoRows.length === 0) return null;

  const normalizedWrittenBy = normalizeEmail(writtenBy);
  const previousPayoutReferences: FullAutoStornoReference[] = existingPayouts
    .map((payout, index): FullAutoStornoReference | null => {
      const amount = finiteMoneyOrNull(payout.amount);
      const payoutWrittenBy = normalizeEmail(payout.writtenBy);
      if (
        payout.statementId === currentStatementId ||
        (normalizedWrittenBy && payoutWrittenBy && payoutWrittenBy !== normalizedWrittenBy) ||
        normalizeStatus(payout.status) === "storno" ||
        amount == null ||
        amount <= MONEY_TOLERANCE
      ) {
        return null;
      }
      return {
        key: payout.key ?? `statement-payout:${index}`,
        code: payout.code ?? null,
        amount,
        source: "statement_payout",
        title: null,
        statementId: payout.statementId ?? null,
        statementNumber: payout.statementNumber ?? null,
        statementPeriod: payout.statementPeriod ?? null,
      };
    })
    .filter((reference): reference is FullAutoStornoReference => Boolean(reference));
  const contractItemReferences: FullAutoStornoReference[] = contractItems
    .map((item, index): FullAutoStornoReference | null => {
      const amount = finiteMoneyOrNull(item.amount);
      if (item.excludeFromTotal || isTotalItem(item) || amount == null || amount <= MONEY_TOLERANCE) {
        return null;
      }
      return {
        key: `contract-item:${index}:${normalizeCommissionCode(item.code)}:${amount}`,
        code: item.code ?? null,
        amount,
        source: "contract_item",
        title: item.title ?? null,
        statementId: null,
        statementNumber: null,
        statementPeriod: null,
      };
    })
    .filter((reference): reference is FullAutoStornoReference => Boolean(reference));
  const references = [...previousPayoutReferences, ...contractItemReferences];
  if (references.length === 0) return null;

  const referenceMatchesRow = (
    reference: FullAutoStornoReference,
    row: FullAutoStornoDetectionRow,
    absStornoAmount: number
  ): boolean => {
    const rowCode = normalizeCommissionCode(row.commissionCode);
    const referenceCode = normalizeCommissionCode(reference.code);
    const codeMatches =
      rowCode && referenceCode ? sameCommissionCode(referenceCode, rowCode) : true;
    return codeMatches && amountsMatchFullStorno(reference.amount, absStornoAmount);
  };

  const fullStornoBoundaryMs = addUtcMonths(policyStartMs, AUTO_FULL_STORNO_MONTHS);
  const usedPayoutKeys = new Set<string>();
  let latestStornoDateMs = 0;
  let detectedReferenceDateSource: FullAutoStornoDetection["referenceDateSource"] = "fallback";
  let totalStornoAmount = 0;
  let totalMatchedPaidAmount = 0;
  let firstDetection: FullAutoStornoDetection | null = null;

  for (const row of stornoRows) {
    const stornoAmount = finiteMoneyOrNull(row.commission);
    if (stornoAmount == null) return null;

    const { dateMs: stornoDateMs, source: referenceDateSource } = stornoReferenceDateMs({
      row,
      policyStartMs,
      fullStornoBoundaryMs,
      statementPeriodStartMs,
      statementPeriodEndMs,
      fallbackStornoDateMs,
    });
    if (stornoDateMs == null || !Number.isFinite(stornoDateMs)) return null;
    if (stornoDateMs < policyStartMs || stornoDateMs > fullStornoBoundaryMs) return null;

    const absStornoAmount = Math.round(Math.abs(stornoAmount) * 100) / 100;
    const matchedReference = references.find((reference) => {
      const key = reference.key;
      if (key && usedPayoutKeys.has(key)) return false;
      return referenceMatchesRow(reference, row, absStornoAmount);
    });
    if (!matchedReference) return null;

    if (matchedReference.key) usedPayoutKeys.add(matchedReference.key);
    const matchedPaidAmount = matchedReference.amount;
    totalStornoAmount += absStornoAmount;
    totalMatchedPaidAmount += matchedPaidAmount;
    latestStornoDateMs = Math.max(latestStornoDateMs, stornoDateMs);
    detectedReferenceDateSource = referenceDateSource;

    if (!firstDetection) {
      firstDetection = {
        stornoDateMs,
        policyStartMs,
        fullStornoBoundaryMs,
        referenceDateSource,
        commissionCode: normalizeCommissionCode(row.commissionCode) || null,
        stornoAmount: absStornoAmount,
        matchedPaidAmount,
        matchedSource: matchedReference.source,
        matchedTitle: matchedReference.title,
        rowId: row.rowId ?? null,
        productCode: row.productCode ?? null,
        matchedPayoutKey: matchedReference.source === "statement_payout" ? matchedReference.key : null,
        matchedStatementId: matchedReference.statementId,
        matchedStatementNumber: matchedReference.statementNumber,
        matchedStatementPeriod: matchedReference.statementPeriod,
      };
    }
  }

  if (!firstDetection) return null;
  if (!amountsMatchFullStorno(totalMatchedPaidAmount, totalStornoAmount)) return null;

  return {
    ...firstDetection,
    stornoDateMs: latestStornoDateMs || firstDetection.stornoDateMs,
    referenceDateSource: detectedReferenceDateSource,
    stornoAmount: Math.round(totalStornoAmount * 100) / 100,
    matchedPaidAmount: Math.round(totalMatchedPaidAmount * 100) / 100,
  };
};
