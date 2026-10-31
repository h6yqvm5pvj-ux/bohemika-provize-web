import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { AutoBulkImportRow, AutoBulkImportRowStatus } from "./calculatorBulkPdfImport";
import formStyles from "./calculatorForm.module.css";

type Props = {
  visible: boolean;
  status: string | null;
  rows: AutoBulkImportRow[];
  busy: boolean;
  onReview: (rowId: string) => void;
};

export function CalculatorBulkPdfImportPanel({ visible, status, rows, busy, onReview }: Props) {
  if (!visible || (!status && rows.length === 0)) return null;

  const counts = rows.reduce(
    (acc, row) => {
      if (row.status === "success" || row.status === "warning") acc.saved += 1;
      if (row.status === "review") acc.review += 1;
      if (row.status === "skipped") acc.skipped += 1;
      if (row.status === "error") acc.failed += 1;
      if (row.status === "processing") acc.processing += 1;
      return acc;
    },
    { saved: 0, review: 0, skipped: 0, failed: 0, processing: 0 }
  );

  const rowTone = (status: AutoBulkImportRowStatus): string => {
    switch (status) {
      case "success":
        return "border-emerald-200 bg-emerald-50 text-emerald-900";
      case "review":
      case "warning":
        return "border-amber-200 bg-amber-50 text-amber-950";
      case "skipped":
        return "border-slate-200 bg-slate-50 text-slate-700";
      case "error":
        return "border-rose-200 bg-rose-50 text-rose-900";
      case "processing":
        return "border-violet-200 bg-violet-50 text-violet-950";
      case "queued":
      default:
        return "border-slate-200 bg-white text-slate-700";
    }
  };

  const rowIcon = (status: AutoBulkImportRowStatus) => {
    if (status === "processing") {
      return <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} aria-hidden="true" />;
    }
    if (status === "success") {
      return <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />;
    }
    if (status === "review" || status === "warning" || status === "error") {
      return <AlertTriangle className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />;
    }
    return <span className="h-2.5 w-2.5 rounded-full bg-current opacity-45" aria-hidden="true" />;
  };

  return (
    <section className={formStyles.batchFeedback} aria-label="Hromadné zpracování PDF">
      {status && <p className={formStyles.importStatus} role="status">{status}</p>}
      {rows.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
              Uloženo {counts.saved}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              Ke kontrole {counts.review}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
              Přeskočeno {counts.skipped}
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
              Chyby {counts.failed}
            </span>
            {counts.processing > 0 && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">
                Běží {counts.processing}
              </span>
            )}
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {rows.map((row) => (
              <div
                key={row.id}
                className={`grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-xl border px-3 py-2 text-xs ${rowTone(
                  row.status
                )}`}
              >
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center">
                  {rowIcon(row.status)}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-bold">
                    <span className="max-w-full truncate">{row.fileName}</span>
                    {row.productLabel && (
                      <span className="shrink-0 text-[11px] font-black">
                        {row.productLabel}
                      </span>
                    )}
                    {row.contractNumber && (
                      <span className="shrink-0 text-[11px] font-black">
                        {row.contractNumber}
                      </span>
                    )}
                  </div>
                  {row.clientName && (
                    <p className="mt-0.5 truncate font-semibold opacity-80">
                      {row.clientName}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-semibold opacity-80">{row.message}</p>
                    {row.status === "review" && row.reviewDraft ? (
                      <button
                        type="button"
                        onClick={() => onReview(row.id)}
                        disabled={busy}
                        className="ui-focus inline-flex min-h-8 items-center justify-center rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-black text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Zkontrolovat
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
