"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChartNoAxesColumn, X } from "lucide-react";

const COMPARISON_URL =
  "/pomucky/srovnavac-trvalych-nasledku?embed=1&preset=neon-oneguard-10x";

export function ProgressivePayoutComparison() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/45 bg-[linear-gradient(135deg,#312e81_0%,#6d28d9_55%,#a21caf_100%)] px-3.5 py-2.5 text-sm font-black !text-white shadow-[0_12px_24px_rgba(109,40,217,0.24)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
      >
        <ChartNoAxesColumn className="h-4 w-4" aria-hidden="true" />
        Zobrazit interaktivní srovnání
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="progressive-payout-modal-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_32px_100px_rgba(0,0,0,0.42)] sm:rounded-[26px]">
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                      Progresivní plnění 10×
                    </p>
                    <h2
                      id="progressive-payout-modal-title"
                      className="truncate text-base font-black text-slate-950 sm:text-lg"
                    >
                      ČPP NEON vs. MetLife OneGuard
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    aria-label="Zavřít srovnání"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </header>
                <iframe
                  src={COMPARISON_URL}
                  title="Srovnání progresivního plnění ČPP NEON a MetLife OneGuard"
                  className="min-h-0 flex-1 border-0 bg-white"
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
