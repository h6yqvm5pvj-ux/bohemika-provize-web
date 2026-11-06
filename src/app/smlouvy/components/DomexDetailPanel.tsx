import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  House,
  HousePlus,
  LifeBuoy,
  Shield,
  Sofa,
} from "lucide-react";
import type { Product } from "@/app/types/domain";
import { formatMoney as formatMoneyValue } from "@/app/lib/formatters";
import type { DomexNeuronData } from "@/app/lib/domexNeuronSchema";
import { normalizeDomexNeuronData } from "@/app/lib/domexNeuronValidation";
import { DomexNeuronObjectsPanel, DomexNeuronParserVersion } from "@/components/insurance/DomexNeuronObjectsPanel";

type DomexDetail = {
  neuron?: DomexNeuronData | null;
  address?: string | null;
  propertyAddress?: string | null;
  householdAddress?: string | null;
  propertyAssistance?: "basic" | "plus" | null;
  householdAssistance?: "basic" | "plus" | null;
  propertyType?: string | null;
  propertyCoverage?: string | null;
  sumInsured?: number | null;
  deductible?: number | null;
  householdType?: string | null;
  householdCoverage?: string | null;
  householdSumInsured?: number | null;
  householdDeductible?: number | null;
  outbuildingSumInsured?: number | null;
  liabilitySumInsured?: number | null;
  liabilityDeductible?: number | null;
  liabilityMobile?: boolean | null;
  liabilityTenant?: boolean | null;
  liabilityLandlord?: boolean | null;
  assistancePlus?: boolean | null;
  note?: string | null;
} | null;

export type DomexFields = {
  address: string;
  propertyAddress: string;
  householdAddress: string;
  propertyAssistance: string;
  householdAssistance: string;
  propertyType: string;
  propertyCoverage: string;
  sumInsured: string;
  deductible: string;
  householdType: string;
  householdCoverage: string;
  householdSumInsured: string;
  householdDeductible: string;
  outbuildingSumInsured: string;
  liabilitySumInsured: string;
  liabilityDeductible: string;
  liabilityMobile: boolean;
  liabilityTenant: boolean;
  liabilityLandlord: boolean;
  assistancePlus: boolean;
  note: string;
};

type DomexFieldKey = keyof DomexFields;

