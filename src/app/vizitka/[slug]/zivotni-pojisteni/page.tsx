import { notFound } from "next/navigation";

import LifeInsuranceShellClient from "./LifeInsuranceShellClient";

import {
  loadOnlineCardBySlug,
  normalizeOnlineCardSlug,
  ONLINE_CARD_SLUG_RE,
} from "@/lib/server/onlineCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OnlineCardLifeInsurancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const normalizedSlug = normalizeOnlineCardSlug(slug);
  if (!normalizedSlug || !ONLINE_CARD_SLUG_RE.test(normalizedSlug)) notFound();

  const card = await loadOnlineCardBySlug(normalizedSlug);
  if (!card) notFound();

  return <LifeInsuranceShellClient slug={normalizedSlug} />;
}
