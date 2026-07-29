"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";

type HelpDialogProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function HelpDialog({
  isOpen,
  title,
  description,
  onClose,
  children,
}: HelpDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Zavřít nápovědu"
        className="absolute inset-0 cursor-default bg-slate-950/58 backdrop-blur-sm"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        className="relative max-h-[min(86vh,760px)] w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white text-slate-900 shadow-[0_30px_90px_rgba(2,6,23,0.42)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              <CircleHelp className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
              Nápověda
            </div>
            <h2 id="help-dialog-title" className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              {title}
            </h2>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <X className="h-4.5 w-4.5" strokeWidth={2.3} aria-hidden="true" />
          </button>
        </div>

        <div className="help-dialog-scrollbar max-h-[calc(min(86vh,760px)-132px)] overflow-y-scroll px-5 py-5 sm:px-6">
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
