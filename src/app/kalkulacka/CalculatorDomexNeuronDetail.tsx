"use client";

import { useState } from "react";
import { DomexNeuronObjectsPanel } from "@/components/insurance/DomexNeuronObjectsPanel";
import type { DomexNeuronData } from "../lib/domexNeuronSchema";

type Props = {
  value: DomexNeuronData;
  onChange: (value: DomexNeuronData) => void;
  liability: { sumInsured: number | null; deductible: number | null };
  onLiabilityChange: (field: "sumInsured" | "deductible", value: number | null) => void;
  premiumIndexationEnabled: boolean | null;
  note: string;
  onNoteChange: (value: string) => void;
};

export function CalculatorDomexNeuronDetail({ value, onChange, liability, onLiabilityChange,
  premiumIndexationEnabled, note, onNoteChange }: Props) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-950">Detail pojištění DOMEX Neuron</h2>
        <button type="button" onClick={() => setEditing(value => !value)}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-800">
          {editing ? "Hotovo" : "Upravit"}
        </button>
      </div>
      <DomexNeuronObjectsPanel value={value} onChange={onChange} editMode={editing}
        liability={liability} onLiabilityChange={onLiabilityChange}
        premiumIndexationEnabled={premiumIndexationEnabled} />
      {editing ? (
        <label className="block text-sm text-slate-700">
          Poznámka
          <textarea value={note} onChange={event => onNoteChange(event.target.value)} maxLength={1000} rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" />
        </label>
      ) : note.trim() ? <p className="whitespace-pre-wrap text-sm text-slate-700">{note}</p> : null}
    </section>
  );
}
