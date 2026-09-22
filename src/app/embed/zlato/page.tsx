"use client";

import { useSyncExternalStore } from "react";
import { GoldInvestmentContent } from "@/components/gold-investment/GoldInvestmentContent";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";

const subscribeToLocation = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};
const getEmbedSearch = () => window.location.search;
const getServerEmbedSearch = () => "";

export default function GoldInvestmentEmbedPage() {
  const search = useSyncExternalStore(subscribeToLocation, getEmbedSearch, getServerEmbedSearch);
  const params = new URLSearchParams(search);
  const advisorSlug = params.get("advisor")?.trim() ?? "";
  const theme = params.get("theme") === "light" ? "light" : "dark";
  const requestedLocale = params.get("locale");
  const locale: OnlineCardLocale = requestedLocale === "en" || requestedLocale === "uk" ? requestedLocale : "cs";

  return <GoldInvestmentContent advisorSlug={advisorSlug} theme={theme} locale={locale} />;
}
