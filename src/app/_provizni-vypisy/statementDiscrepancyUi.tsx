"use client";

import { Loader2, Printer } from "lucide-react";

import {
  discrepancyScopeLabel,
  hasFiniteNumber,
} from "./statementDiscrepancies";
import { formatMoney } from "./statementParsing";
import type {
  DiscrepancyPdfItem,
  MarkedDiscrepancyItem,
  MarkingControls,
} from "./statementTypes";

export function MarkedDiscrepancyToggle({
  item,
  markingControls,
}: {
  item: MarkedDiscrepancyItem;
  markingControls?: MarkingControls;
}) {
  if (!markingControls?.markingMode) return null;

  const checked = Boolean(markingControls.markedItems[item.key]);

  return (
    <label
      onClick={(event) => event.stopPropagation()}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        checked
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => markingControls.onToggleMarked(item, event.target.checked)}
        className="h-4 w-4 accent-rose-700"
      />
      Označit nesrovnalost
    </label>
  );
}

export function DiscrepancyPdfNotesModal({
  items,
  notes,
  downloading,
  onNoteChange,
  onClose,
  onDownload,
}: {
  items: DiscrepancyPdfItem[];
  notes: Record<string, string>;
  downloading: boolean;
  onNoteChange: (key: string, note: string) => void;
  onClose: () => void;
  onDownload: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Souhrn nesrovnalostí</h2>
            <p className="mt-1 text-sm text-slate-600">
              Doplň poznámky pro účetní a stáhni PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Zavřít
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {items.map((item) => (
            <article key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-950">
                      Smlouva {item.contractNumber || "—"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {item.category}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {discrepancyScopeLabel(item.scope)}
                    </span>
                  </div>
                  <div className="mt-2 font-semibold text-slate-800">
                    {item.client || "—"} · {item.product || "—"}
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    {item.statementLabel}
                    {hasFiniteNumber(item.amount ?? undefined)
                      ? ` · ${formatMoney(item.amount ?? 0)} Kč`
                      : ""}
                  </div>
                  {item.autoIssues.length > 0 && (
                    <ul className="mt-2 space-y-2 text-xs text-slate-600">
                      {item.autoIssues.map((issue) => (
                        <li key={issue.key}>
                          <div className="font-semibold text-slate-700">{issue.title}</div>
                          {issue.details.length > 0 && (
                            <div className="mt-1 space-y-0.5 text-slate-500">
                              {issue.details.map((detail) => (
                                <div key={detail}>{detail}</div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <textarea
                  value={notes[item.key] ?? ""}
                  onChange={(event) => onNoteChange(item.key, event.target.value)}
                  placeholder="Poznámka pro účetní"
                  className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 lg:w-96"
                />
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-slate-600">
            {items.length} označených položek
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={downloading}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Zpět
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Printer className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              )}
              Stáhnout PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
