"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ListChecks,
  Loader2,
  RotateCcw,
  Search,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";

import { StatementProgressPanel } from "./StatementProgressPanel";
import importStyles from "./statementImport.module.css";
import historyStyles from "./statementHistory.module.css";
import { matchesStatementHistorySearch, statementHistoryPeriod, statementPayoutTitle } from "./statementHistoryPresentation";
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
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = search.trim().length > 0;
  const visibleStatements = statements.filter((statement) => matchesStatementHistorySearch(statement, search));
  const countLabel = statements.length === 1
    ? "1 výpis"
    : `${statements.length} ${statements.length >= 2 && statements.length <= 4 ? "výpisy" : "výpisů"}`;

  return (
    <section className={historyStyles.panel}>
      <header className={historyStyles.header}>
        <div>
          <div className={historyStyles.heading}>
            <span className={historyStyles.headingIcon}><WalletCards size={24} strokeWidth={1.7} aria-hidden="true" /></span>
            <div>
              <span className={historyStyles.eyebrow}>Provizní výpisy</span>
              <h2 className={historyStyles.title}>Historie výplat</h2>
            </div>
          </div>
          <p className={historyStyles.subtitle}>Vyber výplatu a prohlédni si její podrobný výpis.</p>
        </div>
        <div className={historyStyles.actions}>
          <button type="button" onClick={onRefresh} disabled={loading}
            className={historyStyles.refresh} aria-label="Obnovit historii" title="Obnovit historii">
            {loading
              ? <Loader2 size={16} className={historyStyles.spinner} aria-hidden="true" />
              : <RotateCcw size={16} aria-hidden="true" />}
            <span>Obnovit</span>
          </button>
          {onClose && <button type="button" onClick={onClose}
            className={historyStyles.close} aria-label="Zavřít historii">
            <X size={19} aria-hidden="true" />
          </button>}
        </div>
      </header>
      <div className={historyStyles.searchArea}>
        <div className={historyStyles.searchField}>
          <Search size={18} aria-hidden="true" />
          <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            className={historyStyles.searchInput} aria-label="Hledat výpisy podle roku, měsíce nebo částky"
            placeholder="Hledat rok, měsíc nebo částku…" autoComplete="off" />
          {search && <button type="button" aria-label="Vymazat hledání" className={historyStyles.clearSearch}
            onClick={() => { setSearch(""); searchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}
        </div>
        <span className={historyStyles.searchHint}>Např. 2026, srpen nebo 26 956 Kč</span>
      </div>
      <div className={historyStyles.listHeading}>
        <span>{searching ? "Výsledky hledání" : "Zpracované výpisy"}</span>
        <span role="status" aria-live="polite">{loading ? "Obnovuji…" : searching ? `${visibleStatements.length} z ${countLabel}` : countLabel}</span>
      </div>
      {error && <div role="alert" className={historyStyles.error}>{error}</div>}
      {loading && statements.length === 0 ? (
        <div role="status" className={historyStyles.message}>
          <Loader2 size={18} className={historyStyles.spinner} aria-hidden="true" />
          Načítám historii zpracovaných výpisů…
        </div>
      ) : statements.length === 0 ? (
        <div className={historyStyles.message}>
          <WalletCards size={22} aria-hidden="true" />
          Zatím tu není žádný zpracovaný výpis.
        </div>
      ) : visibleStatements.length === 0 ? (
        <div className={historyStyles.message}>
          <Search size={22} aria-hidden="true" />
          <span>Žádná výplata neodpovídá hledání.<br />Zkus jiný rok, měsíc nebo částku.</span>
        </div>
      ) : (
        <div className={historyStyles.list} aria-busy={loading}>
          {visibleStatements.map((statement) => {
            const selected = selectedId === statement.id;
            const opening = openingId === statement.id;
            const title = statementPayoutTitle(statement);
            const amount = typeof statement.payoutTotal === "number" && Number.isFinite(statement.payoutTotal)
              ? formatMoney(statement.payoutTotal) : null;

            return (
              <button key={statement.id} type="button" onClick={() => onOpen(statement.id)}
                disabled={opening} aria-current={selected || undefined} aria-busy={opening}
                className={historyStyles.card}>
                <span className={historyStyles.payout}>
                  <span className={historyStyles.payoutLabel}>Vyplaceno</span>
                  <span className={historyStyles.amount}>
                    <span className={historyStyles.amountNumber} data-long={amount != null && amount.length > 10 || undefined}>{amount ?? "—"}</span>
                    {amount != null && <span className={historyStyles.currency}>Kč</span>}
                  </span>
                </span>
                <span className={historyStyles.details}>
                  <span className={historyStyles.cardTitle}>{title}</span>
                  <span className={historyStyles.period}>{statementHistoryPeriod(statement)}</span>
                  <span className={historyStyles.metadata}>
                    {statement.statementNumber && <span>Výpis č. {statement.statementNumber}</span>}
                    <span className={historyStyles.status}>
                      {opening ? <Loader2 size={12} className={historyStyles.spinner} aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                      {opening ? "Otevírám…" : selected ? "Právě otevřený" : "Zpracováno"}
                    </span>
                    <span className={historyStyles.processedDate}>Zpracováno {formatSystemDate(statement.processedAtMs)}</span>
                  </span>
                </span>
                <span className={historyStyles.arrow}><ChevronRight size={20} aria-hidden="true" /></span>
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const controls = dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
      const first = controls?.[0];
      const last = controls?.[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className={historyStyles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Historie zpracovaných provizních výpisů"
        className={historyStyles.dialog}
      >
        <ProcessedStatementHistoryPanel {...panelProps} onClose={onClose} />
      </div>
    </div>
  );
}

export function StatementProcessingOverlay({ completedCount, statementCount }: {
  completedCount: number;
  statementCount: number;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key === "Tab") { event.preventDefault(); overlayRef.current?.focus(); }
    };
    document.addEventListener("keydown", keepFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepFocus);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div ref={overlayRef} className={importStyles.processingOverlay} role="dialog" aria-modal="true" aria-label="Zpracování provizního výpisu" tabIndex={-1}>
      <StatementProgressPanel mode="saving" statementCount={statementCount} completedCount={completedCount} />
    </div>
  );
}
