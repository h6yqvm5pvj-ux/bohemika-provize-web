import React, { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Activity,
  Baby,
  Bandage,
  BedDouble,
  BriefcaseMedical,
  CalendarCheck2,
  FileBadge2,
  HandHeart,
  HandHelping,
  HeartPulse,
  LifeBuoy,
  Plane,
  Shield,
  Sparkles,
  Stethoscope,
  Syringe,
  TriangleAlert,
  Wallet,
  Wrench,
} from "lucide-react";
import type { Product } from "@/app/types/domain";
import { parseNeonPdf } from "@/app/lib/parseNeonPdf";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";

export type NeonFields = {
  version: string;
  deathType: string;
  deathAmount: string;
  death2Type: string;
  death2Amount: string;
  deathTerminalAmount: string;
  waiverInvalidity: boolean;
  waiverUnemployment: boolean;
  invalidityAType: string;
  invalidityA1: string;
  invalidityA2: string;
  invalidityA3: string;
  invalidityBType: string;
  invalidityB1: string;
  invalidityB2: string;
  invalidityB3: string;
  invalidityPension: boolean;
  criticalType: string;
  criticalVariant: string;
  criticalAmount: string;
  childSurgeryAmount: string;
  vaccinationCompAmount: string;
  diabetesAmount: string;
  deathAccidentAmount: string;
  injuryPermanentAmount: string;
  injuryPermanentFulfillmentFrom: string;
  injuryPermanentProgression: string;
  injuryPermanent2Amount: string;
  injuryPermanent2FulfillmentFrom: string;
  injuryPermanent2Progression: string;
  hospitalizationAmount: string;
  hospitalizationIllnessAmount: string;
  hospitalizationInjuryAmount: string;
  accidentDailyBenefitStart: string;
  accidentDailyBenefitBackpay: string;
  accidentDailyBenefit: string;
  workIncapacityStart: string;
  workIncapacityBackpay: string;
  workIncapacityAmount: string;
  workIncapacityInjury: boolean;
  workIncapacityIllness: boolean;
  workIncapacity2Start: string;
  workIncapacity2Backpay: string;
  workIncapacity2Amount: string;
  workIncapacity2Injury: boolean;
  workIncapacity2Illness: boolean;
  careDependencyAmount: string;
  specialAidAmount: string;
  caregivingAmount: string;
  reproductionCostAmount: string;
  cppHelp: boolean;
  liabilityCitizenLimit: string;
  liabilityEmployeeLimit: string;
  travelInsurance: boolean;
};

export type NeonDetail = {
  version?: string | null;
  deathType?: string | null;
  deathAmount?: number | null;
  death2Type?: string | null;
  death2Amount?: number | null;
  deathTerminalAmount?: number | null;
  waiverInvalidity?: boolean | null;
  waiverUnemployment?: boolean | null;
  invalidityAType?: string | null;
  invalidityA1?: number | null;
  invalidityA2?: number | null;
  invalidityA3?: number | null;
  invalidityBType?: string | null;
  invalidityB1?: number | null;
  invalidityB2?: number | null;
  invalidityB3?: number | null;
  invalidityPension?: boolean | null;
  criticalIllnessType?: string | null;
  criticalIllnessVariant?: string | null;
  criticalIllnessAmount?: number | null;
  childSurgeryAmount?: number | null;
  vaccinationCompAmount?: number | null;
  diabetesAmount?: number | null;
  deathAccidentAmount?: number | null;
  injuryPermanentAmount?: number | null;
  injuryPermanentFulfillmentFrom?: string | null;
  injuryPermanentProgression?: string | null;
  injuryPermanent2Amount?: number | null;
  injuryPermanent2FulfillmentFrom?: string | null;
  injuryPermanent2Progression?: string | null;
  hospitalizationAmount?: number | null;
  hospitalizationIllnessAmount?: number | null;
  hospitalizationInjuryAmount?: number | null;
  accidentDailyBenefitStart?: string | null;
  accidentDailyBenefitBackpay?: string | null;
  accidentDailyBenefit?: number | null;
  workIncapacityStart?: string | null;
  workIncapacityBackpay?: string | null;
  workIncapacityAmount?: number | null;
  workIncapacityInjury?: boolean | null;
  workIncapacityIllness?: boolean | null;
  workIncapacity2Start?: string | null;
  workIncapacity2Backpay?: string | null;
  workIncapacity2Amount?: number | null;
  workIncapacity2Injury?: boolean | null;
  workIncapacity2Illness?: boolean | null;
  careDependencyAmount?: number | null;
  specialAidAmount?: number | null;
  caregivingAmount?: number | null;
  reproductionCostAmount?: number | null;
  cppHelp?: boolean | null;
  liabilityCitizenLimit?: number | null;
  liabilityEmployeeLimit?: number | null;
  travelInsurance?: boolean | null;
} | null;

type Props = {
  prod?: Product | null;
  editMode: boolean;
  fields: NeonFields;
  contract: NeonDetail;
  onChange: (key: keyof NeonFields, value: string | boolean) => void;
};

