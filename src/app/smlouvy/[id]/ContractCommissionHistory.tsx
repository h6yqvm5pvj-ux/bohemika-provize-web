import { FileText } from "lucide-react";

import { formatMoney } from "./contractDetailHelpers";
import { type ContractCommissionPayout } from "./contractDetailTypes";

type ContractCommissionHistoryProps = {
  payouts?: ContractCommissionPayout[] | null;
};

const normalizeStatus = (
  status: ContractCommissionPayout["status"]
): "paid" | "difference" | "storno" => {
  if (status === "difference" || status === "storno") return status;
  return "paid";
};

const statusLabel = (status: ContractCommissionPayout["status"]): string => {
  switch (normalizeStatus(status)) {
    case "difference":
      return "Rozdíl";
    case "storno":
      return "Storno";
    default:
      return "Vyplaceno";
  }
};

const statusClass = (status: ContractCommissionPayout["status"]): string => {
  switch (normalizeStatus(status)) {
    case "difference":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "storno":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
};

const payoutSortValue = (payout: ContractCommissionPayout): number =>
  typeof payout.writtenAtMs === "number" && Number.isFinite(payout.writtenAtMs)
    ? payout.writtenAtMs
    : 0;

const payoutStatementLabel = (payout: ContractCommissionPayout): string =>
  [
    payout.statementNumber ? `Výpis ${payout.statementNumber}` : "Provizní výpis",
    payout.statementPeriod ?? payout.payoutMonthKey ?? payout.statementDate ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

const payoutCodeLabel = (payout: ContractCommissionPayout): string =>
  [payout.code, payout.title].filter(Boolean).join(" · ") || "Položka provize";

export function ContractCommissionHistory({
  payouts,
}: ContractCommissionHistoryProps) {
  const rows = [...(payouts ?? [])].sort((a, b) => payoutSortValue(b) - payoutSortValue(a));

  return (
    <section className="rounded-[24px] border border-slate-300/90 bg-white px-5 py-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="flex items-center gap-2 font-mono text-xl font-semibold tracking-tight text-slate-900">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-base font-mono tracking-tight text-white">
            <FileText size={14} strokeWidth={2} aria-hidden="true" />
            Historie
          </span>
          Provizní výpisy u smlouvy
        </h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {rows.length} záznamů
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
          Zatím bez zapsaných provizních výpisů. Záznamy se zde objeví až po budoucím výsledném zápisu provizí.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] gap-3 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>Výpis</span>
            <span>Položka</span>
            <span className="text-right">Částka</span>
            <span className="text-right">Stav</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((payout, index) => (
              <div
                key={
                  payout.key ??
                  `${payout.statementId ?? "statement"}-${payout.code ?? payout.title ?? index}`
                }
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">
                    {payoutStatementLabel(payout)}
                  </div>
                  {payout.statementDate && (
                    <div className="mt-0.5 text-xs font-medium text-slate-500">
                      Vystaveno {payout.statementDate}
                    </div>
                  )}
                </div>
                <div className="min-w-0 truncate font-medium text-slate-700">
                  {payoutCodeLabel(payout)}
                </div>
                <div className="whitespace-nowrap text-right font-bold text-slate-950">
                  {formatMoney(payout.amount ?? 0)}
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(payout.status)}`}
                  >
                    {statusLabel(payout.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
