"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CarFront,
  CheckCircle2,
  LifeBuoy,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export type AutoPdfEditorTextField =
  | "carMake"
  | "carPlate"
  | "carVin"
  | "carTp"
  | "carOrv"
  | "carAnnualMileage"
  | "carAllianzScope"
  | "carLiabilityLimit"
  | "carHullSumInsured"
  | "carHullDeductible"
  | "carAssistancePlan"
  | "carAddonGlassLimit"
  | "carAddonAnimalCollisionLimit"
  | "carAddonAnimalDamageLimit"
  | "carAddonTheftLimit"
  | "carAddonNaturalLimit"
  | "carAddonOwnDamageLimit"
  | "carAddonGapLimit";

export type AutoPdfEditorBooleanField =
  | "carHullRiskAccident"
  | "carHullRiskTheft"
  | "carHullRiskNatural"
  | "carHullRiskVandalism"
  | "carHullRiskAnimalCollision"
  | "carAddonEso"
  | "carAddonNaturalRisks"
  | "carAddonKlika"
  | "carAddonGlass"
  | "carAddonAnimalCollision"
  | "carAddonAnimalDamage"
  | "carAddonVandalism"
  | "carAddonTheft"
  | "carAddonNatural"
  | "carAddonOwnDamage"
  | "carAddonGap"
  | "carAddonSmartGap"
  | "carAddonServisPro"
  | "carAddonFireExplosion"
  | "carAddonLegalAdvice"
  | "carAddonReplacementCar"
  | "carAddonLuggage"
  | "carAddonTransportedGoods"
  | "carAddonPothole"
  | "carAddonNonFaultAccident"
  | "carAddonPassengerInjury"
  | "carAddonKeyLossTheft";

export type AutoPdfDetailEditorFields = Record<AutoPdfEditorTextField, string> &
  Record<AutoPdfEditorBooleanField, boolean> & {
    showTp: boolean;
    showAnnualMileage: boolean;
    showAllianzScope: boolean;
    showHull: boolean;
    showHullRisks: boolean;
    showAssistance: boolean;
    canUseHullUsualPrice: boolean;
    hullUsualPriceSelected: boolean;
    visibleAddons: AutoPdfEditorBooleanField[];
  };

type Props = {
  fields: AutoPdfDetailEditorFields;
  onTextChange: (field: AutoPdfEditorTextField, value: string) => void;
  onBooleanChange: (field: AutoPdfEditorBooleanField, value: boolean) => void;
  onHullUsualPriceChange: (value: boolean) => void;
};

const ASSISTANCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Vyber asistenci" },
  { value: "zakladni", label: "Základní" },
  { value: "standard", label: "Standard" },
  { value: "Nadstandard", label: "Nadstandard" },
  { value: "Bez limitu", label: "Bez limitu" },
  { value: "plus", label: "PLUS" },
  { value: "plus_dvojnasob", label: "PLUS Dvojnásob" },
  { value: "cr_bez_limitu", label: "CAR PLUS v ČR bez limitu" },
  { value: "evropa_cr_bez_limitu", label: "CAR PREMIUM ČR a EVROPA bez limitu" },
  { value: "ZÁKLAD", label: "ZÁKLAD" },
  { value: "IDEÁL", label: "IDEÁL" },
  { value: "MAX", label: "MAX" },
  { value: "MAX+", label: "MAX+" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "XL", label: "XL" },
  { value: "VIP", label: "VIP" },
  { value: "Rozšířená asistence 150km", label: "Rozšířená asistence 150km" },
  { value: "Rozšířená asistence 750km", label: "Rozšířená asistence 750km" },
  { value: "Odtah 50 km při nehodě", label: "Odtah 50 km při nehodě" },
  { value: "Odtah 50 km", label: "Odtah 50 km" },
  { value: "Odtah v ČR neomezeně", label: "Odtah v ČR neomezeně" },
  { value: "Odtah i ze zahraničí", label: "Odtah i ze zahraničí" },
];

