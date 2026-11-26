import { InsuranceDetailHeading, InsuranceDetailIllustration } from "@/components/insurance/InsuranceDetailHeading";
import detailStyles from "@/components/insurance/insuranceDetail.module.css";
import autoStyles from "./autoDetail.module.css";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Car,
  CarFront,
  Check,
  CloudLightning,
  Copy,
  Flame,
  Hammer,
  KeyRound,
  LifeBuoy,
  Luggage,
  PackageOpen,
  PanelTop,
  PawPrint,
  Percent,
  Route,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { Product } from "@/app/types/domain";
import { autoAssistancePlanLabel } from "@/app/lib/autoAssistanceLabels";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";

export type AutoFields = {
  carMake: string;
  carPlate: string;
  carVin: string;
  carTp: string;
  carOrv: string;
  carAnnualMileage: string;
  carAllianzScope: string;
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
  carAddonKlikaLimit: string;
  carAddonGlass: boolean;
  carAddonGlassLimit: string;
  carAddonAnimalCollision: boolean;
  carAddonAnimalCollisionLimit: string;
  carAddonAnimalDamage: boolean;
  carAddonAnimalDamageLimit: string;
  carAddonVandalism: boolean;
  carAddonTheft: boolean;
  carAddonTheftLimit: string;
  carAddonNatural: boolean;
  carAddonNaturalLimit: string;
  carAddonOwnDamage: boolean;
  carAddonOwnDamageLimit: string;
  carAddonPothole: boolean;
  carAddonNonFaultAccident: boolean;
  carAddonGap: boolean;
  carAddonGapLimit: string;
  carAddonSmartGap: boolean;
  carAddonServisPro: boolean;
  carExtraBenefitProfi: boolean | null;
  carAddonReplacementCar: boolean;
  carAddonLuggage: boolean;
  carAddonTransportedGoods: boolean;
  carAddonFireExplosion: boolean;
  carAddonLegalAdvice: boolean;
  carAddonPassengerInjury: boolean;
  carAddonKeyLossTheft: boolean;
};

export type AutoDetail = {
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carTp?: string | null;
  carOrv?: string | null;
  carAnnualMileage?: string | null;
  carAllianzScope?: string | null;
  carLiabilityLimit?: number | null;
  carSlaviaDetail?: {
    liabilityVariant?: string | null;
    liabilityPropertyLimit?: number | null;
    priceGuarantee3Years?: boolean | null;
    driverInjury?: boolean | null;
    driverInjuryPermanentLimit?: number | null;
    driverInjuryDeathLimit?: number | null;
    tires?: boolean | null;
    tiresLimit?: number | null;
    tiresDeductible?: number | null;
    keyLossTheftLimit?: number | null;
    keyLossLimit?: number | null;
    keyLossTheftDeductible?: number | null;
    vandalismLimit?: number | null;
    vandalismDeductible?: number | null;
    animalDamageDeductible?: number | null;
  } | null;
  carHullSumInsured?: number | null;
  carHullSumInsuredText?: string | null;
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
  carAddonKlikaLimit?: number | null;
  carAddonGlass?: boolean | null;
  carAddonGlassLimit?: number | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalCollisionLimit?: number | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonAnimalDamageLimit?: number | null;
  carAddonVandalism?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonTheftLimit?: number | null;
  carAddonNatural?: boolean | null;
  carAddonNaturalLimit?: number | null;
  carAddonOwnDamage?: boolean | null;
  carAddonOwnDamageLimit?: number | null;
  carAddonPothole?: boolean | null;
  carAddonNonFaultAccident?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonGapLimit?: number | null;
  carAddonSmartGap?: boolean | null;
  carAddonServisPro?: boolean | null;
  carExtraBenefitProfi?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonTransportedGoods?: boolean | null;
  carAddonFireExplosion?: boolean | null;
  carAddonLegalAdvice?: boolean | null;
  carAddonPassengerInjury?: boolean | null;
  carAddonKeyLossTheft?: boolean | null;
} | null;

const formatMoney = (value: number | undefined | null) =>
  formatMoneyValue(value, {
    emptyValueLabel: "—",
    minFractionDigits: 0,
    maxFractionDigits: 2,
  });

