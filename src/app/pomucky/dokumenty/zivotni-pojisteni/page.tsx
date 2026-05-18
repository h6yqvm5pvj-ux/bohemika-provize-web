// src/app/pomucky/dokumenty/zivotni-pojisteni/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromPath,
} from "@/app/lib/institutionLogoDisplay";
import SplitTitle from "../../plan-produkce/SplitTitle";
import styles from "../../pomuckyWallArt.module.css";

const documentsFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type InsurerCard = {
  key: string;
  title: string;
  logo: string;
  description: string;
  state: "available" | "coming";
  href?: string;
};

const INSURERS: readonly InsurerCard[] = [
  {
    key: "cpp",
    title: "ČPP",
    logo: "/icons/cpp.png",
    description: "Dokumenty a materiály pro životní pojištění ČPP.",
    state: "available",
    href: "/pomucky/dokumenty/zivotni-pojisteni/cpp",
  },
  {
    key: "kooperativa",
    title: "Kooperativa",
    logo: "/icons/koop-v2.png",
    description: "Dokumenty a materiály pro životní pojištění Kooperativa.",
    state: "coming",
  },
];

const INSURER_VISUALS: Record<
  string,
  { accent: string; border: string; chip: string; arrow: string; dot: string; ghostTint: string }
> = {
  cpp: {
    accent: "from-rose-500 via-pink-500 to-fuchsia-500",
    border: "border-rose-200/85 hover:border-rose-300",
    chip: "text-rose-700",
    arrow: "group-hover:border-rose-300 group-hover:bg-rose-700 group-hover:text-white",
    dot: "bg-rose-500",
    ghostTint:
      "bg-[radial-gradient(circle_at_14%_20%,rgba(59,130,246,0.18)_0%,transparent_52%),radial-gradient(circle_at_42%_74%,rgba(239,68,68,0.14)_0%,transparent_54%)]",
  },
  kooperativa: {
    accent: "from-emerald-500 via-emerald-600 to-teal-600",
    border: "border-emerald-200/85 hover:border-emerald-300",
    chip: "text-emerald-700",
    arrow: "group-hover:border-emerald-300 group-hover:bg-emerald-700 group-hover:text-white",
    dot: "bg-emerald-500",
    ghostTint:
      "bg-[radial-gradient(circle_at_14%_20%,rgba(16,185,129,0.18)_0%,transparent_52%),radial-gradient(circle_at_42%_74%,rgba(34,197,94,0.12)_0%,transparent_54%)]",
  },
};

export default function DokumentyZivotniPojisteniPage() {
  return (
    <AppLayout active="tools">
      <div className={`${documentsFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className={styles.canvas}>
            <span className={`${styles.orb} ${styles.orbA}`} />
            <span className={`${styles.orb} ${styles.orbB}`} />
            <span className={`${styles.orb} ${styles.orbC}`} />
            <span className={styles.mesh} />
          </div>
          <div className={styles.grain} />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl space-y-5 px-2 sm:px-3 lg:px-4">
          <header
            className={`${styles.heroPanel} relative rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(240,249,255,0.95)_48%,rgba(238,242,255,0.94)_100%)] px-5 py-6 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.14)] sm:px-8 sm:py-8`}
          >
            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Životní dokumenty
                </span>
                <Link
                  href="/pomucky/dokumenty"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zpět na dokumenty
                </Link>
              </div>

              <SplitTitle text="Životní pojištění" className="!text-4xl !text-slate-900 sm:!text-5xl" />
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Vyber pojišťovnu a pokračuj do konkrétních dokumentů, checklistů a interních materiálů.
              </p>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-2">
            {INSURERS.map((insurer, index) => {
              const logoKey = institutionLogoKeyFromPath(insurer.logo);
              const visual = INSURER_VISUALS[insurer.key] ?? INSURER_VISUALS.cpp;
              const cardClassName = [
                styles.toolCard,
                "group relative flex min-h-[222px] flex-col rounded-[28px] border bg-white/92 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-200",
                visual.border,
                insurer.href ? "hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(15,23,42,0.16)]" : "opacity-95",
              ].join(" ");

              const content = (
                <>
                  <span className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${visual.accent}`} aria-hidden="true" />
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-[64%] overflow-hidden" aria-hidden="true">
                    <div className={`absolute inset-0 ${visual.ghostTint}`} />
                    <div className="absolute inset-y-0 left-[-12%] w-[118%]">
                      <Image
                        src={insurer.logo}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 360px, 280px"
                        className={`${institutionLogoImageClass(logoKey)} object-contain opacity-[0.22] [filter:grayscale(0.72)_contrast(1.03)]`}
                      />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0.4)_44%,rgba(255,255,255,0.86)_74%,rgba(255,255,255,0.96)_100%)]" />
                  </div>

                  <div className="relative z-[1] flex min-h-full flex-col gap-4">
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
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${visual.chip}`}>
                            {insurer.state === "available" ? "Workflow" : "Připravujeme"}
                          </p>
                          <h2 className="mt-1 text-[2rem] font-bold leading-tight tracking-[-0.015em] text-slate-950">
                            {insurer.title}
                          </h2>
                        </div>
                      </div>

                      <span
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition ${
                          insurer.href ? visual.arrow : ""
                        }`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>

                    <p className="text-[0.95rem] leading-relaxed text-slate-600">{insurer.description}</p>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                      <span className={`text-xs font-semibold uppercase tracking-[0.16em] ${visual.chip}`}>
                        {insurer.href ? "Otevřít sekci" : "Doplníme v další verzi"}
                      </span>
                      <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
                        {insurer.href ? "Aktivní obsah" : "Čeká na doplnění"}
                      </span>
                    </div>
                  </div>
                </>
              );

              if (insurer.href) {
                return (
                  <Link
                    key={insurer.key}
                    href={insurer.href}
                    className={cardClassName}
                    style={{ animationDelay: `${Math.min(index * 60, 280)}ms` }}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <article
                  key={insurer.key}
                  className={cardClassName}
                  style={{ animationDelay: `${Math.min(index * 60, 280)}ms` }}
                >
                  {content}
                </article>
              );
            })}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
