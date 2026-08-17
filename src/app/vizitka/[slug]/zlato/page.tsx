import { ArrowLeft, Gem } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  loadOnlineCardBySlug,
  normalizeOnlineCardSlug,
  ONLINE_CARD_SLUG_RE,
} from "@/lib/server/onlineCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OnlineCardGoldPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const normalizedSlug = normalizeOnlineCardSlug(slug);
  if (!normalizedSlug || !ONLINE_CARD_SLUG_RE.test(normalizedSlug)) notFound();

  const card = await loadOnlineCardBySlug(normalizedSlug);
  if (!card) notFound();

  return (
    <main className="min-h-screen bg-[#080610] text-white">
      <header className="relative z-10 border-b border-amber-100/[0.12] bg-[#0c0817]/90 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link
            href={`/vizitka/${normalizedSlug}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-3.5 py-2 text-sm font-semibold text-violet-50 transition hover:border-amber-100/35 hover:bg-white/[0.1]"
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět na vizitku
          </Link>
          <p className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/65 sm:inline-flex">
            <Gem className="h-3.5 w-3.5" />
            Investiční zlato a stříbro
          </p>
        </div>
      </header>
      <iframe title="Investiční zlato a stříbro" src={`/embed/zlato?advisor=${encodeURIComponent(normalizedSlug)}`} className="block h-[calc(100vh-65px)] min-h-[920px] w-full border-0 bg-[#080610]" />
    </main>
  );
}
