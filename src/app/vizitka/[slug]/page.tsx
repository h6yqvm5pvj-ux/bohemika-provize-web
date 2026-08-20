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
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_12%,#271245_0%,#110a21_36%,#080715_72%,#05040f_100%)]">
      <div className="pointer-events-none absolute -left-24 top-12 h-96 w-96 rounded-full bg-violet-500/28 blur-[110px] vizitka-ambient-float" />
      <div className="pointer-events-none absolute -right-32 top-[22%] h-[32rem] w-[32rem] rounded-full bg-indigo-500/24 blur-[130px] vizitka-ambient-float [animation-delay:-4.5s] [animation-duration:21s]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_4%,rgba(139,92,246,0.22),transparent_34%),radial-gradient(circle_at_18%_72%,rgba(59,130,246,0.16),transparent_40%),radial-gradient(circle_at_72%_78%,rgba(14,165,233,0.1),transparent_44%)] vizitka-bg-shift" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(192,132,252,0.52),transparent)] vizitka-line-pulse" />

      <div className="relative w-full">
        <OnlineCardPublicClient
          slug={requestedSlug}
          card={card}
          initialLocale={resolveOnlineCardLocale(requestedLocale)}
        />
      </div>
    </main>
  );
}
