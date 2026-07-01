"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  FileText,
  House,
  HousePlus,
  LifeBuoy,
  Shield,
  Sofa,
} from "lucide-react";

export type DomexPdfEditorTextField =
  | "address"
  | "propertyType"
  | "propertyCoverage"
  | "sumInsured"
  | "deductible"
  | "outbuildingSumInsured"
  | "householdType"
  | "householdCoverage"
  | "householdSumInsured"
  | "householdDeductible"
  | "liabilitySumInsured"
  | "liabilityDeductible"
  | "note";

export type DomexPdfEditorBooleanField =
  | "liabilityMobile"
  | "liabilityTenant"
  | "liabilityLandlord"
  | "assistancePlus";

export type DomexPdfDetailEditorFields = Record<DomexPdfEditorTextField, string> &
  Record<DomexPdfEditorBooleanField, boolean>;

type Props = {
  fields: DomexPdfDetailEditorFields;
  onTextChange: (field: DomexPdfEditorTextField, value: string) => void;
  onBooleanChange: (field: DomexPdfEditorBooleanField, value: boolean) => void;
};

const PROPERTY_TYPE_OPTIONS = [
  { value: "", label: "Vyber typ" },
  { value: "byt", label: "Byt" },
  { value: "dum", label: "Dům" },
  { value: "chata", label: "Chata" },
  { value: "rekreace", label: "Rekreační objekt" },
  { value: "ostatni", label: "Ostatní" },
];

const HOUSEHOLD_TYPE_OPTIONS = [
  { value: "", label: "Vyber typ" },
  { value: "trvale", label: "Trvale obydlená" },
  { value: "rekreacni", label: "Rekreační" },
];

const COVERAGE_OPTIONS = [
  { value: "", label: "Vyber rozsah" },
  { value: "mini", label: "MINI" },
  { value: "opti", label: "OPTI" },
  { value: "maxi", label: "MAXI" },
  { value: "vip", label: "VIP" },
  { value: "nop", label: "NOP" },
];

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
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
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
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase leading-tight text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      >
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

export function CalculatorDomexPdfDetailEditor({
  fields,
  onTextChange,
  onBooleanChange,
}: Props) {
  return (
    <div className="space-y-4 pt-3">
      <EditSection title="Pojištění stavby" icon={House}>
        <div className="mb-3">
          <TextInput
            label="Adresa"
            value={fields.address}
            placeholder="Místo pojištění"
            onChange={(value) => onTextChange("address", value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectInput
            label="Typ nemovitosti"
            value={fields.propertyType}
            options={PROPERTY_TYPE_OPTIONS}
            onChange={(value) => onTextChange("propertyType", value)}
          />
          <SelectInput
            label="Rozsah"
            value={fields.propertyCoverage}
            options={COVERAGE_OPTIONS}
            onChange={(value) => onTextChange("propertyCoverage", value)}
          />
          <TextInput
            label="Pojistná částka"
            value={fields.sumInsured}
            placeholder="Částka v Kč"
            onChange={(value) => onTextChange("sumInsured", value)}
          />
          <TextInput
            label="Spoluúčast"
            value={fields.deductible}
            placeholder="Spoluúčast v Kč"
            onChange={(value) => onTextChange("deductible", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Vedlejší stavby" icon={HousePlus}>
        <TextInput
          label="Pojistná částka"
          value={fields.outbuildingSumInsured}
          placeholder="Částka v Kč"
          onChange={(value) => onTextChange("outbuildingSumInsured", value)}
        />
      </EditSection>

      <EditSection title="Pojištění domácnosti" icon={Sofa}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectInput
            label="Typ"
            value={fields.householdType}
            options={HOUSEHOLD_TYPE_OPTIONS}
            onChange={(value) => onTextChange("householdType", value)}
          />
          <SelectInput
            label="Rozsah"
            value={fields.householdCoverage}
            options={COVERAGE_OPTIONS}
            onChange={(value) => onTextChange("householdCoverage", value)}
          />
          <TextInput
            label="Pojistná částka"
            value={fields.householdSumInsured}
            placeholder="Částka v Kč"
            onChange={(value) => onTextChange("householdSumInsured", value)}
          />
          <TextInput
            label="Spoluúčast"
            value={fields.householdDeductible}
            placeholder="Spoluúčast v Kč"
            onChange={(value) => onTextChange("householdDeductible", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Pojištění odpovědnosti" icon={Shield}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            label="Pojistná částka"
            value={fields.liabilitySumInsured}
            placeholder="Částka v Kč"
            onChange={(value) => onTextChange("liabilitySumInsured", value)}
          />
          <TextInput
            label="Spoluúčast"
            value={fields.liabilityDeductible}
            placeholder="Spoluúčast v Kč"
            onChange={(value) => onTextChange("liabilityDeductible", value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <TogglePill
            label="Náhrada újmy mobilní elektronice"
            checked={fields.liabilityMobile}
            onChange={(value) => onBooleanChange("liabilityMobile", value)}
          />
          <TogglePill
            label="Odpovědnost nájemce na věci nemovité"
            checked={fields.liabilityTenant}
            onChange={(value) => onBooleanChange("liabilityTenant", value)}
          />
          <TogglePill
            label="Odpovědnost pronajímatele"
            checked={fields.liabilityLandlord}
            onChange={(value) => onBooleanChange("liabilityLandlord", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Asistence" icon={LifeBuoy}>
        <div className="flex flex-wrap gap-2">
          <TogglePill
            label="Asistence PLUS"
            checked={fields.assistancePlus}
            onChange={(value) => onBooleanChange("assistancePlus", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Poznámka" icon={FileText}>
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase leading-tight text-slate-500">
            Poznámka
          </span>
          <textarea
            value={fields.note}
            onChange={(event) => onTextChange("note", event.target.value)}
            rows={3}
            placeholder="Poznámka k rizikům, rekonstrukci apod."
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </label>
      </EditSection>
    </div>
  );
}