const ADDON_LABELS: Record<AutoPdfEditorBooleanField, string> = {
  carHullRiskAccident: "Havárie",
  carHullRiskTheft: "Odcizení",
  carHullRiskNatural: "Živel",
  carHullRiskVandalism: "Vandalismus",
  carHullRiskAnimalCollision: "Střet se zvířetem",
  carAddonEso: "ESO",
  carAddonNaturalRisks: "Pojištění přírodních rizik",
  carAddonKlika: "Pojištění KLIKA",
  carAddonGlass: "Skla",
  carAddonAnimalCollision: "Střet se zvěří",
  carAddonAnimalDamage: "Poškození zvěří",
  carAddonVandalism: "Vandalismus",
  carAddonTheft: "Odcizení",
  carAddonNatural: "Živel",
  carAddonOwnDamage: "Poškození vlastního vozidla",
  carAddonGap: "GAP",
  carAddonSmartGap: "SmartGAP",
  carAddonServisPro: "Servis PRO",
  carAddonFireExplosion: "Požár/výbuch",
  carAddonLegalAdvice: "Právní poradenství",
  carAddonReplacementCar: "Náhradní vozidlo",
  carAddonLuggage: "Zavazadla, nosiče a boxy",
  carAddonTransportedGoods: "Dopravované věci",
  carAddonPothole: "Výmol",
  carAddonNonFaultAccident: "Pojištění nezaviněné nehody",
  carAddonPassengerInjury: "Úraz všech osob",
  carAddonKeyLossTheft: "Ztráta/odcizení klíčů",
};

const ADDON_LIMIT_FIELDS: Partial<Record<AutoPdfEditorBooleanField, AutoPdfEditorTextField>> = {
  carAddonGlass: "carAddonGlassLimit",
  carAddonAnimalCollision: "carAddonAnimalCollisionLimit",
  carAddonAnimalDamage: "carAddonAnimalDamageLimit",
  carAddonTheft: "carAddonTheftLimit",
  carAddonNatural: "carAddonNaturalLimit",
  carAddonOwnDamage: "carAddonOwnDamageLimit",
  carAddonGap: "carAddonGapLimit",
};

function EditSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase leading-none text-slate-500">
        <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase leading-tight text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
      />
    </label>
  );
}

function TogglePill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        checked
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <CheckCircle2 size={14} strokeWidth={2.35} aria-hidden="true" />
      {label}
    </label>
  );
}

