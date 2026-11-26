"use client";

import { useId, useMemo } from "react";
import { FileText, X } from "lucide-react";
import { buildInteractiveStatementHtml } from "@/lib/statementPreview";
import { extractContractStatementRows } from "@/lib/contractStatementRows";
import type { ContractCommissionStatementDetail } from "./contractDetailTypes";

export type ContractStatementPreview = ContractCommissionStatementDetail & {
  contractNumber: string;
  commissionCodes: string[];
};

const statementDisplayTitle = (statement: ContractCommissionStatementDetail): string =>
  statement.statementNumber ? `Provizní výpis ${statement.statementNumber}` : statement.fileName || "Provizní výpis";

export function CommissionStatementPreviewModal({ statement, onClose }: {
  statement: ContractStatementPreview | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const tables = useMemo(() => statement
    ? extractContractStatementRows(statement.html, statement.contractNumber, statement.commissionCodes)
    : [], [statement]);
  if (!statement) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08030f]/78 px-4 py-6 backdrop-blur-[7px]" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex max-h-[95vh] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 text-slate-950 shadow-[0_38px_92px_rgba(2,6,23,0.38)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <FileText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />Provizní výpis
            </div>
            <h3 id={titleId} className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">{statementDisplayTitle(statement)}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {statement.period ?? "Období nezjištěno"}{statement.statementDate ? ` · vystaveno ${statement.statementDate}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="ui-focus inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900"
            aria-label="Zavřít náhled provizního výpisu">
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <section aria-label="Řádky otevřené smlouvy" className="max-h-[36vh] shrink-0 overflow-auto border-b border-violet-100 bg-violet-50/50 px-3 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h4 className="text-sm font-semibold text-violet-950">Smlouva {statement.contractNumber}</h4>
            <span className="text-xs text-slate-500">Původní řádky z výpisu{statement.commissionCodes.length > 0 ? ` · vybraná provize ${statement.commissionCodes.join(", ")}` : ""}</span>
          </div>
          {tables.length > 0 ? tables.map((table, tableIndex) => (
            <div key={tableIndex} className="mb-3 overflow-x-auto rounded-xl border border-violet-100 bg-white last:mb-0">
              <table className="w-full border-collapse text-left text-xs tabular-nums">
                <caption className="px-3 py-2 text-left font-semibold text-slate-700">{table.label}</caption>
                <thead className="border-y border-slate-200 bg-slate-50 text-slate-500">
                  <tr>{table.headers.map((heading, index) => <th key={index} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{heading || "—"}</th>)}</tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} data-selected-commission={row.highlighted || undefined}
                      className={row.highlighted ? "border-b border-violet-100 bg-violet-100/70 text-violet-950 last:border-0" : "border-b border-slate-100 text-slate-700 last:border-0"}>
                      {row.cells.map((cell, index) => <td key={index} className="whitespace-nowrap px-3 py-2.5">{cell || "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )) : <p className="text-sm text-slate-600">V tomto výpisu se nepodařilo dohledat původní řádek smlouvy. Celý výpis je k dispozici níže.</p>}
        </section>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 px-3 py-4 sm:px-5">
          <iframe title={statementDisplayTitle(statement)} srcDoc={buildInteractiveStatementHtml(statement.html)}
            sandbox="allow-scripts" referrerPolicy="no-referrer"
            className="mx-auto block h-[min(76vh,940px)] w-[840px] max-w-full rounded-xl border border-slate-300 bg-white shadow-[0_16px_38px_rgba(15,23,42,0.16)]" />
        </div>
      </div>
    </div>
  );
}
