import { notFound } from "next/navigation";

import {
  loadOnlineCardBySlug,
  normalizeOnlineCardSlug,
  ONLINE_CARD_SLUG_RE,
} from "@/lib/server/onlineCard";
import OnlineCardPublicClient from "./OnlineCardPublicClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OnlineCardPage({
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_12%,#271245_0%,#110a21_36%,#080715_72%,#05040f_100%)]">
      <div className="pointer-events-none absolute -left-24 top-12 h-96 w-96 rounded-full bg-violet-500/28 blur-[110px] vizitka-ambient-float" />
      <div className="pointer-events-none absolute -right-32 top-[22%] h-[32rem] w-[32rem] rounded-full bg-indigo-500/24 blur-[130px] vizitka-ambient-float [animation-delay:-4.5s] [animation-duration:21s]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_4%,rgba(139,92,246,0.22),transparent_34%),radial-gradient(circle_at_18%_72%,rgba(59,130,246,0.16),transparent_40%),radial-gradient(circle_at_72%_78%,rgba(14,165,233,0.1),transparent_44%)] vizitka-bg-shift" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(192,132,252,0.52),transparent)] vizitka-line-pulse" />

      <div className="relative w-full px-4 pb-10 pt-6 sm:px-8 sm:pb-12 sm:pt-8 lg:px-12">
        <div>
          <OnlineCardPublicClient slug={requestedSlug} card={card} />
        </div>
      </div>
    </main>
  );
}
