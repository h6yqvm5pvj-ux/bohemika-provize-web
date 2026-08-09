import { AlertTriangle, CheckCircle2, ReceiptText } from "lucide-react";

export function StatementPreviewHeader({
  fileName,
  statementNumber,
  statementDate,
}: {
  fileName: string;
  statementNumber: string | null | undefined;
  statementDate: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <ReceiptText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          <span className="truncate">{fileName}</span>
        </div>
        <h2 className="mt-1 text-lg font-bold text-slate-950">
          Výpis {statementNumber ?? "bez čísla"}
        </h2>
        {statementDate && (
          <p className="mt-1 text-sm font-medium text-slate-500">
            Vystaveno {statementDate}
          </p>
        )}
      </div>
      <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
        Bez zápisu provizí
      </span>
    </div>
  );
}

export function StatementParseWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {warnings.map((warning) => (
        <div key={warning} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}
