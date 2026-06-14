import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  loadOnlineCardBySlug,
  normalizeOnlineCardSlug,
  ONLINE_CARD_SLUG_RE,
} from "@/lib/server/onlineCard";
import MeetingEmbedClient from "./MeetingEmbedClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sjednat schůzku | Bohemka.App",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function MeetingEmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const requestedSlug = normalizeOnlineCardSlug(resolvedParams.slug);
  if (!requestedSlug || requestedSlug.length < 3 || !ONLINE_CARD_SLUG_RE.test(requestedSlug)) {
    notFound();
  }

  const card = await loadOnlineCardBySlug(requestedSlug);
  if (!card) notFound();

  return <MeetingEmbedClient slug={requestedSlug} advisorName={card.fullName} />;
}
