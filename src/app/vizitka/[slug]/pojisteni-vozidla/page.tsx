import { resolveOnlineCardLocale } from "@/lib/onlineCardI18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  loadOnlineCardBySlug,
  normalizeOnlineCardSlug,
  ONLINE_CARD_SLUG_RE,
} from "@/lib/server/onlineCard";
import VehicleInsuranceShellClient from "./VehicleInsuranceShellClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pojištění vozidel | Praktický průvodce",
  description:
    "Jak nastavit havarijní pojištění, pojištění skel, střetu se zvěří a asistenční služby tak, aby skutečně pomohly.",
};

export default async function OnlineCardVehicleInsurancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const initialLocale = resolveOnlineCardLocale(Array.isArray(lang) ? lang[0] : lang);
  const normalizedSlug = normalizeOnlineCardSlug(slug);
  if (!normalizedSlug || !ONLINE_CARD_SLUG_RE.test(normalizedSlug)) notFound();

  const card = await loadOnlineCardBySlug(normalizedSlug);
  if (!card) notFound();

  return <VehicleInsuranceShellClient slug={normalizedSlug} initialLocale={initialLocale} />;
}
