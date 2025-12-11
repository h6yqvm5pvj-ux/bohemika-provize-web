"use client";
"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";

type LifeResultInput = {
  hasInvalidity: boolean;
  totalInvalidity: number;
  hasCriticalIllness: boolean;
  hasSeriousIllness: boolean;
  hasExistingContract?: boolean;
};

export default function RecordResultsPage() {
  const [lines, setLines] = useState<string[] | null>(null);
  const [additional, setAdditional] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem("lifeRecordResultInput");
    if (!raw) {
      setLines([]);
      return;
    }

    try {
      const data: LifeResultInput = JSON.parse(raw);
      const recs: string[] = [];
      const extras: string[] = [];

      // 1) Invalidita
      if (!data.hasInvalidity) {
        recs.push(
          "Klientovi bylo vysvětleno, proč by měl mít připojištěnou invaliditu, přesto si ji nepřeje."
        );
      } else if (
        data.totalInvalidity > 0 &&
        data.totalInvalidity < 1_000_000
      ) {
        recs.push(
          "Klient byl upozorněn, že požadované částky na invaliditu mohou být nedostačující."
        );
      }

      // 2) Závažná onemocnění a poranění
      if (data.hasCriticalIllness) {
        recs.push(
          "Klient byl upozorněn, že se připojištění Závažná onemocnění a poranění vztahuje pouze na diagnózy uvedené v pojistných podmínkách."
        );
      }

      // 3) Vážná onemocnění Pro něj / Pro ni
      if (data.hasSeriousIllness) {
        recs.push(
          "Klient byl upozorněn, že se připojištění Vážná onemocnění (Pro něj / Pro ni) vztahuje pouze na diagnózy uvedené v pojistných podmínkách."
        );
      }

      if (data.hasExistingContract) {
        extras.push(
          "Protože jsi zvolil, že klient má již smlouvu se stejným pojistným zájmem, uveď, že klient má již uzavřenou smlouvu / smlouvy životního pojištění u pojišťovny ______ a co s nimi má v plánu. Např.: Klient má již uzavřenou smlouvu ŽP u pojišťovny Kooperativa a.s., klient ji chce vypovědět."
        );
      }

      setLines(recs);
      setAdditional(extras);
    } catch (err) {
      console.error(err);
      setLines([]);
      setAdditional([]);
    }
  }, []);

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Doporučení do dopadů
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Texty, které můžeš využít v části „Dopady na klienta“ v záznamu
            z jednání. Další pravidla budeme postupně doplňovat.
          </p>
        </header>

        <div className="space-y-3">
          <div className="text-lg font-semibold text-slate-50">
            Další požadavky, potřeby a cíle zákazníka
          </div>
          <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-3">
            <div className="flex items-start gap-2 text-sm text-slate-50 leading-relaxed">
              <span className="mt-[6px] block h-[10px] w-[10px] rounded-full bg-emerald-400 flex-shrink-0" />
              <span>
                Klient vyžadoval vysvětlení pojmů, které jsou uvedeny v
                pojistných podmínkách k požadovanému typu pojištění.
              </span>
            </div>
            {additional === null ? (
              <p className="text-sm text-slate-300">Načítám…</p>
            ) : (
              <div className="space-y-2 text-sm text-slate-50">
                {additional.map((line, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 leading-relaxed"
                  >
                    <span className="mt-[6px] block h-[10px] w-[10px] rounded-full bg-emerald-400 flex-shrink-0" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <div className="text-lg font-semibold text-slate-50">
            Popis dopadů sjednání pojištění/změny pojištění
          </div>
          <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
            {lines === null ? (
              <p className="text-sm text-slate-300">Načítám doporučení…</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-slate-300">
                Zatím tu nemám žádná konkrétní doporučení. Vyplň nejdřív krytí
                na stránce „Záznam z jednání – Život“ a znovu klikni na{" "}
                <strong>Výsledky</strong>.
              </p>
            ) : (
              <ul className="space-y-3 text-sm text-slate-50">
                {lines.map((line, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 leading-relaxed"
                  >
                    <span className="mt-[6px] block h-[10px] w-[10px] rounded-full bg-emerald-400 flex-shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
