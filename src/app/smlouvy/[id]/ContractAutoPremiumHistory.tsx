import { CalendarDays, Car, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { type PaymentFrequency, type Product } from "../../types/domain";
import {
  formatMoney,
  isAnnualAutoPayoutProduct,
  isAutoProduct,
  paymentsPerYear,
  productLabel,
  toDate,
} from "./contractDetailHelpers";
import {
  type ContractAutoPremiumStatementHistoryEntry,
  type ContractAutoPremiumStatementRow,
  type ContractCommissionStatementSummary,
  type ContractDoc,
} from "./contractDetailTypes";

type ContractAutoPremiumHistoryProps = {
  product: Product | undefined;
  contractNumber?: string | null;
  policyStartDate?: ContractDoc["policyStartDate"];
  systemAnnualPremium: number;
  paymentFrequency?: PaymentFrequency | null;
  contractPaymentFrequency?: PaymentFrequency | null;
  statements: ContractCommissionStatementSummary[];
  storedHistory?: ContractAutoPremiumStatementHistoryEntry[] | null;
  loading?: boolean;
  error?: string | null;
};

type AnniversaryHit = {
  number: number;
  date: Date;
};

type PremiumChangeStatus = "initial" | "increased" | "decreased" | "same" | "detected";

type PremiumHistoryRow = {
  key: string;
  premiumKind: ContractAutoPremiumStatementHistoryEntry["premiumKind"];
  anniversaryNumber: number;
  anniversaryDate: Date;
  policyStartDate: Date;
  policyStartSource: "statement" | "system";
  statementPeriod: string | null;
  statementDate: string | null;
  statementNumber: string | null;
  productCode: string;
  productKey: Product | null;
  previousPremium: number | null;
  basePremium: number;
  difference: number | null;
  previousAnnualPremium: number | null;
  newAnnualPremium: number | null;
  differenceAnnual: number | null;
  basePremiumPeriod: "annual" | "payment" | null;
  status: PremiumChangeStatus;
  commissionCodes: string[];
  source: ContractAutoPremiumStatementRow["source"];
};

const ANNUAL_PREMIUM_TOLERANCE = 12;

const normalizeContractNumber = (value: string | null | undefined): string =>
  String(value ?? "").replace(/\D+/g, "").trim();

const endOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const formatDate = (date: Date | null | undefined): string =>
  date ? date.toLocaleDateString("cs-CZ") : "—";

const validNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const paymentFrequencyLabel = (frequency: PaymentFrequency | null | undefined): string | null => {
  switch (frequency) {
    case "monthly":
      return "měsíčně";
    case "quarterly":
      return "čtvrtletně";
    case "semiannual":
      return "pololetně";
    case "annual":
      return "ročně";
    default:
      return null;
  }
};

const premiumAmountLabel = (
  amount: number,
  frequency: PaymentFrequency | null | undefined
): string => {
  const frequencyLabel = paymentFrequencyLabel(frequency);
  return frequencyLabel ? `${formatMoney(amount)} ${frequencyLabel}` : formatMoney(amount);
};

const signedMoneyLabel = (value: number | null | undefined): string =>
  value == null
    ? "—"
    : `${value >= 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;

const signedAnnualMoneyLabel = (value: number | null | undefined): string =>
  value == null ? "—" : `${signedMoneyLabel(value)} ročně`;

const statementPeriodDate = (value: number | null): Date | null => {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const statementRowDate = (value: string | null | undefined): Date | null => {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const storedHistoryDate = (value: string | null | undefined): Date | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const czechDate = statementRowDate(normalized);
  if (czechDate) return czechDate;

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const anniversaryOnOrBeforePeriodEnd = (
  policyStart: Date,
  periodEnd: Date | null
): AnniversaryHit | null => {
  if (!periodEnd) return null;
  const end = endOfDay(periodEnd);
  const policyStartYear = policyStart.getFullYear();
  let latest: AnniversaryHit | null = null;

  for (let yearOffset = 1; yearOffset <= 80; yearOffset += 1) {
    const anniversary = new Date(
      policyStartYear + yearOffset,
      policyStart.getMonth(),
      policyStart.getDate()
    );

    if (anniversary > end) return latest;
    latest = {
      number: yearOffset,
      date: anniversary,
    };
  }

  return latest;
};

const premiumStatus = (
  basePremium: number,
  systemAnnualPremium: number
): { status: PremiumChangeStatus; difference: number | null } => {
  if (!Number.isFinite(systemAnnualPremium) || systemAnnualPremium <= 0) {
    return { status: "detected", difference: null };
  }

  const difference = Math.round((basePremium - systemAnnualPremium) * 100) / 100;
  if (Math.abs(difference) <= ANNUAL_PREMIUM_TOLERANCE) {
    return { status: "same", difference };
  }
  return {
    status: difference > 0 ? "increased" : "decreased",
    difference,
  };
};

const statementBasePeriodForAutoProduct = (
  product: Product | null | undefined
): "annual" | "payment" | null => {
  if (!isAutoProduct(product)) return null;
  return isAnnualAutoPayoutProduct(product) ? "annual" : "payment";
};

const annualPremiumFromStatementBase = (
  basePremium: number,
  product: Product | null | undefined,
  paymentFrequency: PaymentFrequency | null | undefined
): { annualPremium: number; basePremiumPeriod: "annual" | "payment" | null } => {
  const base = Math.round(basePremium * 100) / 100;
  const basePremiumPeriod = statementBasePeriodForAutoProduct(product);
  if (basePremiumPeriod === "payment") {
    return {
      annualPremium: Math.round(base * paymentsPerYear(paymentFrequency) * 100) / 100,
      basePremiumPeriod,
    };
  }
  return {
    annualPremium: base,
    basePremiumPeriod,
  };
};

const statusLabel = (status: PremiumChangeStatus): string => {
  switch (status) {
    case "initial":
      return "Základna při sjednání";
    case "increased":
      return "Pojistné zvýšeno";
    case "decreased":
      return "Pojistné poníženo";
    case "same":
      return "Beze změny";
    default:
      return "Pojistné z výpisu";
  }
};

const statusClass = (status: PremiumChangeStatus): string => {
  switch (status) {
    case "initial":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "increased":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "decreased":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "same":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
};

const statusIcon = (status: PremiumChangeStatus) => {
  switch (status) {
    case "increased":
      return TrendingUp;
    case "decreased":
      return TrendingDown;
    case "initial":
    default:
      return Minus;
  }
};

const premiumChangeTitle = (
  row: PremiumHistoryRow,
  frequency: PaymentFrequency | null | undefined
): string => {
  if (row.status === "initial") {
    return `Sjednání smlouvy: ${premiumAmountLabel(row.basePremium, frequency)}`;
  }
  if (row.status === "decreased") {
    return `Snížení pojistného na ${premiumAmountLabel(row.basePremium, frequency)}`;
  }
  if (row.status === "same") {
    return `Pojistné beze změny: ${premiumAmountLabel(row.basePremium, frequency)}`;
  }
  return `Navýšení pojistného na ${premiumAmountLabel(row.basePremium, frequency)}`;
};

const statementSourceLabel = (row: PremiumHistoryRow): string => {
  if (row.statementPeriod) {
    return `Provizní výpis z období ${row.statementPeriod}`;
  }
  if (row.statementNumber) {
    return `Provizní výpis ${row.statementNumber}`;
  }
  return row.status === "initial" ? "Sjednání smlouvy" : "Provizní výpis";
};

const premiumStatusFromDifference = (
  difference: number | null,
  tolerance = ANNUAL_PREMIUM_TOLERANCE
): PremiumChangeStatus => {
  if (difference == null) return "detected";
  if (Math.abs(difference) <= tolerance) return "same";
  return difference > 0 ? "increased" : "decreased";
};

const buildPremiumHistoryRows = ({
  contractNumber,
  policyStartDate,
  product,
  paymentFrequency,
  systemAnnualPremium,
  statements,
}: {
  contractNumber: string;
  policyStartDate: ContractDoc["policyStartDate"];
  product: Product | undefined;
  paymentFrequency: PaymentFrequency | null | undefined;
  systemAnnualPremium: number;
  statements: ContractCommissionStatementSummary[];
}): PremiumHistoryRow[] => {
  const systemPolicyStart = toDate(policyStartDate);
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  if (!normalizedContractNumber) return [];

  const rows = new Map<string, PremiumHistoryRow>();

  for (const statement of statements) {
    const periodEnd = statementPeriodDate(statement.periodEndMs);

    for (const row of statement.autoPremiumRows ?? []) {
      if (normalizeContractNumber(row.contractNumber) !== normalizedContractNumber) continue;

      const statementPolicyStart = statementRowDate(row.validFrom);
      const policyStart = statementPolicyStart ?? systemPolicyStart;
      if (!policyStart) continue;

      const anniversary = anniversaryOnOrBeforePeriodEnd(policyStart, periodEnd);
      if (!anniversary) continue;

      const statementProduct = row.productKey ?? product ?? null;
      const { annualPremium, basePremiumPeriod } = annualPremiumFromStatementBase(
        row.basePremium,
        statementProduct,
        paymentFrequency
      );
      const { status, difference } = premiumStatus(annualPremium, systemAnnualPremium);
      const key = [
        statement.id,
        anniversary.number,
        normalizedContractNumber,
        row.productCode,
        annualPremium,
        basePremiumPeriod ?? "unknown",
        policyStart.toISOString().slice(0, 10),
      ].join(":");
      const existing = rows.get(key);
      if (existing) {
        if (row.commissionCode && !existing.commissionCodes.includes(row.commissionCode)) {
          existing.commissionCodes.push(row.commissionCode);
        }
        continue;
      }

      rows.set(key, {
        key,
        premiumKind: "auto_change",
        anniversaryNumber: anniversary.number,
        anniversaryDate: anniversary.date,
        policyStartDate: policyStart,
        policyStartSource: statementPolicyStart ? "statement" : "system",
        statementPeriod: statement.period,
        statementDate: statement.statementDate,
        statementNumber: statement.statementNumber,
        productCode: row.productCode,
        productKey: row.productKey,
        previousPremium: null,
        basePremium: annualPremium,
        difference,
        previousAnnualPremium: null,
        newAnnualPremium: annualPremium,
        differenceAnnual: difference,
        basePremiumPeriod,
        status,
        commissionCodes: row.commissionCode ? [row.commissionCode] : [],
        source: row.source,
      });
    }
  }

  return [...rows.values()].sort((a, b) => {
    const dateCompare = a.anniversaryDate.getTime() - b.anniversaryDate.getTime();
    if (dateCompare !== 0) return dateCompare;
    return a.basePremium - b.basePremium;
  });
};

const buildStoredPremiumHistoryRows = (
  history: ContractAutoPremiumStatementHistoryEntry[] | null | undefined
): PremiumHistoryRow[] =>
  (history ?? [])
    .map((entry): PremiumHistoryRow | null => {
      const premiumKind = entry.premiumKind ?? "auto_change";
      const annualNewPremium = validNumber(entry.newAnnualPremium);
      const newPremium = annualNewPremium ?? validNumber(entry.newPremium);
      if (newPremium == null) return null;
      const basePremiumPeriod =
        entry.basePremiumPeriod === "payment"
          ? "payment"
          : entry.basePremiumPeriod === "annual" || annualNewPremium != null
            ? "annual"
            : null;

      const anniversaryDate = storedHistoryDate(entry.anniversaryDate);
      const validFromDate = statementRowDate(entry.validFrom);
      const difference = validNumber(entry.difference);
      const differenceAnnual = validNumber(entry.differenceAnnual);
      const status =
        premiumKind === "auto_initial"
          ? "initial"
          : premiumStatusFromDifference(
              premiumKind === "life_increase" ? differenceAnnual ?? difference : difference
            );

      return {
        key: entry.key ?? `${entry.statementId ?? "statement"}-${entry.rowId ?? newPremium}`,
        premiumKind,
        anniversaryNumber:
          typeof entry.anniversaryNumber === "number" && Number.isFinite(entry.anniversaryNumber)
            ? entry.anniversaryNumber
            : 0,
        anniversaryDate: anniversaryDate ?? validFromDate ?? new Date(0),
        policyStartDate: validFromDate ?? anniversaryDate ?? new Date(0),
        policyStartSource: entry.validFrom ? "statement" : "system",
        statementPeriod: entry.statementPeriod ?? null,
        statementDate: entry.statementDate ?? null,
        statementNumber: entry.statementNumber ?? null,
        productCode: entry.productCode ?? "AUTO",
        productKey: null,
        previousPremium: validNumber(entry.previousPremium),
        basePremium: newPremium,
        difference,
        previousAnnualPremium: validNumber(entry.previousAnnualPremium),
        newAnnualPremium: validNumber(entry.newAnnualPremium),
        differenceAnnual,
        basePremiumPeriod,
        status,
        commissionCodes: entry.commissionCode ? [entry.commissionCode] : [],
        source: entry.source === "manager" ? "manager" : "own",
      };
    })
    .filter((row): row is PremiumHistoryRow => Boolean(row))
    .sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime());

const premiumRowsMatchStoredChange = (
  storedRow: PremiumHistoryRow,
  detectedRow: PremiumHistoryRow
): boolean => {
  if (storedRow.premiumKind !== detectedRow.premiumKind) return false;
  if (storedRow.anniversaryNumber !== detectedRow.anniversaryNumber) return false;
  if (storedRow.productCode !== detectedRow.productCode) return false;
  if (Math.abs(storedRow.basePremium - detectedRow.basePremium) > ANNUAL_PREMIUM_TOLERANCE) {
    return false;
  }

  const sameStatementNumber =
    !storedRow.statementNumber ||
    !detectedRow.statementNumber ||
    storedRow.statementNumber === detectedRow.statementNumber;
  const sameStatementPeriod =
    !storedRow.statementPeriod ||
    !detectedRow.statementPeriod ||
    storedRow.statementPeriod === detectedRow.statementPeriod;

  return sameStatementNumber && sameStatementPeriod;
};

const shouldSuppressDetectedPremiumRow = (
  detectedRow: PremiumHistoryRow,
  storedRows: PremiumHistoryRow[]
): boolean => {
  if (detectedRow.premiumKind !== "auto_change") return false;
  const storedAutoChanges = storedRows.filter((row) => row.premiumKind === "auto_change");
  if (storedAutoChanges.length === 0) return false;

  if (storedAutoChanges.some((storedRow) => premiumRowsMatchStoredChange(storedRow, detectedRow))) {
    return true;
  }

  const latestStoredChangeTime = Math.max(
    ...storedAutoChanges.map((row) => row.anniversaryDate.getTime())
  );
  return detectedRow.anniversaryDate.getTime() < latestStoredChangeTime;
};

const buildInitialPremiumHistoryRow = ({
  storedRows,
  policyStartDate,
  paymentFrequency,
}: {
  storedRows: PremiumHistoryRow[];
  policyStartDate?: ContractDoc["policyStartDate"];
  paymentFrequency?: PaymentFrequency | null;
}): PremiumHistoryRow | null => {
  const autoRows = storedRows.filter((row) => row.premiumKind !== "life_increase");
  if (autoRows.length === 0) return null;
  if (autoRows.some((row) => row.premiumKind === "auto_initial")) return null;
  const firstRow = [...autoRows].sort(
    (a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime()
  )[0];
  const initialPremium = firstRow.previousPremium ?? firstRow.basePremium;
  if (!Number.isFinite(initialPremium) || initialPremium <= 0) return null;

  const policyStart = toDate(policyStartDate) ?? firstRow.policyStartDate;
  const productCode = firstRow.productCode || "AUTO";
  return {
    key: `initial:${productCode}:${policyStart.toISOString().slice(0, 10)}:${initialPremium}`,
    premiumKind: "auto_initial",
    anniversaryNumber: 0,
    anniversaryDate: policyStart,
    policyStartDate: policyStart,
    policyStartSource: firstRow.policyStartSource,
    statementPeriod: null,
    statementDate: null,
    statementNumber: null,
    productCode,
    productKey: firstRow.productKey,
    previousPremium: null,
    basePremium: initialPremium,
    difference: 0,
    previousAnnualPremium: null,
    newAnnualPremium: paymentFrequency === "annual" ? initialPremium : null,
    differenceAnnual: null,
    basePremiumPeriod: "annual",
    status: "initial",
    commissionCodes: [],
    source: firstRow.source,
  };
};

export function ContractAutoPremiumHistory({
  product,
  contractNumber,
  policyStartDate,
  systemAnnualPremium,
  paymentFrequency = null,
  contractPaymentFrequency = null,
  statements,
  storedHistory,
  loading = false,
  error = null,
}: ContractAutoPremiumHistoryProps) {
  const showAutoStatementScan = isAutoProduct(product);
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  const policyStart = toDate(policyStartDate);
  const detectedRows = showAutoStatementScan && normalizedContractNumber
    ? buildPremiumHistoryRows({
        contractNumber: normalizedContractNumber,
        policyStartDate,
        product,
        paymentFrequency: contractPaymentFrequency ?? paymentFrequency,
        systemAnnualPremium,
        statements,
      })
    : [];
  const storedRows = buildStoredPremiumHistoryRows(storedHistory);

  if (!showAutoStatementScan && storedRows.length === 0) return null;

  const rowsByKey = new Map<string, PremiumHistoryRow>();
  const initialRow = buildInitialPremiumHistoryRow({
    storedRows,
    policyStartDate,
    paymentFrequency,
  });
  if (initialRow) rowsByKey.set(initialRow.key, initialRow);
  storedRows.forEach((row) => rowsByKey.set(row.key, row));
  detectedRows.forEach((row) => {
    if (shouldSuppressDetectedPremiumRow(row, storedRows)) {
      return;
    }
    if (!rowsByKey.has(row.key)) rowsByKey.set(row.key, row);
  });
  const rows = [...rowsByKey.values()].sort(
    (a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime()
  );
  const initialPremiumBase =
    rows.find((row) => row.status === "initial")?.basePremium ??
    rows.find((row) => row.previousPremium != null)?.previousPremium ??
    null;
  const HeaderIcon = showAutoStatementScan ? Car : TrendingUp;

  return (
    <section className="rounded-[24px] border border-slate-300/90 bg-white px-5 py-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="flex items-center gap-2 font-mono text-xl font-semibold tracking-tight text-slate-900">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-base font-mono tracking-tight text-white">
            <HeaderIcon size={14} strokeWidth={2} aria-hidden="true" />
            {showAutoStatementScan ? "Výročí" : "Pojistné"}
          </span>
          Změny pojistného
        </h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {rows.length} záznamů
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Aktuálně v systému
          </div>
          <div className="mt-1 text-xl font-bold text-slate-950">
            {premiumAmountLabel(systemAnnualPremium, paymentFrequency)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Počátek smlouvy
          </div>
          <div className="mt-1 text-xl font-bold text-slate-950">
            {formatDate(policyStart)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Produkt
          </div>
          <div className="mt-1 text-xl font-bold text-slate-950">
            {productLabel(product)}
          </div>
        </div>
      </div>

      {showAutoStatementScan && loading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Načítám provizní výpisy pro kontrolu výročí.
        </div>
      ) : showAutoStatementScan && error ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
          {error}
        </div>
      ) : showAutoStatementScan && !normalizedContractNumber ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Smlouva nemá číslo smlouvy, takže ji nejde spárovat s provizním výpisem.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Zatím žádný výpis neobsahuje uloženou změnu pojistného.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row, index) => {
            const StatusIcon = statusIcon(row.status);
            const isLifeIncrease = row.premiumKind === "life_increase";
            const rowFrequency: PaymentFrequency | null = isLifeIncrease
              ? "monthly"
              : row.newAnnualPremium != null ||
                  row.basePremiumPeriod === "annual" ||
                  row.basePremiumPeriod === "payment"
                ? "annual"
              : paymentFrequency;
            const isInitial = row.status === "initial";
            const effectiveLabel = isInitial
              ? "Počátek"
              : isLifeIncrease
                ? "Účinnost"
                : "Výročí";
            const previousDisplayedPremium =
              [...rows]
                .slice(0, index)
                .reverse()
                .find((item) => item.premiumKind === row.premiumKind && item.status !== "same")
                ?.basePremium ?? null;
            const previousPremium =
              previousDisplayedPremium ??
              row.previousPremium ??
              null;
            const changeFromInitial =
              !isInitial && initialPremiumBase != null
                ? Math.round((row.basePremium - initialPremiumBase) * 100) / 100
                : null;
            const changeFromPrevious =
              !isInitial && previousPremium != null
                ? Math.round((row.basePremium - previousPremium) * 100) / 100
                : null;
            return (
              <article
                key={row.key}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        <StatusIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                        {statusLabel(row.status)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {isInitial
                          ? "Sjednání"
                          : isLifeIncrease
                          ? "Změna pojistného"
                          : `${row.anniversaryNumber}. výročí`}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {row.productCode}
                      </span>
                    </div>

                    <div className="mt-3 text-lg font-bold text-slate-950">
                      {premiumChangeTitle(row, rowFrequency)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={14} strokeWidth={2.1} aria-hidden="true" />
                        {effectiveLabel} {formatDate(row.anniversaryDate)}
                      </span>
                      <span>Zdroj: {statementSourceLabel(row)}</span>
                    </div>
                  </div>

                  {!isInitial && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Oproti sjednání
                        </div>
                        <div className="mt-1 text-lg font-bold text-slate-950">
                          {signedAnnualMoneyLabel(changeFromInitial)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Oproti poslednímu výročí
                        </div>
                        <div className="mt-1 text-lg font-bold text-slate-950">
                          {signedAnnualMoneyLabel(changeFromPrevious)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
