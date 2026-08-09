import {
  classifyGeneralCommissionCode,
  formatMoney,
  formatWholeMoney,
  resolveStatementProduct,
} from "./statementParsing";
import type {
  CommissionRow,
  GeneralCommissionKind,
  OtherPayment,
} from "./statementTypes";

export function LifeSplitCommissionTable({
  rows,
  b36Payments,
  b36HalfLabel,
  pairedB36PaymentIndexes,
}: {
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
  b36HalfLabel: string;
  pairedB36PaymentIndexes: Set<number>;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Kód</th>
            <th className="px-3 py-2">Význam</th>
            <th className="px-3 py-2 text-right">Základna</th>
            <th className="px-3 py-2 text-right">Procento</th>
            <th className="px-3 py-2 text-right">Provize</th>
            <th className="px-3 py-2 text-right">Rez. fond</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.id}-${row.type}-${row.commission}`}>
              <td className="px-3 py-2 font-semibold text-slate-900">{row.type}</td>
              <td className="px-3 py-2 text-slate-700">{row.lifeSplitLabel}</td>
              <td className="px-3 py-2 text-right text-slate-700">{formatMoney(row.base)}</td>
              <td className="px-3 py-2 text-right text-slate-700">{row.percent || "—"}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-950">
                {formatMoney(row.commission)}
              </td>
              <td className="px-3 py-2 text-right text-slate-700">
                {formatMoney(row.reserveFund)}
              </td>
            </tr>
          ))}
          {b36Payments.map((payment, index) => {
            const isOffsetPair = pairedB36PaymentIndexes.has(index);
            return (
              <tr key={`${payment.contractNumber}-b36-${index}`} className="bg-emerald-50/60">
                <td className="px-3 py-2 font-semibold text-slate-900">B36</td>
                <td className="px-3 py-2 text-slate-700">
                  {b36HalfLabel} z ostatních plateb
                  {payment.isStorno ? " / storno" : ""}
                  {isOffsetPair ? " / vyplaceno a odečteno ve stejném výpisu" : ""}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">—</td>
                <td className="px-3 py-2 text-right text-slate-700">—</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-950">
                  {formatMoney(payment.amount)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OtherProductCommissionTable({
  rows,
  b36Payments,
  pairedB36PaymentIndexes,
  generalCommissionKindClass,
}: {
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
  pairedB36PaymentIndexes: Set<number>;
  generalCommissionKindClass: (kind: GeneralCommissionKind) => string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Produkt</th>
            <th className="px-3 py-2">Kód</th>
            <th className="px-3 py-2">Význam</th>
            <th className="px-3 py-2 text-right">Základna</th>
            <th className="px-3 py-2 text-right">Procento</th>
            <th className="px-3 py-2 text-right">Provize</th>
            <th className="px-3 py-2 text-right">Rez. fond</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const classification = classifyGeneralCommissionCode(row.product, row.type);
            const rowProductMeta = resolveStatementProduct(row.product);
            return (
              <tr key={`${row.id}-${row.type}-${row.commission}`}>
                <td className="px-3 py-2 text-slate-700">
                  <div className="font-semibold text-slate-900">{rowProductMeta.label}</div>
                  <div className="text-xs text-slate-500">{rowProductMeta.rawCode}</div>
                </td>
                <td className="px-3 py-2 font-semibold text-slate-900">{row.type || "—"}</td>
                <td className="px-3 py-2 text-slate-700">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${generalCommissionKindClass(
                      classification.kind
                    )}`}
                  >
                    {classification.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  <div>{formatMoney(row.base)}</div>
                  {rowProductMeta.usesAnnualPremiumBase && row.base > 0 && (
                    <div className="text-xs text-slate-500">
                      měs. {formatWholeMoney(row.base / 12)} Kč
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{row.percent || "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-950">
                  {formatMoney(row.commission)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(row.reserveFund)}
                </td>
              </tr>
            );
          })}
          {b36Payments.map((payment, index) => {
            const isOffsetPair = pairedB36PaymentIndexes.has(index);
            return (
              <tr key={`${payment.contractNumber}-b36-${index}`} className="bg-emerald-50/60">
                <td className="px-3 py-2 text-slate-700">
                  <div className="font-semibold text-slate-900">Ostatní platby</div>
                  <div className="text-xs text-slate-500">bez produktového kódu</div>
                </td>
                <td className="px-3 py-2 font-semibold text-slate-900">B36</td>
                <td className="px-3 py-2 text-slate-700">
                  <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                    50% z B36 z ostatních plateb
                  </span>
                  {isOffsetPair && (
                    <div className="mt-1 text-xs font-medium text-emerald-800">
                      Vyplaceno a odečteno ve stejném výpisu
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">—</td>
                <td className="px-3 py-2 text-right text-slate-700">—</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-950">
                  {formatMoney(payment.amount)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
