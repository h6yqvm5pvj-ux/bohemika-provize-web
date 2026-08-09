"use client";

import { useEffect, useMemo } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ListChecks,
  Loader2,
  ReceiptText,
  RotateCcw,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";

import introStyles from "../cashflow/cashflowIntro.module.css";
import { formatMoney, formatSystemDate } from "./statementParsing";
import type {
  SavedCommissionStatement,
  StatementProcessingSummary,
} from "./statementTypes";

export function ProcessingAuditPanel({
  summary,
}: {
  summary: StatementProcessingSummary;
}) {
  const uniqueAmbiguousContracts = Array.from(new Set(summary.ambiguousContracts));
  const uniqueSkippedContracts = Array.from(new Set(summary.skippedContracts));
  const payoutChangeRecordCount = summary.payoutRecordsAdded + summary.payoutRecordsUpdated;
  const contractsWithPayoutChanges =
    summary.contractsWithPayoutChanges > 0 || payoutChangeRecordCount === 0
      ? summary.contractsWithPayoutChanges
      : summary.contractsUpdated;
  const skippedTotal =
    summary.duplicatePayoutRowsSkipped +
    summary.olderPremiumUpdatesSkipped +
    uniqueSkippedContracts.length;
  const manualReviewTotal =
    uniqueAmbiguousContracts.length +
    uniqueSkippedContracts.length +
    summary.accountingRepairDrafts +
    summary.externalUpdateTasks +
    summary.errors.length;
  const skippedDetail = [
    summary.duplicatePayoutRowsSkipped > 0
      ? `${summary.duplicatePayoutRowsSkipped} duplicitních položek`
      : null,
    summary.olderPremiumUpdatesSkipped > 0
      ? `${summary.olderPremiumUpdatesSkipped} starších změn pojistného`
      : null,
    uniqueSkippedContracts.length > 0
      ? `${uniqueSkippedContracts.length} smluv bez zápisu`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const manualReviewDetail = [
    uniqueAmbiguousContracts.length > 0
      ? `${uniqueAmbiguousContracts.length} duplicitních shod`
      : null,
    summary.accountingRepairDrafts > 0
      ? `${summary.accountingRepairDrafts} účetních oprav`
      : null,
    summary.externalUpdateTasks > 0
      ? `${summary.externalUpdateTasks} MAXX/extranet`
      : null,
    summary.errors.length > 0 ? `${summary.errors.length} chyb` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const auditItems: {
    label: string;
    value: number;
    detail: string;
    valueClass: string;
    iconClass: string;
    icon: LucideIcon;
  }[] = [
    {
      label: "Smlouvy s výplatou",
      value: contractsWithPayoutChanges,
      detail:
        payoutChangeRecordCount > 0
          ? `${payoutChangeRecordCount} výplatních položek`
          : "Bez nové výplaty",
      valueClass: "text-slate-950",
      iconClass: "text-violet-700",
      icon: WalletCards,
    },
    {
      label: "Zapsané položky",
      value: payoutChangeRecordCount,
      detail: `${summary.payoutRecordsAdded} nových · ${summary.payoutRecordsUpdated} aktualizovaných`,
      valueClass: "text-violet-700",
      iconClass: "text-violet-700",
      icon: CheckCircle2,
    },
    {
      label: "Přeskočeno",
      value: skippedTotal,
      detail: skippedDetail || "Nic nepřeskočeno",
      valueClass: skippedTotal > 0 ? "text-violet-700" : "text-slate-950",
      iconClass: skippedTotal > 0 ? "text-violet-700" : "text-slate-500",
      icon: ListChecks,
    },
    {
      label: "Ruční kontrola",
      value: manualReviewTotal,
      detail: manualReviewDetail || "Bez ruční kontroly",
      valueClass: manualReviewTotal > 0 ? "text-violet-700" : "text-slate-950",
      iconClass: manualReviewTotal > 0 ? "text-violet-700" : "text-slate-950",
      icon: manualReviewTotal > 0 ? AlertTriangle : CheckCircle2,
    },
  ];
  const hasReviewDetails =
    uniqueAmbiguousContracts.length > 0 ||
    uniqueSkippedContracts.length > 0 ||
    summary.accountingRepairDrafts > 0 ||
    summary.externalUpdateTasks > 0 ||
    summary.errors.length > 0;

  return (
    <section className="relative mt-4 overflow-hidden rounded-lg border border-white/70 bg-white/75 shadow-[0_18px_42px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/70 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-violet-500/70" aria-hidden="true" />
      <div className="flex flex-col gap-3 border-b border-violet-100/70 bg-white/45 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-violet-700" strokeWidth={2.2} aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-950">Audit po zápisu</h3>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
          Upraveno {summary.contractsUpdated} smluv
        </span>
      </div>

      <div className="grid divide-y divide-violet-100/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        {auditItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex min-h-24 items-center justify-between gap-4 bg-white/35 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {item.label}
                </div>
                <div className={`mt-1 text-2xl font-black tracking-tight ${item.valueClass}`}>
                  {item.value}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-600">
                  {item.detail}
                </div>
              </div>
              <Icon className={`h-5 w-5 shrink-0 ${item.iconClass}`} strokeWidth={2.2} aria-hidden="true" />
            </div>
          );
        })}
      </div>

      {hasReviewDetails && (
        <div className="space-y-2 border-t border-violet-100 bg-violet-50/70 px-4 py-3 text-sm font-semibold text-slate-950">
          {uniqueAmbiguousContracts.length > 0 && (
            <div>
              Duplicitní shody smluv: {uniqueAmbiguousContracts.slice(0, 12).join(", ")}
              {uniqueAmbiguousContracts.length > 12 ? "…" : ""}
            </div>
          )}
          {uniqueSkippedContracts.length > 0 && (
            <div>
              Přeskočené smlouvy: {uniqueSkippedContracts.slice(0, 12).join(", ")}
              {uniqueSkippedContracts.length > 12 ? "…" : ""}
            </div>
          )}
          {summary.accountingRepairDrafts > 0 && (
            <div>Návrhy účetních oprav: {summary.accountingRepairDrafts}</div>
          )}
          {summary.externalUpdateTasks > 0 && (
            <div>Podklady pro MAXX/extranet: {summary.externalUpdateTasks}</div>
          )}
          {summary.errors.length > 0 && (
            <div>Chyby: {summary.errors.slice(0, 3).join(" | ")}</div>
          )}
        </div>
      )}
    </section>
  );
}

