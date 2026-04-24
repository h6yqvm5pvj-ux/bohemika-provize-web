import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Car,
  CarFront,
  LifeBuoy,
  Shield,
  Wrench,
} from "lucide-react";
import type { Product } from "@/app/types/domain";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";

export type AutoFields = {
  carMake: string;
  carPlate: string;
  carVin: string;
  carTp: string;
  carOrv: string;
  carLiabilityLimit: string;
  carHullSumInsured: string;
  carHullDeductible: string;
  carHullRiskAccident: boolean;
  carHullRiskTheft: boolean;
  carHullRiskNatural: boolean;
  carHullRiskVandalism: boolean;
  carHullRiskAnimalCollision: boolean;
  carAssistancePlan: string;
  carAddonEso: boolean;
  carAddonNaturalRisks: boolean;
  carAddonKlika: boolean;
  carAddonGlass: boolean;
  carAddonAnimalCollision: boolean;
  carAddonAnimalDamage: boolean;
  carAddonVandalism: boolean;
  carAddonTheft: boolean;
  carAddonNatural: boolean;
  carAddonOwnDamage: boolean;
  carAddonPothole: boolean;
  carAddonNonFaultAccident: boolean;
  carAddonGap: boolean;
  carAddonSmartGap: boolean;
  carAddonServisPro: boolean;
  carAddonReplacementCar: boolean;
  carAddonLuggage: boolean;
  carAddonTransportedGoods: boolean;
  carAddonPassengerInjury: boolean;
  carAddonKeyLossTheft: boolean;
};

export type AutoDetail = {
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carTp?: string | null;
  carOrv?: string | null;
  carLiabilityLimit?: number | null;
  carHullSumInsured?: number | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
  carAssistancePlan?: string | null;
  carAddonEso?: boolean | null;
  carAddonNaturalRisks?: boolean | null;
  carAddonKlika?: boolean | null;
  carAddonGlass?: boolean | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonVandalism?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonNatural?: boolean | null;
  carAddonOwnDamage?: boolean | null;
  carAddonPothole?: boolean | null;
  carAddonNonFaultAccident?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonSmartGap?: boolean | null;
  carAddonServisPro?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonTransportedGoods?: boolean | null;
  carAddonPassengerInjury?: boolean | null;
  carAddonKeyLossTheft?: boolean | null;
} | null;

