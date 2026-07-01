"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Bandage,
  BedDouble,
  BriefcaseMedical,
  CheckCircle2,
  FileBadge2,
  HandHeart,
  HeartPulse,
  Shield,
  Stethoscope,
} from "lucide-react";

export type NeonPdfEditorTextField =
  | "version"
  | "deathType"
  | "deathAmount"
  | "death2Type"
  | "death2Amount"
  | "deathTerminalAmount"
  | "invalidityAType"
  | "invalidityA1"
  | "invalidityA2"
  | "invalidityA3"
  | "invalidityBType"
  | "invalidityB1"
  | "invalidityB2"
  | "invalidityB3"
  | "criticalType"
  | "criticalVariant"
  | "criticalAmount"
  | "childSurgeryAmount"
  | "vaccinationCompAmount"
  | "diabetesAmount"
  | "deathAccidentAmount"
  | "injuryPermanentAmount"
  | "injuryPermanentFulfillmentFrom"
  | "injuryPermanentProgression"
  | "injuryPermanent2Amount"
  | "injuryPermanent2FulfillmentFrom"
  | "injuryPermanent2Progression"
  | "hospitalizationAmount"
  | "hospitalizationIllnessAmount"
  | "hospitalizationInjuryAmount"
  | "accidentDailyBenefitStart"
  | "accidentDailyBenefitBackpay"
  | "accidentDailyBenefit"
  | "workIncapacityStart"
  | "workIncapacityBackpay"
  | "workIncapacityAmount"
  | "workIncapacity2Start"
  | "workIncapacity2Backpay"
  | "workIncapacity2Amount"
  | "careDependencyAmount"
  | "specialAidAmount"
  | "caregivingAmount"
  | "reproductionCostAmount"
  | "liabilityCitizenLimit"
  | "liabilityEmployeeLimit";

export type NeonPdfEditorBooleanField =
  | "waiverInvalidity"
  | "waiverUnemployment"
  | "invalidityPension"
  | "workIncapacityInjury"
  | "workIncapacityIllness"
  | "workIncapacity2Injury"
  | "workIncapacity2Illness"
  | "cppHelp"
  | "travelInsurance";

export type NeonPdfDetailEditorFields = Record<NeonPdfEditorTextField, string> &
  Record<NeonPdfEditorBooleanField, boolean>;

type Props = {
  fields: NeonPdfDetailEditorFields;
  onTextChange: (field: NeonPdfEditorTextField, value: string) => void;
  onBooleanChange: (field: NeonPdfEditorBooleanField, value: boolean) => void;
};

export const createEmptyNeonPdfDetailFields = (): NeonPdfDetailEditorFields => ({
  version: "",
  deathType: "",
  deathAmount: "",
  death2Type: "",
  death2Amount: "",
  deathTerminalAmount: "",
  waiverInvalidity: false,
  waiverUnemployment: false,
  invalidityAType: "",
  invalidityA1: "",
  invalidityA2: "",
  invalidityA3: "",
  invalidityBType: "",
  invalidityB1: "",
  invalidityB2: "",
  invalidityB3: "",
  invalidityPension: false,
  criticalType: "",
  criticalVariant: "",
  criticalAmount: "",
  childSurgeryAmount: "",
  vaccinationCompAmount: "",
  diabetesAmount: "",
  deathAccidentAmount: "",
  injuryPermanentAmount: "",
  injuryPermanentFulfillmentFrom: "",
  injuryPermanentProgression: "",
  injuryPermanent2Amount: "",
  injuryPermanent2FulfillmentFrom: "",
  injuryPermanent2Progression: "",
  hospitalizationAmount: "",
  hospitalizationIllnessAmount: "",
  hospitalizationInjuryAmount: "",
  accidentDailyBenefitStart: "",
  accidentDailyBenefitBackpay: "",
  accidentDailyBenefit: "",
  workIncapacityStart: "",
  workIncapacityBackpay: "",
  workIncapacityAmount: "",
  workIncapacityInjury: false,
  workIncapacityIllness: false,
  workIncapacity2Start: "",
  workIncapacity2Backpay: "",
  workIncapacity2Amount: "",
  workIncapacity2Injury: false,
  workIncapacity2Illness: false,
  careDependencyAmount: "",
  specialAidAmount: "",
  caregivingAmount: "",
  reproductionCostAmount: "",
  cppHelp: false,
  liabilityCitizenLimit: "",
  liabilityEmployeeLimit: "",
  travelInsurance: false,
});

const VERSION_OPTIONS = [
  { value: "", label: "Vyber verzi" },
  { value: "neon_life", label: "NEON Life" },
  { value: "neon_risk", label: "NEON Risk" },
  { value: "neon_life_kids", label: "NEON Life Dětské" },
  { value: "neon_risk_kids", label: "NEON Risk Dětské" },
];

