import React from "react";
import type { Product } from "@/app/types/domain";

export type FlexiFields = {
  deathAmount: string;
  deathTypedType: string;
  deathTypedAmount: string;
  deathAccidentAmount: string;
  seriousIllnessType: string;
  seriousIllnessAmount: string;
  seriousIllnessForHim: string;
  seriousIllnessForHer: string;
  permanentIllnessAmount: string;
  invalidityIllnessType: string;
  invalidityIllness1: string;
  invalidityIllness2: string;
  invalidityIllness3: string;
  hospitalGeneralAmount: string;
  workIncapacityStart: string;
  workIncapacityBackpay: string;
  workIncapacityAmount: string;
  caregivingAmount: string;
  permanentAccidentAmount: string;
  injuryDamageAmount: string;
  accidentDailyBenefit: string;
  hospitalAccidentAmount: string;
  invalidityAccidentType: string;
  invalidityAccident1: string;
  invalidityAccident2: string;
  invalidityAccident3: string;
  trafficDeathAccidentAmount: string;
  trafficPermanentAccidentAmount: string;
  trafficInjuryDamageAmount: string;
  trafficAccidentDailyBenefit: string;
  trafficHospitalAccidentAmount: string;
  trafficWorkIncapacityAmount: string;
  trafficInvalidityAmount: string;
  loanDeathAmount: string;
  loanInvalidityType: string;
  loanInvalidity1: string;
  loanInvalidity2: string;
  loanInvalidity3: string;
  loanIllnessAmount: string;
  loanWorkIncapacityAmount: string;
  addonMajakBasic: boolean;
  addonMajakPlus: boolean;
  addonLiabilityCitizen: string;
  addonTravel: boolean;
};

export type FlexiDetail = {
  deathAmount?: number | null;
  deathTypedType?: string | null;
  deathTypedAmount?: number | null;
  deathAccidentAmount?: number | null;
  seriousIllnessType?: string | null;
  seriousIllnessAmount?: number | null;
  seriousIllnessForHim?: number | null;
  seriousIllnessForHer?: number | null;
  permanentIllnessAmount?: number | null;
  invalidityIllnessType?: string | null;
  invalidityIllness1?: number | null;
  invalidityIllness2?: number | null;
  invalidityIllness3?: number | null;
  hospitalGeneralAmount?: number | null;
  workIncapacityStart?: string | null;
  workIncapacityBackpay?: string | null;
  workIncapacityAmount?: number | null;
  caregivingAmount?: number | null;
  permanentAccidentAmount?: number | null;
  injuryDamageAmount?: number | null;
  accidentDailyBenefit?: number | null;
  hospitalAccidentAmount?: number | null;
  invalidityAccidentType?: string | null;
  invalidityAccident1?: number | null;
  invalidityAccident2?: number | null;
  invalidityAccident3?: number | null;
  trafficDeathAccidentAmount?: number | null;
  trafficPermanentAccidentAmount?: number | null;
  trafficInjuryDamageAmount?: number | null;
  trafficAccidentDailyBenefit?: number | null;
  trafficHospitalAccidentAmount?: number | null;
  trafficWorkIncapacityAmount?: number | null;
  trafficInvalidityAmount?: number | null;
  loanDeathAmount?: number | null;
  loanInvalidityType?: string | null;
  loanInvalidity1?: number | null;
  loanInvalidity2?: number | null;
  loanInvalidity3?: number | null;
  loanIllnessAmount?: number | null;
  loanWorkIncapacityAmount?: number | null;
  addonMajakBasic?: boolean | null;
  addonMajakPlus?: boolean | null;
  addonLiabilityCitizen?: number | null;
  addonTravel?: boolean | null;
} | null;

const formatMoney = (value: number | undefined | null) =>
  value != null && Number.isFinite(value)
    ? `${value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`
    : "—";

const sumTypeLabel = (val?: string | null) => {
  const map: Record<string, string> = {
    konstantni: "Konstantní",
    klesajici: "Klesající",
  };
  if (!val) return "—";
  const key = val.trim().toLowerCase();
  return map[key] ?? val;
};

const selectClass =
  "w-full rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";
const inputClass =
  "w-full rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";

const sumTypeOptions = [
  { value: "konstantni", label: "Konstantní" },
  { value: "klesajici", label: "Klesající" },
];

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