const formatMoney = (value: number | undefined | null) =>
  formatMoneyValue(value, {
    emptyValueLabel: "—",
    minFractionDigits: 2,
    maxFractionDigits: 2,
  });

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
    standard: "Standard",
    plus: "PLUS",
    plus_dvojnasob: "PLUS Dvojnásob",
    "plus dvojnasob": "PLUS Dvojnásob",
    cr_bez_limitu: "CAR PLUS v ČR bez limitu",
    "v čr bez limitu": "CAR PLUS v ČR bez limitu",
    "v cr bez limitu": "CAR PLUS v ČR bez limitu",
    evropa_cr_bez_limitu: "CAR PREMIUM ČR a EVROPA bez limitu",
    "evropa a čr bez limitu": "CAR PREMIUM ČR a EVROPA bez limitu",
    "evropa a cr bez limitu": "CAR PREMIUM ČR a EVROPA bez limitu",
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
        ? "border-slate-900 bg-slate-900 text-white shadow-[0_6px_14px_rgba(15,23,42,0.18)]"
        : "border-slate-300 bg-white text-slate-900 hover:border-slate-900"
    } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
  >
    <span className="text-left">{label}</span>
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold ${
        checked
          ? "border-slate-900 bg-white text-slate-900"
          : "border-slate-300 bg-slate-100 text-slate-500"
      }`}
    >
      {checked ? "✓" : ""}
    </span>
  </button>
);

const SectionTitle = ({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) => (
  <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
    <Icon size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export function AutoDetailPanel({ prod, editMode, fields, contract, onChange }: Props) {
  if (!prod) return null;

  const hasHullData =
    contract?.carHullSumInsured != null ||
    contract?.carHullDeductible != null ||
    (contract?.carHullDeductibleText?.trim() ?? "") !== "" ||
    contract?.carHullRiskAccident === true ||
    contract?.carHullRiskTheft === true ||
    contract?.carHullRiskNatural === true ||
    contract?.carHullRiskVandalism === true ||
    contract?.carHullRiskAnimalCollision === true ||
    (fields.carHullSumInsured?.trim?.() ?? "") !== "" ||
    (fields.carHullDeductible?.trim?.() ?? "") !== "" ||
    fields.carHullRiskAccident ||
    fields.carHullRiskTheft ||
    fields.carHullRiskNatural ||
    fields.carHullRiskVandalism ||
    fields.carHullRiskAnimalCollision;

  return (
    <>
      <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-1 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <SectionTitle icon={CarFront} label="Parametry vozidla" />
        <div className="text-sm text-slate-900">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Značka / model</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="text"
                  value={fields.carMake}
                  onChange={(e) => onChange("carMake", e.target.value)}
                  className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="např. Škoda Octavia"
                />
              ) : (
                contract?.carMake || fields.carMake || "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">SPZ</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="text"
                  value={fields.carPlate}
                  onChange={(e) => onChange("carPlate", e.target.value)}
                  className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="např. 1AB2345"
                />
              ) : (
                contract?.carPlate || fields.carPlate || "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">VIN</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="text"
                  value={fields.carVin}
                  onChange={(e) => onChange("carVin", e.target.value)}
                  className="w-52 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="VIN"
                />
              ) : (
                contract?.carVin || fields.carVin || "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">TP</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="text"
                  value={fields.carTp}
                  onChange={(e) => onChange("carTp", e.target.value)}
                  className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="Číslo TP"
                />
              ) : (
                contract?.carTp || fields.carTp || "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">ORV</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="text"
                  value={fields.carOrv}
                  onChange={(e) => onChange("carOrv", e.target.value)}
                  className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="Číslo ORV"
                />
              ) : (
                contract?.carOrv || fields.carOrv || "—"
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <SectionTitle icon={Shield} label="Povinné ručení" />
        <div className="text-sm text-slate-900">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Limity</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.carLiabilityLimit}
                  onChange={(e) => onChange("carLiabilityLimit", e.target.value)}
                  className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
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

      <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <SectionTitle icon={LifeBuoy} label="Asistence" />
        <div className="text-sm text-slate-900">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Tarif</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.carAssistancePlan}
                  onChange={(e) => onChange("carAssistancePlan", e.target.value)}
                  className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                >
                  <option value="">Vyber asistenci</option>
                  <option value="zakladni">Základní</option>
                  <option value="standard">Standard</option>
                  <option value="plus">PLUS</option>
                  <option value="plus_dvojnasob">PLUS Dvojnásob</option>
                  <option value="cr_bez_limitu">CAR PLUS v ČR bez limitu</option>
                  <option value="evropa_cr_bez_limitu">CAR PREMIUM ČR a EVROPA bez limitu</option>
                  <option value="ZÁKLAD">ZÁKLAD</option>
                  <option value="IDEÁL">IDEÁL</option>
                  <option value="MAX">MAX</option>
                  <option value="MAX+">MAX+</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="XL">XL</option>
                  <option value="VIP">VIP</option>
                  <option value="Rozšířená asistence 150km">Rozšířená asistence 150km</option>
                  <option value="Rozšířená asistence 750km">Rozšířená asistence 750km</option>
                </select>
              ) : (
                assistanceLabel(contract?.carAssistancePlan ?? fields.carAssistancePlan)
              )}
            </span>
          </div>
        </div>
      </div>

      {(editMode || hasHullData) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Car} label="Havarijní pojištění" />
          <div className="text-sm text-slate-900 space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Pojistná částka</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.carHullSumInsured}
                    onChange={(e) => onChange("carHullSumInsured", e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
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
              <span className="text-slate-600">Spoluúčast</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="text"
                    value={fields.carHullDeductible}
                    onChange={(e) => onChange("carHullDeductible", e.target.value)}
                    className="w-56 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                    placeholder="např. 10 % (min. 10.000 Kč)"
                  />
                ) : (contract?.carHullDeductibleText?.trim() ?? "") !== "" ? (
                  contract?.carHullDeductibleText?.trim()
                ) : contract?.carHullDeductible != null ? (
                  formatMoney(contract.carHullDeductible)
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="pt-1 space-y-1">
              {[
                {
                  key: "carHullRiskAccident",
                  label: "Havárie",
                  checked: fields.carHullRiskAccident,
                },
                {
                  key: "carHullRiskTheft",
                  label: "Odcizení",
                  checked: fields.carHullRiskTheft,
                },
                {
                  key: "carHullRiskNatural",
                  label: "Živel",
                  checked: fields.carHullRiskNatural,
                },
                {
                  key: "carHullRiskVandalism",
                  label: "Vandalismus",
                  checked: fields.carHullRiskVandalism,
                },
                {
                  key: "carHullRiskAnimalCollision",
                  label: "Střet se zvířetem",
                  checked: fields.carHullRiskAnimalCollision,
                },
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
        </div>
      )}

      <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <SectionTitle icon={Wrench} label="Připojištění" />
        <div className="space-y-1">
          {[
            { key: "carAddonEso", label: "ESO", checked: fields.carAddonEso },
            {
              key: "carAddonNaturalRisks",
              label: "Pojištění PŘÍRODNÍCH RIZIK",
              checked: fields.carAddonNaturalRisks,
            },
            { key: "carAddonKlika", label: "Pojištění KLIKA", checked: fields.carAddonKlika },
            { key: "carAddonGlass", label: "Skla", checked: fields.carAddonGlass },
            { key: "carAddonAnimalCollision", label: "Střet se zvěří", checked: fields.carAddonAnimalCollision },
            { key: "carAddonAnimalDamage", label: "Poškození zvěří", checked: fields.carAddonAnimalDamage },
            { key: "carAddonVandalism", label: "Vandalismus", checked: fields.carAddonVandalism },
            { key: "carAddonTheft", label: "Odcizení", checked: fields.carAddonTheft },
            { key: "carAddonNatural", label: "Živel", checked: fields.carAddonNatural },
            { key: "carAddonOwnDamage", label: "Poškození vlastního vozidla", checked: fields.carAddonOwnDamage },
            { key: "carAddonPothole", label: "Výmol", checked: fields.carAddonPothole },
            {
              key: "carAddonNonFaultAccident",
              label: "Pojištění nezaviněné nehody",
              checked: fields.carAddonNonFaultAccident,
            },
            { key: "carAddonGap", label: "GAP", checked: fields.carAddonGap },
            { key: "carAddonSmartGap", label: "SmartGAP", checked: fields.carAddonSmartGap },
            { key: "carAddonServisPro", label: "Servis PRO", checked: fields.carAddonServisPro },
            {
              key: "carAddonReplacementCar",
              label: "Pojištění náhradního vozidla",
              checked: fields.carAddonReplacementCar,
            },
            {
              key: "carAddonLuggage",
              label: "Pojištění zavazadel, nosičů a boxů",
              checked: fields.carAddonLuggage,
            },
            {
              key: "carAddonTransportedGoods",
              label: "Pojištění dopravovaných věcí",
              checked: fields.carAddonTransportedGoods,
            },
            { key: "carAddonPassengerInjury", label: "Úraz všech osob", checked: fields.carAddonPassengerInjury },
            { key: "carAddonKeyLossTheft", label: "Ztráta a odcizení klíčů", checked: fields.carAddonKeyLossTheft },
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