const SUM_TYPE_OPTIONS = [
  { value: "", label: "Typ" },
  { value: "konstantni", label: "Konstantní" },
  { value: "klesajici", label: "Klesající" },
  { value: "klesajici_urok", label: "Klesající dle úroku" },
];

const CRITICAL_VARIANT_OPTIONS = [
  { value: "", label: "Vyber variantu" },
  { value: "zakladni", label: "Základní" },
  { value: "rozsirena_in_situ", label: "Rozšířená včetně formy in situ" },
  { value: "maxi_in_situ", label: "Maxi včetně formy in situ" },
];

const INCAPACITY_START_OPTIONS = [
  { value: "", label: "Vyber den" },
  { value: "15", label: "15. dne" },
  { value: "29", label: "29. dne" },
  { value: "60", label: "60. dne" },
];

const INCAPACITY_BACKPAY_OPTIONS = [
  { value: "", label: "Vyber" },
  { value: "zpetne", label: "Zpětně" },
  { value: "nezpetne", label: "Nezpětně" },
];

const INJURY_PERMANENT_FULFILLMENT_OPTIONS = [
  { value: "", label: "Vyber" },
  { value: "0.001", label: "0,001 %" },
  { value: "10", label: "10 %" },
];

const INJURY_PERMANENT_PROGRESSION_OPTIONS = [
  { value: "", label: "Vyber progresi" },
  { value: "bez_progrese", label: "Bez progrese" },
  { value: "progrese_5x", label: "5x progrese" },
  { value: "progrese_10x", label: "10x progrese" },
];

const ACCIDENT_DAILY_START_OPTIONS = [
  { value: "", label: "Vyber den" },
  { value: "1", label: "1. dne" },
  { value: "22", label: "22. dne" },
];

const ACCIDENT_DAILY_BACKPAY_OPTIONS = [
  { value: "", label: "Vyber" },
  { value: "zpetne", label: "Zpětně od 1. dne" },
  { value: "zpetne_progrese", label: "Zpětně s progresí" },
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

function TypedAmountRow({
  label,
  typeValue,
  amountValue,
  onTypeChange,
  onAmountChange,
}: {
  label: string;
  typeValue: string;
  amountValue: string;
  onTypeChange: (value: string) => void;
  onAmountChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_10rem] sm:items-end">
      <div className="text-sm font-semibold text-slate-800 sm:pb-2.5">{label}</div>
      <SelectInput label="Typ" value={typeValue} options={SUM_TYPE_OPTIONS} onChange={onTypeChange} />
      <TextInput
        label="Částka"
        value={amountValue}
        placeholder="Částka v Kč"
        onChange={onAmountChange}
      />
    </div>
  );
}

