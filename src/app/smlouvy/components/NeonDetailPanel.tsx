import React from "react";
import type { Product } from "@/app/types/domain";

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
  criticalAmount: string;
  childSurgeryAmount: string;
  vaccinationCompAmount: string;
  diabetesAmount: string;
  deathAccidentAmount: string;
  injuryPermanentAmount: string;
  hospitalizationAmount: string;
  accidentDailyBenefit: string;
  workIncapacityStart: string;
  workIncapacityBackpay: string;
  workIncapacityAmount: string;
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
  criticalIllnessAmount?: number | null;
  childSurgeryAmount?: number | null;
  vaccinationCompAmount?: number | null;
  diabetesAmount?: number | null;
  deathAccidentAmount?: number | null;
  injuryPermanentAmount?: number | null;
  hospitalizationAmount?: number | null;
  accidentDailyBenefit?: number | null;
  workIncapacityStart?: string | null;
  workIncapacityBackpay?: string | null;
  workIncapacityAmount?: number | null;
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
  value != null && Number.isFinite(value)
    ? `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`
    : "—";

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

const selectClass =
  "w-full rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";

const inputClass =
  "w-full rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";

const sumTypeOptions = [
  { value: "konstantni", label: "Konstantní" },
  { value: "klesajici", label: "Klesající" },
  { value: "klesajici_urok", label: "Klesající dle úroku" },
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
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
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
          <span className="text-sm font-semibold">
            {sumTypeLabel(contractType ?? typeValue)}
          </span>
        )}
        <div className="w-40">
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
  if (prod !== "neon") return null;

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
    editMode || contract?.criticalIllnessAmount != null || fields.criticalAmount.trim() !== "";
  const hasChildSurgery =
    editMode || contract?.childSurgeryAmount != null || fields.childSurgeryAmount.trim() !== "";
  const hasVaccination =
    editMode || contract?.vaccinationCompAmount != null || fields.vaccinationCompAmount.trim() !== "";
  const hasDiabetes = editMode || contract?.diabetesAmount != null || fields.diabetesAmount.trim() !== "";
  const hasDeathAccident = editMode || contract?.deathAccidentAmount != null || fields.deathAccidentAmount.trim() !== "";
  const hasInjuryPermanent = editMode || contract?.injuryPermanentAmount != null || fields.injuryPermanentAmount.trim() !== "";
  const hasHospitalization =
    editMode || contract?.hospitalizationAmount != null || fields.hospitalizationAmount.trim() !== "";
  const hasAccidentDaily =
    editMode || contract?.accidentDailyBenefit != null || fields.accidentDailyBenefit.trim() !== "";
  const hasWorkIncapacity =
    editMode ||
    contract?.workIncapacityAmount != null ||
    fields.workIncapacityAmount.trim() !== "" ||
    (contract?.workIncapacityStart ?? fields.workIncapacityStart)?.trim?.() ||
    (contract?.workIncapacityBackpay ?? fields.workIncapacityBackpay)?.trim?.();
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
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-emerald-200">Verze</div>
        <div className="text-sm text-slate-100">
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Rizika</div>
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
            })}
          {hasTerminal && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-300">Smrt nebo terminální stádium</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Zproštění od placení</div>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Invalidita</div>
          {showInvalidityA3 &&
            renderAmountRow({
              label: "Stupeň 3",
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
              label: "Stupeň 2",
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
              label: "Stupeň 1",
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
      )}

      {(editMode || hasInvalidityB) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Invalidita (2)</div>
          {showInvalidityB3 &&
            renderAmountRow({
              label: "Stupeň 3",
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
              label: "Stupeň 2",
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
              label: "Stupeň 1",
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Invalidita s výplatou důchodu</div>
          <ToggleRow
            label="Invalidita s výplatou důchodu"
            checked={fields.invalidityPension}
            onChange={(val) => onChange("invalidityPension", val)}
            disabled={!editMode}
          />
        </div>
      )}

      {(editMode || hasCritical) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Závažná onemocnění a poranění</div>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Operace dítěte s vrozenou vadou</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Pojistná částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Závažné následky očkování</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Pojistná částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Cukrovka a její komplikace</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Pojistná částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Smrt úrazem</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Pojistná částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Trvalé následky úrazu</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Pojistná částka</span>
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
        </div>
      )}

      {(editMode || hasHospitalization) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Hospitalizace (Nemoc/Úraz)</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Denní částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.hospitalizationAmount}
                  onChange={(e) => onChange("hospitalizationAmount", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.hospitalizationAmount != null ? (
                formatMoney(contract.hospitalizationAmount)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasAccidentDaily) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Denní odškodné úrazem</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Denní částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.accidentDailyBenefit}
                  onChange={(e) => onChange("accidentDailyBenefit", e.target.value)}
                  className={`${inputClass} w-32`}
                  placeholder="částka"
                />
              ) : contract?.accidentDailyBenefit != null ? (
                formatMoney(contract.accidentDailyBenefit)
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      )}

      {(editMode || hasWorkIncapacity) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Pracovní neschopnost</div>
          <div className="space-y-2 text-sm text-slate-100">
            <div className="flex justify-between gap-2">
              <span className="text-slate-300">Plnění od</span>
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
              <span className="text-slate-300">Zpětné plnění</span>
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
              <span className="text-slate-300">Denní částka</span>
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

      {(editMode || hasCareDependency) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Závislost na péči II.–IV. stupně</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Měsíční částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Příspěvek na pořízení zvláštní pomůcky</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Celodenní ošetřování pojištěného</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Denní částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Náklady asistované reprodukce</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Částka</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">ČPP Pomoc</div>
          <ToggleRow
            label="ČPP Pomoc"
            checked={fields.cppHelp}
            onChange={(val) => onChange("cppHelp", val)}
            disabled={!editMode}
          />
        </div>
      )}

      {(editMode || hasLiabilityCitizen) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Odpovědnost občana</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Limit</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Odpovědnost zaměstnance</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-300">Limit</span>
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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Cestovní pojištění</div>
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
