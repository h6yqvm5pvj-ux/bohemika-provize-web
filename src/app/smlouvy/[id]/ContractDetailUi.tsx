import { type ReactNode } from "react";

import { type ToastMessage } from "./contractDetailTypes";

export function ContractSectionHeading({
  icon,
  children,
  className = "",
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`flex items-center gap-2.5 font-mono text-sm font-black uppercase tracking-[0.14em] text-slate-950 ${className}`}
    >
      <span className="inline-flex shrink-0 text-violet-700">{icon}</span>
      <span>{children}</span>
    </h3>
  );
}

export const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <span
    className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 ${className}`}
    aria-hidden="true"
  />
);

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-xl bg-slate-200 ${className}`} />
);

export function Toasts({
  items,
  onDismiss,
}: {
  items: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed top-6 right-4 z-50 flex max-w-md flex-col gap-3">
      {items.map((toast) => {
        const isError = toast.type === "error";
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl ${
              isError
                ? "border-rose-300 bg-white text-rose-800 shadow-slate-300/40"
                : "border-slate-300 bg-white text-slate-900 shadow-slate-300/40"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                  isError ? "bg-rose-500" : "bg-slate-900"
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 text-sm font-medium">{toast.message}</div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-full px-2 text-xs text-slate-500 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zavřít upozornění"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