function AddonTogglePillWithLimit({
  label,
  checked,
  limit,
  onCheckedChange,
  onLimitChange,
}: {
  label: string;
  checked: boolean;
  limit: string;
  onCheckedChange: (value: boolean) => void;
  onLimitChange: (value: string) => void;
}) {
  return (
    <div
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        checked
          ? "rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      <button
        type="button"
        onClick={() => onCheckedChange(!checked)}
        className="inline-flex items-center gap-2"
      >
        <CheckCircle2 size={14} strokeWidth={2.35} aria-hidden="true" />
        {label}
      </button>
      {checked && (
        <span className="inline-flex items-center gap-1.5 border-l border-emerald-200 pl-2">
          <span className="text-[9px] font-bold uppercase leading-none text-emerald-700/80">
            Limit
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={limit}
            onChange={(event) => onLimitChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            className="h-7 w-24 rounded-full border border-emerald-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="částka"
          />
        </span>
      )}
    </div>
  );
}

export function CalculatorAutoPdfDetailEditor({
  fields,
  onTextChange,
  onBooleanChange,
  onHullUsualPriceChange,
}: Props) {
  const hullRiskFields: AutoPdfEditorBooleanField[] = [
    "carHullRiskAccident",
    "carHullRiskTheft",
    "carHullRiskNatural",
    "carHullRiskVandalism",
    "carHullRiskAnimalCollision",
  ];

  return (
    <div className="space-y-4 pt-3">
      <EditSection title="Vozidlo" icon={CarFront}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            label="Značka/model"
            value={fields.carMake}
            onChange={(value) => onTextChange("carMake", value)}
          />
          <TextInput
            label="RZ"
            value={fields.carPlate}
            onChange={(value) => onTextChange("carPlate", value)}
          />
          <TextInput
            label="VIN"
            value={fields.carVin}
            onChange={(value) => onTextChange("carVin", value)}
          />
          {fields.showTp && (
            <TextInput
              label="TP"
              value={fields.carTp}
              onChange={(value) => onTextChange("carTp", value)}
            />
          )}
          <TextInput
            label="ORV"
            value={fields.carOrv}
            onChange={(value) => onTextChange("carOrv", value)}
          />
          {fields.showAnnualMileage && (
            <TextInput
              label="Roční nájezd"
              value={fields.carAnnualMileage}
              onChange={(value) => onTextChange("carAnnualMileage", value)}
            />
          )}
          {fields.showAllianzScope && (
            <TextInput
              label="Rozsah Allianz"
              value={fields.carAllianzScope}
              onChange={(value) => onTextChange("carAllianzScope", value)}
            />
          )}
        </div>
      </EditSection>

      <EditSection title="Povinné ručení" icon={ShieldCheck}>
        <TextInput
          label="Limit odpovědnosti"
          value={fields.carLiabilityLimit}
          placeholder="např. 200000000"
          onChange={(value) => onTextChange("carLiabilityLimit", value)}
        />
      </EditSection>

      {fields.showHull && (
        <EditSection title="Havarijní pojištění" icon={Banknote}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput
              label="Pojistná částka"
              value={fields.carHullSumInsured}
              disabled={fields.hullUsualPriceSelected}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("carHullSumInsured", value)}
            />
            <TextInput
              label="Spoluúčast"
              value={fields.carHullDeductible}
              placeholder="např. 5 % (min. 5.000 Kč)"
              onChange={(value) => onTextChange("carHullDeductible", value)}
            />
          </div>
          {fields.canUseHullUsualPrice && (
            <div className="mt-2">
              <TogglePill
                label="Obvyklá cena vozidla"
                checked={fields.hullUsualPriceSelected}
                onChange={onHullUsualPriceChange}
              />
            </div>
          )}
          {fields.showHullRisks && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hullRiskFields.map((field) => (
                <TogglePill
                  key={field}
                  label={ADDON_LABELS[field]}
                  checked={fields[field]}
                  onChange={(value) => onBooleanChange(field, value)}
                />
              ))}
            </div>
          )}
        </EditSection>
      )}

      {fields.showAssistance && (
        <EditSection title="Asistence" icon={LifeBuoy}>
          <label className="mb-3 block">
            <span className="mb-1 block text-[10px] font-bold uppercase leading-tight text-slate-500">
              Asistence
            </span>
            <select
              value={fields.carAssistancePlan}
              onChange={(event) => onTextChange("carAssistancePlan", event.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              {ASSISTANCE_OPTIONS.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </EditSection>
      )}

      <EditSection title="Připojištění" icon={Wrench}>
        <div className="flex flex-wrap gap-2">
          {fields.visibleAddons.map((field) => {
            const limitField = ADDON_LIMIT_FIELDS[field];
            return limitField ? (
              <AddonTogglePillWithLimit
                key={field}
                label={ADDON_LABELS[field]}
                checked={fields[field]}
                limit={fields[limitField]}
                onCheckedChange={(value) => onBooleanChange(field, value)}
                onLimitChange={(value) => onTextChange(limitField, value)}
              />
            ) : (
              <TogglePill
                key={field}
                label={ADDON_LABELS[field]}
                checked={fields[field]}
                onChange={(value) => onBooleanChange(field, value)}
              />
            );
          })}
        </div>
      </EditSection>
    </div>
  );
}
