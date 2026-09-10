import type { VehicleChecks } from "@/app/lib/vehicleReport";

const dateLabel = (value: string) => {
  const day = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(day.getTime()) ? value : day.toLocaleDateString("cs-CZ");
};

export function VehicleAdditionalChecks({ checks }: { checks: VehicleChecks }) {
  const insurance = checks.insurance[0];
  if (!insurance && !checks.ambiguous && checks.mileageManipulated !== true) return null;
  return (
    <div className="space-y-3">
      {checks.ambiguous && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Registr obsahuje více záznamů vozidla. Zobrazuje se nejnovější dostupný záznam.</p>}
      {checks.mileageManipulated === true && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">Nesrovnalost v historii tachometru. Ověř jednotlivé záznamy nájezdu.</p>}
      {insurance && <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Poslední evidované pojištění</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{insurance.insurer ?? "Pojišťovna neuvedena"}{insurance.from ? ` · od ${dateLabel(insurance.from)}` : ""}</p>
        {checks.insuranceDataThrough && <p className="mt-1 text-xs text-slate-500">Evidence dostupná k {dateLabel(checks.insuranceDataThrough)}</p>}
      </div>}
    </div>
  );
}
