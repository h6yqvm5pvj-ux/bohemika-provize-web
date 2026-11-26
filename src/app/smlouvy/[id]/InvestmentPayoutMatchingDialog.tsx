"use client";

import { useEffect, useId, useRef } from "react";

export type InvestmentPayoutMatchingView = {
  phase: "loading" | "scanning" | "saving" | "complete" | "error";
  scanned: number;
  total: number;
  months: string[];
  message?: string;
};

const monthFormatter = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Prague",
});

export function investmentStatementMonth(ms: number | null): string {
  if (ms == null) return "Výpis bez data";
  const label = monthFormatter.format(ms);
  return label.charAt(0).toLocaleUpperCase("cs-CZ") + label.slice(1);
}

export function InvestmentPayoutMatchingDialog({
  view,
  onClose,
}: {
  view: InvestmentPayoutMatchingView;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const finished = view.phase === "complete" || view.phase === "error";
  const percentage = view.phase === "complete" ? 100
    : view.total > 0 ? Math.floor(99 * view.scanned / view.total) : 0;
  const latestMonth = view.months.at(-1);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    modal.showModal();
    return () => { if (modal.open) modal.close(); };
  }, []);

  return (
    <dialog
      ref={modalRef}
      aria-labelledby={headingId}
      onCancel={event => {
        event.preventDefault();
        if (finished) onClose();
      }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-violet-100 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
    >
      <h2 id={headingId} className="text-lg font-semibold">Párování provizí</h2>
      <div className="mt-4 flex items-center gap-3">
        <progress max={100} value={percentage} aria-label="Průběh párování" className="h-2 min-w-0 flex-1 accent-violet-700" />
        <span className="text-sm font-semibold tabular-nums text-violet-800">{percentage} %</span>
      </div>
      <p className="mt-4 font-medium" role={view.phase === "error" ? "alert" : "status"}>
        {view.message ?? (view.phase === "loading"
          ? "Načítám uložené výpisy…"
          : view.phase === "saving"
            ? "Ukládám spárované provize…"
            : latestMonth ?? "Procházím výpisy…")}
      </p>
      {view.total > 0 && <p className="mt-1 text-sm text-slate-600">Zkontrolováno {view.scanned} z {view.total} výpisů.</p>}
      {view.months.length > 0 && (
        <ul aria-label="Prošlá období" className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
          {view.months.map((month, index) => (
            <li key={`${month}-${index}`} className="rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-800">{month}</li>
          ))}
        </ul>
      )}
      {finished && (
        <button type="button" onClick={onClose} className="mt-5 rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white">
          Zavřít
        </button>
      )}
    </dialog>
  );
}