const formatMoney = (value: number | undefined | null) =>
  formatMoneyValue(value, {
    emptyValueLabel: "—",
    minFractionDigits: 2,
    maxFractionDigits: 2,
  });

const versionLabel = (val?: string | null) => {
  const map: Record<string, string> = {
    neon_life: "NEON Life",
    neon_risk: "NEON Risk",
    neon_life_kids: "NEON Life Dětské",
    neon_risk_kids: "NEON Risk Dětské",
  };
  if (!val) return "—";
  return map[val] ?? val;
};

const sumTypeLabel = (val?: string | null) => {
  const map: Record<string, string> = {
    konstantni: "Konstantní",
    klesajici: "Klesající",
    klesajici_urok: "Klesající dle úroku",
  };
  if (!val) return "—";
  return map[val] ?? val;
};

const criticalVariantLabel = (val?: string | null) => {
  const map: Record<string, string> = {
    zakladni: "Základní",
    rozsirena_in_situ: "Rozšířená včetně formy in situ",
    maxi_in_situ: "Maxi včetně formy in situ",
  };
  if (!val) return "—";
  return map[val] ?? val;
};

const criticalVariantOptions = [
  { value: "zakladni", label: "Základní" },
  { value: "rozsirena_in_situ", label: "Rozšířená včetně formy in situ" },
  { value: "maxi_in_situ", label: "Maxi včetně formy in situ" },
];

const accidentDailyStartLabel = (val?: string | null) => {
  if (!val) return "—";
  return `${val}. dne`;
};

const accidentDailyBackpayLabel = (val?: string | null) => {
  const map: Record<string, string> = {
    zpetne: "Zpětně od 1. dne",
    zpetne_progrese: "Zpětně s progresí",
  };
  if (!val) return "—";
  return map[val] ?? val;
};

const accidentDailyStartOptions = [
  { value: "1", label: "1. dne" },
  { value: "22", label: "22. dne" },
];

const accidentDailyBackpayOptions = [
  { value: "zpetne", label: "Zpětně od 1. dne" },
  { value: "zpetne_progrese", label: "Zpětně s progresí" },
];

const injuryPermanentFulfillmentLabel = (val?: string | null) => {
  if (!val) return "—";
  if (val === "0.001") return "0,001 %";
  if (val === "10") return "10 %";
  return val;
};

const injuryPermanentProgressionLabel = (val?: string | null) => {
  const map: Record<string, string> = {
    bez_progrese: "Bez progrese",
    progrese_5x: "5x progrese",
    progrese_10x: "10x progrese",
  };
  if (!val) return "—";
  return map[val] ?? val;
};