export function CalculatorNeonPdfDetailEditor({
  fields,
  onTextChange,
  onBooleanChange,
}: Props) {
  return (
    <div className="space-y-4 pt-3">
      <EditSection title="Verze" icon={FileBadge2}>
        <SelectInput
          label="Verze produktu"
          value={fields.version}
          options={VERSION_OPTIONS}
          onChange={(value) => onTextChange("version", value)}
        />
      </EditSection>

      <EditSection title="Smrt" icon={HeartPulse}>
        <div className="space-y-3">
          <TypedAmountRow
            label="Smrt"
            typeValue={fields.deathType}
            amountValue={fields.deathAmount}
            onTypeChange={(value) => onTextChange("deathType", value)}
            onAmountChange={(value) => onTextChange("deathAmount", value)}
          />
          <TypedAmountRow
            label="Smrt (2)"
            typeValue={fields.death2Type}
            amountValue={fields.death2Amount}
            onTypeChange={(value) => onTextChange("death2Type", value)}
            onAmountChange={(value) => onTextChange("death2Amount", value)}
          />
          <TextInput
            label="Smrt nebo terminální stádium"
            value={fields.deathTerminalAmount}
            placeholder="Částka v Kč"
            onChange={(value) => onTextChange("deathTerminalAmount", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Zproštění od placení" icon={Shield}>
        <div className="flex flex-wrap gap-2">
          <TogglePill
            label="Invalidita"
            checked={fields.waiverInvalidity}
            onChange={(value) => onBooleanChange("waiverInvalidity", value)}
          />
          <TogglePill
            label="Ztráta zaměstnání"
            checked={fields.waiverUnemployment}
            onChange={(value) => onBooleanChange("waiverUnemployment", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Invalidita" icon={Accessibility}>
        <div className="space-y-3">
          <SelectInput
            label="Typ invalidity"
            value={fields.invalidityAType}
            options={SUM_TYPE_OPTIONS}
            onChange={(value) => onTextChange("invalidityAType", value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextInput
              label="1. stupeň"
              value={fields.invalidityA1}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("invalidityA1", value)}
            />
            <TextInput
              label="2. stupeň"
              value={fields.invalidityA2}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("invalidityA2", value)}
            />
            <TextInput
              label="3. stupeň"
              value={fields.invalidityA3}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("invalidityA3", value)}
            />
          </div>
          <SelectInput
            label="Typ invalidity (2)"
            value={fields.invalidityBType}
            options={SUM_TYPE_OPTIONS}
            onChange={(value) => onTextChange("invalidityBType", value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextInput
              label="1. stupeň (2)"
              value={fields.invalidityB1}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("invalidityB1", value)}
            />
            <TextInput
              label="2. stupeň (2)"
              value={fields.invalidityB2}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("invalidityB2", value)}
            />
            <TextInput
              label="3. stupeň (2)"
              value={fields.invalidityB3}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("invalidityB3", value)}
            />
          </div>
          <TogglePill
            label="Invalidita s výplatou důchodu"
            checked={fields.invalidityPension}
            onChange={(value) => onBooleanChange("invalidityPension", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Závažná onemocnění" icon={Stethoscope}>
        <div className="space-y-3">
          <SelectInput
            label="Varianta"
            value={fields.criticalVariant}
            options={CRITICAL_VARIANT_OPTIONS}
            onChange={(value) => onTextChange("criticalVariant", value)}
          />
          <TypedAmountRow
            label="Závažná onemocnění a poranění"
            typeValue={fields.criticalType}
            amountValue={fields.criticalAmount}
            onTypeChange={(value) => onTextChange("criticalType", value)}
            onAmountChange={(value) => onTextChange("criticalAmount", value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextInput
              label="Operace dítěte"
              value={fields.childSurgeryAmount}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("childSurgeryAmount", value)}
            />
            <TextInput
              label="Následky očkování"
              value={fields.vaccinationCompAmount}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("vaccinationCompAmount", value)}
            />
            <TextInput
              label="Cukrovka"
              value={fields.diabetesAmount}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("diabetesAmount", value)}
            />
          </div>
        </div>
      </EditSection>

      <EditSection title="Úrazová rizika" icon={Bandage}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput
              label="Smrt úrazem"
              value={fields.deathAccidentAmount}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("deathAccidentAmount", value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectInput
              label="Denní odškodné - plnění od"
              value={fields.accidentDailyBenefitStart}
              options={ACCIDENT_DAILY_START_OPTIONS}
              onChange={(value) => onTextChange("accidentDailyBenefitStart", value)}
            />
            <SelectInput
              label="Denní odškodné - zpětně"
              value={fields.accidentDailyBenefitBackpay}
              options={ACCIDENT_DAILY_BACKPAY_OPTIONS}
              onChange={(value) => onTextChange("accidentDailyBenefitBackpay", value)}
            />
            <TextInput
              label="Denní odškodné úrazem"
              value={fields.accidentDailyBenefit}
              placeholder="Denní částka"
              onChange={(value) => onTextChange("accidentDailyBenefit", value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextInput
              label="Trvalé následky úrazu"
              value={fields.injuryPermanentAmount}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("injuryPermanentAmount", value)}
            />
            <SelectInput
              label="Plnění od"
              value={fields.injuryPermanentFulfillmentFrom}
              options={INJURY_PERMANENT_FULFILLMENT_OPTIONS}
              onChange={(value) => onTextChange("injuryPermanentFulfillmentFrom", value)}
            />
            <SelectInput
              label="Progrese"
              value={fields.injuryPermanentProgression}
              options={INJURY_PERMANENT_PROGRESSION_OPTIONS}
              onChange={(value) => onTextChange("injuryPermanentProgression", value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextInput
              label="Trvalé následky úrazu (2)"
              value={fields.injuryPermanent2Amount}
              placeholder="Částka v Kč"
              onChange={(value) => onTextChange("injuryPermanent2Amount", value)}
            />
            <SelectInput
              label="Plnění od (2)"
              value={fields.injuryPermanent2FulfillmentFrom}
              options={INJURY_PERMANENT_FULFILLMENT_OPTIONS}
              onChange={(value) => onTextChange("injuryPermanent2FulfillmentFrom", value)}
            />
            <SelectInput
              label="Progrese (2)"
              value={fields.injuryPermanent2Progression}
              options={INJURY_PERMANENT_PROGRESSION_OPTIONS}
              onChange={(value) => onTextChange("injuryPermanent2Progression", value)}
            />
          </div>
        </div>
      </EditSection>

      <EditSection title="Hospitalizace" icon={BedDouble}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            label="Hospitalizace"
            value={fields.hospitalizationAmount}
            placeholder="Denní částka"
            onChange={(value) => onTextChange("hospitalizationAmount", value)}
          />
          <TextInput
            label="Hospitalizace nemoc"
            value={fields.hospitalizationIllnessAmount}
            placeholder="Denní částka"
            onChange={(value) => onTextChange("hospitalizationIllnessAmount", value)}
          />
          <TextInput
            label="Hospitalizace úraz"
            value={fields.hospitalizationInjuryAmount}
            placeholder="Denní částka"
            onChange={(value) => onTextChange("hospitalizationInjuryAmount", value)}
          />
        </div>
      </EditSection>

      <EditSection title="Pracovní neschopnost" icon={BriefcaseMedical}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <TogglePill
              label="Nemoc"
              checked={fields.workIncapacityIllness}
              onChange={(value) => onBooleanChange("workIncapacityIllness", value)}
            />
            <TogglePill
              label="Úraz"
              checked={fields.workIncapacityInjury}
              onChange={(value) => onBooleanChange("workIncapacityInjury", value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectInput
              label="Plnění od"
              value={fields.workIncapacityStart}
              options={INCAPACITY_START_OPTIONS}
              onChange={(value) => onTextChange("workIncapacityStart", value)}
            />
            <SelectInput
              label="Zpětné plnění"
              value={fields.workIncapacityBackpay}
              options={INCAPACITY_BACKPAY_OPTIONS}
              onChange={(value) => onTextChange("workIncapacityBackpay", value)}
            />
            <TextInput
              label="Denní částka"
              value={fields.workIncapacityAmount}
              placeholder="Denní částka"
              onChange={(value) => onTextChange("workIncapacityAmount", value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <TogglePill
              label="Nemoc (2)"
              checked={fields.workIncapacity2Illness}
              onChange={(value) => onBooleanChange("workIncapacity2Illness", value)}
            />
            <TogglePill
              label="Úraz (2)"
              checked={fields.workIncapacity2Injury}
              onChange={(value) => onBooleanChange("workIncapacity2Injury", value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectInput
              label="Plnění od (2)"
              value={fields.workIncapacity2Start}
              options={INCAPACITY_START_OPTIONS}
              onChange={(value) => onTextChange("workIncapacity2Start", value)}
            />
            <SelectInput
              label="Zpětné plnění (2)"
              value={fields.workIncapacity2Backpay}
              options={INCAPACITY_BACKPAY_OPTIONS}
              onChange={(value) => onTextChange("workIncapacity2Backpay", value)}
            />
            <TextInput
              label="Denní částka (2)"
              value={fields.workIncapacity2Amount}
              placeholder="Denní částka"
              onChange={(value) => onTextChange("workIncapacity2Amount", value)}
            />
          </div>
        </div>
      </EditSection>

      <EditSection title="Péče a ostatní" icon={HandHeart}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            label="Závislost na péči"
            value={fields.careDependencyAmount}
            placeholder="Měsíční částka"
            onChange={(value) => onTextChange("careDependencyAmount", value)}
          />
          <TextInput
            label="Zvláštní pomůcka"
            value={fields.specialAidAmount}
            placeholder="Částka v Kč"
            onChange={(value) => onTextChange("specialAidAmount", value)}
          />
          <TextInput
            label="Celodenní ošetřování"
            value={fields.caregivingAmount}
            placeholder="Denní částka"
            onChange={(value) => onTextChange("caregivingAmount", value)}
          />
          <TextInput
            label="Asistovaná reprodukce"
            value={fields.reproductionCostAmount}
            placeholder="Částka v Kč"
            onChange={(value) => onTextChange("reproductionCostAmount", value)}
          />
          <TextInput
            label="Odpovědnost občana"
            value={fields.liabilityCitizenLimit}
            placeholder="Limit v Kč"
            onChange={(value) => onTextChange("liabilityCitizenLimit", value)}
          />
          <TextInput
            label="Odpovědnost zaměstnance"
            value={fields.liabilityEmployeeLimit}
            placeholder="Limit v Kč"
            onChange={(value) => onTextChange("liabilityEmployeeLimit", value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <TogglePill
            label="ČPP Pomoc"
            checked={fields.cppHelp}
            onChange={(value) => onBooleanChange("cppHelp", value)}
          />
          <TogglePill
            label="Cestovní pojištění"
            checked={fields.travelInsurance}
            onChange={(value) => onBooleanChange("travelInsurance", value)}
          />
        </div>
      </EditSection>

    </div>
  );
}
