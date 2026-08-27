"use client";

import {
  BriefcaseBusiness,
  Check,
  CircleHelp,
  ExternalLink,
  LockKeyhole,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { Position } from "../../types/domain";

type CareerTimelineRow = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string;
};

type CareerTimelinePanelProps = {
  positions: { id: Position; label: string }[];
  rows: CareerTimelineRow[];
  fieldClass: string;
  locked: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  helpOpen: boolean;
  onHelpOpen: () => void;
  onHelpClose: () => void;
  onAddRow: () => void;
  onPrependRow: () => void;
  onUnlock: () => void;
  onUpdateRow: (rowId: string, patch: Partial<CareerTimelineRow>) => void;
  onRemoveRow: (rowId: string) => void;
  onSave: () => void | Promise<void>;
};

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
};

const hasInvalidRangeOrder = (validFrom: string, validTo: string): boolean => {
  if (!validFrom || !validTo) return false;
  if (!isIsoDay(validFrom) || !isIsoDay(validTo)) return false;
  return validTo < validFrom;
};

export function CareerTimelinePanel({
  positions,
  rows,
  fieldClass,
  locked,
  saving,
  saved,
  error,
  helpOpen,
  onHelpOpen,
  onHelpClose,
  onAddRow,
  onPrependRow,
  onUnlock,
  onUpdateRow,
  onRemoveRow,
  onSave,
}: CareerTimelinePanelProps) {
  const timelineFieldClass = `${fieldClass} min-h-11 !rounded-xl !border-slate-200 !bg-slate-50/80 !shadow-none focus:!border-violet-500 focus:!ring-violet-500/10 disabled:cursor-not-allowed disabled:!bg-slate-100 disabled:!text-slate-500`;

  return (
    <section
      id="timeline-kariery"
      className="relative h-full overflow-hidden scroll-mt-24 rounded-[24px] border border-violet-200/70 bg-[radial-gradient(circle_at_100%_0%,rgba(221,214,254,0.62),transparent_28%),linear-gradient(180deg,#ffffff_0%,#faf9ff_48%,#f5f3ff_100%)] px-3.5 py-4 shadow-[0_20px_60px_rgba(76,29,149,0.10)] sm:rounded-[28px] sm:px-6 sm:py-6 lg:col-span-2"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border-[34px] border-violet-100/60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_48%,#34d399_100%)]" />

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-[0_10px_24px_rgba(109,40,217,0.28)]">
            <BriefcaseBusiness className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-slate-950 sm:text-lg">
                Historie kariéry
              </h2>
              {rows.length > 0 ? (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">
                  {rows.length} období
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
              Podle těchto období aplikace automaticky vybere správnou pozici k datu sjednání.
            </p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={onHelpOpen}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 sm:flex-none"
          >
            <CircleHelp size={14} strokeWidth={2.2} aria-hidden="true" />
            Nápověda
          </button>
          {locked ? (
            <button
              type="button"
              onClick={onUnlock}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-violet-700 bg-violet-700 px-4 py-2 text-xs font-bold text-white shadow-[0_8px_20px_rgba(109,40,217,0.22)] transition hover:bg-violet-800 sm:flex-none"
            >
              <Pencil size={13} strokeWidth={2.3} aria-hidden="true" />
              Upravit
            </button>
          ) : (
            rows.length > 0 ? (
              <button
                type="button"
                onClick={onPrependRow}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 sm:flex-none"
              >
                <Plus size={14} strokeWidth={2.3} aria-hidden="true" />
                Přidat na začátek
              </button>
            ) : null
          )}
        </div>
      </div>

      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-3 backdrop-blur-[2px]"
          onClick={onHelpClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="career-timeline-help-title"
            className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-[24px] border border-violet-100 bg-white px-4 py-4 shadow-[0_28px_80px_rgba(15,23,42,0.35)] sm:rounded-[28px] sm:px-6 sm:py-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <CircleHelp size={17} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <h3 id="career-timeline-help-title" className="text-base font-bold text-slate-950">
                  Kde historii najdu?
                </h3>
              </div>
              <button
                type="button"
                onClick={onHelpClose}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Zavřít nápovědu"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">
              Přesná období najdeš v Maxxu v záložce Kariéra. Otevři kartu sjednatele a
              přepiš pozice od nejstarší po aktuální.
            </p>
            <a
              href="https://sjednatel.bohemiaservis.cz/broker-card"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800 transition hover:bg-violet-100"
            >
              Otevřít kartu sjednatele v Maxxu
              <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 mt-5">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-[20px] border border-dashed border-violet-300 bg-white/75 px-4 py-8 text-center shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Sparkles className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-sm font-bold text-slate-900">Začni první pozicí</h3>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-600">
              Přidávej období od nejstaršího po aktuální. Pokud předchozí pozice má datum
              Do, další pozice na něj automaticky naváže.
            </p>
            {!locked ? (
              <button
                type="button"
                onClick={onAddRow}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-violet-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-800"
              >
                <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
                Přidat první pozici
              </button>
            ) : null}
          </div>
        ) : (
          <ol className="relative space-y-3 before:absolute before:bottom-7 before:left-[17px] before:top-7 before:w-px before:bg-[linear-gradient(180deg,#a78bfa_0%,#c4b5fd_72%,#6ee7b7_100%)]">
            {rows.map((row, rowIndex) => {
              const rowRangeError = hasInvalidRangeOrder(row.validFrom.trim(), row.validTo.trim());
              const isLastDraftRow = rowIndex === rows.length - 1;
              const isCurrentRow = isLastDraftRow && !row.validTo.trim();
              const rowOpenEndedNotLast = !row.validTo.trim() && !isLastDraftRow;
              const hasRowError = rowRangeError || rowOpenEndedNotLast;
              const rowNumber = String(rowIndex + 1).padStart(2, "0");
              const positionInputId = `career-position-${row.id}`;
              const validFromInputId = `career-from-${row.id}`;
              const validToInputId = `career-to-${row.id}`;

              return (
                <li key={row.id} className="relative pl-11">
                  <span
                    className={`absolute left-0 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border-4 border-[#faf9ff] text-[10px] font-extrabold shadow-sm ${
                      hasRowError
                        ? "bg-rose-500 text-white"
                        : isCurrentRow
                          ? "bg-emerald-500 text-white"
                          : "bg-violet-700 text-white"
                    }`}
                    aria-hidden="true"
                  >
                    {isCurrentRow ? <Check size={15} strokeWidth={2.8} /> : rowNumber}
                  </span>

                  <div
                    className={`rounded-[18px] border bg-white/90 p-3 shadow-[0_8px_24px_rgba(76,29,149,0.06)] transition sm:p-3.5 ${
                      hasRowError
                        ? "border-rose-300 ring-2 ring-rose-100"
                        : isCurrentRow
                          ? "border-emerald-200"
                          : "border-violet-100 hover:border-violet-200"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 md:hidden">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">
                        Období {rowNumber}
                      </span>
                      {isCurrentRow ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                          Aktuální
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12 md:items-end">
                      <label htmlFor={positionInputId} className="min-w-0 md:col-span-5">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Pozice
                        </span>
                        <select
                          id={positionInputId}
                          value={row.position}
                          onChange={(event) =>
                            onUpdateRow(row.id, { position: event.target.value as Position })
                          }
                          disabled={locked}
                          className={timelineFieldClass}
                        >
                          {positions.map((positionItem) => (
                            <option key={positionItem.id} value={positionItem.id}>
                              {positionItem.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label htmlFor={validFromInputId} className="min-w-0 md:col-span-2">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Od
                        </span>
                        <input
                          id={validFromInputId}
                          type="date"
                          value={row.validFrom}
                          onChange={(event) => onUpdateRow(row.id, { validFrom: event.target.value })}
                          disabled={locked}
                          className={timelineFieldClass}
                        />
                      </label>

                      <div className={`min-w-0 ${locked ? "md:col-span-5" : "md:col-span-4"}`}>
                        <label
                          htmlFor={validToInputId}
                          className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"
                        >
                          Do
                        </label>
                        {locked && isCurrentRow ? (
                          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
                            Do současnosti
                          </div>
                        ) : (
                          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                            <input
                              id={validToInputId}
                              type="date"
                              value={row.validTo}
                              onChange={(event) => onUpdateRow(row.id, { validTo: event.target.value })}
                              disabled={locked}
                              className={`${timelineFieldClass} min-w-0 flex-1`}
                            />
                            {isLastDraftRow && !locked ? (
                              <button
                                type="button"
                                onClick={() => onUpdateRow(row.id, { validTo: "" })}
                                className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-[0.08em] transition ${
                                  row.validTo.trim()
                                    ? "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                    : "border-emerald-500 bg-emerald-500 text-white shadow-[0_8px_18px_rgba(16,185,129,0.20)]"
                                }`}
                              >
                                {row.validTo.trim() ? null : <Check size={13} strokeWidth={2.6} />}
                                Do současnosti
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {!locked ? (
                        <div className="md:col-span-1">
                          <button
                            type="button"
                            onClick={() => onRemoveRow(row.id)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50/70 px-3 text-xs font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-100 hover:text-rose-700"
                            aria-label={`Smazat období ${rowIndex + 1}`}
                            title="Smazat období"
                          >
                            <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                            <span className="md:sr-only">Smazat</span>
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {rowRangeError ? (
                      <p className="mt-2.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        Datum Do nemůže být dříve než datum Od.
                      </p>
                    ) : null}
                    {rowOpenEndedNotLast ? (
                      <p className="mt-2.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        Současnost (prázdné Do) může být jen u posledního období.
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {error ? (
        <p className="relative z-10 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="relative z-10 mt-5 flex flex-col gap-3 border-t border-violet-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {locked ? (
          <p className="inline-flex items-center gap-2 text-xs leading-relaxed text-slate-600">
            <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-violet-600" strokeWidth={2.2} />
            Historie je zamčená proti nechtěné změně.
          </p>
        ) : (
          <button
            type="button"
            onClick={onAddRow}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-violet-700 bg-violet-700 px-5 py-2 text-xs font-bold text-white shadow-[0_8px_20px_rgba(109,40,217,0.22)] transition hover:bg-violet-800 sm:w-auto"
          >
            <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
            Přidat pozici
          </button>
        )}

        <div className="flex shrink-0 items-center justify-end gap-2">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <Check size={14} strokeWidth={2.6} aria-hidden="true" />
              Uloženo
            </span>
          ) : null}
          {!locked ? (
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-[0_8px_20px_rgba(5,150,105,0.20)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Ukládám…" : "Uložit historii"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
