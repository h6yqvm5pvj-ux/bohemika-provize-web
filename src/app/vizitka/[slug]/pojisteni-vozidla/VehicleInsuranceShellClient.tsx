"use client";

import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { VehicleInsuranceContent } from "@/components/vehicle-insurance/VehicleInsuranceContent";
import styles from "@/components/life-insurance/lifeInsuranceTheme.module.css";

import {
  onlineCardLanguageMeta,
  type OnlineCardLocale,
} from "@/lib/onlineCardI18n";

type VehicleInsuranceShellClientProps = {
  slug: string;
};

const LANGUAGE_OPTIONS: Array<{ id: OnlineCardLocale; label: string; shortLabel: string; flag: string }> = [
  { id: "cs", label: "Čeština", shortLabel: "CZ", flag: "🇨🇿" },
  { id: "en", label: "English", shortLabel: "EN", flag: "🇬🇧" },
  { id: "uk", label: "Українська", shortLabel: "UK", flag: "🇺🇦" },
];

const SHELL_COPY = {
  cs: { back: "Zpět na vizitku", title: "Pojištění vozidel", dark: "Tmavý", light: "Světlý", display: "Vzhled stránky", language: "Jazyk stránky" },
  en: { back: "Back to profile", title: "Vehicle insurance", dark: "Dark", light: "Light", display: "Page appearance", language: "Page language" },
  uk: { back: "Назад до профілю", title: "Страхування автомобіля", dark: "Темна", light: "Світла", display: "Вигляд сторінки", language: "Мова сторінки" },
} as const;

export default function VehicleInsuranceShellClient({ slug }: VehicleInsuranceShellClientProps) {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [locale, setLocale] = useState<OnlineCardLocale>("cs");
  const copy = SHELL_COPY[locale];
  const lightMode = theme === "light";

  useEffect(() => {
    document.documentElement.lang = onlineCardLanguageMeta(locale).htmlLang;
  }, [locale]);

  return (
    <div data-theme={theme} className={`${styles.theme} ${styles.shell}`}>
      <header className={styles.toolbar}>
        <div className={styles.navInner}>
          <div className={styles.navIdentity}>
            <a href={`/vizitka/${slug}`} className={styles.navBack}>
              <ArrowLeft aria-hidden="true" />
              <span>{copy.back}</span>
            </a>
            <a href={`/vizitka/${slug}`} className={styles.navLogo} aria-label="Bohemika">
              <Image src={lightMode ? "/icons/bohemikalogo.png" : "/icons/bhmkwhite.png"} alt="Bohemika" width={168} height={168} priority />
            </a>
          </div>
          <div className={styles.navTools}>
            <button
              type="button"
              onClick={() => setTheme(lightMode ? "dark" : "light")}
              className={styles.iconButton}
              aria-label={lightMode ? copy.dark : copy.light}
              title={lightMode ? copy.dark : copy.light}
            >
              {lightMode ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </button>
            <select className={styles.language} value={locale} onChange={event => setLocale(event.target.value as OnlineCardLocale)} aria-label={copy.language}>
              {LANGUAGE_OPTIONS.map(option => <option key={option.id} value={option.id} lang={option.id}>{option.shortLabel}</option>)}
            </select>
          </div>
        </div>
      </header>
      <VehicleInsuranceContent advisorSlug={slug} theme={theme} locale={locale} />
    </div>
  );
}
