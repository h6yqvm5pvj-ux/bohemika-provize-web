"use client";

import { useEffect, useSyncExternalStore } from "react";
import { LifeInsuranceContent } from "@/components/LifeInsuranceContent";
import { onlineCardLanguageMeta, type OnlineCardLocale } from "@/lib/onlineCardI18n";

const subscribeToLocation = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};
const getEmbedSearch = () => window.location.search;
const getServerEmbedSearch = () => "";

export default function LifeInsuranceEmbedPage() {
  const embedSearch = useSyncExternalStore(subscribeToLocation, getEmbedSearch, getServerEmbedSearch);
  const embedParams = new URLSearchParams(embedSearch);
  const advisorSlug = embedParams.get("advisor")?.trim() ?? "";
  const theme = embedParams.get("theme") === "dark" ? "dark" : "light";
  const requestedLocale = embedParams.get("locale");
  const locale: OnlineCardLocale = requestedLocale === "en" || requestedLocale === "uk" ? requestedLocale : "cs";

  useEffect(() => {
    document.documentElement.lang = onlineCardLanguageMeta(locale).htmlLang;
  }, [locale]);

  return <LifeInsuranceContent advisorSlug={advisorSlug} theme={theme} locale={locale} />;
}
