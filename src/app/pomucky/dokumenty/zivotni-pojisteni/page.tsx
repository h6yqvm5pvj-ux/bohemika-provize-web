// src/app/pomucky/dokumenty/zivotni-pojisteni/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../../plan-produkce/SplitTitle";

const INSURERS = [
  {
    key: "cpp",
    title: "ČPP",
    logo: "/icons/cpp.png",
    description: "Dokumenty a materiály pro životní pojištění ČPP.",
    href: "/pomucky/dokumenty/zivotni-pojisteni/cpp",
  },
  {
    key: "kooperativa",
    title: "Kooperativa",
    logo: "/icons/koop.png",
    description: "Dokumenty a materiály pro životní pojištění Kooperativa.",
  },
] as const;

export default function DokumentyZivotniPojisteniPage() {
  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="space-y-2">
          <SplitTitle text="Životní pojištění" className="!text-slate-900" />
          <p className="max-w-3xl text-sm text-slate-600">
            Vyber pojišťovnu a pokračuj do konkrétních dokumentů.
          </p>
          <Link
            href="/pomucky/dokumenty"
            className="inline-flex items-center text-xs text-slate-600 transition hover:text-slate-900"
          >
            ← Zpět na dokumenty
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {INSURERS.map((insurer) => {
            const cardClassName = `rounded-3xl border border-slate-300 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
              insurer.href ? "transition hover:-translate-y-0.5 hover:border-slate-900 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]" : ""
            }`;
            const content = (
              <div className="flex items-center gap-3">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-300 bg-white">
                  <Image
                    src={insurer.logo}
                    alt={`${insurer.title} logo`}
                    width={42}
                    height={42}
                    className="h-10 w-10 object-contain"
                  />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{insurer.title}</h2>
                  <p className="text-xs text-slate-500">{insurer.description}</p>
                </div>
              </div>
            );

            if (insurer.href) {
              return (
                <Link key={insurer.key} href={insurer.href} className={cardClassName}>
                  {content}
                </Link>
              );
            }

            return (
              <article key={insurer.key} className={cardClassName}>
                {content}
              </article>
            );
          })}
        </section>
      </div>
    </AppLayout>
  );
}
