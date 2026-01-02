import React from "react";
import type { Product } from "@/app/types/domain";

export type AutoFields = {
  carMake: string;
  carPlate: string;
  carVin: string;
  carTp: string;
  carLiabilityLimit: string;
  carHullSumInsured: string;
  carHullDeductible: string;
  carAssistancePlan: string;
  carAddonGlass: boolean;
  carAddonAnimalCollision: boolean;
  carAddonAnimalDamage: boolean;
  carAddonVandalism: boolean;
  carAddonTheft: boolean;
  carAddonNatural: boolean;
  carAddonOwnDamage: boolean;
  carAddonGap: boolean;
  carAddonSmartGap: boolean;
  carAddonServisPro: boolean;
  carAddonReplacementCar: boolean;
  carAddonLuggage: boolean;
  carAddonPassengerInjury: boolean;
};

export type AutoDetail = {
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carTp?: string | null;
  carLiabilityLimit?: number | null;
  carHullSumInsured?: number | null;
  carHullDeductible?: number | null;
  carAssistancePlan?: string | null;
  carAddonGlass?: boolean | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonVandalism?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonNatural?: boolean | null;
  carAddonOwnDamage?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonSmartGap?: boolean | null;
  carAddonServisPro?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonPassengerInjury?: boolean | null;
} | null;

const formatMoney = (value: number | undefined | null) =>
  value != null && Number.isFinite(value)
    ? `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`
    : "—";

const formatLimitLabel = (val: string): string => {
  if (!val) return "—";
  const num = Number(val);
  if (!Number.isFinite(num)) return "—";
  const mil = num / 1_000_000;
  return `${mil}/${mil} mil. Kč`;
};

const assistanceLabel = (val?: string | null): string => {
  const map: Record<string, string> = {
    zakladni: "Základní",
    plus: "PLUS",
    plus_dvojnasob: "Plus Dvojnásob",
    cr_bez_limitu: "V ČR bez limitu",
    evropa_cr_bez_limitu: "Evropa a ČR bez limitu",
  };
  if (!val) return "—";
  const key = val.trim().toLowerCase();
  return map[key] ?? val;
};

type Props = {
  prod?: Product | null;
  editMode: boolean;
  fields: AutoFields;
  contract: AutoDetail;
  onChange: (key: keyof AutoFields, value: string | boolean) => void;
};

