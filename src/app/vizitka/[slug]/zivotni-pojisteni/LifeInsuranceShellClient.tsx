"use client";

import { ArrowLeft, HeartHandshake, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  onlineCardLanguageMeta,
  type OnlineCardLocale,
} from "@/lib/onlineCardI18n";

type LifeInsuranceShellClientProps = {
  slug: string;
};

const LANGUAGE_OPTIONS: Array<{ id: OnlineCardLocale; label: string; shortLabel: string; flag: string }> = [
  { id: "cs", label: "Čeština", shortLabel: "CZ", flag: "🇨🇿" },
  { id: "en", label: "English", shortLabel: "EN", flag: "🇬🇧" },
  { id: "uk", label: "Українська", shortLabel: "UK", flag: "🇺🇦" },
];

const SHELL_COPY = {
  cs: { back: "Zpět na vizitku", title: "Životní a úrazové pojištění", dark: "Tmavý", light: "Světlý", display: "Vzhled stránky", language: "Jazyk stránky" },
  en: { back: "Back to profile", title: "Life and accident insurance", dark: "Dark", light: "Light", display: "Page appearance", language: "Page language" },
  uk: { back: "Назад до профілю", title: "Страхування життя та від нещасних випадків", dark: "Темна", light: "Світла", display: "Вигляд сторінки", language: "Мова сторінки" },
} as const;

export default function LifeInsuranceShellClient({ slug }: LifeInsuranceShellClientProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [locale, setLocale] = useState<OnlineCardLocale>("cs");
  const copy = SHELL_COPY[locale];
  const lightMode = theme === "light";
  const iframeSrc = useMemo(
    () => `/embed/zivotni-pojisteni?advisor=${encodeURIComponent(slug)}&theme=${theme}&locale=${locale}`,
    [locale, slug, theme]
  );

  useEffect(() => {
    document.documentElement.lang = onlineCardLanguageMeta(locale).htmlLang;
  }, [locale]);

  return (
    <main className="min-h-screen bg-[#080610] text-white">
      <header className="relative z-10 border-b border-fuchsia-100/[0.12] bg-[#0c0817]/90 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 sm:gap-4">
          <a
            href={`/vizitka/${slug}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-violet-50 transition hover:border-fuchsia-100/35 hover:bg-white/[0.1] sm:px-3.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{copy.back}</span>
          </a>

          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <div
              className="inline-flex h-8 items-center rounded-[11px] border border-white/16 bg-slate-950/42 p-0.5 text-[11px] font-bold text-violet-100 shadow-[0_10px_20px_rgba(15,23,42,0.16)] backdrop-blur sm:h-auto sm:rounded-full sm:p-1 sm:text-xs"
              aria-label={copy.display}
            >
              <button type="button" onClick={() => setTheme("dark")} aria-pressed={!lightMode} className={`inline-flex h-7 w-7 items-center justify-center rounded-[8px] transition sm:h-auto sm:w-auto sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-1.5 ${!lightMode ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]" : "hover:bg-white/10"}`}>
                <Moon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{copy.dark}</span>
              </button>
              <button type="button" onClick={() => setTheme("light")} aria-pressed={lightMode} className={`inline-flex h-7 w-7 items-center justify-center rounded-[8px] transition sm:h-auto sm:w-auto sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-1.5 ${lightMode ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]" : "hover:bg-white/10"}`}>
                <Sun className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{copy.light}</span>
              </button>
            </div>
            <div
              className="inline-flex h-8 items-center rounded-[11px] border border-white/16 bg-slate-950/42 p-0.5 text-[11px] font-bold text-violet-100 shadow-[0_10px_20px_rgba(15,23,42,0.16)] backdrop-blur sm:h-auto sm:rounded-full sm:p-1 sm:text-xs"
              aria-label={copy.language}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <button key={option.id} type="button" onClick={() => setLocale(option.id)} aria-pressed={locale === option.id} aria-label={option.label} className={`inline-flex h-7 w-7 items-center justify-center gap-1 rounded-[8px] transition sm:h-auto sm:w-auto sm:rounded-full sm:px-3 sm:py-1.5 ${locale === option.id ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]" : "hover:bg-white/10"}`}>
                  <span aria-hidden="true" className="text-sm leading-none sm:text-xs">{option.flag}</span>
                  <span className="hidden sm:inline">{option.shortLabel}</span>
                </button>
              ))}
            </div>
            <p className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-100/65 lg:inline-flex">
              <HeartHandshake className="h-3.5 w-3.5" />
              {copy.title}
            </p>
          </div>
        </div>
      </header>
      <iframe title={copy.title} src={iframeSrc} className="block h-[calc(100vh-65px)] min-h-[920px] w-full border-0 bg-[#080610]" />
    </main>
  );
}