const AmountRow = ({
  label,
  amountValue,
  amountKey,
  editMode,
  onChange,
  contractAmount,
  typeValue,
  typeKey,
  showType,
}: {
  label: string;
  amountValue: string;
  amountKey: keyof FlexiFields;
  editMode: boolean;
  onChange: (key: keyof FlexiFields, value: string | boolean) => void;
  contractAmount?: number | null;
  typeValue?: string;
  typeKey?: keyof FlexiFields;
  showType?: boolean;
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        {showType ? (
          editMode ? (
            <select
              value={typeValue ?? ""}
              onChange={(e) => onChange(typeKey!, e.target.value)}
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
            <span className="text-sm font-semibold">{sumTypeLabel(typeValue)}</span>
          )
        ) : null}
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

const hasValue = (val?: string | null) => !!(val && val.trim().length > 0);
const hasAmount = (cv?: number | null, fv?: string) =>
  cv != null || hasValue(fv);

export function FlexiDetailPanel({ prod, editMode, fields, contract, onChange }: Props) {
  if (prod !== "flexi") return null;

  const hasDeath = editMode || contract?.deathAmount != null || hasValue(fields.deathAmount);
  const hasDeathTyped = editMode || contract?.deathTypedAmount != null || hasValue(fields.deathTypedAmount);
  const hasDeathAccident = editMode || contract?.deathAccidentAmount != null || hasValue(fields.deathAccidentAmount);
  const hasSerious = editMode || contract?.seriousIllnessAmount != null || hasValue(fields.seriousIllnessAmount);
  const hasSeriousForHim = editMode || contract?.seriousIllnessForHim != null || hasValue(fields.seriousIllnessForHim);
  const hasSeriousForHer = editMode || contract?.seriousIllnessForHer != null || hasValue(fields.seriousIllnessForHer);
  const hasPermanentIllness =
    editMode || contract?.permanentIllnessAmount != null || hasValue(fields.permanentIllnessAmount);
  const hasInvalidityIllness =
    editMode ||
    contract?.invalidityIllness1 != null ||
    contract?.invalidityIllness2 != null ||
    contract?.invalidityIllness3 != null ||
    hasValue(fields.invalidityIllness1) ||
    hasValue(fields.invalidityIllness2) ||
    hasValue(fields.invalidityIllness3);
  const hasHospitalGeneral = editMode || contract?.hospitalGeneralAmount != null || hasValue(fields.hospitalGeneralAmount);
  const hasWorkIncapacity =
    editMode ||
    contract?.workIncapacityAmount != null ||
    hasValue(fields.workIncapacityAmount) ||
    hasValue(fields.workIncapacityStart) ||
    hasValue(fields.workIncapacityBackpay);
  const hasCaregiving = editMode || contract?.caregivingAmount != null || hasValue(fields.caregivingAmount);
  const hasPermanentAccident = editMode || contract?.permanentAccidentAmount != null || hasValue(fields.permanentAccidentAmount);
  const hasInjuryDamage = editMode || contract?.injuryDamageAmount != null || hasValue(fields.injuryDamageAmount);
  const hasAccidentDaily = editMode || contract?.accidentDailyBenefit != null || hasValue(fields.accidentDailyBenefit);
  const hasHospitalAccident = editMode || contract?.hospitalAccidentAmount != null || hasValue(fields.hospitalAccidentAmount);
  const hasInvalidityAccident =
    editMode ||
    contract?.invalidityAccident1 != null ||
    contract?.invalidityAccident2 != null ||
    contract?.invalidityAccident3 != null ||
    hasValue(fields.invalidityAccident1) ||
    hasValue(fields.invalidityAccident2) ||
    hasValue(fields.invalidityAccident3);
  const hasTraffic =
    editMode ||
    contract?.trafficDeathAccidentAmount != null ||
    hasValue(fields.trafficDeathAccidentAmount) ||
    contract?.trafficPermanentAccidentAmount != null ||
    hasValue(fields.trafficPermanentAccidentAmount) ||
    contract?.trafficInjuryDamageAmount != null ||
    hasValue(fields.trafficInjuryDamageAmount) ||
    contract?.trafficAccidentDailyBenefit != null ||
    hasValue(fields.trafficAccidentDailyBenefit) ||
    contract?.trafficHospitalAccidentAmount != null ||
    hasValue(fields.trafficHospitalAccidentAmount) ||
    contract?.trafficWorkIncapacityAmount != null ||
    hasValue(fields.trafficWorkIncapacityAmount) ||
    contract?.trafficInvalidityAmount != null ||
    hasValue(fields.trafficInvalidityAmount);
  const hasLoan =
    editMode ||
    contract?.loanDeathAmount != null ||
    hasValue(fields.loanDeathAmount) ||
    contract?.loanInvalidity1 != null ||
    hasValue(fields.loanInvalidity1) ||
    contract?.loanInvalidity2 != null ||
    hasValue(fields.loanInvalidity2) ||
    contract?.loanInvalidity3 != null ||
    hasValue(fields.loanInvalidity3) ||
    contract?.loanIllnessAmount != null ||
    hasValue(fields.loanIllnessAmount) ||
    contract?.loanWorkIncapacityAmount != null ||
    hasValue(fields.loanWorkIncapacityAmount);
  const hasAddon =
    editMode ||
    contract?.addonMajakBasic ||
    contract?.addonMajakPlus ||
    hasValue(fields.addonLiabilityCitizen) ||
    contract?.addonTravel ||
    fields.addonMajakBasic ||
    fields.addonMajakPlus ||
    fields.addonTravel;

  return (
    <div className="space-y-3">
      {(editMode || hasDeath || hasDeathTyped || hasDeathAccident) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Smrt</div>
          {hasDeath && (
            <AmountRow
              label="Smrt"
              amountValue={fields.deathAmount}
              amountKey="deathAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.deathAmount ?? null}
            />
          )}
          {hasDeathTyped && (
            <AmountRow
              label="Smrt (typ)"
              amountValue={fields.deathTypedAmount}
              amountKey="deathTypedAmount"
              typeValue={fields.deathTypedType}
              typeKey="deathTypedType"
              showType
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.deathTypedAmount ?? null}
            />
          )}
          {hasDeathAccident && (
            <AmountRow
              label="Smrt následkem úrazu"
              amountValue={fields.deathAccidentAmount}
              amountKey="deathAccidentAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.deathAccidentAmount ?? null}
            />
          )}
        </div>
      )}

      {(editMode || hasSerious || hasSeriousForHim || hasSeriousForHer) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Vážná onemocnění</div>
          {hasSerious && (
            <AmountRow
              label="Vážná onemocnění"
              amountValue={fields.seriousIllnessAmount}
              amountKey="seriousIllnessAmount"
              typeValue={fields.seriousIllnessType}
              typeKey="seriousIllnessType"
              showType
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.seriousIllnessAmount ?? null}
            />
          )}
          {hasSeriousForHim && (
            <AmountRow
              label="Vážná onemocnění PRO NĚJ"
              amountValue={fields.seriousIllnessForHim}
              amountKey="seriousIllnessForHim"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.seriousIllnessForHim ?? null}
            />
          )}
          {hasSeriousForHer && (
            <AmountRow
              label="Vážná onemocnění PRO NI"
              amountValue={fields.seriousIllnessForHer}
              amountKey="seriousIllnessForHer"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.seriousIllnessForHer ?? null}
            />
          )}
        </div>
      )}

      {(editMode || hasPermanentIllness) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Trvalé následky nemoci</div>
          <AmountRow
            label="Pojistná částka"
            amountValue={fields.permanentIllnessAmount}
            amountKey="permanentIllnessAmount"
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.permanentIllnessAmount ?? null}
          />
        </div>
      )}

      {(editMode || hasInvalidityIllness) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">
            Invalidita / snížená soběstačnost (úraz nebo nemoc)
          </div>
          <AmountRow
            label="Stupeň 1"
            amountValue={fields.invalidityIllness1}
            amountKey="invalidityIllness1"
            typeValue={fields.invalidityIllnessType}
            typeKey="invalidityIllnessType"
            showType
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.invalidityIllness1 ?? null}
          />
          <AmountRow
            label="Stupeň 2"
            amountValue={fields.invalidityIllness2}
            amountKey="invalidityIllness2"
            typeValue={fields.invalidityIllnessType}
            typeKey="invalidityIllnessType"
            showType
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.invalidityIllness2 ?? null}
          />
          <AmountRow
            label="Stupeň 3"
            amountValue={fields.invalidityIllness3}
            amountKey="invalidityIllness3"
            typeValue={fields.invalidityIllnessType}
            typeKey="invalidityIllnessType"
            showType
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.invalidityIllness3 ?? null}
          />
        </div>
      )}

      {(editMode || hasHospitalGeneral) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Pobyt v nemocnici (nemoc/úraz)</div>
          <AmountRow
            label="Denní částka"
            amountValue={fields.hospitalGeneralAmount}
            amountKey="hospitalGeneralAmount"
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.hospitalGeneralAmount ?? null}
          />
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
                    <option value="">Vyber</option>
                    <option value="15">15. den</option>
                    <option value="29">29. den</option>
                    <option value="57">57. den</option>
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

      {(editMode || hasCaregiving) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Ošetřování</div>
          <AmountRow
            label="Denní částka"
            amountValue={fields.caregivingAmount}
            amountKey="caregivingAmount"
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.caregivingAmount ?? null}
          />
        </div>
      )}

      {(editMode || hasPermanentAccident || hasInjuryDamage || hasAccidentDaily || hasHospitalAccident) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Úrazová rizika</div>
          {hasPermanentAccident && (
            <AmountRow
              label="Trvalé následky úrazu"
              amountValue={fields.permanentAccidentAmount}
              amountKey="permanentAccidentAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.permanentAccidentAmount ?? null}
            />
          )}
          {hasInjuryDamage && (
            <AmountRow
              label="Tělesné poškození - úraz"
              amountValue={fields.injuryDamageAmount}
              amountKey="injuryDamageAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.injuryDamageAmount ?? null}
            />
          )}
          {hasAccidentDaily && (
            <AmountRow
              label="Denní odškodné - úraz"
              amountValue={fields.accidentDailyBenefit}
              amountKey="accidentDailyBenefit"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.accidentDailyBenefit ?? null}
            />
          )}
          {hasHospitalAccident && (
            <AmountRow
              label="Pobyt v nemocnici - úraz"
              amountValue={fields.hospitalAccidentAmount}
              amountKey="hospitalAccidentAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.hospitalAccidentAmount ?? null}
            />
          )}
        </div>
      )}

      {(editMode || hasInvalidityAccident) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">
            Invalidita / snížená soběstačnost (úraz)
          </div>
          <AmountRow
            label="Stupeň 1"
            amountValue={fields.invalidityAccident1}
            amountKey="invalidityAccident1"
            typeValue={fields.invalidityAccidentType}
            typeKey="invalidityAccidentType"
            showType
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.invalidityAccident1 ?? null}
          />
          <AmountRow
            label="Stupeň 2"
            amountValue={fields.invalidityAccident2}
            amountKey="invalidityAccident2"
            typeValue={fields.invalidityAccidentType}
            typeKey="invalidityAccidentType"
            showType
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.invalidityAccident2 ?? null}
          />
          <AmountRow
            label="Stupeň 3"
            amountValue={fields.invalidityAccident3}
            amountKey="invalidityAccident3"
            typeValue={fields.invalidityAccidentType}
            typeKey="invalidityAccidentType"
            showType
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.invalidityAccident3 ?? null}
          />
        </div>
      )}

      {(editMode || hasTraffic) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">
            Pojištění úrazu při dopravní nehodě
          </div>
          {(editMode || hasAmount(contract?.trafficDeathAccidentAmount, fields.trafficDeathAccidentAmount)) && (
            <AmountRow
              label="Smrt následkem úrazu"
              amountValue={fields.trafficDeathAccidentAmount}
              amountKey="trafficDeathAccidentAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.trafficDeathAccidentAmount ?? null}
            />
          )}
          {(editMode || hasAmount(contract?.trafficPermanentAccidentAmount, fields.trafficPermanentAccidentAmount)) && (
            <AmountRow
              label="Trvalé následky úrazu"
              amountValue={fields.trafficPermanentAccidentAmount}
              amountKey="trafficPermanentAccidentAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.trafficPermanentAccidentAmount ?? null}
            />
          )}
          {(editMode || hasAmount(contract?.trafficInjuryDamageAmount, fields.trafficInjuryDamageAmount)) && (
            <AmountRow
              label="Tělesné poškození - úraz"
              amountValue={fields.trafficInjuryDamageAmount}
              amountKey="trafficInjuryDamageAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.trafficInjuryDamageAmount ?? null}
            />
          )}
          {(editMode || hasAmount(contract?.trafficAccidentDailyBenefit, fields.trafficAccidentDailyBenefit)) && (
            <AmountRow
              label="Denní odškodné - úraz"
              amountValue={fields.trafficAccidentDailyBenefit}
              amountKey="trafficAccidentDailyBenefit"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.trafficAccidentDailyBenefit ?? null}
            />
          )}
          {(editMode || hasAmount(contract?.trafficHospitalAccidentAmount, fields.trafficHospitalAccidentAmount)) && (
            <AmountRow
              label="Pobyt v nemocnici (úraz)"
              amountValue={fields.trafficHospitalAccidentAmount}
              amountKey="trafficHospitalAccidentAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.trafficHospitalAccidentAmount ?? null}
            />
          )}
          {(editMode || hasAmount(contract?.trafficWorkIncapacityAmount, fields.trafficWorkIncapacityAmount)) && (
            <AmountRow
              label="Pracovní neschopnost – úraz"
              amountValue={fields.trafficWorkIncapacityAmount}
              amountKey="trafficWorkIncapacityAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.trafficWorkIncapacityAmount ?? null}
            />
          )}
          {(editMode || hasAmount(contract?.trafficInvalidityAmount, fields.trafficInvalidityAmount)) && (
            <AmountRow
              label="Invalidita / snížená soběstačnost – úraz"
              amountValue={fields.trafficInvalidityAmount}
              amountKey="trafficInvalidityAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.trafficInvalidityAmount ?? null}
            />
          )}
        </div>
      )}

      {(editMode || hasLoan) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Pojištění úvěru</div>
          <AmountRow
            label="Smrt"
            amountValue={fields.loanDeathAmount}
            amountKey="loanDeathAmount"
            editMode={editMode}
            onChange={onChange}
            contractAmount={contract?.loanDeathAmount ?? null}
          />
          <div className="space-y-1">
            <div className="text-slate-200 text-sm font-semibold">Invalidita / snížená soběstačnost</div>
            {(editMode || hasAmount(contract?.loanInvalidity1, fields.loanInvalidity1)) && (
              <AmountRow
                label="Stupeň 1"
                amountValue={fields.loanInvalidity1}
                amountKey="loanInvalidity1"
                editMode={editMode}
                onChange={onChange}
                contractAmount={contract?.loanInvalidity1 ?? null}
              />
            )}
            {(editMode || hasAmount(contract?.loanInvalidity2, fields.loanInvalidity2)) && (
              <AmountRow
                label="Stupeň 2"
                amountValue={fields.loanInvalidity2}
                amountKey="loanInvalidity2"
                editMode={editMode}
                onChange={onChange}
                contractAmount={contract?.loanInvalidity2 ?? null}
              />
            )}
            {(editMode || hasAmount(contract?.loanInvalidity3, fields.loanInvalidity3)) && (
              <AmountRow
                label="Stupeň 3"
                amountValue={fields.loanInvalidity3}
                amountKey="loanInvalidity3"
                editMode={editMode}
                onChange={onChange}
                contractAmount={contract?.loanInvalidity3 ?? null}
              />
            )}
          </div>
          {(editMode || hasAmount(contract?.loanIllnessAmount, fields.loanIllnessAmount)) && (
            <AmountRow
              label="Vážná onemocnění"
              amountValue={fields.loanIllnessAmount}
              amountKey="loanIllnessAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.loanIllnessAmount ?? null}
            />
          )}
          {(editMode || hasAmount(contract?.loanWorkIncapacityAmount, fields.loanWorkIncapacityAmount)) && (
            <AmountRow
              label="Pracovní neschopnost (úraz nebo nemoc)"
              amountValue={fields.loanWorkIncapacityAmount}
              amountKey="loanWorkIncapacityAmount"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.loanWorkIncapacityAmount ?? null}
            />
          )}
        </div>
      )}

      {(editMode || hasAddon) && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/15 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-emerald-200">Doplňková připojištění</div>
          {(editMode || fields.addonMajakBasic || contract?.addonMajakBasic) && (
            <ToggleRow
              label="MAJÁK zdravotní a sociální infolinka"
              checked={fields.addonMajakBasic}
              onChange={(val) => onChange("addonMajakBasic", val)}
              disabled={!editMode}
            />
          )}
          {(editMode || fields.addonMajakPlus || contract?.addonMajakPlus) && (
            <ToggleRow
              label="MAJÁK+ konzultační a asistenční služby"
              checked={fields.addonMajakPlus}
              onChange={(val) => onChange("addonMajakPlus", val)}
              disabled={!editMode}
            />
          )}
          {(editMode || contract?.addonLiabilityCitizen != null || hasValue(fields.addonLiabilityCitizen)) && (
            <AmountRow
              label="Odpovědnost občana"
              amountValue={fields.addonLiabilityCitizen}
              amountKey="addonLiabilityCitizen"
              editMode={editMode}
              onChange={onChange}
              contractAmount={contract?.addonLiabilityCitizen ?? null}
            />
          )}
          {(editMode || contract?.addonTravel || fields.addonTravel) && (
            <ToggleRow
              label="Cestovní pojištění"
              checked={fields.addonTravel}
              onChange={(val) => onChange("addonTravel", val)}
              disabled={!editMode}
            />
          )}
        </div>
      )}
    </div>
  );
}