const ToggleRow = ({
  label,
  checked,
  onChange,
  disabled,
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

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900";

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

const sumTypeOptions = [
  { value: "konstantni", label: "Konstantní" },
  { value: "klesajici", label: "Klesající" },
  { value: "klesajici_urok", label: "Klesající dle úroku" },
];

const injuryPermanentFulfillmentOptions = [
  { value: "0.001", label: "0,001 %" },
  { value: "10", label: "10 %" },
];

const injuryPermanentProgressionOptions = [
  { value: "bez_progrese", label: "Bez progrese" },
  { value: "progrese_5x", label: "5x progrese" },
  { value: "progrese_10x", label: "10x progrese" },
];

const renderAmountRow = ({
  label,
  typeValue,
  amountValue,
  typeKey,
  amountKey,
  editMode,
  onChange,
  contractType,
  contractAmount,
  hideEmptyType = false,
}: {
  label: string;
  typeValue: string;
  amountValue: string;
  typeKey: keyof NeonFields;
  amountKey: keyof NeonFields;
  editMode: boolean;
  onChange: (key: keyof NeonFields, value: string | boolean) => void;
  contractType?: string | null;
  contractAmount?: number | null;
  hideEmptyType?: boolean;
}) => (
  <div className="space-y-1">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-slate-600 leading-tight">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:justify-end sm:gap-3">
        {editMode ? (
          <select
            value={typeValue}
            onChange={(e) => onChange(typeKey, e.target.value)}
            className={`${selectClass} w-28`}
          >
            <option value="">Typ</option>
            {sumTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          ) : (
          <span className="min-w-0 text-sm font-semibold text-right sm:min-w-[88px]">
            {(() => {
              const rawType = contractType ?? typeValue;
              if (!rawType && hideEmptyType) return "";
              return sumTypeLabel(rawType);
            })()}
          </span>
        )}
        <div className="min-w-0 text-right whitespace-nowrap sm:min-w-[120px]">
          {editMode ? (
            <input
              type="number"
              value={amountValue}
              onChange={(e) => onChange(amountKey, e.target.value)}
              className={inputClass}
              placeholder="částka"
            />
          ) : (
            <span className="text-sm font-semibold">
              {contractAmount != null && Number.isFinite(contractAmount)
                ? formatMoney(contractAmount)
                : amountValue
                ? `${amountValue} Kč`
                : "—"}
            </span>
          )}
        </div>
      </div>
    </div>
  </div>
);

export function NeonDetailPanel({ prod, editMode, fields, contract, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (prod !== "neon") return null;

  const applyField = (key: keyof NeonFields, value: string | boolean | number | null | undefined) => {
    if (value == null) return 0;
    if (typeof value === "string" && value.trim() === "") return 0;
    onChange(key, typeof value === "number" ? String(value) : value);
    return 1;
  };

  const handleImportPdf = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportStatus("Načítám PDF…");
    try {
      const parsed = await parseNeonPdf(file);
      const risks = parsed.riskFields;
      let applied = 0;
      if (risks) {
        applied += applyField("version", risks.version ?? "neon_life");
        applied += applyField("deathType", risks.deathType);
        applied += applyField("deathAmount", risks.deathAmount);
        applied += applyField("death2Type", risks.death2Type);
        applied += applyField("death2Amount", risks.death2Amount);
        applied += applyField("deathTerminalAmount", risks.deathTerminalAmount);
        applied += applyField("waiverInvalidity", risks.waiverInvalidity);
        applied += applyField("waiverUnemployment", risks.waiverUnemployment);
        applied += applyField("invalidityAType", risks.invalidityAType);
        applied += applyField("invalidityA1", risks.invalidityA1);
        applied += applyField("invalidityA2", risks.invalidityA2);
        applied += applyField("invalidityA3", risks.invalidityA3);
        applied += applyField("invalidityBType", risks.invalidityBType);
        applied += applyField("invalidityB1", risks.invalidityB1);
        applied += applyField("invalidityB2", risks.invalidityB2);
        applied += applyField("invalidityB3", risks.invalidityB3);
        applied += applyField("invalidityPension", risks.invalidityPension);
        applied += applyField("criticalType", risks.criticalType);
        applied += applyField("criticalVariant", risks.criticalVariant);
        applied += applyField("criticalAmount", risks.criticalAmount);
        applied += applyField("childSurgeryAmount", risks.childSurgeryAmount);
        applied += applyField("vaccinationCompAmount", risks.vaccinationCompAmount);
        applied += applyField("diabetesAmount", risks.diabetesAmount);
        applied += applyField("deathAccidentAmount", risks.deathAccidentAmount);
        applied += applyField("injuryPermanentAmount", risks.injuryPermanentAmount);
        applied += applyField(
          "injuryPermanentFulfillmentFrom",
          risks.injuryPermanentFulfillmentFrom
        );
        applied += applyField("injuryPermanentProgression", risks.injuryPermanentProgression);
        applied += applyField("injuryPermanent2Amount", risks.injuryPermanent2Amount);
        applied += applyField(
          "injuryPermanent2FulfillmentFrom",
          risks.injuryPermanent2FulfillmentFrom
        );
        applied += applyField("injuryPermanent2Progression", risks.injuryPermanent2Progression);
        applied += applyField("hospitalizationAmount", risks.hospitalizationAmount);
        applied += applyField("hospitalizationIllnessAmount", risks.hospitalizationIllnessAmount);
        applied += applyField("hospitalizationInjuryAmount", risks.hospitalizationInjuryAmount);
        applied += applyField("accidentDailyBenefitStart", risks.accidentDailyBenefitStart);
        applied += applyField(
          "accidentDailyBenefitBackpay",
          risks.accidentDailyBenefitBackpay
        );
        applied += applyField("accidentDailyBenefit", risks.accidentDailyBenefit);
        applied += applyField("workIncapacityStart", risks.workIncapacityStart);
        applied += applyField("workIncapacityBackpay", risks.workIncapacityBackpay);
        applied += applyField("workIncapacityAmount", risks.workIncapacityAmount);
        applied += applyField("workIncapacityInjury", risks.workIncapacityInjury);
        applied += applyField("workIncapacityIllness", risks.workIncapacityIllness);
        applied += applyField("workIncapacity2Start", risks.workIncapacity2Start);
        applied += applyField("workIncapacity2Backpay", risks.workIncapacity2Backpay);
        applied += applyField("workIncapacity2Amount", risks.workIncapacity2Amount);
        applied += applyField("workIncapacity2Injury", risks.workIncapacity2Injury);
        applied += applyField("workIncapacity2Illness", risks.workIncapacity2Illness);
        applied += applyField("careDependencyAmount", risks.careDependencyAmount);
        applied += applyField("specialAidAmount", risks.specialAidAmount);
        applied += applyField("caregivingAmount", risks.caregivingAmount);
        applied += applyField("reproductionCostAmount", risks.reproductionCostAmount);
        applied += applyField("cppHelp", risks.cppHelp);
        applied += applyField("liabilityCitizenLimit", risks.liabilityCitizenLimit);
        applied += applyField("liabilityEmployeeLimit", risks.liabilityEmployeeLimit);
        applied += applyField("travelInsurance", risks.travelInsurance);

        // pokud hospitalizace v PDF nebyla, vyčisti hodnotu
        if (risks.hospitalizationAmount === undefined) {
          onChange("hospitalizationAmount", "");
        }
      }

      setImportStatus(
        (parsed.risks?.length ?? 0) > 0
          ? `Načteno ${parsed.risks?.length ?? 0} rizik z PDF.`
          : applied > 0
          ? `Načteno ${applied} polí z PDF. Zkontroluj prosím údaje.`
          : "V PDF se nepodařilo najít rizika k doplnění."
      );
    } catch (err) {
      console.error("Import NEON rizik z PDF selhal", err);
      setImportError("PDF se nepodařilo přečíst. Zkus prosím jiný soubor nebo doplň ručně.");
      setImportStatus(null);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const hasDeath1 = editMode || contract?.deathAmount != null || fields.deathAmount.trim() !== "";
  const hasDeath2 = editMode || contract?.death2Amount != null || fields.death2Amount.trim() !== "";
  const hasTerminal = editMode || contract?.deathTerminalAmount != null || fields.deathTerminalAmount.trim() !== "";
  const hasInvalidityA =
    editMode ||
    contract?.invalidityA1 != null ||
    contract?.invalidityA2 != null ||
    contract?.invalidityA3 != null ||
    fields.invalidityA1.trim() !== "" ||
    fields.invalidityA2.trim() !== "" ||
    fields.invalidityA3.trim() !== "";
  const showInvalidityA1 = editMode || contract?.invalidityA1 != null || fields.invalidityA1.trim() !== "";
  const showInvalidityA2 = editMode || contract?.invalidityA2 != null || fields.invalidityA2.trim() !== "";
  const showInvalidityA3 = editMode || contract?.invalidityA3 != null || fields.invalidityA3.trim() !== "";
  const hasInvalidityB =
    editMode ||
    contract?.invalidityB1 != null ||
    contract?.invalidityB2 != null ||
    contract?.invalidityB3 != null ||
    fields.invalidityB1.trim() !== "" ||
    fields.invalidityB2.trim() !== "" ||
    fields.invalidityB3.trim() !== "";
  const showInvalidityB1 = editMode || contract?.invalidityB1 != null || fields.invalidityB1.trim() !== "";
  const showInvalidityB2 = editMode || contract?.invalidityB2 != null || fields.invalidityB2.trim() !== "";
  const showInvalidityB3 = editMode || contract?.invalidityB3 != null || fields.invalidityB3.trim() !== "";
  const hasCritical =
    editMode ||
    contract?.criticalIllnessAmount != null ||
    !!contract?.criticalIllnessType ||
    !!contract?.criticalIllnessVariant ||
    fields.criticalType.trim() !== "" ||
    fields.criticalVariant.trim() !== "" ||
    fields.criticalAmount.trim() !== "";
  const hasChildSurgery =
    editMode || contract?.childSurgeryAmount != null || fields.childSurgeryAmount.trim() !== "";
  const hasVaccination =
    editMode || contract?.vaccinationCompAmount != null || fields.vaccinationCompAmount.trim() !== "";
  const hasDiabetes = editMode || contract?.diabetesAmount != null || fields.diabetesAmount.trim() !== "";
  const hasDeathAccident = editMode || contract?.deathAccidentAmount != null || fields.deathAccidentAmount.trim() !== "";
  const hasInjuryPermanent =
    editMode ||
    contract?.injuryPermanentAmount != null ||
    !!contract?.injuryPermanentFulfillmentFrom ||
    !!contract?.injuryPermanentProgression ||
    fields.injuryPermanentAmount.trim() !== "" ||
    fields.injuryPermanentFulfillmentFrom.trim() !== "" ||
    fields.injuryPermanentProgression.trim() !== "";
  const hasInjuryPermanent2 =
    editMode ||
    contract?.injuryPermanent2Amount != null ||
    !!contract?.injuryPermanent2FulfillmentFrom ||
    !!contract?.injuryPermanent2Progression ||
    fields.injuryPermanent2Amount.trim() !== "" ||
    fields.injuryPermanent2FulfillmentFrom.trim() !== "" ||
    fields.injuryPermanent2Progression.trim() !== "";
  const hasHospitalizationIllness =
    editMode || contract?.hospitalizationIllnessAmount != null || fields.hospitalizationIllnessAmount.trim() !== "";
  const hasHospitalizationInjury =
    editMode || contract?.hospitalizationInjuryAmount != null || fields.hospitalizationInjuryAmount.trim() !== "";
  const hasAccidentDaily =
    editMode ||
    contract?.accidentDailyBenefit != null ||
    !!contract?.accidentDailyBenefitStart ||
    !!contract?.accidentDailyBenefitBackpay ||
    fields.accidentDailyBenefit.trim() !== "" ||
    fields.accidentDailyBenefitStart.trim() !== "" ||
    fields.accidentDailyBenefitBackpay.trim() !== "";
  const hasWorkIncapacity =
    editMode ||
    contract?.workIncapacityAmount != null ||
    fields.workIncapacityAmount.trim() !== "" ||
    (contract?.workIncapacityStart ?? fields.workIncapacityStart)?.trim?.() ||
    (contract?.workIncapacityBackpay ?? fields.workIncapacityBackpay)?.trim?.() ||
    contract?.workIncapacityInjury ||
    contract?.workIncapacityIllness ||
    fields.workIncapacityInjury ||
    fields.workIncapacityIllness;
  const hasWorkIncapacity2 =
    editMode ||
    contract?.workIncapacity2Amount != null ||
    fields.workIncapacity2Amount.trim() !== "" ||
    (contract?.workIncapacity2Start ?? fields.workIncapacity2Start)?.trim?.() ||
    (contract?.workIncapacity2Backpay ?? fields.workIncapacity2Backpay)?.trim?.() ||
    contract?.workIncapacity2Injury ||
    contract?.workIncapacity2Illness ||
    fields.workIncapacity2Injury ||
    fields.workIncapacity2Illness;
  const hasCareDependency =
    editMode || contract?.careDependencyAmount != null || fields.careDependencyAmount.trim() !== "";
  const hasSpecialAid =
    editMode || contract?.specialAidAmount != null || fields.specialAidAmount.trim() !== "";
  const hasCaregiving =
    editMode || contract?.caregivingAmount != null || fields.caregivingAmount.trim() !== "";
  const hasReproduction =
    editMode || contract?.reproductionCostAmount != null || fields.reproductionCostAmount.trim() !== "";
  const hasCppHelp = editMode || contract?.cppHelp || fields.cppHelp;
  const hasLiabilityCitizen =
    editMode || contract?.liabilityCitizenLimit != null || fields.liabilityCitizenLimit.trim() !== "";
  const hasLiabilityEmployee =
    editMode || contract?.liabilityEmployeeLimit != null || fields.liabilityEmployeeLimit.trim() !== "";
  const hasTravel = editMode || contract?.travelInsurance || fields.travelInsurance;

  return (
    <div className="space-y-3">
      {editMode && (
        <div className="rounded-2xl border border-slate-300 bg-slate-50 p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-slate-900">
              Načíst rizika z PDF (ČPP ŽP NEON)
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? "Načítám…" : "Vybrat PDF"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleImportPdf(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-[12px] text-slate-600">
            Pokusí se načíst hlavní rizika (smrt, invalidity, závažná onemocnění, úrazy, PN) přímo z PDF smlouvy. Data zůstávají jen v prohlížeči.
          </p>
          {importStatus && <p className="text-[12px] text-slate-700">{importStatus}</p>}
          {importError && <p className="text-[12px] text-rose-700">{importError}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <SectionTitle icon={FileBadge2} label="Verze" />
        <div className="text-sm text-slate-900">
          {editMode ? (
            <select
              value={fields.version}
              onChange={(e) => onChange("version", e.target.value)}
              className={selectClass}
            >
              <option value="">Vyber verzi</option>
              <option value="neon_life">NEON Life</option>
              <option value="neon_risk">NEON Risk</option>
              <option value="neon_life_kids">NEON Life Dětské</option>
              <option value="neon_risk_kids">NEON Risk Dětské</option>
            </select>
          ) : (
            <span className="font-semibold">{versionLabel(contract?.version ?? fields.version)}</span>
          )}
        </div>
      </div>

      {hasDeath1 && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={HeartPulse} label="Rizika" />
          {hasDeath1 &&
            renderAmountRow({
              label: "Smrt",
              typeValue: fields.deathType,
              amountValue: fields.deathAmount,
              typeKey: "deathType",
              amountKey: "deathAmount",
              editMode,
              onChange,
              contractType: contract?.deathType,
              contractAmount: contract?.deathAmount ?? null,
              hideEmptyType: true,
            })}
          {hasDeath2 &&
            renderAmountRow({
              label: "Smrt (2)",
              typeValue: fields.death2Type,
              amountValue: fields.death2Amount,
              typeKey: "death2Type",
              amountKey: "death2Amount",
              editMode,
              onChange,
              contractType: contract?.death2Type,
              contractAmount: contract?.death2Amount ?? null,
              hideEmptyType: true,
            })}
          {hasTerminal && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Smrt nebo terminální stádium</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.deathTerminalAmount}
                    onChange={(e) => onChange("deathTerminalAmount", e.target.value)}
                    className={`${inputClass} w-32`}
                    placeholder="částka"
                  />
                ) : contract?.deathTerminalAmount != null ? (
                  formatMoney(contract.deathTerminalAmount)
                ) : (
                  "—"
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {(editMode || contract?.waiverInvalidity || fields.waiverInvalidity || contract?.waiverUnemployment || fields.waiverUnemployment) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Shield} label="Zproštění od placení" />
          <div className="space-y-1">
            {(editMode || contract?.waiverInvalidity || fields.waiverInvalidity) && (
              <ToggleRow
                label="Invalidita"
                checked={fields.waiverInvalidity}
                onChange={(val) => onChange("waiverInvalidity", val)}
                disabled={!editMode}
              />
            )}
            {(editMode || contract?.waiverUnemployment || fields.waiverUnemployment) && (
              <ToggleRow
                label="Ztráta zaměstnání"
                checked={fields.waiverUnemployment}
                onChange={(val) => onChange("waiverUnemployment", val)}
                disabled={!editMode}
              />
            )}
          </div>
        </div>
      )}

      {(editMode || hasInvalidityA) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Accessibility} label="Invalidita" />
          <div className="space-y-2">
            {showInvalidityA3 &&
              renderAmountRow({
                label: "3. stupeň",
                typeValue: fields.invalidityAType,
                amountValue: fields.invalidityA3,
                typeKey: "invalidityAType",
                amountKey: "invalidityA3",
                editMode,
                onChange,
                contractType: contract?.invalidityAType,
                contractAmount: contract?.invalidityA3 ?? null,
              })}
            {showInvalidityA2 &&
              renderAmountRow({
                label: "2. stupeň",
                typeValue: fields.invalidityAType,
                amountValue: fields.invalidityA2,
                typeKey: "invalidityAType",
                amountKey: "invalidityA2",
                editMode,
                onChange,
                contractType: contract?.invalidityAType,
                contractAmount: contract?.invalidityA2 ?? null,
              })}
            {showInvalidityA1 &&
              renderAmountRow({
                label: "1. stupeň",
                typeValue: fields.invalidityAType,
                amountValue: fields.invalidityA1,
                typeKey: "invalidityAType",
                amountKey: "invalidityA1",
                editMode,
                onChange,
                contractType: contract?.invalidityAType,
                contractAmount: contract?.invalidityA1 ?? null,
              })}
          </div>
        </div>
      )}

      {(editMode || hasInvalidityB) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Accessibility} label="Invalidita (2)" />
          {showInvalidityB3 &&
            renderAmountRow({
              label: "3. stupeň",
              typeValue: fields.invalidityBType,
              amountValue: fields.invalidityB3,
              typeKey: "invalidityBType",
              amountKey: "invalidityB3",
              editMode,
              onChange,
              contractType: contract?.invalidityBType,
              contractAmount: contract?.invalidityB3 ?? null,
            })}
          {showInvalidityB2 &&
            renderAmountRow({
              label: "2. stupeň",
              typeValue: fields.invalidityBType,
              amountValue: fields.invalidityB2,
              typeKey: "invalidityBType",
              amountKey: "invalidityB2",
              editMode,
              onChange,
              contractType: contract?.invalidityBType,
              contractAmount: contract?.invalidityB2 ?? null,
            })}
          {showInvalidityB1 &&
            renderAmountRow({
              label: "1. stupeň",
              typeValue: fields.invalidityBType,
              amountValue: fields.invalidityB1,
              typeKey: "invalidityBType",
              amountKey: "invalidityB1",
              editMode,
              onChange,
              contractType: contract?.invalidityBType,
              contractAmount: contract?.invalidityB1 ?? null,
            })}
        </div>
      )}

      {(editMode || contract?.invalidityPension || fields.invalidityPension) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Wallet} label="Invalidita s výplatou důchodu" />
          <ToggleRow
            label="Invalidita s výplatou důchodu"
            checked={fields.invalidityPension}
            onChange={(val) => onChange("invalidityPension", val)}
            disabled={!editMode}
          />
        </div>
      )}

      {(editMode || hasCritical) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Stethoscope} label="Závažná onemocnění a poranění" />
          <div className="flex flex-col gap-1">
            <span className="text-slate-600">Varianta</span>
            {editMode ? (
              <select
                value={fields.criticalVariant}
                onChange={(e) => onChange("criticalVariant", e.target.value)}
                className={selectClass}
              >
                <option value="">Vyber variantu</option>
                {criticalVariantOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold">
                {criticalVariantLabel(contract?.criticalIllnessVariant ?? fields.criticalVariant)}
              </span>
            )}
          </div>
          {renderAmountRow({
            label: "Krytí",
            typeValue: fields.criticalType,
            amountValue: fields.criticalAmount,
            typeKey: "criticalType",
            amountKey: "criticalAmount",
            editMode,
            onChange,
            contractType: contract?.criticalIllnessType,
            contractAmount: contract?.criticalIllnessAmount ?? null,
          })}
        </div>
      )}

      {(editMode || hasChildSurgery) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Baby} label="Operace dítěte s vrozenou vadou" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.childSurgeryAmount}
                  onChange={(e) => onChange("childSurgeryAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.childSurgeryAmount != null ? (
                formatMoney(contract.childSurgeryAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasVaccination) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Syringe} label="Závažné následky očkování" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.vaccinationCompAmount}
                  onChange={(e) => onChange("vaccinationCompAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.vaccinationCompAmount != null ? (
                formatMoney(contract.vaccinationCompAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasDiabetes) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Activity} label="Cukrovka a její komplikace" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.diabetesAmount}
                  onChange={(e) => onChange("diabetesAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.diabetesAmount != null ? (
                formatMoney(contract.diabetesAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasDeathAccident) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={TriangleAlert} label="Smrt úrazem" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.deathAccidentAmount}
                  onChange={(e) => onChange("deathAccidentAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.deathAccidentAmount != null ? (
                formatMoney(contract.deathAccidentAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasInjuryPermanent) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Bandage} label="Trvalé následky úrazu" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.injuryPermanentAmount}
                  onChange={(e) => onChange("injuryPermanentAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.injuryPermanentAmount != null ? (
                formatMoney(contract.injuryPermanentAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Plnění od</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.injuryPermanentFulfillmentFrom}
                  onChange={(e) => onChange("injuryPermanentFulfillmentFrom", e.target.value)}
                  className={`${selectClass} w-36`}
                >
                  <option value="">Vyber</option>
                  {injuryPermanentFulfillmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                injuryPermanentFulfillmentLabel(contract?.injuryPermanentFulfillmentFrom)
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Progrese</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.injuryPermanentProgression}
                  onChange={(e) => onChange("injuryPermanentProgression", e.target.value)}
                  className={`${selectClass} w-40`}
                >
                  <option value="">Vyber</option>
                  {injuryPermanentProgressionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                injuryPermanentProgressionLabel(contract?.injuryPermanentProgression)
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasInjuryPermanent2) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Bandage} label="Trvalé následky úrazu (2)" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.injuryPermanent2Amount}
                  onChange={(e) => onChange("injuryPermanent2Amount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.injuryPermanent2Amount != null ? (
                formatMoney(contract.injuryPermanent2Amount)
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Plnění od</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.injuryPermanent2FulfillmentFrom}
                  onChange={(e) => onChange("injuryPermanent2FulfillmentFrom", e.target.value)}
                  className={`${selectClass} w-36`}
                >
                  <option value="">Vyber</option>
                  {injuryPermanentFulfillmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                injuryPermanentFulfillmentLabel(contract?.injuryPermanent2FulfillmentFrom)
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Progrese</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.injuryPermanent2Progression}
                  onChange={(e) => onChange("injuryPermanent2Progression", e.target.value)}
                  className={`${selectClass} w-40`}
                >
                  <option value="">Vyber</option>
                  {injuryPermanentProgressionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                injuryPermanentProgressionLabel(contract?.injuryPermanent2Progression)
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasHospitalizationIllness) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={BedDouble} label="Hospitalizace (Nemoc)" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Denní částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.hospitalizationIllnessAmount}
                  onChange={(e) => onChange("hospitalizationIllnessAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.hospitalizationIllnessAmount != null ? (
                formatMoney(contract.hospitalizationIllnessAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasHospitalizationInjury) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={BedDouble} label="Hospitalizace (Úraz)" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Denní částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.hospitalizationInjuryAmount}
                  onChange={(e) => onChange("hospitalizationInjuryAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.hospitalizationInjuryAmount != null ? (
                formatMoney(contract.hospitalizationInjuryAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasAccidentDaily) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={CalendarCheck2} label="Denní odškodné úrazem" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-slate-600">Plnění od</span>
              {editMode ? (
                <select
                  value={fields.accidentDailyBenefitStart}
                  onChange={(e) => onChange("accidentDailyBenefitStart", e.target.value)}
                  className={selectClass}
                >
                  <option value="">Vyber den</option>
                  {accidentDailyStartOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-semibold">
                  {accidentDailyStartLabel(
                    contract?.accidentDailyBenefitStart ?? fields.accidentDailyBenefitStart
                  )}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-600">Zpětně</span>
              {editMode ? (
                <select
                  value={fields.accidentDailyBenefitBackpay}
                  onChange={(e) => onChange("accidentDailyBenefitBackpay", e.target.value)}
                  className={selectClass}
                >
                  <option value="">Vyber</option>
                  {accidentDailyBackpayOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-semibold">
                  {accidentDailyBackpayLabel(
                    contract?.accidentDailyBenefitBackpay ??
                      fields.accidentDailyBenefitBackpay
                  )}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-600">Denní částka</span>
              {editMode ? (
                <input
                  type="number"
                  value={fields.accidentDailyBenefit}
                  onChange={(e) => onChange("accidentDailyBenefit", e.target.value)}
                  className={inputClass}
                  placeholder="částka"
                />
              ) : contract?.accidentDailyBenefit != null ? (
                formatMoney(contract.accidentDailyBenefit)
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>
      )}

      {(editMode || hasWorkIncapacity) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={BriefcaseMedical} label="Pracovní neschopnost" />
          <div className="space-y-2 text-sm text-slate-900">
            <div className="flex flex-wrap gap-2">
              <ToggleRow
                label="Nemoc"
                checked={fields.workIncapacityIllness}
                onChange={(val) => onChange("workIncapacityIllness", val)}
                disabled={!editMode}
              />
              <ToggleRow
                label="Úraz"
                checked={fields.workIncapacityInjury}
                onChange={(val) => onChange("workIncapacityInjury", val)}
                disabled={!editMode}
              />
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Plnění od</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <select
                    value={fields.workIncapacityStart}
                    onChange={(e) => onChange("workIncapacityStart", e.target.value)}
                    className={`${selectClass} w-32`}
                  >
                    <option value="">Vyber den</option>
                    <option value="15">15. dne</option>
                    <option value="29">29. dne</option>
                    <option value="60">60. dne</option>
                  </select>
                ) : (
                  fields.workIncapacityStart || contract?.workIncapacityStart || "—"
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Zpětné plnění</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <select
                    value={fields.workIncapacityBackpay}
                    onChange={(e) => onChange("workIncapacityBackpay", e.target.value)}
                    className={`${selectClass} w-32`}
                  >
                    <option value="">Vyber</option>
                    <option value="zpetne">Zpětně</option>
                    <option value="nezpetne">Nezpětně</option>
                  </select>
                ) : (
                  fields.workIncapacityBackpay || contract?.workIncapacityBackpay || "—"
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Denní částka</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.workIncapacityAmount}
                    onChange={(e) => onChange("workIncapacityAmount", e.target.value)}
                    className={`${inputClass} w-32`}
                    placeholder="částka"
                  />
                ) : contract?.workIncapacityAmount != null ? (
                  formatMoney(contract.workIncapacityAmount)
                ) : (
                  "—"
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {(editMode || hasWorkIncapacity2) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={BriefcaseMedical} label="Pracovní neschopnost (2)" />
          <div className="space-y-2 text-sm text-slate-900">
            <div className="flex flex-wrap gap-2">
              <ToggleRow
                label="Nemoc"
                checked={fields.workIncapacity2Illness}
                onChange={(val) => onChange("workIncapacity2Illness", val)}
                disabled={!editMode}
              />
              <ToggleRow
                label="Úraz"
                checked={fields.workIncapacity2Injury}
                onChange={(val) => onChange("workIncapacity2Injury", val)}
                disabled={!editMode}
              />
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Plnění od</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <select
                    value={fields.workIncapacity2Start}
                    onChange={(e) => onChange("workIncapacity2Start", e.target.value)}
                    className={`${selectClass} w-32`}
                  >
                    <option value="">Vyber den</option>
                    <option value="15">15. dne</option>
                    <option value="29">29. dne</option>
                    <option value="60">60. dne</option>
                  </select>
                ) : (
                  fields.workIncapacity2Start || contract?.workIncapacity2Start || "—"
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Zpětné plnění</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <select
                    value={fields.workIncapacity2Backpay}
                    onChange={(e) => onChange("workIncapacity2Backpay", e.target.value)}
                    className={`${selectClass} w-32`}
                  >
                    <option value="">Vyber</option>
                    <option value="zpetne">Zpětně</option>
                    <option value="nezpetne">Nezpětně</option>
                  </select>
                ) : (
                  fields.workIncapacity2Backpay || contract?.workIncapacity2Backpay || "—"
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Denní částka</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.workIncapacity2Amount}
                    onChange={(e) => onChange("workIncapacity2Amount", e.target.value)}
                    className={`${inputClass} w-32`}
                    placeholder="částka"
                  />
                ) : contract?.workIncapacity2Amount != null ? (
                  formatMoney(contract.workIncapacity2Amount)
                ) : (
                  "—"
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {(editMode || hasCareDependency) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={HandHeart} label="Závislost na péči II.–IV. stupně" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Měsíční částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.careDependencyAmount}
                  onChange={(e) => onChange("careDependencyAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.careDependencyAmount != null ? (
                formatMoney(contract.careDependencyAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasSpecialAid) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Wrench} label="Příspěvek na pořízení zvláštní pomůcky" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.specialAidAmount}
                  onChange={(e) => onChange("specialAidAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.specialAidAmount != null ? (
                formatMoney(contract.specialAidAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasCaregiving) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={HandHelping} label="Celodenní ošetřování pojištěného" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Denní částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.caregivingAmount}
                  onChange={(e) => onChange("caregivingAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.caregivingAmount != null ? (
                formatMoney(contract.caregivingAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasReproduction) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Sparkles} label="Náklady asistované reprodukce" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.reproductionCostAmount}
                  onChange={(e) => onChange("reproductionCostAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.reproductionCostAmount != null ? (
                formatMoney(contract.reproductionCostAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasCppHelp) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={LifeBuoy} label="ČPP Pomoc" />
          <ToggleRow
            label="ČPP Pomoc"
            checked={fields.cppHelp}
            onChange={(val) => onChange("cppHelp", val)}
            disabled={!editMode}
          />
        </div>
      )}

      {(editMode || hasLiabilityCitizen) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Shield} label="Odpovědnost občana" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Limit</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.liabilityCitizenLimit}
                  onChange={(e) => onChange("liabilityCitizenLimit", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="limit v Kč"
                />
              ) : contract?.liabilityCitizenLimit != null ? (
                formatMoney(contract.liabilityCitizenLimit)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasLiabilityEmployee) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Shield} label="Odpovědnost zaměstnance" />
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Limit</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.liabilityEmployeeLimit}
                  onChange={(e) => onChange("liabilityEmployeeLimit", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="limit v Kč"
                />
              ) : contract?.liabilityEmployeeLimit != null ? (
                formatMoney(contract.liabilityEmployeeLimit)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasTravel) && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <SectionTitle icon={Plane} label="Cestovní pojištění" />
          <ToggleRow
            label="Cestovní pojištění"
            checked={fields.travelInsurance}
            onChange={(val) => onChange("travelInsurance", val)}
            disabled={!editMode}
          />
        </div>
      )}
    </div>
  );
}
