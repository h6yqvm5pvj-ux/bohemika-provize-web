import { type ToastMessage } from "./contractDetailTypes";

export const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <span
    className={`inline-block animate-spin rounded-full border-2 border-white/30 border-t-white/80 ${className}`}
    aria-hidden="true"
  />
);

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-xl bg-white/10 ${className}`} />
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
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md ${
              isError
                ? "border-rose-400/50 bg-rose-600/20 text-rose-50 shadow-rose-900/40"
                : "border-emerald-400/50 bg-emerald-500/20 text-emerald-50 shadow-emerald-900/40"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                  isError ? "bg-rose-300" : "bg-emerald-300"
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 text-sm font-medium">{toast.message}</div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="text-xs text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60 rounded-full px-2"
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