type Props = {
  prod?: Product | null;
  premiumIndexationEnabled?: boolean | null;
  editMode: boolean;
  fields: DomexFields;
  domexDetail: DomexDetail;
  onChange: (key: DomexFieldKey, value: string | boolean) => void;
  neuronData?: DomexNeuronData | null;
  onNeuronChange?: (next: DomexNeuronData) => void;
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
}) => {
  return (
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
};

const formatKc = (val?: number | null) =>
  formatMoneyValue(val, {
    emptyValueLabel: "—",
    minFractionDigits: 2,
    maxFractionDigits: 2,
  });

const propertyTypeLabel = (val?: string | null): string => {
  const key = (val ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    byt: "Byt",
    dum: "Dům",
    chata: "Chata",
    rekreace: "Rekreační objekt",
    ostatni: "Ostatní",
  };
  if (!key) return "—";
  return map[key] ?? (val ?? "—");
};

export function DomexDetailPanel({ prod, premiumIndexationEnabled, editMode, fields, domexDetail, onChange, neuronData, onNeuronChange }: Props) {
  if (prod !== "domex" && prod !== "domexneuron" && prod !== "maxdomov") return null;
  const isNeuron = prod === "domexneuron";
  const rawNeuron = isNeuron ? editMode ? neuronData ?? domexDetail?.neuron : domexDetail?.neuron : null;
  const hasCanonicalNeuron = rawNeuron != null;
  const canonicalNeuron = hasCanonicalNeuron ? normalizeDomexNeuronData(rawNeuron) : null;

  const hasValue = (v?: string | null) => !!(v && v.trim().length > 0);
  const hasNum = (v?: number | null) => v != null && Number.isFinite(v);

  const showPropertyBlock = !hasCanonicalNeuron && (
    editMode ||
    (isNeuron ? hasValue(domexDetail?.propertyAddress) || hasValue(domexDetail?.propertyAssistance) : hasValue(domexDetail?.address)) ||
    hasValue(domexDetail?.propertyType) ||
    hasValue(domexDetail?.propertyCoverage) ||
    hasNum(domexDetail?.sumInsured) ||
    hasNum(domexDetail?.deductible));

  const showOutbuildingBlock = hasCanonicalNeuron ? hasNum(domexDetail?.outbuildingSumInsured)
    : editMode || hasNum(domexDetail?.outbuildingSumInsured);

  const showHouseholdBlock = !hasCanonicalNeuron && (
    editMode ||
    (isNeuron && (hasValue(domexDetail?.householdAddress) || hasValue(domexDetail?.householdAssistance))) ||
    hasValue(domexDetail?.householdType) ||
    hasValue(domexDetail?.householdCoverage) ||
    hasNum(domexDetail?.householdSumInsured) ||
    hasNum(domexDetail?.householdDeductible));

  const showAssistance = !hasCanonicalNeuron && (isNeuron
    ? editMode || hasValue(domexDetail?.propertyAssistance) || hasValue(domexDetail?.householdAssistance)
    : editMode || !!domexDetail?.assistancePlus);

  const showLiabilityBlock = !hasCanonicalNeuron && (
    editMode ||
    hasNum(domexDetail?.liabilitySumInsured) ||
    hasNum(domexDetail?.liabilityDeductible) ||
    !!domexDetail?.liabilityMobile ||
    !!domexDetail?.liabilityTenant ||
    !!domexDetail?.liabilityLandlord);

  const showNote = editMode || hasValue(domexDetail?.note);
  const propertyAddress = domexDetail?.propertyAddress === undefined
    ? domexDetail?.address ?? "" : domexDetail.propertyAddress ?? "";
  const resolvedAddress = (editMode
    ? isNeuron ? fields.propertyAddress : fields.address
    : isNeuron ? propertyAddress : domexDetail?.address ?? ""
  ).trim();
  const cuzkHref = !isNeuron && resolvedAddress.length >= 2
    ? `/cuzk?address=${encodeURIComponent(resolvedAddress)}`
    : null;
  const hasInsuredAmounts = editMode
    ? [fields.sumInsured, fields.householdSumInsured].some(value => Number(value.replace(/\s/g, "").replace(",", ".")) > 0)
    : [domexDetail?.sumInsured, domexDetail?.householdSumInsured].some(value => hasNum(value) && value! > 0);
  const assistanceLabel = (value?: string | null) => value === "plus" ? "Asistence PLUS" : value === "basic" ? "Domácí asistence" : "Neurčeno";
  const formAmount = (text: string) => {
    const number = Number(text.replace(/\s/g, "").replace(",", "."));
    return text.trim() && Number.isFinite(number) && number >= 0 ? number : null;
  };

  return (
    <>
      {isNeuron && !hasCanonicalNeuron && <div className="sm:col-span-2"><DomexNeuronParserVersion version={null} /></div>}
      {hasCanonicalNeuron && canonicalNeuron && <DomexNeuronObjectsPanel
        value={canonicalNeuron} editMode={editMode} onChange={onNeuronChange} premiumIndexationEnabled={premiumIndexationEnabled}
        liability={{ sumInsured: editMode ? formAmount(fields.liabilitySumInsured) : domexDetail?.liabilitySumInsured ?? null,
          deductible: editMode ? formAmount(fields.liabilityDeductible) : domexDetail?.liabilityDeductible ?? null }}
        onLiabilityChange={(field, value) => onChange(field === "sumInsured" ? "liabilitySumInsured" : "liabilityDeductible", value == null ? "" : String(value))}
      />}
      {hasCanonicalNeuron && !canonicalNeuron && <p role="alert" className="text-sm text-amber-900 sm:col-span-2">Údaje objektů nelze bezpečně přečíst. Načtěte je znovu z PDF.</p>}
      {hasCanonicalNeuron && (domexDetail?.liabilityMobile === true || domexDetail?.liabilityTenant === true || domexDetail?.liabilityLandlord === true) &&
        <div className="space-y-2 rounded-2xl border border-slate-300 bg-white p-3">
          <h3 className="text-xs font-semibold text-slate-600">Uložené doplňky odpovědnosti</h3>
          {([
            ["liabilityMobile", "Náhrada újmy mobilní elektronice"],
            ["liabilityTenant", "Odpovědnost nájemce na věci nemovité"],
            ["liabilityLandlord", "Odpovědnost pronajímatele"],
          ] as const).filter(([field]) => domexDetail?.[field] === true).map(([field, label]) =>
            <ToggleRow key={field} label={label} checked={editMode ? fields[field] : true}
              onChange={next => onChange(field, next)} disabled={!editMode} />)}
        </div>}
      {isNeuron && !hasCanonicalNeuron && premiumIndexationEnabled === true && hasInsuredAmounts && (
        <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Uvedené pojistné částky se mohou v čase navyšovat z důvodu schválené valorizace.</span>
        </p>
      )}
      {showPropertyBlock && (
        <>
          <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
            <House size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
            <span>Pojištění stavby</span>
          </div>
          <div className="space-y-2 text-sm text-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <span className="shrink-0 text-slate-600">{isNeuron ? "Místo pojištění" : "Adresa"}</span>
              <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-center justify-end gap-2">
                <span className="min-w-0 max-w-full font-semibold text-right [overflow-wrap:anywhere]">
                  {editMode ? (
                    <input
                      type="text"
                      value={isNeuron ? fields.propertyAddress : fields.address}
                      onChange={(e) => onChange(isNeuron ? "propertyAddress" : "address", e.target.value)}
                      aria-label="Adresa pojištěné nemovitosti"
                      className="w-44 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                      placeholder="Adresa"
                    />
                  ) : (
                    resolvedAddress || "—"
                  )}
                </span>
                {cuzkHref && (
                  <Link
                    href={cuzkHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-left text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  >
                    <ExternalLink size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                    <span>Prověřit v katastru<span className="sr-only"> (otevře se v nové kartě)</span></span>
                  </Link>
                )}
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Typ nemovitosti</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <select
                    value={fields.propertyType}
                    onChange={(e) => onChange("propertyType", e.target.value)}
                    className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  >
                    <option value="">Vyber typ</option>
                    <option value="byt">{isNeuron ? "Bytová jednotka" : "Byt"}</option>
                    <option value="dum">{isNeuron ? "Rodinný dům" : "Dům"}</option>
                    <option value="chata">Chata</option>
                    <option value="rekreace">Rekreační objekt</option>
                    <option value="ostatni">Ostatní</option>
                  </select>
                ) : (
                  isNeuron && domexDetail?.propertyType === "dum" ? "Rodinný dům"
                    : isNeuron && domexDetail?.propertyType === "byt" ? "Bytová jednotka"
                    : propertyTypeLabel(domexDetail?.propertyType)
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{isNeuron ? "Varianta pojištění" : "Rozsah"}</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <select
                    value={fields.propertyCoverage}
                    onChange={(e) => onChange("propertyCoverage", e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  >
                    <option value="">Vyber</option>
                    <option value="mini">MINI</option>
                    <option value="opti">OPTI</option>
                    <option value="maxi">MAXI</option>
                    <option value="vip">VIP</option>
                    <option value="nop">NOP</option>
                  </select>
                ) : (
                  (domexDetail?.propertyCoverage ?? "").toUpperCase() || "—"
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Pojistná částka</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.sumInsured}
                    onChange={(e) => onChange("sumInsured", e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                    placeholder="částka"
                  />
                ) : (
                  formatKc(domexDetail?.sumInsured)
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Spoluúčast</span>
              <span className="font-semibold text-right">
                {editMode ? (
                  <input
                    type="number"
                    value={fields.deductible}
                    onChange={(e) => onChange("deductible", e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                    placeholder="Spoluúčast v Kč"
                  />
                ) : (
                  formatKc(domexDetail?.deductible)
                )}
              </span>
            </div>
          </div>
          </div>
        </>
      )}

      {showOutbuildingBlock && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
          <HousePlus size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
          <span>Vedlejší stavby</span>
        </div>
        <div className="space-y-2 text-sm text-slate-900">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.outbuildingSumInsured}
                  onChange={(e) => onChange("outbuildingSumInsured", e.target.value)}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="částka"
                />
              ) : (
                formatKc(domexDetail?.outbuildingSumInsured)
              )}
            </span>
          </div>
        </div>
        </div>
      )}

      {showHouseholdBlock && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
          <Sofa size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
          <span>Pojištění domácnosti</span>
        </div>
        <div className="space-y-2 text-sm text-slate-900">
          {isNeuron && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Místo pojištění</span>
              <span className="min-w-0 font-semibold text-right [overflow-wrap:anywhere]">
                {editMode ? (
                  <input
                    type="text"
                    value={fields.householdAddress}
                    onChange={(event) => onChange("householdAddress", event.target.value)}
                    aria-label="Adresa pojištěné domácnosti"
                    className="w-44 max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  />
                ) : domexDetail?.householdAddress || "—"}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Typ</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.householdType}
                  onChange={(e) => onChange("householdType", e.target.value)}
                  className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                >
                  <option value="">Vyber typ</option>
                  <option value="trvale">Trvale obydlená</option>
                  <option value="rekreacni">Rekreační</option>
                </select>
              ) : domexDetail?.householdType === "trvale" ? (
                "Trvale obydlená"
              ) : domexDetail?.householdType === "rekreacni" ? (
                "Rekreační"
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">{isNeuron ? "Varianta pojištění" : "Rozsah"}</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <select
                  value={fields.householdCoverage}
                  onChange={(e) => onChange("householdCoverage", e.target.value)}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                >
                  <option value="">Vyber</option>
                  <option value="mini">MINI</option>
                  <option value="opti">OPTI</option>
                  <option value="maxi">MAXI</option>
                  <option value="vip">VIP</option>
                  <option value="nop">NOP</option>
                </select>
              ) : (
                (domexDetail?.householdCoverage ?? "").toUpperCase() || "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Pojistná částka</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.householdSumInsured}
                  onChange={(e) => onChange("householdSumInsured", e.target.value)}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="částka"
                />
              ) : (
                formatKc(domexDetail?.householdSumInsured)
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Spoluúčast</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.householdDeductible}
                  onChange={(e) => onChange("householdDeductible", e.target.value)}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="Spoluúčast v Kč"
                />
              ) : (
                formatKc(domexDetail?.householdDeductible)
              )}
            </span>
          </div>
        </div>
        </div>
      )}

      {showAssistance && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
          <LifeBuoy size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
          <span>{isNeuron ? "Asistenční služby" : "Asistence PLUS"}</span>
        </div>
        {isNeuron ? (
          <dl className="space-y-2 text-sm text-slate-900">
            {([
              ["Stavba", "propertyAssistance"],
              ["Domácnost", "householdAssistance"],
            ] as const).map(([label, key]) => (editMode || hasValue(domexDetail?.[key])) && (
              <div key={key} className="flex justify-between gap-2">
                <dt className="text-slate-600">{label}</dt>
                <dd className="font-semibold text-right">
                  {editMode ? (
                    <select
                      aria-label={`Asistence ${label.toLowerCase()}`}
                      value={fields[key]}
                      onChange={(event) => onChange(key, event.target.value)}
                      className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                    >
                      <option value="">Neurčeno / nepojištěno</option>
                      <option value="basic">Domácí asistence</option>
                      <option value="plus">Asistence PLUS</option>
                    </select>
                  ) : assistanceLabel(domexDetail?.[key])}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <ToggleRow
            label="Asistence PLUS"
            checked={fields.assistancePlus}
            onChange={(val) => onChange("assistancePlus", val)}
            disabled={!editMode}
          />
        )}
        </div>
      )}

      {showLiabilityBlock && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
          <Shield size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
          <span>Pojištění odpovědnosti</span>
        </div>
        <div className="space-y-2 text-sm text-slate-900">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">{isNeuron ? "Limit pojistného plnění" : "Pojistná částka"}</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.liabilitySumInsured}
                  onChange={(e) => onChange("liabilitySumInsured", e.target.value)}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="částka"
                />
              ) : (
                formatKc(domexDetail?.liabilitySumInsured)
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Spoluúčast</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="number"
                  value={fields.liabilityDeductible}
                  onChange={(e) => onChange("liabilityDeductible", e.target.value)}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="Spoluúčast v Kč"
                />
              ) : (
                formatKc(domexDetail?.liabilityDeductible)
              )}
            </span>
          </div>
          {!isNeuron && <div className="space-y-1">
            <ToggleRow
              label="Náhrada újmy mobilní elektronice"
              checked={fields.liabilityMobile}
              onChange={(val) => onChange("liabilityMobile", val)}
              disabled={!editMode}
            />
            <ToggleRow
              label="Odpovědnost nájemce na věci nemovité"
              checked={fields.liabilityTenant}
              onChange={(val) => onChange("liabilityTenant", val)}
              disabled={!editMode}
            />
            <ToggleRow
              label="Odpovědnost pronajímatele"
              checked={fields.liabilityLandlord}
              onChange={(val) => onChange("liabilityLandlord", val)}
              disabled={!editMode}
            />
          </div>}
        </div>
        </div>
      )}

      {showNote && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-1 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="text-xs uppercase tracking-wide text-slate-600">
          Poznámka
        </div>
        {editMode ? (
          <textarea
            value={fields.note}
            onChange={(e) => onChange("note", e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900 resize-none"
            rows={3}
            placeholder="Poznámka k rizikům, rekonstrukci apod."
          />
        ) : (
          <span className="text-sm text-slate-900">
            {domexDetail?.note?.trim() || "—"}
          </span>
        )}
        </div>
      )}
    </>
  );
}
