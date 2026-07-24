"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Home } from "lucide-react";

import { AdditionalRequirementSection } from "./AdditionalRequirementSection";

const DOMEX_BONUS_PHRASE =
  "Klient byl seznámen s podmínkami vstupního bonusu 30 % za bezeškodní průběh a byl upozorněn, že v případě pojistné události může dojít ke snížení bonusu a následnému navýšení pojistného při výročí smlouvy v souladu s podmínkami pojišťovny.";

const UNIVERSAL_PROPERTY_PHRASES = [
  "Klient byl seznámen s rozsahem sjednaného pojistného krytí, hlavními výlukami z pojištění, limity a sublimity pojistného plnění, výší spoluúčasti a územní platností pojištění.",
  "Klient byl informován o způsobu stanovení pojistných částek a limitů, rozdílu mezi novou a obvyklou cenou (je-li relevantní) a o možných důsledcích podpojištění nebo nesprávně stanovených pojistných částek.",
  "Byly vysvětleny povinnosti pojistníka a pojištěného při sjednání pojištění, během jeho trvání i při vzniku pojistné události, včetně povinnosti předcházet vzniku škod a oznamovat změny rozhodné pro pojištění.",
  "Klient byl seznámen s možnostmi rozšíření pojistné ochrany, výší pojistných limitů a dopady případného nesjednání doporučeného rozsahu pojištění. Rozsah sjednaného pojištění odpovídá zjištěným potřebám a požadavkům klienta.",
  "Klient byl informován o možnosti změny hodnoty pojištěného majetku v průběhu trvání pojištění a bylo mu doporučeno pravidelně přehodnocovat pojistné částky, limity a rozsah pojistného krytí, aby pojištění i nadále odpovídalo jeho aktuálním potřebám a byla minimalizována rizika podpojištění nebo nedostatečného pojistného krytí.",
];

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
  index,
  text,
  copiedText,
  onCopy,
  helper,
}: {
  index?: number;
  text: string;
  copiedText: string | null;
  onCopy: (text: string) => void;
  helper?: string;
}) {
  return (
    <article className="grid gap-3 rounded-[22px] border border-violet-200/70 bg-white/95 p-3 shadow-[0_8px_22px_rgba(42,20,72,0.08)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      {index ? (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[11px] font-black text-violet-900">
          {String(index).padStart(2, "0")}
        </span>
      ) : (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
          <Home className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-slate-800">{text}</p>
        {helper ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {helper}
          </p>
        ) : null}
      </div>
      <CopyButton text={text} copiedText={copiedText} onCopy={onCopy} />
    </article>
  );
}

export function PropertyRecordForm() {
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
              <Home className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                Majetek
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
                Tato sekce je v přípravě
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                Zatím je možné využít větu pro ČPP DOMEX a univerzální věty
                níže.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-emerald-200/75 bg-[linear-gradient(180deg,#ffffff_0%,#f0fdf4_100%)] shadow-[0_18px_44px_rgba(6,95,70,0.10)]">
        <div className="border-b border-emerald-100 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
            ČPP DOMEX
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
            V případě sjednání produktu ČPP DOMEX:
          </h2>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <CopyPhraseRow
            text={DOMEX_BONUS_PHRASE}
            helper="Použij u produktu ČPP DOMEX."
            copiedText={copiedText}
            onCopy={handleCopy}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-violet-200/75 bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_100%)] shadow-[0_18px_44px_rgba(42,20,72,0.12)]">
        <div className="border-b border-violet-100/80 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
            Dopady a upozornění
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
            Doporučené univerzální věty
          </h2>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {UNIVERSAL_PROPERTY_PHRASES.map((phrase, index) => (
            <CopyPhraseRow
              key={phrase}
              index={index + 1}
              text={phrase}
              copiedText={copiedText}
              onCopy={handleCopy}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
