// src/app/pomucky/dokumenty/auto/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CarFront } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import {
  AUTO_TOOL_DOCUMENT_INSURERS,
  type AutoToolDocumentInsurer,
} from "@/app/lib/toolDocuments";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromPath,
} from "@/app/lib/institutionLogoDisplay";
import SplitTitle from "../../plan-produkce/SplitTitle";
import { systemSansFont } from "@/lib/fonts";

const documentsFont = systemSansFont;

type InsurerCard = {
  key: AutoToolDocumentInsurer["key"];
  title: string;
  logo: string;
  description: string;
  href: string;
};

const INSURERS: readonly InsurerCard[] = AUTO_TOOL_DOCUMENT_INSURERS.map((insurer) => ({
  key: insurer.key,
  title: insurer.title,
  logo: insurer.logo,
  description: insurer.description,
  href: `/pomucky/dokumenty/auto/${insurer.slug}`,
}));

export default function DokumentyAutoPage() {
  return (
    <AppLayout active="tools">
      <div className={`${documentsFont.className} w-full bg-white px-2 pb-10 pt-2 sm:px-3`}>
        <div className="mx-auto max-w-6xl space-y-5 px-2 sm:px-3 lg:px-4">
          <header className="rounded-[32px] border border-slate-200 bg-white px-5 py-6 text-slate-900 sm:px-8 sm:py-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                  <CarFront className="h-3.5 w-3.5" />
                  Auto dokumenty
                </span>
                <Link
                  href="/pomucky/dokumenty"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zpět na dokumenty
                </Link>
              </div>

              <SplitTitle text="Auto" className="!text-4xl !text-slate-900 sm:!text-5xl" />
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Vyber pojišťovnu a pokračuj do konkrétních dokumentů, checklistů a interních materiálů pro povinné ručení a havarijní pojištění.
              </p>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-2">
            {INSURERS.map((insurer) => {
              const logoKey = institutionLogoKeyFromPath(insurer.logo);

              return (
                <Link
                  key={insurer.key}
                  href={insurer.href}
                  className="group flex min-h-[222px] flex-col rounded-[28px] border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-slate-300"
                >
                  <div className="flex min-h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`relative inline-flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white ${institutionLogoFrameClass(
                            logoKey,
                            "compact"
                          )}`}
                        >
                          <Image
                            src={insurer.logo}
                            alt={`${insurer.title} logo`}
                            fill
                            sizes="64px"
                            className={institutionLogoImageClass(logoKey)}
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Workflow
                          </p>
                          <h2 className="mt-1 text-[2rem] font-bold leading-tight tracking-[-0.015em] text-slate-950">
                            {insurer.title}
                          </h2>
                        </div>
                      </div>

                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition group-hover:border-slate-300 group-hover:bg-slate-900 group-hover:text-white">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>

                    <p className="text-[0.95rem] leading-relaxed text-slate-600">{insurer.description}</p>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                        Otevřít sekci
                      </span>
                      <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Aktivní obsah
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
