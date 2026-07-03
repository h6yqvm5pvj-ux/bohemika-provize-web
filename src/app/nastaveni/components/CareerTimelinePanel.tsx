"use client";

import { CircleHelp, ExternalLink, Sparkles, X } from "lucide-react";

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
  return (
    <section
      id="timeline-kariery"
      className="relative h-full space-y-4 overflow-hidden scroll-mt-24 rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_62%,#eef2f7_100%)] px-5 py-5 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:px-6 sm:py-6 lg:col-span-2"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            <Sparkles size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
            <span>Historie Kariéry</span>
          </h2>
          <p className="text-xs text-slate-500">
            Nastav období od-do. Kalkulačka pak sama předvyplní pozici podle data sjednání.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onHelpOpen}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <CircleHelp size={13} strokeWidth={2.2} aria-hidden="true" />
            Nápověda
          </button>
          {locked ? (
            <button
              type="button"
              onClick={onUnlock}
              className="rounded-full border border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Změna
            </button>
          ) : (
            <>
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={onPrependRow}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Přidat před první
                </button>
              )}
              <button
                type="button"
                onClick={onAddRow}
                className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
              >
                Přidat pozici
              </button>
            </>
          )}
        </div>
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4"
          onClick={onHelpClose}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.3)] sm:px-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.16em] text-slate-900">
                <CircleHelp size={14} strokeWidth={2.2} className="text-slate-600" />
                Nápověda
              </h3>
              <button
                type="button"
                onClick={onHelpClose}
                className="rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100"
                aria-label="Zavřít nápovědu"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">
              Zadej historii své kariéry, najdeš ji v Maxxu pod odkazem{" "}
              <a
                href="https://sjednatel.bohemiaservis.cz/broker-card"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-semibold text-slate-900 underline underline-offset-2"
              >
                https://sjednatel.bohemiaservis.cz/broker-card
                <ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" />
              </a>
              . Záložka kariéra.
            </p>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
          Historii kariéry zatím nemáš nastavenou. Najdeš ji v Maxxu pod odkazem{" "}
          <a
            href="https://sjednatel.bohemiaservis.cz/broker-card"
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-slate-900 underline underline-offset-2"
          >
            https://sjednatel.bohemiaservis.cz/broker-card
          </a>
          . Záložka kariéra. Přidej stupně kliknutím na tlačítko Přidat pozici, přidávej od
          nejstarší po aktuální tak jako v Maxxu.
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row, rowIndex) => {
            const rowRangeError = hasInvalidRangeOrder(row.validFrom.trim(), row.validTo.trim());
            const isLastDraftRow = rowIndex === rows.length - 1;
            const rowOpenEndedNotLast = !row.validTo.trim() && !isLastDraftRow;

            return (
              <div
                key={row.id}
                className={`rounded-2xl border bg-white px-3 py-3 shadow-[0_6px_16px_rgba(15,23,42,0.05)] ${
                  rowRangeError || rowOpenEndedNotLast ? "border-rose-300" : "border-slate-300"
                }`}
              >
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_150px_230px_auto]">
                  <select
                    value={row.position}
                    onChange={(event) =>
                      onUpdateRow(row.id, { position: event.target.value as Position })
                    }
                    disabled={locked}
                    className={`${fieldClass} ${
                      locked ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
                    }`}
                  >
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={row.validFrom}
                    onChange={(event) => onUpdateRow(row.id, { validFrom: event.target.value })}
                    disabled={locked}
                    className={`${fieldClass} ${
                      locked ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
                    }`}
                    title="Platí od"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] md:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      type="date"
                      value={row.validTo}
                      onChange={(event) => onUpdateRow(row.id, { validTo: event.target.value })}
                      disabled={locked}
                      className={`${fieldClass} ${
                        locked ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
                      }`}
                      title="Platí do"
                    />
                    {isLastDraftRow && (
                      <button
                        type="button"
                        onClick={() => onUpdateRow(row.id, { validTo: "" })}
                        disabled={locked}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition disabled:cursor-not-allowed ${
                          row.validTo.trim()
                            ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                            : "border-emerald-600 bg-emerald-600 text-white shadow-[0_8px_18px_rgba(5,150,105,0.18)] disabled:opacity-80"
                        }`}
                      >
                        Do současnosti
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.id)}
                    disabled={locked}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Smazat
                  </button>
                </div>
                {rowRangeError && (
                  <p className="mt-2 text-xs font-medium text-rose-700">
                    Datum DO nemůže být dřív než datum OD.
                  </p>
                )}
                {rowOpenEndedNotLast && (
                  <p className="mt-2 text-xs font-medium text-rose-700">
                    Současnost (prázdné DO) může být jen u posledního řádku.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {saved ? <span className="text-xs font-semibold text-emerald-700">Uloženo</span> : null}
        {locked ? (
          <button
            type="button"
            onClick={onUnlock}
            className="rounded-xl border border-slate-900 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Změna
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Ukládám..." : "Uložit timeline"}
          </button>
        )}
      </div>
    </section>
  );
}
