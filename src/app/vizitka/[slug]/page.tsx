import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  loadOnlineCardBySlug,
  normalizeOnlineCardSlug,
  ONLINE_CARD_SLUG_RE,
} from "@/lib/server/onlineCard";
import { resolveOnlineCardLocale } from "@/lib/onlineCardI18n";
import OnlineCardPublicClient from "./OnlineCardPublicClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OnlineCardPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
};

const loadOnlineCardForPage = cache(loadOnlineCardBySlug);

function normalizeSeoLabel(value: string): string {
  return value
    .trim()
    .split(/\s{2,}/)
    .map((group) => {
      const parts = group.trim().split(/\s+/);
      return parts.length >= 3 && parts.every((part) => Array.from(part).length === 1)
        ? parts.join("")
        : parts.join(" ");
    })
    .filter(Boolean)
    .join(" ");
}

function buildOnlineCardDescription(
  fullName: string,
  title: string,
  bio: string,
  location: string
): string {
  const fallback = [title, location].filter(Boolean).join(" · ");
  const value =
    bio.trim() ||
    (fallback
      ? `${fullName} – ${fallback}. Kontakty, specializace a možnost sjednat schůzku.`
      : `Osobní vizitka poradce ${fullName}. Kontakty, specializace a možnost sjednat schůzku.`);
  return value.length > 160 ? `${value.slice(0, 157).trimEnd()}…` : value;
}

export async function generateMetadata({
  params,
}: Pick<OnlineCardPageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const normalizedSlug = normalizeOnlineCardSlug(slug);
  if (
    !normalizedSlug ||
    normalizedSlug.length < 3 ||
    !ONLINE_CARD_SLUG_RE.test(normalizedSlug)
  ) {
    return { robots: { index: false, follow: false } };
  }

  const card = await loadOnlineCardForPage(normalizedSlug);
  if (!card) return { robots: { index: false, follow: false } };

  const fullName = normalizeSeoLabel(card.fullName);
  const role = normalizeSeoLabel(card.title);
  const title = role ? `${fullName} | ${role}` : `${fullName} | Finanční poradce`;
  const description = buildOnlineCardDescription(
    fullName,
    role,
    card.bio,
    card.location
  );
  const canonicalPath = `/vizitka/${normalizedSlug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "website",
      locale: "cs_CZ",
      url: canonicalPath,
      title,
      description,
    },
  };
}

export default async function OnlineCardPage({
  params,
  searchParams,
}: OnlineCardPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const requestedSlug = normalizeOnlineCardSlug(resolvedParams.slug);
  if (!requestedSlug || requestedSlug.length < 3 || !ONLINE_CARD_SLUG_RE.test(requestedSlug)) {
    notFound();
  }

  const card = await loadOnlineCardForPage(requestedSlug);
  if (!card) notFound();
  const requestedLocale = Array.isArray(resolvedSearchParams.lang)
    ? resolvedSearchParams.lang[0]
    : resolvedSearchParams.lang;

  return (
    <main className="min-h-screen bg-[#fafbfe]">
        <OnlineCardPublicClient
          slug={requestedSlug}
          card={card}
          initialLocale={resolveOnlineCardLocale(requestedLocale)}
        />
    </main>
  );
}
