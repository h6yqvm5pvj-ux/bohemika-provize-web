// src/app/pomucky/page.tsx
"use client";

import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "./plan-produkce/SplitTitle";
import { TeamMessageToolCard } from "./TeamMessageToolCard";

export default function ToolsPage() {
  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="mb-2">
          <SplitTitle text="Pomůcky" />
          <p className="text-sm text-slate-300 mt-1">
            Rychlé nástroje pro efektivnější práci.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Argumenty */}
          <Link
            href="/pomucky/argumenty"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">Argumenty</h2>
            <p className="text-sm text-slate-300">
              Přehled Argumentů na různé typy námitek od klienta.
            </p>
          </Link>

          {/* Záznam z jednání */}
          <Link
            href="/pomucky/zaznam"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">Záznam z jednání</h2>
            <p className="text-sm text-slate-300">
              Pomůcka pro správně vypsaný Záznam z jednání.
            </p>
          </Link>

          {/* Investiční kalkulačka */}
          <Link
            href="/pomucky/investicni-kalkulacka"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">
              Investiční kalkulačka
            </h2>
            <p className="text-sm text-slate-300">
              Spočítej konečnou hodnotu investice při pravidelných vkladech.
            </p>
          </Link>

          {/* Export produkce do PDF */}
          <Link
            href="/pomucky/export-produkce"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">
              Statistika
            </h2>
            <p className="text-sm text-slate-300">
              Statistika s možností stažení v PDF a Odeslání mailem.
            </p>
          </Link>

          {/* Plán produkce */}
          <Link
            href="/pomucky/plan-produkce"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">Plán produkce</h2>
            <p className="text-sm text-slate-300">
              Naplánuj si cíleně Produkci a rovnou uvidíš svou odměnu. Můžeš i stáhnout v PDF.
            </p>
          </Link>

          {/* Projekce výkonu */}
          <Link
            href="/pomucky/projekce-vykonu"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">Projekce výkonu</h2>
            <p className="text-sm text-slate-300">
              Vizualizuj si výplatu do budoucna.
            </p>
          </Link>

          {/* Generátor PDF pozvánky */}
          {/* Kalkulačka pracovní neschopnosti */}
          <Link
            href="/pomucky/pracovni-neschopenka"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">
              Jak nastavit Pracovní neschopnost
            </h2>
            <p className="text-sm text-slate-300">
              Kalkulačka na stanovení pojistné částky pro případ pracovní
              neschopnosti.
            </p>
          </Link>

          {/* Kalkulačka invalidity */}
          <Link
            href="/pomucky/invalidita"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">Jak nastavit Invaliditu</h2>
            <p className="text-sm text-slate-300">
              Kalkulačka na stanovení pojistné částky pro Invaliditu 1., 2. a 3. stupně dle poklesu příjmu.
            </p>
          </Link>

          {/* Zpráva týmu – karta, co jsme dělali dřív */}
          <TeamMessageToolCard />
        </section>
      </div>
    </AppLayout>
  );
}