const ToggleRow = ({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
      checked
        ? "border-emerald-300/70 bg-emerald-500/15 text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
        : "border-white/10 bg-white/5 text-slate-100 hover:border-emerald-200/40 hover:text-emerald-50"
    } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
  >
    <span className="text-left">{label}</span>
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold ${
        checked
          ? "border-emerald-200 bg-emerald-500/30 text-emerald-50"
          : "border-slate-500 bg-slate-900 text-slate-400"
      }`}
    >
      {checked ? "✓" : ""}
    </span>
  </button>
);

export function AutoDetailPanel({ prod, editMode, fields, contract, onChange }: Props) {
  if (!prod) return null;

  const hasHullData =
    contract?.carHullSumInsured != null ||
    contract?.carHullDeductible != null ||
    (fields.carHullSumInsured?.trim?.() ?? "") !== "" ||
    (fields.carHullDeductible?.trim?.() ?? "") !== "";

  return (
    <>
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-1">
        <div className="text-xs uppercase tracking-wide text-emerald-200">Parametry vozidla</div>
        <div className="text-sm text-slate-100">
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Značka / model</span>
            <span className="font-semibold">{contract?.carMake || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">SPZ</span>
            <span className="font-semibold">{contract?.carPlate || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">VIN</span>
            <span className="font-semibold">{contract?.carVin || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">TP</span>
            <span className="font-semibold">{contract?.carTp || "—"}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-emerald-200">Povinné ručení</div>
        <div className="text-sm text-slate-100">
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Limity</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.carLiabilityLimit}
                  onChange={(e) => onChange("carLiabilityLimit", e.target.value)}
                  className="w-40 rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Vyber limit</option>
                  <option value={50_000_000}>50/50 mil. Kč</option>
                  <option value={70_000_000}>70/70 mil. Kč</option>
                  <option value={100_000_000}>100/100 mil. Kč</option>
                  <option value={150_000_000}>150/150 mil. Kč</option>
                  <option value={200_000_000}>200/200 mil. Kč</option>
                  <option value={250_000_000}>250/250 mil. Kč</option>
                </select>
              ) : contract?.carLiabilityLimit != null ? (
                formatMoney(contract.carLiabilityLimit)
              ) : fields.carLiabilityLimit ? (
                formatLimitLabel(fields.carLiabilityLimit)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-emerald-200">Asistence</div>
        <div className="text-sm text-slate-100">
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Tarif</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.carAssistancePlan}
                  onChange={(e) => onChange("carAssistancePlan", e.target.value)}
                  className="w-44 rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Vyber asistenci</option>
                  <option value="zakladni">Základní</option>
                  <option value="plus">PLUS</option>
                  <option value="plus_dvojnasob">Plus Dvojnásob</option>
                  <option value="cr_bez_limitu">V ČR bez limitu</option>
                  <option value="evropa_cr_bez_limitu">Evropa a ČR bez limitu</option>
                </select>
              ) : (
                assistanceLabel(contract?.carAssistancePlan ?? fields.carAssistancePlan)
              )}
            </span>
          </div>
        </div>
      </div>

      {(editMode || hasHullData) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Havarijní pojištění</div>
          <div className="text-sm text-slate-100 space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-slate-300">Pojistná částka</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.carHullSumInsured}
                    onChange={(e) => onChange("carHullSumInsured", e.target.value)}
                    className="w-32 rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="částka"
                  />
                ) : contract?.carHullSumInsured != null ? (
                  formatMoney(contract.carHullSumInsured)
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-300">Spoluúčast</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.carHullDeductible}
                    onChange={(e) => onChange("carHullDeductible", e.target.value)}
                    className="w-32 rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Spoluúčast v Kč"
                  />
                ) : contract?.carHullDeductible != null ? (
                  formatMoney(contract.carHullDeductible)
                ) : (
                  "—"
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-emerald-200">Připojištění</div>
        <div className="space-y-1">
          {[
            { key: "carAddonGlass", label: "Skla", checked: fields.carAddonGlass },
            { key: "carAddonAnimalCollision", label: "Střet se zvěří", checked: fields.carAddonAnimalCollision },
            { key: "carAddonAnimalDamage", label: "Poškození zvěří", checked: fields.carAddonAnimalDamage },
            { key: "carAddonVandalism", label: "Vandalismus", checked: fields.carAddonVandalism },
            { key: "carAddonTheft", label: "Odcizení", checked: fields.carAddonTheft },
            { key: "carAddonNatural", label: "Živel", checked: fields.carAddonNatural },
            { key: "carAddonOwnDamage", label: "Poškození vlastního vozidla", checked: fields.carAddonOwnDamage },
            { key: "carAddonGap", label: "GAP", checked: fields.carAddonGap },
            { key: "carAddonSmartGap", label: "SmartGAP", checked: fields.carAddonSmartGap },
            { key: "carAddonServisPro", label: "Servis PRO", checked: fields.carAddonServisPro },
            { key: "carAddonReplacementCar", label: "Náhradní vozidlo", checked: fields.carAddonReplacementCar },
            { key: "carAddonLuggage", label: "Zavazadla", checked: fields.carAddonLuggage },
            { key: "carAddonPassengerInjury", label: "Úraz všech osob", checked: fields.carAddonPassengerInjury },
          ]
            .filter((item) => editMode || item.checked)
            .map((item) => (
              <ToggleRow
                key={item.key}
                label={item.label}
                checked={item.checked}
                onChange={(val) => onChange(item.key as keyof AutoFields, val)}
                disabled={!editMode}
              />
            ))}
        </div>
      </div>
    </>
  );
}
