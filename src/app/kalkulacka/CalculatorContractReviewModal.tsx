"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ClipboardCheck, Pencil, X } from "lucide-react";
import type { ContractReview } from "./contractReview";

export function CalculatorContractReviewModal({ review, onResolve }: {
  review: ContractReview;
  onResolve: (confirmed: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    editRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => onResolve(false)} aria-hidden="true" />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
        className="relative flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-violet-100 bg-white text-slate-900 shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onResolve(false); }
          if (event.key !== "Tab") return;
          const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="flex items-start gap-3 border-b border-slate-200 bg-violet-50/60 px-5 py-4">
          <span className="rounded-xl bg-violet-100 p-2 text-violet-700"><ClipboardCheck size={22} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold">{review.title}</h2>
            <p id={descriptionId} className="mt-1 text-sm text-slate-600">Zkontroluj údaje. Tlačítkem Souhlasí potvrdíš uložení.</p>
          </div>
          <button type="button" onClick={() => onResolve(false)} aria-label="Zavřít rekapitulaci a upravit údaje"
            className="rounded-full p-2 text-slate-500 hover:bg-white focus-visible:outline-2 focus-visible:outline-violet-600"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {review.warnings.length > 0 && (
            <div role="note" aria-label="Údaje ke kontrole" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={18} aria-hidden="true" />Ještě prosím zkontroluj</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              <p className="mt-3 text-xs text-amber-800">Pokud údaje odpovídají smlouvě, můžeš pokračovat přes Souhlasí.</p>
            </div>
          )}
          <dl className="divide-y divide-slate-100">{review.rows.map(({ label, value }) => (
            <div key={label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:gap-4">
              <dt className="text-slate-500">{label}</dt>
              <dd className="min-w-0 break-words font-semibold sm:text-right">{value}</dd>
            </div>
          ))}</dl>
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button ref={editRef} type="button" onClick={() => onResolve(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-600"><Pencil size={16} aria-hidden="true" />Upravit</button>
          <button type="button" onClick={() => onResolve(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"><Check size={17} aria-hidden="true" />Souhlasí</button>
        </div>
      </section>
    </div>, document.body
  );
}
