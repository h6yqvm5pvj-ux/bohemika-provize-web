import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { loadOnlineCardBySlug, normalizeOnlineCardSlug, ONLINE_CARD_SLUG_RE } from "@/lib/server/onlineCard";
import TravelInsuranceClient from "./TravelInsuranceClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const loadCard = cache(loadOnlineCardBySlug);
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = normalizeOnlineCardSlug((await params).slug);
  const card = slug.length >= 3 && ONLINE_CARD_SLUG_RE.test(slug) ? await loadCard(slug) : null;
  if (!card) return { robots: { index: false, follow: false } };
  const title = `Cestovní pojištění podle vaší cesty | ${card.fullName}`;
  const description = "Moře, hory, ferraty nebo půjčené auto? Vyberte své aktivity, zjistěte, co ohlídat v pojištění, a požádejte svého poradce o konkrétní nabídku.";
  return { title, description, alternates: { canonical: `/vizitka/${slug}/cestovni-pojisteni` }, openGraph: { title, description, type: "website", locale: "cs_CZ" } };
}

export default async function TravelInsurancePage({ params }: Props) {
  const slug = normalizeOnlineCardSlug((await params).slug);
  if (slug.length < 3 || !ONLINE_CARD_SLUG_RE.test(slug)) notFound();
  const card = await loadCard(slug);
  if (!card) notFound();
  return <TravelInsuranceClient slug={slug} advisorName={card.fullName} advisorPhone={card.phone} />;
}
