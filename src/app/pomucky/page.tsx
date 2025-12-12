// src/app/pomucky/page.tsx
"use client";

import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { TeamMessageToolCard } from "./TeamMessageToolCard";

function AnimatedSplitTitle({ text }: { text: string }) {
  return (
    <>
      <div className="flex flex-wrap gap-0 text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-tight">
        {text.split("").map((char, idx) => (
          <span
            key={idx}
            className="split-letter inline-block"
            style={{ animationDelay: `${idx * 35}ms` }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </div>
      <style jsx global>{`
        .split-letter {
          opacity: 0;
          transform: translateY(14px) rotate(-1deg);
          animation: splitFade 0.65s ease-out forwards;
        }

        @keyframes splitFade {
          from {
            opacity: 0;
            transform: translateY(18px) rotate(-2deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
        }
      `}</style>
    </>
  );
}

export default function ToolsPage() {
  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="mb-2">
          <AnimatedSplitTitle text="Pomůcky" />
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
              Statistika s možností stažení v PDF.
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

          {/* Zpráva týmu – karta, co jsme dělali dřív */}
          <TeamMessageToolCard />
        </section>
      </div>
    </AppLayout>
  );
}
