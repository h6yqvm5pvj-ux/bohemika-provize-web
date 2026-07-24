"use client";

import { useState } from "react";
import { AlertTriangle, Check, ClipboardCopy, Plane } from "lucide-react";

import { AdditionalRequirementSection } from "./AdditionalRequirementSection";

const TRAVEL_RECORD_PHRASE =
  "Klient byl seznámen s rozsahem krytí léčebných výloh, asistenčních služeb, pojištění odpovědnosti, úrazu, a dalších sjednaných připojištění, s limity pojistného plnění, územní platností, dobou pojištění, hlavními výlukami, povinnostmi pojištěného při vzniku pojistné události a postupem při jejím hlášení. Současně byl upozorněn na rizika spojená s nesjednáním vyšších limitů nebo dalších připojištění odpovídajících účelu cesty.";

function CopyButton({
  text,
  copiedText,
  onCopy,
}: {
  text: string;
  copiedText: string | null;
  onCopy: (text: string) => void;
}) {
  const copied = copiedText === text;

  return (
    <button
      type="button"
      onClick={() => onCopy(text)}
      className="inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-900 transition hover:border-violet-400 hover:bg-violet-100"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ClipboardCopy className="h-3.5 w-3.5" />
      )}
      <span>{copied ? "Zkopírováno" : "Kopírovat"}</span>
    </button>
  );
}

function CopyPhraseRow({
  text,
  copiedText,
  onCopy,
}: {
  text: string;
  copiedText: string | null;
  onCopy: (text: string) => void;
}) {
  return (
    <article className="grid gap-3 rounded-[22px] border border-violet-200/70 bg-white/95 p-3 shadow-[0_8px_22px_rgba(42,20,72,0.08)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[11px] font-black text-violet-900">
        01
      </span>
      <p className="text-sm leading-relaxed text-slate-800">{text}</p>
      <CopyButton text={text} copiedText={copiedText} onCopy={onCopy} />
    </article>
  );
}

export function TravelRecordForm() {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    window.setTimeout(() => {
      setCopiedText((current) => (current === text ? null : current));
    }, 1800);
  };

  return (
    <div className="space-y-4">
      <AdditionalRequirementSection />

      <section className="overflow-hidden rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)] shadow-[0_18px_44px_rgba(146,64,14,0.10)]">
        <div className="border-b border-amber-100 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
              <Plane className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                Cestovní pojištění
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
                Tato sekce je v přípravě
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                Zatím je možné využít Doporučenou univerzální větu níže.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-violet-200/75 bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_100%)] shadow-[0_18px_44px_rgba(42,20,72,0.12)]">
        <div className="border-b border-violet-100/80 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
            Dopady a upozornění
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
            Doporučená univerzální věta
          </h2>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex gap-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Výstraha: text vždy uprav dle skutečně sjednávaného krytí,
              limitů, územní platnosti, doby pojištění a zvolených
              připojištění.
            </p>
          </div>

          <CopyPhraseRow
            text={TRAVEL_RECORD_PHRASE}
            copiedText={copiedText}
            onCopy={handleCopy}
          />
        </div>
      </section>
    </div>
  );
}
