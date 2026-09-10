"use client";

import { useId, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { ChevronDown, LoaderCircle, Route } from "lucide-react";
import { fetchAuthedJson } from "@/app/lib/authenticatedApi";
import type { VehicleVignetteResponse } from "@/app/lib/vehicleReport";

const dateLabel = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("cs-CZ");
};

// The parent keys this component by the completed lookup so responses cannot
// appear on a different vehicle after the user starts another search.
export function VehicleVignette({ user, query }: { user: User; query: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VehicleVignetteResponse["vignette"] | null>(null);
  const inFlight = useRef(false);

  const load = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { response, data } = await fetchAuthedJson<VehicleVignetteResponse & { error?: string }>(user, "/api/autokuk/vehicle", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, check: "vignette" }),
      });
      if (!response.ok || data?.ok !== true || !data.vignette) throw new Error(data?.error || "Dálniční známku se nepodařilo ověřit.");
      setResult(data.vignette);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Dálniční známku se nepodařilo ověřit.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };
  const known = result?.available && (result.exempt === true || result.valid !== null);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <button type="button" aria-expanded={expanded} aria-controls={id}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-slate-700"
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded && !result && !error) void load();
        }}>
        <Route className="h-4 w-4 text-slate-500" aria-hidden="true" />
        Dálniční známka
        <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Bonus</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {expanded && <div id={id} className="mt-3 text-sm" aria-live="polite">
        {loading && <p className="flex items-center gap-2 text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Ověřuji dálniční známku…</p>}
        {!loading && error && <p role="alert" className="text-amber-800">{error}</p>}
        {!loading && !error && result && <>
          <p className={known && (result.exempt || result.valid) ? "font-semibold text-emerald-700" : "text-slate-700"}>
            {!known ? "Údaj o dálniční známce není dostupný." : result.exempt ? "Vozidlo je osvobozené od dálničního poplatku." : result.valid ? "Dálniční známka je platná." : "Platná dálniční známka nenalezena."}
          </p>
          {known && !result.exempt && (result.from || result.until) && <p className="mt-1 text-slate-500">
            {result.from && `Od ${dateLabel(result.from)}`}{result.from && result.until && " · "}{result.until && `do ${dateLabel(result.until)}`}
          </p>}
        </>}
        {!loading && (error || (result && !known)) && <button type="button" onClick={() => void load()} className="mt-2 font-semibold text-violet-700 underline underline-offset-4">Zkusit znovu</button>}
      </div>}
    </section>
  );
}
