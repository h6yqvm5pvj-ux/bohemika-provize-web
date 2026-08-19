"use client";

import { useState } from "react";
import { ArrowRight, CircleHelp, Microscope, ShieldAlert } from "lucide-react";

import { HelpDialog } from "@/components/HelpDialog";

export function InSituExplanation() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-white px-2.5 py-1.5 text-xs font-black text-fuchsia-800 shadow-sm transition hover:-translate-y-0.5 hover:border-fuchsia-300 hover:bg-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-2"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        Co je to?
      </button>

      <HelpDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Co znamená premaligní a in situ?"
        description="Pojmy označují časné změny buněk před vznikem invazivního nádoru, nejde ale o totožné nálezy."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="flex items-center gap-2 text-amber-950">
                <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <h3 className="font-black">Premaligní nález</h3>
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-amber-950/80">
                Přednádorový stav nebo změna, která se může v budoucnu změnit ve
                zhoubný nádor. Neznamená automaticky, že se rakovina skutečně
                rozvine.
              </p>
            </section>

            <section className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/80 p-4">
              <div className="flex items-center gap-2 text-fuchsia-950">
                <Microscope className="h-5 w-5 shrink-0 text-fuchsia-600" aria-hidden="true" />
                <h3 className="font-black">Karcinom in situ</h3>
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-fuchsia-950/80">
                Abnormální buňky jsou pouze v místě svého vzniku a neprorůstají
                do okolní tkáně. Často se označuje jako stadium 0. U některých
                nálezů může později vzniknout invazivní nádor.
              </p>
            </section>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Zjednodušený vývoj
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black text-slate-800 sm:text-sm">
              <span className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                Premaligní změny
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="rounded-lg border border-fuchsia-200 bg-white px-3 py-2">
                In situ
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="rounded-lg border border-rose-200 bg-white px-3 py-2">
                Invazivní nádor
              </span>
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
              Jde o orientační schéma. Ne každý premaligní nebo in-situ nález
              postoupí do další fáze.
            </p>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
            <p className="font-black">Proč je to důležité u pojištění?</p>
            <p className="mt-1 font-medium text-violet-950/80">
              Pojistné podmínky mohou premaligní a in-situ nálezy z hlavního
              krytí vyloučit nebo pro ně požadovat samostatné připojištění. O
              zařazení rozhoduje přesná diagnóza a definice v konkrétních
              pojistných podmínkách.
            </p>
          </div>

          <p className="text-xs font-medium leading-5 text-slate-500">
            Vysvětlení je orientační a nenahrazuje lékařské posouzení.
            {" "}
            <a
              href="https://www.cancer.gov/publications/dictionaries/cancer-terms/def/carcinoma-in-situ"
              target="_blank"
              rel="noreferrer"
              className="font-black text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-950"
            >
              Odborný zdroj: National Cancer Institute
            </a>
          </p>
        </div>
      </HelpDialog>
    </>
  );
}
