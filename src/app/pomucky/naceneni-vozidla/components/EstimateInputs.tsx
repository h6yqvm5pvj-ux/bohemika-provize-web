import { SlidersHorizontal } from "lucide-react";
import { type ReactNode } from "react";

import { type Condition, type Damage, type Equipment, type Origin, type ServiceHistory, type Usage } from "../types";

function InputLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">{children}</label>;
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <InputLabel>{label}</InputLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type EstimateInputsProps = {
  mileageKm: string;
  setMileageKm: (value: string) => void;
  condition: Condition;
  setCondition: (value: Condition) => void;
  serviceHistory: ServiceHistory;
  setServiceHistory: (value: ServiceHistory) => void;
  origin: Origin;
  setOrigin: (value: Origin) => void;
  equipment: Equipment;
  setEquipment: (value: Equipment) => void;
  damage: Damage;
  setDamage: (value: Damage) => void;
  usage: Usage;
  setUsage: (value: Usage) => void;
  isMileageFilled: boolean;
  detailFieldsDone: number;
  detailFieldsTotal: number;
  detailCompletionPct: number;
  remainingHints: string[];
  frame?: "card" | "plain";
  showHeader?: boolean;
};

export function EstimateInputs({
  mileageKm,
  setMileageKm,
  condition,
  setCondition,
  serviceHistory,
  setServiceHistory,
  origin,
  setOrigin,
  equipment,
  setEquipment,
  damage,
  setDamage,
  usage,
  setUsage,
  isMileageFilled,
  detailFieldsDone,
  detailFieldsTotal,
  detailCompletionPct,
  remainingHints,
  frame = "card",
  showHeader = true,
}: EstimateInputsProps) {
  return (
    <section className={frame === "card" ? "space-y-4 rounded-xl border border-slate-100 bg-white px-4 py-4" : "space-y-4"}>
      {showHeader && (
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-900">Vstupy pro odhad</h2>
        </div>
      )}

      <div
        className={`rounded-lg border px-3 py-3 ${
          isMileageFilled ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Přesnost vstupů</div>
          <div className="text-xs font-semibold text-slate-600">
            {detailFieldsDone}/{detailFieldsTotal} doplněno
          </div>
        </div>
        <div className="mt-1.5 text-xs text-slate-700">
          {!isMileageFilled
            ? "Doplň nájezd km. Má největší vliv na kvalitu odhadu."
            : remainingHints.length > 0
              ? "Nájezd km je vyplněný. Pro přesnější odhad doplň ještě položky níže."
              : "Všechny klíčové vstupy jsou doplněné."}
        </div>
        {remainingHints.length > 0 && (
          <div className="mt-2 text-xs text-slate-600">
            Doplnit ještě: <span className="font-semibold text-slate-800">{remainingHints.slice(0, 4).join(", ")}</span>
            {remainingHints.length > 4 ? "..." : ""}
          </div>
        )}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/80">
          <div
            className={`h-full rounded-full transition-all ${isMileageFilled ? "bg-emerald-500" : "bg-amber-400"}`}
            style={{ width: `${detailCompletionPct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <InputLabel>
            Nájezd km <span className="text-amber-600">*</span>
          </InputLabel>
          <input
            type="text"
            inputMode="numeric"
            value={mileageKm}
            onChange={(event) => setMileageKm(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-medium text-slate-900 outline-none transition ${
              isMileageFilled
                ? "border-slate-200 bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                : "border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            }`}
            placeholder="např. 128000"
          />
          {!isMileageFilled && (
            <p className="text-xs text-amber-700">Doporučeno vyplnit před finálním nastavením pojistné částky.</p>
          )}
        </div>
        <SelectField
          label="Stav"
          value={condition}
          onChange={setCondition}
          options={[
            { value: "excellent", label: "Výborný" },
            { value: "good", label: "Dobrý" },
            { value: "average", label: "Průměrný" },
            { value: "worse", label: "Horší" },
          ]}
        />
        <SelectField
          label="Servisní historie"
          value={serviceHistory}
          onChange={setServiceHistory}
          options={[
            { value: "full", label: "Doložená" },
            { value: "partial", label: "Částečná" },
            { value: "unknown", label: "Neznámá" },
            { value: "none", label: "Bez doložení" },
          ]}
        />
        <SelectField
          label="Původ"
          value={origin}
          onChange={setOrigin}
          options={[
            { value: "cz", label: "ČR" },
            { value: "eu", label: "EU doložený" },
            { value: "import", label: "Dovoz" },
            { value: "unknown", label: "Neznámý" },
          ]}
        />
        <SelectField
          label="Výbava"
          value={equipment}
          onChange={setEquipment}
          options={[
            { value: "basic", label: "Základní" },
            { value: "standard", label: "Standardní" },
            { value: "high", label: "Nadstandardní" },
            { value: "top", label: "Top výbava" },
          ]}
        />
        <SelectField
          label="Poškození"
          value={damage}
          onChange={setDamage}
          options={[
            { value: "none", label: "Bez známého poškození" },
            { value: "cosmetic", label: "Kosmetické vady" },
            { value: "repaired", label: "Opravená větší škoda" },
            { value: "unresolved", label: "Neopravené poškození" },
          ]}
        />
        <SelectField
          label="Užívání"
          value={usage}
          onChange={setUsage}
          options={[
            { value: "private", label: "Soukromé" },
            { value: "company", label: "Firemní" },
            { value: "taxi", label: "Taxi / intenzivní" },
            { value: "unknown", label: "Neznámé" },
          ]}
        />
      </div>
    </section>
  );
}
