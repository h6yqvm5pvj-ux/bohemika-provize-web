import { ArrowUpRight, Globe2 } from "lucide-react";
import { notFound } from "next/navigation";

import type { PremiumOnlineCardValue } from "@/components/PremiumOnlineCardPreview";
import { adminDb } from "@/lib/server/firebaseAdmin";
import OnlineCardPublicClient from "./OnlineCardPublicClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value: unknown, maxLen: number): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
};

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return "";
  return email;
};

const normalizeSlug = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const ascii = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.slice(0, 64);
};

const normalizeWebsite = (value: unknown): string => {
  const raw = normalizeText(value, 220);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  return url.toString();
};

const parseOnlineCard = (value: unknown): (PremiumOnlineCardValue & { enabled: boolean; slug: string }) | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const enabled = row.enabled === true;
  const slug = normalizeSlug(row.slug);
  const fullName = normalizeText(row.fullName, 120);
  const title = normalizeText(row.title, 120);
  const phone = normalizeText(row.phone, 80);
  const email = normalizeEmail(row.email);
  const website = normalizeWebsite(row.website);
  const bio = normalizeText(row.bio, 1_000);
  const location = normalizeText(row.location, 120);

  if (!enabled) return null;
  if (!slug || slug.length < 3) return null;
  if (!fullName) return null;

  return {
    enabled,
    slug,
    fullName,
    title,
    phone,
    email,
    website,
    bio,
    location,
  };
};

async function loadOnlineCardBySlug(slug: string): Promise<PremiumOnlineCardValue | null> {
  if (!adminDb) return null;
  const usersCol = adminDb.collection("users");
  const snap = await usersCol.where("onlineCard.slug", "==", slug).limit(12).get();
  if (snap.empty) return null;

  for (const docSnap of snap.docs) {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const parsed = parseOnlineCard(data.onlineCard);
    if (!parsed || parsed.slug !== slug) continue;
    return {
      fullName: parsed.fullName,
      title: parsed.title,
      phone: parsed.phone,
      email: parsed.email,
      website: parsed.website,
      bio: parsed.bio,
      location: parsed.location,
    };
  }

  return null;
}

export default async function OnlineCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const requestedSlug = normalizeSlug(resolvedParams.slug);
  if (!requestedSlug || requestedSlug.length < 3 || !SLUG_RE.test(requestedSlug)) {
    notFound();
  }

  const card = await loadOnlineCardBySlug(requestedSlug);
  if (!card) notFound();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,#f8fbff_0%,#f1f6ff_42%,#eef4ff_100%)] px-4 py-8 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(125,211,252,0.25),transparent_35%),radial-gradient(circle_at_88%_2%,rgba(96,165,250,0.18),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(148,163,184,0.17)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.17)_1px,transparent_1px)] [background-size:64px_64px]" />

      <div className="relative mx-auto w-full max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.07)] backdrop-blur-xl">
            <Globe2 className="h-3.5 w-3.5 text-slate-600" />
            Veřejná vizitka
          </div>
          <a
            href="https://bohemka.app"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/90 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_12px_28px_rgba(15,23,42,0.07)] transition hover:border-slate-400 hover:bg-white"
          >
            Zpět na bohemka.app
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </header>

        <OnlineCardPublicClient slug={requestedSlug} card={card} />
      </div>
    </main>
  );
}
