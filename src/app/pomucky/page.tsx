// src/app/pomucky/page.tsx
"use client";

import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { TeamMessageToolCard } from "./TeamMessageToolCard";

export default function ToolsPage() {
  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="mb-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Pomůcky
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Rychlé nástroje pro práci s klienty – argumenty, zápisy a kalkulačky.
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
              Přehled námitek a odpovědí pro život, neživot, investice a zlato.
            </p>
          </Link>

          {/* Záznam z jednání */}
          <Link
            href="/pomucky/zaznam"
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-sky-400/70 transition cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-2">Záznam z jednání</h2>
            <p className="text-sm text-slate-300">
              Strukturovaná pomůcka pro vyplnění Záznamu z jednání podle typu pojištění.
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

          {/* Zpráva týmu – zobrazí se jen manažerům s podřízenými */}
          <TeamMessageToolCard />
        </section>
      </div>
    </AppLayout>
  );
}