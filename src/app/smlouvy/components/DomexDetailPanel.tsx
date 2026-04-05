import React from "react";
import {
  House,
  HousePlus,
  LifeBuoy,
  Shield,
  Sofa,
} from "lucide-react";
import type { Product } from "@/app/types/domain";

type DomexDetail = {
  address?: string | null;
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
  editMode: boolean;
  fields: DomexFields;
  domexDetail: DomexDetail;
  onChange: (key: DomexFieldKey, value: string | boolean) => void;
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
  val != null && Number.isFinite(val) ? `${val.toLocaleString("cs-CZ")} Kč` : "—";

export function DomexDetailPanel({ prod, editMode, fields, domexDetail, onChange }: Props) {
  if (prod !== "domex") return null;

  const hasValue = (v?: string | null) => !!(v && v.trim().length > 0);
  const hasNum = (v?: number | null) => v != null && Number.isFinite(v);

  const showPropertyBlock =
    editMode ||
    hasValue(domexDetail?.address) ||
    hasValue(domexDetail?.propertyType) ||
    hasValue(domexDetail?.propertyCoverage) ||
    hasNum(domexDetail?.sumInsured) ||
    hasNum(domexDetail?.deductible);

  const showOutbuildingBlock = editMode || hasNum(domexDetail?.outbuildingSumInsured);

  const showHouseholdBlock =
    editMode ||
    hasValue(domexDetail?.householdType) ||
    hasValue(domexDetail?.householdCoverage) ||
    hasNum(domexDetail?.householdSumInsured) ||
    hasNum(domexDetail?.householdDeductible);

  const showAssistance = editMode || !!domexDetail?.assistancePlus;

  const showLiabilityBlock =
    editMode ||
    hasNum(domexDetail?.liabilitySumInsured) ||
    hasNum(domexDetail?.liabilityDeductible) ||
    !!domexDetail?.liabilityMobile ||
    !!domexDetail?.liabilityTenant ||
    !!domexDetail?.liabilityLandlord;

  const showNote = editMode || hasValue(domexDetail?.note);

  return (
    <>
      {showPropertyBlock && (
        <div className="rounded-2xl border border-slate-300 bg-white p-3 space-y-2 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
          <House size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
          <span>Pojištění stavby</span>
        </div>
        <div className="space-y-2 text-sm text-slate-900">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Adresa</span>
            <span className="font-semibold text-right">
              {editMode ? (
                <input
                  type="text"
                  value={fields.address}
                  onChange={(e) => onChange("address", e.target.value)}
                  className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-900"
                  placeholder="Adresa"
                />
              ) : (
                domexDetail?.address || "—"
              )}
            </span>
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
                  <option value="byt">Byt</option>
                  <option value="dum">Dům</option>
                  <option value="chata">Chata</option>
                  <option value="rekreace">Rekreační objekt</option>
                  <option value="ostatni">Ostatní</option>
                </select>
              ) : (
                domexDetail?.propertyType || "—"
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Rozsah</span>
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
            <span className="text-slate-600">Rozsah</span>
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
          <span>Asistence PLUS</span>
        </div>
        <ToggleRow
          label="Asistence PLUS"
          checked={fields.assistancePlus}
          onChange={(val) => onChange("assistancePlus", val)}
          disabled={!editMode}
        />
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
            <span className="text-slate-600">Pojistná částka</span>
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
          <div className="space-y-1">
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
          </div>
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