type ProcessedStatementHistoryPanelProps = {
  statements: SavedCommissionStatement[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  openingId: string | null;
  onClose?: () => void;
  onRefresh: () => void;
  onOpen: (statementId: string) => void;
};

function ProcessedStatementHistoryPanel({
  statements,
  loading,
  error,
  selectedId,
  openingId,
  onClose,
  onRefresh,
  onOpen,
}: ProcessedStatementHistoryPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            <CalendarDays className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Historie
          </div>
          <h2 className="mt-3 text-lg font-black text-slate-950">Zpracované výpisy</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Uložené výstupy po zpracování výpisu.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            )}
            Obnovit
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              aria-label="Zavřít historii"
            >
              <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}

      {loading && statements.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
          Načítám historii zpracovaných výpisů…
        </div>
      ) : statements.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-5 text-sm font-semibold text-slate-500">
          Zatím tu není žádný zpracovaný výpis.
        </div>
      ) : (
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {statements.map((statement) => {
            const selected = selectedId === statement.id;
            const opening = openingId === statement.id;
            const title = statement.statementNumber
              ? `Výpis ${statement.statementNumber}`
              : statement.fileName || "Provizní výpis";
            const period = statement.period || statement.payoutMonthKey || "Bez období";

            return (
              <button
                key={statement.id}
                type="button"
                onClick={() => onOpen(statement.id)}
                disabled={opening}
                className={`w-full rounded-xl border px-4 py-3 text-left transition disabled:cursor-wait ${
                  selected
                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black">{title}</span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          selected
                            ? "border-white/25 bg-white/10 text-white"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        Zpracováno
                      </span>
                    </div>
                    <div
                      className={`mt-1 text-sm font-semibold ${
                        selected ? "text-slate-200" : "text-slate-600"
                      }`}
                    >
                      {period}
                    </div>
                    <div
                      className={`mt-1 text-xs font-semibold ${
                        selected ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      Vystaveno {statement.statementDate || "—"} · zpracováno{" "}
                      {formatSystemDate(statement.processedAtMs)}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <div
                        className={`text-xs font-bold uppercase ${
                          selected ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        Vyplaceno
                      </div>
                      <div className="text-base font-black">
                        {typeof statement.payoutTotal === "number" &&
                        Number.isFinite(statement.payoutTotal)
                          ? `${formatMoney(statement.payoutTotal)} Kč`
                          : "—"}
                      </div>
                    </div>
                    {opening ? (
                      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <ChevronDown className="-rotate-90 h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ProcessedStatementHistoryModal({
  onClose,
  ...panelProps
}: ProcessedStatementHistoryPanelProps & { onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historie zpracovaných provizních výpisů"
        className="w-full max-w-3xl"
      >
        <ProcessedStatementHistoryPanel {...panelProps} onClose={onClose} />
      </div>
    </div>
  );
}

export const PROCESSING_CAPTIONS = [
  "Ukládám výpis do provizního kalendáře",
  "Páruju smlouvy podle čísel smluv",
  "Zapisuju vyplacené provizní položky",
  "Kontroluju výročí aut a změny pojistného",
  "Připravuju účetní opravy",
  "Chystám podklady pro MAXX a extranet",
  "Čekám na potvrzení zápisu",
] as const;

export function StatementProcessingOverlay({
  caption,
  progress,
  stepIndex,
  statementCount,
}: {
  caption: string;
  progress: number;
  stepIndex: number;
  statementCount: number;
}) {
  const visibleProgress = Math.max(0, Math.min(100, progress));
  const pileSheetCount = Math.max(4, Math.min(10, Math.ceil(visibleProgress / 12) + 2));
  const progressStyle = useMemo(() => ({ width: `${visibleProgress}%` }), [visibleProgress]);
  const documentStackStyle = useMemo(
    () => ({
      ["--statement-pile-height" as string]: `${70 + visibleProgress * 0.48}px`,
      minHeight: "18rem",
    }),
    [visibleProgress]
  );

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-md"
      aria-busy="true"
      aria-live="polite"
    >
      <section
        className={`${introStyles.initialLoaderShell} relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/80 px-5 py-5 shadow-[0_32px_96px_rgba(15,23,42,0.28)] sm:px-7 sm:py-7`}
        role="status"
      >
        <span className={introStyles.initialLoaderBeam} aria-hidden="true" />

        <div className="relative z-10 grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-fuchsia-200 bg-white text-fuchsia-700 shadow-[0_14px_30px_rgba(162,28,175,0.13)]">
                <ReceiptText className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-black">Zpracování výpisu</p>
                <p className="text-sm text-black/55">
                  {statementCount === 1
                    ? "Zapisuji 1 provizní výpis"
                    : `Zapisuji ${statementCount} provizní výpisy`}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-end gap-2 font-mono text-6xl font-semibold leading-none text-black sm:text-7xl">
                <span>{visibleProgress}</span>
                <span className="pb-1.5 text-2xl text-fuchsia-700 sm:text-3xl">%</span>
              </div>
              <h2
                key={caption}
                className={`${introStyles.initialLoaderStage} mt-4 min-h-10 text-2xl font-semibold leading-tight text-black sm:text-3xl`}
              >
                {caption}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-black/55">
                <span>Zápis do historie smluv</span>
                <span aria-hidden="true">·</span>
                <span>Provizní kalendář</span>
              </div>
            </div>

            <div
              className={introStyles.initialLoaderProgress}
              role="progressbar"
              aria-label="Průběh zpracování provizního výpisu"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={visibleProgress}
            >
              <span className={introStyles.initialLoaderProgressFill} style={progressStyle} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PROCESSING_CAPTIONS.map((stage, index) => (
                <span
                  key={stage}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index <= stepIndex ? "w-9 bg-slate-950" : "w-3 bg-white/80"
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          <div className={introStyles.initialLoaderConsole} style={documentStackStyle} aria-hidden="true">
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-black">
                <Loader2 className="h-5 w-5 animate-spin text-fuchsia-700" strokeWidth={2.2} />
                Zápis položek
              </div>
              <div className="text-sm font-semibold text-black/50">probíhá</div>
            </div>

            <div className={introStyles.statementLoaderDropZone} style={{ minHeight: "13rem" }}>
              {[0, 1, 2, 3, 4].map((paperIndex) => (
                <span
                  key={paperIndex}
                  className={introStyles.statementLoaderPaper}
                  style={{ ["--paper-index" as string]: paperIndex }}
                >
                  <span />
                  <span />
                  <span />
                </span>
              ))}

              <div className={introStyles.statementLoaderPile}>
                {Array.from({ length: pileSheetCount }, (_, sheetIndex) => {
                  const xOffset = ((sheetIndex % 5) - 2) * 6;
                  const rotation = ((sheetIndex % 6) - 2.5) * 1.4;

                  return (
                    <span
                      key={sheetIndex}
                      style={{
                        bottom: `${sheetIndex * 6}px`,
                        transform: `translateX(${xOffset}px) rotate(${rotation}deg)`,
                        zIndex: sheetIndex + 1,
                      }}
                    >
                      <span />
                      <span />
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
