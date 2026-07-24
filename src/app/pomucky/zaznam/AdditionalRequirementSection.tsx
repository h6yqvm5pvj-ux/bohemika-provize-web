"use client";

import { useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";

export const BASE_ADDITIONAL_REQUIREMENT_TEXT =
  "Klient vyžadoval vysvětlení pojmů, které jsou uvedeny v pojistných podmínkách k požadovanému typu pojištění.";

export function AdditionalRequirementSection() {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    window.setTimeout(() => {
      setCopiedText((current) => (current === text ? null : current));
    }, 1800);
  };

  const copied = copiedText === BASE_ADDITIONAL_REQUIREMENT_TEXT;

  return (
    <section className="overflow-hidden rounded-[28px] border border-violet-200/75 bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_100%)] shadow-[0_18px_44px_rgba(42,20,72,0.12)]">
      <div className="border-b border-violet-100/80 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
              Část 1
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
              Další požadavky, potřeby a cíle zákazníka
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
              Krátké texty pro úvodní část záznamu. Položky označené jako ruční doplnění obsahují proměnné údaje.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-900">
              1 text
            </span>
            <button
              type="button"
              onClick={() => handleCopy(BASE_ADDITIONAL_REQUIREMENT_TEXT)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-900 transition hover:border-violet-400 hover:bg-violet-100"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <ClipboardCopy className="h-3.5 w-3.5" />
              )}
              <span>{copied ? "Zkopírováno" : "Kopírovat vše"}</span>
            </button>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        <article className="grid gap-3 rounded-[22px] border border-violet-200/70 bg-white/95 p-3 shadow-[0_8px_22px_rgba(42,20,72,0.08)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[11px] font-black text-violet-900">
            01
          </span>
          <p className="text-sm leading-relaxed text-slate-800">
            {BASE_ADDITIONAL_REQUIREMENT_TEXT}
          </p>
          <button
            type="button"
            onClick={() => handleCopy(BASE_ADDITIONAL_REQUIREMENT_TEXT)}
            className="inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-900 transition hover:border-violet-400 hover:bg-violet-100"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? "Zkopírováno" : "Kopírovat"}</span>
          </button>
        </article>
      </div>
    </section>
  );
}
