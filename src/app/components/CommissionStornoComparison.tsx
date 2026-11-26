import type { CommissionStornoRow } from "@/app/lib/commissionStornoComparison";

const money = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("cs-CZ", { style: "percent", maximumFractionDigits: 1 });
const amount = (cents: number) => money.format(cents / 100);

export function CommissionStornoComparison({ rows, preview = false }: {
  rows: readonly CommissionStornoRow[];
  preview?: boolean;
}) {
  const visibleRows = rows.filter(row => (row.estimated ?? 0) > 0 || row.deducted !== null);
  const hasMissingEstimates = rows.some(row => row.estimated === null && row.deducted === null);
  const emptyMessage = rows.length > 0 && !hasMissingEstimates
    ? "Žádná očekávaná vratka." : "Odhad není k dispozici.";
  const showActual = !preview || visibleRows.some(row => row.deducted !== null);
  const payoutColumnTitle = visibleRows.some(row => row.includesPayoutWithoutPriorDate)
    ? "Vyplaceno z výpisů" : "Vyplaceno před stornem";
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800" aria-label="Odhad a srážky storna">
      <h3 className="font-semibold">Storno provize podle kódu</h3>
      {visibleRows.length === 0 ? <p className="mt-1 text-slate-600">{emptyMessage}</p> : <>
        <p className="mt-1 text-xs text-slate-600">Odhad pro běžné ukončení podle data účinnosti storna. Částky před odpočtem stornofondu.</p>
        {hasMissingEstimates && <p className="mt-1 text-xs text-slate-600">U dalších provizí není odhad k dispozici.</p>}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-xs text-slate-600">
              <tr>
                <th scope="col" className="p-2">Kód</th>
                <th scope="col" className="p-2 text-right">{payoutColumnTitle}</th>
                <th scope="col" className="p-2 text-right">Odhad vratky</th>
                {showActual && <><th scope="col" className="p-2 text-right">Srážky z výpisů</th><th scope="col" className="p-2 text-right">Rozdíl</th></>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => <tr key={row.code} className="border-t border-slate-100">
                <th scope="row" className="whitespace-nowrap p-2">{row.code || "Bez kódu"}</th>
                <td className="whitespace-nowrap p-2 text-right">
                  {row.paid === null ? "—" : amount(row.paid)}
                  {row.includesPayoutWithoutPriorDate && <small className="block text-xs text-slate-600">Bez doloženého data před stornem</small>}
                </td>
                <td className="whitespace-nowrap p-2 text-right">
                  {row.estimated === null ? "K prověření" : row.estimated === 0 ? "Bez vratky"
                    : `${amount(row.estimated)}${row.paid ? ` (${percent.format(row.estimated / row.paid)})` : ""}`}
                  {row.usingNewerTerms && <small className="block text-xs text-slate-600">Orientační podle novějších podmínek</small>}
                </td>
                {showActual && <>
                  <td className="whitespace-nowrap p-2 text-right">{row.deducted === null ? "Čeká na výpis" : amount(row.deducted)}</td>
                  <td className="whitespace-nowrap p-2 text-right">{row.difference === null ? "—"
                    : row.difference === 0 ? "Storno sedí"
                      : `Storno je o ${amount(Math.abs(row.difference))} ${row.difference > 0 ? "vyšší" : "nižší"}`}</td>
                </>}
              </tr>)}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