const formatLimitLabel = (val: string): string => {
  if (!val) return "—";
  const num = Number(val);
  if (!Number.isFinite(num)) return "—";
  const mil = num / 1_000_000;
  return `${mil}/${mil} mil. Kč`;
};

type CoverageTone = "violet" | "sky" | "emerald" | "amber" | "rose" | "cyan";

const COVERAGE_ICON_CLASSES: Record<CoverageTone, string> = {
  violet: "border-violet-100 bg-violet-50 text-violet-600",
  sky: "border-sky-100 bg-sky-50 text-sky-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  rose: "border-rose-100 bg-rose-50 text-rose-700",
  cyan: "border-cyan-100 bg-cyan-50 text-cyan-700",
};

const AUTO_ADDON_VISUALS: Record<
  string,
  { icon: LucideIcon; tone: CoverageTone }
> = {
  carAddonEso: { icon: Sparkles, tone: "violet" },
  carAddonNaturalRisks: { icon: CloudLightning, tone: "cyan" },
  carAddonKlika: { icon: ShieldCheck, tone: "emerald" },
  carAddonGlass: { icon: PanelTop, tone: "sky" },
  carAddonAnimalCollision: { icon: PawPrint, tone: "amber" },
  carAddonAnimalDamage: { icon: PawPrint, tone: "amber" },
  carAddonVandalism: { icon: Hammer, tone: "rose" },
  carAddonTheft: { icon: KeyRound, tone: "violet" },
  carAddonNatural: { icon: CloudLightning, tone: "cyan" },
  carAddonOwnDamage: { icon: CarFront, tone: "rose" },
  carAddonPothole: { icon: Route, tone: "amber" },
  carAddonNonFaultAccident: { icon: ShieldCheck, tone: "emerald" },
  carAddonGap: { icon: Shield, tone: "violet" },
  carAddonSmartGap: { icon: Sparkles, tone: "violet" },
  carAddonServisPro: { icon: Wrench, tone: "sky" },
  carAddonReplacementCar: { icon: Car, tone: "cyan" },
  carAddonLuggage: { icon: Luggage, tone: "violet" },
  carAddonTransportedGoods: { icon: PackageOpen, tone: "sky" },
  carAddonFireExplosion: { icon: Flame, tone: "rose" },
  carAddonLegalAdvice: { icon: Scale, tone: "violet" },
  carAddonPassengerInjury: { icon: UsersRound, tone: "rose" },
  carAddonKeyLossTheft: { icon: KeyRound, tone: "amber" },
};

type Props = {
  prod?: Product | null;
  editMode: boolean;
  fields: AutoFields;
  contract: AutoDetail;
  onChange: (key: keyof AutoFields, value: string | boolean) => void;
};

type AutoAddonLimitField =
  | "carAddonKlikaLimit"
  | "carAddonGlassLimit"
  | "carAddonAnimalCollisionLimit"
  | "carAddonAnimalDamageLimit"
  | "carAddonTheftLimit"
  | "carAddonNaturalLimit"
  | "carAddonOwnDamageLimit"
  | "carAddonGapLimit";

const ToggleRow = ({
  label, checked, onChange, disabled = false, icon: Icon = ShieldCheck, tone = "violet",
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  icon?: LucideIcon;
  tone?: CoverageTone;
}) => (
  <button type="button" disabled={disabled} aria-pressed={checked} onClick={() => onChange(!checked)}
    className={autoStyles.coverage} data-editable={!disabled}>
    <span className={`${autoStyles.coverageIcon} ${checked ? COVERAGE_ICON_CLASSES[tone] : "border-slate-200 bg-slate-50 text-slate-400"}`}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </span>
    <span className={autoStyles.coverageTitle}>{label}</span>
    <span className={autoStyles.coverageCheck} data-checked={checked} aria-hidden="true"><Check size={11} strokeWidth={2.5} /></span>
  </button>
);

