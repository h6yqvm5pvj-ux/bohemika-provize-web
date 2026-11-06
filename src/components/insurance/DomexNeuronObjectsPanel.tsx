"use client";

import { AlertTriangle, House, Plus, Shield, Sofa, Trash2 } from "lucide-react";
import {
  DOMEX_EXTRACTION_STATUSES, DOMEX_NEURON_MAX_OBJECTS, DOMEX_NEURON_OBJECT_FIELDS, DOMEX_NEURON_PARSER_VERSION,
  type DomexExtractionStatus, type DomexNeuronData, type DomexNeuronObject, type DomexNeuronObjectKind,
} from "@/app/lib/domexNeuronSchema";
import { formatMoney } from "@/app/lib/formatters";
import { nextDomexNeuronObjectId } from "@/app/lib/domexNeuronMerge";

export type DomexNeuronObjectsPanelProps = {
  value: DomexNeuronData;
  editMode?: boolean;
  onChange?: (next: DomexNeuronData) => void;
  premiumIndexationEnabled?: boolean | null;
  liability?: { sumInsured: number | null; deductible: number | null };
  onLiabilityChange?: (field: "sumInsured" | "deductible", value: number | null) => void;
  className?: string;
};

export const domexNeuronStatusLabel = (status: DomexExtractionStatus): string => ({
  found: "Nalezeno", not_insured: "Nesjednáno", not_found: "Nenalezeno v PDF", unreadable: "Nelze přečíst z PDF",
})[status];

