import { CalendarDays, Car, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { type Product } from "../../types/domain";
import {
  formatMoney,
  isAutoProduct,
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
  statements: ContractCommissionStatementSummary[];
  storedHistory?: ContractAutoPremiumStatementHistoryEntry[] | null;
  loading?: boolean;
  error?: string | null;
};

type AnniversaryHit = {
  number: number;
  date: Date;
};

type PremiumChangeStatus = "increased" | "decreased" | "same" | "detected";

type PremiumHistoryRow = {
  key: string;
  anniversaryNumber: number;
  anniversaryDate: Date;
  policyStartDate: Date;
  policyStartSource: "statement" | "system";
  statementPeriod: string | null;
  statementDate: string | null;
  statementNumber: string | null;
  productCode: string;
  productKey: Product | null;
  basePremium: number;
  difference: number | null;
  status: PremiumChangeStatus;
  commissionCodes: string[];
  source: ContractAutoPremiumStatementRow["source"];
};

const ANNUAL_PREMIUM_TOLERANCE = 12;

const normalizeContractNumber = (value: string | null | undefined): string =>
  String(value ?? "").replace(/\D+/g, "").trim();

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const formatDate = (date: Date | null | undefined): string =>
  date ? date.toLocaleDateString("cs-CZ") : "—";

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

const anniversaryInStatementPeriod = (
  policyStart: Date,
  periodStart: Date | null,
  periodEnd: Date | null
): AnniversaryHit | null => {
  if (!periodStart || !periodEnd) return null;

  const start = startOfDay(periodStart);
  const end = endOfDay(periodEnd);
  const policyStartYear = policyStart.getFullYear();

  for (let yearOffset = 1; yearOffset <= 80; yearOffset += 1) {
    const anniversary = new Date(
      policyStartYear + yearOffset,
      policyStart.getMonth(),
      policyStart.getDate()
    );

    if (anniversary > end) return null;
    if (anniversary >= start && anniversary <= end) {
      return {
        number: yearOffset,
        date: anniversary,
      };
    }
  }

  return null;
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

const statusLabel = (status: PremiumChangeStatus): string => {
  switch (status) {
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
    default:
      return Minus;
  }
};

const buildPremiumHistoryRows = ({
  contractNumber,
  policyStartDate,
  systemAnnualPremium,
  statements,
}: {
  contractNumber: string;
  policyStartDate: ContractDoc["policyStartDate"];
  systemAnnualPremium: number;
  statements: ContractCommissionStatementSummary[];
}): PremiumHistoryRow[] => {
  const systemPolicyStart = toDate(policyStartDate);
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  if (!normalizedContractNumber) return [];

  const rows = new Map<string, PremiumHistoryRow>();

  for (const statement of statements) {
    const periodStart = statementPeriodDate(statement.periodStartMs);
    const periodEnd = statementPeriodDate(statement.periodEndMs);

    for (const row of statement.autoPremiumRows ?? []) {
      if (normalizeContractNumber(row.contractNumber) !== normalizedContractNumber) continue;

      const statementPolicyStart = statementRowDate(row.validFrom);
      const policyStart = statementPolicyStart ?? systemPolicyStart;
      if (!policyStart) continue;

      const anniversary = anniversaryInStatementPeriod(policyStart, periodStart, periodEnd);
      if (!anniversary) continue;

      const { status, difference } = premiumStatus(row.basePremium, systemAnnualPremium);
      const key = [
        statement.id,
        anniversary.number,
        normalizedContractNumber,
        row.productCode,
        row.basePremium,
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
        anniversaryNumber: anniversary.number,
        anniversaryDate: anniversary.date,
        policyStartDate: policyStart,
        policyStartSource: statementPolicyStart ? "statement" : "system",
        statementPeriod: statement.period,
        statementDate: statement.statementDate,
        statementNumber: statement.statementNumber,
        productCode: row.productCode,
        productKey: row.productKey,
        basePremium: row.basePremium,
        difference,
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
      const newPremium =
        typeof entry.newPremium === "number" && Number.isFinite(entry.newPremium)
          ? entry.newPremium
          : null;
      if (newPremium == null) return null;

      const anniversaryDate = storedHistoryDate(entry.anniversaryDate);
      const validFromDate = statementRowDate(entry.validFrom);
      const difference =
        typeof entry.difference === "number" && Number.isFinite(entry.difference)
          ? Math.round(entry.difference * 100) / 100
          : null;
      const status =
        difference == null
          ? "detected"
          : Math.abs(difference) <= ANNUAL_PREMIUM_TOLERANCE
            ? "same"
            : difference > 0
              ? "increased"
              : "decreased";

      return {
        key: entry.key ?? `${entry.statementId ?? "statement"}-${entry.rowId ?? newPremium}`,
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
        basePremium: newPremium,
        difference,
        status,
        commissionCodes: entry.commissionCode ? [entry.commissionCode] : [],
        source: entry.source === "manager" ? "manager" : "own",
      };
    })
    .filter((row): row is PremiumHistoryRow => Boolean(row))
    .sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime());

export function ContractAutoPremiumHistory({
  product,
  contractNumber,
  policyStartDate,
  systemAnnualPremium,
  statements,
  storedHistory,
  loading = false,
  error = null,
}: ContractAutoPremiumHistoryProps) {
  if (!isAutoProduct(product)) return null;

  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  const policyStart = toDate(policyStartDate);
  const detectedRows = normalizedContractNumber
    ? buildPremiumHistoryRows({
        contractNumber: normalizedContractNumber,
        policyStartDate,
        systemAnnualPremium,
        statements,
      })
    : [];
  const storedRows = buildStoredPremiumHistoryRows(storedHistory);
  const rowsByKey = new Map<string, PremiumHistoryRow>();
  storedRows.forEach((row) => rowsByKey.set(row.key, row));
  detectedRows.forEach((row) => {
    if (!rowsByKey.has(row.key)) rowsByKey.set(row.key, row);
  });
  const rows = [...rowsByKey.values()].sort(
    (a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime()
  );

  return (
    <section className="rounded-[24px] border border-slate-300/90 bg-white px-5 py-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="flex items-center gap-2 font-mono text-xl font-semibold tracking-tight text-slate-900">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-base font-mono tracking-tight text-white">
            <Car size={14} strokeWidth={2} aria-hidden="true" />
            Výročí
          </span>
          Změny pojistného z výpisů
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
            {formatMoney(systemAnnualPremium)}
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

      {loading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Načítám provizní výpisy pro kontrolu výročí.
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
          {error}
        </div>
      ) : !normalizedContractNumber ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Smlouva nemá číslo smlouvy, takže ji nejde spárovat s provizním výpisem.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Zatím žádný výpis neobsahuje tuto auto smlouvu v období jejího ročního výročí podle sloupce Platnost.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const StatusIcon = statusIcon(row.status);
            return (
              <article
                key={row.key}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        <StatusIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                        {statusLabel(row.status)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {row.anniversaryNumber}. výročí
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {row.productCode}
                      </span>
                    </div>

                    <div className="mt-3 text-lg font-bold text-slate-950">
                      {statusLabel(row.status)} na {formatMoney(row.basePremium)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={14} strokeWidth={2.1} aria-hidden="true" />
                        Výročí {formatDate(row.anniversaryDate)}
                      </span>
                      <span>
                        Období výpisu {row.statementPeriod ?? "—"}
                      </span>
                      <span>
                        Platnost {formatDate(row.policyStartDate)}
                        {row.policyStartSource === "statement" ? " z výpisu" : " ze systému"}
                      </span>
                      {row.statementDate && <span>Vystaveno {row.statementDate}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 text-left sm:text-right">
                    <div
                      className={`rounded-2xl border px-4 py-3 ${
                        row.status === "increased"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : row.status === "decreased"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-slate-200 bg-white text-slate-900"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide opacity-70">
                        Rozdíl proti systému
                      </div>
                      <div className="mt-1 whitespace-nowrap text-xl font-bold">
                        {row.difference == null
                          ? "—"
                          : `${row.difference >= 0 ? "+" : "−"}${formatMoney(Math.abs(row.difference))}`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                  {row.commissionCodes.length > 0 && (
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                      Kód provize {row.commissionCodes.join(", ")}
                    </span>
                  )}
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                    Zdroj: {row.source === "manager" ? "manažerská část výpisu" : "vlastní část výpisu"}
                  </span>
                  {row.productKey && (
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                      {productLabel(row.productKey)}
                    </span>
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