const AddonToggleWithLimitRow = ({
  label, checked, disabled, editMode, limitField, limitAmount, limitValue,
  onToggle, onLimitChange, icon: Icon = ShieldCheck, tone = "violet",
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  editMode: boolean;
  limitField: AutoAddonLimitField;
  limitAmount: number | null;
  limitValue: string;
  onToggle: (val: boolean) => void;
  onLimitChange: (key: AutoAddonLimitField, value: string) => void;
  icon?: LucideIcon;
  tone?: CoverageTone;
}) => (
  <div className={autoStyles.coverage} data-editable={!disabled}>
    <span className={`${autoStyles.coverageIcon} ${checked ? COVERAGE_ICON_CLASSES[tone] : "border-slate-200 bg-slate-50 text-slate-400"}`}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </span>
    <button type="button" disabled={disabled} aria-pressed={checked} onClick={() => onToggle(!checked)} className={autoStyles.coverageTitle}>{label}</button>
    {checked && editMode && (
      <div className={autoStyles.coverageLimit}>
        <label className="flex flex-wrap items-center gap-2 text-xs font-normal text-slate-500">
          Limit v Kč
          <input type="text" inputMode="decimal" value={limitValue} onChange={event => onLimitChange(limitField, event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" placeholder="20 000" />
        </label>
      </div>
    )}
    {checked && !editMode && limitAmount != null && <div className={autoStyles.coverageLimit}>Limit {formatMoney(limitAmount)}</div>}
    <button type="button" disabled={disabled} aria-pressed={checked} aria-label={`${checked ? "Odebrat" : "Přidat"} připojištění ${label}`}
      onClick={() => onToggle(!checked)} className={autoStyles.coverageCheck} data-checked={checked}>
      <Check size={11} strokeWidth={2.5} aria-hidden="true" />
    </button>
  </div>
);

const SectionTitle = ({ icon, label, tone }: { icon: LucideIcon; label: string; tone?: CoverageTone }) => (
  <InsuranceDetailHeading icon={icon} tone={tone} className={autoStyles.sectionHeading}>{label}</InsuranceDetailHeading>
);

export function AutoDetailPanel({ prod, editMode, fields, contract, onChange }: Props) {
  const [copiedVehicleField, setCopiedVehicleField] = useState<
    "plate" | "orv" | "vin" | null
  >(null);
  if (!prod) return null;
  const copyVehicleValue = async (
    field: "plate" | "orv" | "vin",
    value: string
  ) => {
    if (!value || value === "—" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedVehicleField(field);
      window.setTimeout(() => {
        setCopiedVehicleField((current) => (current === field ? null : current));
      }, 1_800);
    } catch {
      setCopiedVehicleField(null);
    }
  };
  const showAnnualMileageBox = prod === "allianzAuto" || prod === "pillowAuto";
  const showAllianzScopeBox = prod === "allianzAuto";
  const hasTextValue = (value: string | undefined | null) => {
    const normalized = value?.trim();
    return Boolean(normalized && normalized !== "—" && normalized !== "-");
  };
  const hasTpValue = hasTextValue(contract?.carTp) || hasTextValue(fields.carTp);
  const slaviaDetail = prod === "slaviaauto" ? contract?.carSlaviaDetail : null;
  const slaviaMoney = (value: number | undefined | null) =>
    value != null && Number.isFinite(value) ? formatMoney(value) : "—";
  const slaviaAddonDetail = (key: string): string | null => {
    if (!slaviaDetail) return null;
    switch (key) {
      case "carAddonAnimalDamage":
        return `Limit ${slaviaMoney(contract?.carAddonAnimalDamageLimit)} · spoluúčast ${slaviaMoney(slaviaDetail.animalDamageDeductible)}`;
      case "carAddonVandalism":
        return `Limit ${slaviaMoney(slaviaDetail.vandalismLimit)} · spoluúčast ${slaviaMoney(slaviaDetail.vandalismDeductible)}`;
      case "carAddonKeyLossTheft":
        return `Limit ${slaviaMoney(slaviaDetail.keyLossTheftLimit)} · pro ztrátu ${slaviaMoney(slaviaDetail.keyLossLimit)} · spoluúčast ${slaviaMoney(slaviaDetail.keyLossTheftDeductible)}`;
      default:
        return null;
    }
  };

  const hasHullData =
    contract?.carHullSumInsured != null ||
    (contract?.carHullSumInsuredText?.trim() ?? "") !== "" ||
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
  const numericLimit = (value: number | undefined | null) =>
    value != null && Number.isFinite(value) ? value : null;
  const addonLimitConfig: Partial<
    Record<string, { field: AutoAddonLimitField; amount: number | null }>
  > = {
    carAddonKlika: {
      field: "carAddonKlikaLimit",
      amount: numericLimit(contract?.carAddonKlikaLimit),
    },
    carAddonGlass: {
      field: "carAddonGlassLimit",
      amount: numericLimit(contract?.carAddonGlassLimit),
    },
    carAddonAnimalCollision: {
      field: "carAddonAnimalCollisionLimit",
      amount: numericLimit(contract?.carAddonAnimalCollisionLimit),
    },
    carAddonAnimalDamage: {
      field: "carAddonAnimalDamageLimit",
      amount: numericLimit(contract?.carAddonAnimalDamageLimit),
    },
    carAddonTheft: {
      field: "carAddonTheftLimit",
      amount: numericLimit(contract?.carAddonTheftLimit),
    },
    carAddonNatural: {
      field: "carAddonNaturalLimit",
      amount: numericLimit(contract?.carAddonNaturalLimit),
    },
    carAddonOwnDamage: {
      field: "carAddonOwnDamageLimit",
      amount: numericLimit(contract?.carAddonOwnDamageLimit),
    },
    carAddonGap: {
      field: "carAddonGapLimit",
      amount: numericLimit(contract?.carAddonGapLimit),
    },
  };
  const vehicleMake = contract?.carMake || fields.carMake || "—";
  const vehiclePlate = contract?.carPlate || fields.carPlate || "—";
  const vehicleVin = contract?.carVin || fields.carVin || "—";
  const vehicleTp = contract?.carTp || fields.carTp || "—";
  const vehicleOrv = contract?.carOrv || fields.carOrv || "—";
  const activeAddonCount =
    Object.keys(AUTO_ADDON_VISUALS).filter(
      (key) => fields[key as keyof AutoFields] === true
    ).length +
    (slaviaDetail?.driverInjury === true ? 1 : 0) +
    (slaviaDetail?.tires === true ? 1 : 0);
  const hasAnyAddon = activeAddonCount > 0;

  return (
    <div className={autoStyles.layout}>
      <section className={autoStyles.vehicleArea} aria-label="Pojištěné vozidlo">
        <div className={`${detailStyles.card} ${autoStyles.compactCard}`} data-detail-tone="sky">
          <div className={autoStyles.vehicleHeader}>
            <InsuranceDetailIllustration icon={CarFront} className={autoStyles.vehicleIllustration} />
            <div className={autoStyles.vehicleIdentity}>
              <p className={autoStyles.eyebrow}>Pojištěné vozidlo</p>
              {editMode ? (
                <label className={autoStyles.editField}>
                  <span className="sr-only">Značka a model vozidla</span>
                  <input type="text" value={fields.carMake} onChange={event => onChange("carMake", event.target.value)} placeholder="např. Škoda Octavia" />
                </label>
              ) : <h3 className={autoStyles.vehicleName}>{vehicleMake}</h3>}
            </div>
          </div>
          {editMode ? (
            <div className={autoStyles.vehicleFields}>
              {([
                ["carPlate", "SPZ"], ["carOrv", "Číslo ORV"], ["carVin", "VIN"], ["carTp", "Číslo TP"],
              ] as const).map(([field, label]) => (
                <label key={field} className={autoStyles.editField}>
                  <span>{label}</span>
                  <input type="text" value={fields[field]} onChange={event => onChange(field, event.target.value)} />
                </label>
              ))}
            </div>
          ) : (
            <div className={autoStyles.vehicleFields}>
              {([
                ["plate", "SPZ", vehiclePlate], ["orv", "ORV", vehicleOrv], ["vin", "VIN", vehicleVin],
              ] as const).filter(([, , value]) => value !== "—").map(([field, label, value]) => (
                <button key={field} type="button" onClick={() => void copyVehicleValue(field, value)}
                  aria-label={copiedVehicleField === field ? `${label} zkopírováno` : `Zkopírovat ${label} ${value}`}
                  title={`Kliknutím zkopíruješ ${label}`} className={autoStyles.vehicleField}>
                  <span>
                    <span className={autoStyles.vehicleFieldLabel}>{label}</span>
                    <span className={autoStyles.vehicleFieldValue}>{value}</span>
                  </span>
                  {copiedVehicleField === field
                    ? <Check size={16} className={autoStyles.copiedIcon} aria-hidden="true" />
                    : <Copy size={15} className={autoStyles.copyIcon} aria-hidden="true" />}
                </button>
              ))}
              {hasTpValue && <div className={autoStyles.vehicleField}>
                <span><span className={autoStyles.vehicleFieldLabel}>TP</span><span className={autoStyles.vehicleFieldValue}>{vehicleTp}</span></span>
              </div>}
            </div>
          )}
        </div>

      {showAnnualMileageBox && (
        <div className={`${detailStyles.card} ${autoStyles.compactCard} space-y-2`} data-detail-tone="sky">
          <SectionTitle icon={Route} label="Roční nájezd km" tone="sky" />
          <div className={autoStyles.summary}>
            <div className={autoStyles.summaryRow}>
              <span className="text-slate-600">Hodnota</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="text"
                    value={fields.carAnnualMileage}
                    onChange={(e) => onChange("carAnnualMileage", e.target.value)}
                    className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                    placeholder="např. 10 000 km"
                  />
                ) : (
                  contract?.carAnnualMileage || fields.carAnnualMileage || "—"
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {showAllianzScopeBox && (
        <div className={`${detailStyles.card} ${autoStyles.compactCard} space-y-2`} data-detail-tone="violet">
          <SectionTitle icon={Sparkles} label="Rozsah" tone="violet" />
          <div className={autoStyles.summary}>
            <div className={autoStyles.summaryRow}>
              <span className="text-slate-600">Varianta</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <select
                    value={fields.carAllianzScope}
                    onChange={(e) => onChange("carAllianzScope", e.target.value)}
                    className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  >
                    <option value="">Vyber rozsah</option>
                    <option value="Komfort">Komfort</option>
                    <option value="Plus">Plus</option>
                    <option value="Extra">Extra</option>
                    <option value="Max">Max</option>
                  </select>
                ) : (
                  contract?.carAllianzScope || fields.carAllianzScope || "—"
                )}
              </span>
            </div>
          </div>
        </div>
      )}
      </section>

      <div className={autoStyles.content}>
        <div className={autoStyles.primaryGrid}>

      <div className={`${detailStyles.card} ${autoStyles.compactCard} space-y-2`} data-detail-tone="emerald">
        <SectionTitle icon={ShieldCheck} label="Povinné ručení" tone="emerald" />
        <div className={autoStyles.summary}>
          <div className={autoStyles.summaryRow} data-highlight={!editMode}>
            <span className="text-slate-600">
              {slaviaDetail ? "Limit újmy na zdraví" : "Limity"}
            </span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.carLiabilityLimit}
                  onChange={(e) => onChange("carLiabilityLimit", e.target.value)}
                  className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                >
                  <option value="">Vyber limit</option>
                  <option value={50_000_000}>50/50 mil. Kč</option>
                  <option value={60_000_000}>60/60 mil. Kč</option>
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
          {slaviaDetail?.liabilityPropertyLimit != null && (
            <div className={autoStyles.summaryRow}>
              <span className="text-slate-600">Limit škody na majetku</span>
              <span className="font-semibold text-right">
                {formatMoney(slaviaDetail.liabilityPropertyLimit)}
              </span>
            </div>
          )}
          {slaviaDetail?.liabilityVariant && (
            <div className={autoStyles.summaryRow}>
              <span className="text-slate-600">Varianta</span>
              <span className="font-semibold text-right">
                {slaviaDetail.liabilityVariant}
              </span>
            </div>
          )}
          {slaviaDetail?.priceGuarantee3Years === true && (
            <div className={autoStyles.summaryRow}>
              <span className="text-slate-600">Garance ceny na 3 roky</span>
              <span className="font-semibold text-right">Sjednáno</span>
            </div>
          )}
        </div>
      </div>

      <div className={`${detailStyles.card} ${autoStyles.compactCard} space-y-2`} data-detail-tone="sky">
        <SectionTitle icon={LifeBuoy} label="Asistence" tone="sky" />
        <div className={autoStyles.summary}>
          <div className={autoStyles.summaryRow}>
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
                  <option value="Nadstandard">Nadstandard</option>
                  <option value="Bez limitu">Bez limitu</option>
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
                  <option value="Odtah 50 km při nehodě">Odtah 50 km při nehodě</option>
                  <option value="Odtah 50 km">Odtah 50 km</option>
                  <option value="Odtah v ČR neomezeně">Odtah v ČR neomezeně</option>
                  <option value="Odtah i ze zahraničí">Odtah i ze zahraničí</option>
                </select>
              ) : (
                autoAssistancePlanLabel(contract?.carAssistancePlan ?? fields.carAssistancePlan)
              )}
            </span>
          </div>
        </div>
      </div>
        </div>

      {(editMode || hasHullData) && (
        <div className={`${detailStyles.card} ${autoStyles.compactCard} space-y-2`} data-detail-tone="rose">
          <SectionTitle icon={Car} label="Havarijní pojištění" tone="rose" />
          <div className={autoStyles.summary}>
            <div className={autoStyles.summaryRow}>
              <span className="text-slate-600">Pojistná částka</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="text"
                    value={fields.carHullSumInsured}
                    onChange={(e) => onChange("carHullSumInsured", e.target.value)}
                    className="w-56 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                    placeholder="např. 200000 nebo Obvyklá cena vozidla"
                  />
                ) : (contract?.carHullSumInsuredText?.trim() ?? "") !== "" ? (
                  contract?.carHullSumInsuredText?.trim()
                ) : contract?.carHullSumInsured != null ? (
                  formatMoney(contract.carHullSumInsured)
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className={autoStyles.summaryRow}>
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
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
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
                .map((item) => {
                  const visual =
                    AUTO_ADDON_VISUALS[
                      item.key === "carHullRiskAccident"
                        ? "carAddonOwnDamage"
                        : item.key === "carHullRiskTheft"
                          ? "carAddonTheft"
                          : item.key === "carHullRiskNatural"
                            ? "carAddonNatural"
                            : item.key === "carHullRiskVandalism"
                              ? "carAddonVandalism"
                              : "carAddonAnimalCollision"
                    ];
                  return (
                    <ToggleRow
                      key={item.key}
                      label={item.label}
                      checked={item.checked}
                      onChange={(val) => onChange(item.key as keyof AutoFields, val)}
                      disabled={!editMode}
                      icon={visual.icon}
                      tone={visual.tone}
                    />
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {(prod === "cppAuto" && (editMode || contract?.carExtraBenefitProfi != null)) && (
        <div className={`${detailStyles.card} ${autoStyles.compactCard} space-y-2`} data-detail-tone="emerald">
          <SectionTitle icon={Percent} label="EXTRA BENEFIT PROFI" tone="emerald" />
          {editMode ? (
            <label className="flex min-h-[56px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600">
                <Percent size={16} strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="flex-1 font-bold text-slate-900">Sjednáno</span>
              <select
                aria-label="Extra Benefit PROFI sjednáno"
                value={fields.carExtraBenefitProfi == null ? "" : String(fields.carExtraBenefitProfi)}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange("carExtraBenefitProfi", value === "" ? "" : value === "true");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
              >
                <option value="">Neznámé</option>
                <option value="true">Ano</option>
                <option value="false">Ne</option>
              </select>
            </label>
          ) : (
            <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-600">
                <Percent size={16} strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                {contract?.carExtraBenefitProfi ? "Ano" : "Ne"}
              </span>
            </div>
          )}
        </div>
      )}

      <div className={`${detailStyles.card} ${autoStyles.compactCard} space-y-2`} data-detail-tone="violet">
        <div className={autoStyles.addonsHeading}>
          <SectionTitle icon={Wrench} label="Připojištění" tone="violet" />
          {!editMode && (
            <span className={autoStyles.addonCount}>
              {activeAddonCount === 1 ? "1 aktivní" : `${activeAddonCount} aktivních`}
            </span>
          )}
        </div>
        <div className={autoStyles.addonsGrid}>
          {!editMode && !hasAnyAddon && (
            <div className="col-span-full flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-3 text-sm text-slate-500">
              <Shield size={18} strokeWidth={1.9} className="text-slate-400" aria-hidden="true" />
              U této smlouvy není evidované žádné připojištění.
            </div>
          )}
          {!editMode && slaviaDetail?.driverInjury === true && (
            <div className="space-y-1">
              <ToggleRow
                label="Úraz řidiče"
                checked
                onChange={() => undefined}
                disabled
                icon={UsersRound}
                tone="rose"
              />
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Trvalé následky {slaviaMoney(slaviaDetail.driverInjuryPermanentLimit)} · smrt úrazem {slaviaMoney(slaviaDetail.driverInjuryDeathLimit)}
              </p>
            </div>
          )}
          {!editMode && slaviaDetail?.tires === true && (
            <div className="space-y-1">
              <ToggleRow
                label="Pojištění pneumatik"
                checked
                onChange={() => undefined}
                disabled
                icon={Route}
                tone="sky"
              />
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Limit {slaviaMoney(slaviaDetail.tiresLimit)} · spoluúčast {slaviaMoney(slaviaDetail.tiresDeductible)}
              </p>
            </div>
          )}
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
            {
              key: "carAddonAnimalDamage",
              label:
                prod === "slaviaauto"
                  ? "Poškození kabelů vozidla zvířetem"
                  : "Poškození zvěří",
              checked: fields.carAddonAnimalDamage,
            },
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
            {
              key: "carAddonFireExplosion",
              label: "Požár a výbuch",
              checked: fields.carAddonFireExplosion,
            },
            {
              key: "carAddonLegalAdvice",
              label: "Právní poradenství",
              checked: fields.carAddonLegalAdvice,
            },
            { key: "carAddonPassengerInjury", label: "Úraz všech osob", checked: fields.carAddonPassengerInjury },
            { key: "carAddonKeyLossTheft", label: "Ztráta a odcizení klíčů", checked: fields.carAddonKeyLossTheft },
          ]
            .filter((item) => editMode || item.checked)
            .map((item) => {
              const visual = AUTO_ADDON_VISUALS[item.key] ?? {
                icon: ShieldCheck,
                tone: "violet" as CoverageTone,
              };
              const limitConfig = addonLimitConfig[item.key];
              const showLimitInput = Boolean(limitConfig && editMode && item.checked);
              const showLimitValue = Boolean(
                limitConfig &&
                  !editMode &&
                  limitConfig.amount != null &&
                  !(prod === "slaviaauto" && item.key === "carAddonAnimalDamage")
              );
              const showInlineLimit =
                (item.key === "carAddonGlass" || item.key === "carAddonKlika") && limitConfig;

              if (showInlineLimit) {
                return (
                  <AddonToggleWithLimitRow
                    key={item.key}
                    label={item.label}
                    checked={item.checked}
                    disabled={!editMode}
                    editMode={editMode}
                    limitField={limitConfig.field}
                    limitAmount={limitConfig.amount}
                    limitValue={fields[limitConfig.field]}
                    onToggle={(val) => onChange(item.key as keyof AutoFields, val)}
                    onLimitChange={(key, value) => onChange(key, value)}
                    icon={visual.icon}
                    tone={visual.tone}
                  />
                );
              }

              return (
                <div key={item.key} className="space-y-2">
                  <ToggleRow
                    label={item.label}
                    checked={item.checked}
                    onChange={(val) => onChange(item.key as keyof AutoFields, val)}
                    disabled={!editMode}
                    icon={visual.icon}
                    tone={visual.tone}
                  />
                  {!editMode && slaviaAddonDetail(item.key) && (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {slaviaAddonDetail(item.key)}
                    </p>
                  )}
                  {(showLimitInput || showLimitValue) && limitConfig && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {prod === "kooperativaAuto" && item.key === "carAddonAnimalDamage" ? "Roční limit plnění" : "Částka v Kč"}
                      </div>
                      {editMode ? (
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={fields[limitConfig.field]}
                            onChange={(e) => onChange(limitConfig.field, e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 pr-9 text-xs font-semibold text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
                            placeholder="např. 20 000"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-slate-500">
                            Kč
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-slate-900">
                          {formatMoney(limitConfig.amount)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      </div>
    </div>
  );
}