const inputClass = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200";
const cardClass = "min-w-0 rounded-2xl border border-slate-300 bg-white p-3 shadow-[0_6px_16px_rgba(15,23,42,0.06)]";
const labelClass = "block text-xs font-semibold text-slate-600";
const numberValue = (raw: string) => {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const TYPE_LABELS: Record<string, string> = { dum: "Rodinný dům", byt: "Bytová jednotka", trvale: "Trvale obydlená", rekreacni: "Rekreační" };
const FIELD_LABELS = { type: "Typ", address: "Místo pojištění", coverage: "Varianta pojištění", sumInsured: "Pojistná částka", deductible: "Spoluúčast", assistance: "Asistence" };
type ObjectField = typeof DOMEX_NEURON_OBJECT_FIELDS[number];

export function DomexNeuronParserVersion({ version }: { version?: number | null }) {
  return <p className="text-xs text-slate-500" data-parser-version={version ?? "unknown"}>
    {version == null ? "Verze parseru: neuvedena (ruční nebo starší údaje)."
      : `Verze parseru: ${version}.${version < DOMEX_NEURON_PARSER_VERSION ? " Starší zpracování PDF; údaje lze znovu načíst z PDF." : ""}`}
  </p>;
}

function StatusSelect({ label, status, onChange, foundDisabled = false }: {
  label: string; status: DomexExtractionStatus; onChange: (status: DomexExtractionStatus) => void; foundDisabled?: boolean;
}) {
  return <label className={`${labelClass} space-y-1`}>
    <span>{label}</span>
    <select value={status} onChange={event => onChange(event.target.value as DomexExtractionStatus)} className={inputClass}>
      {DOMEX_EXTRACTION_STATUSES.map(value => <option key={value} value={value} disabled={value === "found" && foundDisabled}>
        {domexNeuronStatusLabel(value)}
      </option>)}
    </select>
  </label>;
}

function ObjectFieldEditor({ object, field, onValueChange, onStatusChange }: {
  object: DomexNeuronObject; field: ObjectField;
  onValueChange: (value: string | number | null) => void; onStatusChange: (status: DomexExtractionStatus) => void;
}) {
  const value = object[field];
  const label = FIELD_LABELS[field];
  return <div className="min-w-0 space-y-2" data-field={field}>
    <label className={`${labelClass} space-y-1`}>
      <span>{label}</span>
      {field === "coverage" || field === "assistance" ? <select className={inputClass} value={value ?? ""}
        onChange={event => onValueChange(event.target.value || null)}>
        <option value="">Neuvedeno</option>
        {(field === "coverage" ? ["mini", "opti", "maxi", "nop"] : ["basic", "plus"]).map(option =>
          <option key={option} value={option}>{option === "basic" ? "Domácí asistence" : option.toUpperCase()}</option>)}
      </select> : <input className={inputClass} value={value ?? ""} type={field === "sumInsured" || field === "deductible" ? "number" : "text"}
        min={field === "sumInsured" || field === "deductible" ? 0 : undefined}
        max={field === "sumInsured" || field === "deductible" ? 1_000_000_000 : undefined}
        step={field === "sumInsured" || field === "deductible" ? "0.01" : undefined}
        maxLength={field === "type" || field === "address" ? 200 : undefined}
        onChange={event => onValueChange(field === "sumInsured" || field === "deductible"
          ? numberValue(event.target.value) : event.target.value || null)} />}
    </label>
    <StatusSelect label={`Stav údaje: ${label.toLowerCase()}`} status={object.fields[field]}
      foundDisabled={value == null || value === ""} onChange={onStatusChange} />
  </div>;
}

function objectValue(object: DomexNeuronObject, field: ObjectField): string {
  const value = object[field];
  if (value == null || value === "") return domexNeuronStatusLabel(object.fields[field]);
  if (typeof value === "number") return formatMoney(value);
  if (field === "coverage") return value.toUpperCase();
  if (field === "assistance") return value === "plus" ? "Asistence PLUS" : "Domácí asistence";
  return field === "type" ? TYPE_LABELS[value] ?? value : value;
}

export function DomexNeuronObjectsPanel({ value, editMode = false, onChange, premiumIndexationEnabled, liability,
  onLiabilityChange, className = "" }: DomexNeuronObjectsPanelProps) {
  const editable = editMode && Boolean(onChange);
  const addObject = (kind: DomexNeuronObjectKind) => {
    if (value.objects.length >= DOMEX_NEURON_MAX_OBJECTS) return;
    const object: DomexNeuronObject = { id: nextDomexNeuronObjectId(value.objects, kind), kind, type: null, address: null,
      coverage: null, sumInsured: null, deductible: null, assistance: null,
      fields: { type: "not_found", address: "not_found", coverage: "not_found", sumInsured: "not_found", deductible: "not_found", assistance: "not_found" } };
    onChange?.({ ...value, sections: { ...value.sections, [kind]: "found" }, objects: [...value.objects, object] });
  };
  const removeObject = (object: DomexNeuronObject) => {
    const objects = value.objects.filter(item => item.id !== object.id);
    onChange?.({ ...value, objects, sections: { ...value.sections,
      [object.kind]: objects.some(item => item.kind === object.kind) ? "found" : "not_found" } });
  };
  const changeField = (object: DomexNeuronObject, field: ObjectField, next: string | number | null) => {
    const draft = typeof next === "string" ? next || null : next;
    const hasValue = draft != null && (typeof draft !== "string" || draft.trim().length > 0);
    onChange?.({ ...value, sections: { ...value.sections, [object.kind]: "found", ...(field === "assistance" && hasValue ? { assistance: "found" as const } : {}) }, objects: value.objects.map(item =>
      item.id === object.id ? { ...item, [field]: draft, fields: { ...item.fields, [field]: hasValue ? "found" : "not_found" } } : item) });
  };
  const changeFieldStatus = (object: DomexNeuronObject, field: ObjectField, status: DomexExtractionStatus) => {
    if (status === "found" && object[field] == null) return;
    onChange?.({ ...value, objects: value.objects.map(item => item.id === object.id
      ? { ...item, [field]: status === "found" ? item[field] : null, fields: { ...item.fields, [field]: status } } : item) });
  };
  const changeSection = (section: keyof DomexNeuronData["sections"], status: DomexExtractionStatus) => {
    if ((section === "property" || section === "household") && status === "found" && !value.objects.some(object => object.kind === section)) {
      addObject(section); return;
    }
    if (section === "liability" && status !== "found") {
      onLiabilityChange?.("sumInsured", null); onLiabilityChange?.("deductible", null);
    }
    onChange?.({ ...value, sections: { ...value.sections, [section]: status },
      ...(section === "property" || section === "household" ? { objects: status === "found" ? value.objects : value.objects.filter(object => object.kind !== section) } : {}),
      ...(section === "liability" && status !== "found" ? { liabilityFields: { sumInsured: status, deductible: status } } : {}),
      ...(section === "assistance" && status !== "found" ? { objects: value.objects.map(object => ({ ...object, assistance: null, fields: { ...object.fields, assistance: status } })) } : {}),
    });
  };
  return <section className={`min-w-0 space-y-4 sm:col-span-2 ${className}`} aria-label="Objekty a údaje DOMEX Neuron">
    <DomexNeuronParserVersion version={value.parserVersion} />
    {premiumIndexationEnabled === true && value.objects.some(object => object.sumInsured != null && object.sumInsured > 0) &&
      <p role="note" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Pojistné částky u uvedených staveb a domácností se mohou v čase navyšovat z důvodu schválené valorizace.</span>
      </p>}
    {(["property", "household"] as const).map(kind => {
      const title = kind === "property" ? "Pojištění staveb" : "Pojištění domácností";
      const Icon = kind === "property" ? House : Sofa;
      const objects = value.objects.filter(object => object.kind === kind);
      return <section key={kind} className={`${cardClass} space-y-3`} aria-label={title}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon size={16} aria-hidden="true" />{title}</h3>
          {!editable && <span className="text-xs text-slate-600">{domexNeuronStatusLabel(value.sections[kind])}</span>}
        </div>
        {editable && <StatusSelect label={`Stav sekce: ${title.toLowerCase()}`} status={value.sections[kind]} onChange={status => changeSection(kind, status)} />}
        {objects.map((object, index) => <article key={object.id} data-object-id={object.id}
          className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-900">
            {kind === "property" ? "Stavba" : "Domácnost"} {index + 1}
          </h4>{editable && <button type="button" onClick={() => removeObject(object)} aria-label={`Odebrat ${kind === "property" ? "stavbu" : "domácnost"} ${index + 1}`}
            className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700"><Trash2 size={13} aria-hidden="true" />Odebrat</button>}</div>
          {editable ? <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{DOMEX_NEURON_OBJECT_FIELDS.map(field =>
            <ObjectFieldEditor key={field} object={object} field={field} onValueChange={next => changeField(object, field, next)}
              onStatusChange={status => changeFieldStatus(object, field, status)} />)}</div>
            : <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{DOMEX_NEURON_OBJECT_FIELDS.map(field =>
              <div key={field} className="min-w-0"><dt className="text-xs text-slate-500">{FIELD_LABELS[field]}</dt>
                <dd className="break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{objectValue(object, field)}</dd></div>)}</dl>}
        </article>)}
        {editable && <button type="button" disabled={value.objects.length >= DOMEX_NEURON_MAX_OBJECTS} onClick={() => addObject(kind)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
          <Plus size={14} aria-hidden="true" />Přidat {kind === "property" ? "stavbu" : "domácnost"}
        </button>}
      </section>;
    })}
    <section className={`${cardClass} space-y-3`} aria-label="Pojištění odpovědnosti">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Shield size={16} aria-hidden="true" />Pojištění odpovědnosti</h3>
      {editable ? <StatusSelect label="Stav sekce: pojištění odpovědnosti" status={value.sections.liability} onChange={status => changeSection("liability", status)} />
        : <p className="text-xs text-slate-600">{domexNeuronStatusLabel(value.sections.liability)}</p>}
      {(["sumInsured", "deductible"] as const).map(field => <div key={field} className="space-y-2">
        {editable && onLiabilityChange ? <>
          <label className={`${labelClass} space-y-1`}><span>{field === "sumInsured" ? "Limit pojistného plnění" : "Spoluúčast"}</span>
            <input className={inputClass} type="number" min="0" max="1000000000" step="0.01" value={liability?.[field] ?? ""}
              onChange={event => { const next = numberValue(event.target.value); onLiabilityChange(field, next);
                onChange?.({ ...value, sections: { ...value.sections, liability: "found" }, liabilityFields: { ...value.liabilityFields, [field]: next == null ? "not_found" : "found" } }); }} /></label>
          <StatusSelect label={`Stav údaje: ${field === "sumInsured" ? "limit odpovědnosti" : "spoluúčast odpovědnosti"}`}
            status={value.liabilityFields[field]} foundDisabled={liability?.[field] == null}
            onChange={status => { if (status !== "found") onLiabilityChange(field, null);
              onChange?.({ ...value, liabilityFields: { ...value.liabilityFields, [field]: status } }); }} />
        </> : <dl><dt className="text-xs text-slate-500">{field === "sumInsured" ? "Limit pojistného plnění" : "Spoluúčast"}</dt>
          <dd className="text-sm font-semibold text-slate-900">{liability?.[field] != null ? formatMoney(liability[field]) : domexNeuronStatusLabel(value.liabilityFields[field])}</dd></dl>}
      </div>)}
    </section>
    <div className={cardClass}>
      {editable ? <StatusSelect label="Stav sekce: asistenční služby" status={value.sections.assistance} onChange={status => changeSection("assistance", status)} />
        : <p className="text-xs text-slate-600">Asistenční služby: {domexNeuronStatusLabel(value.sections.assistance)}</p>}
      <p className="mt-2 text-xs text-slate-500">Varianta asistence je uvedena samostatně u každé stavby a domácnosti.</p>
    </div>
  </section>;
}
