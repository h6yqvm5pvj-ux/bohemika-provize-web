import { notFound } from "next/navigation";

import type { PremiumOnlineCardValue } from "@/components/PremiumOnlineCardPreview";
import { adminDb } from "@/lib/server/firebaseAdmin";
import OnlineCardPublicClient from "./OnlineCardPublicClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONLINE_CARD_OFFICE_PHOTOS_MAX = 3;
const ONLINE_CARD_OFFICE_PHOTO_URL_MAX_LEN = 1_200;

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

const normalizePhotoUrl = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ONLINE_CARD_OFFICE_PHOTO_URL_MAX_LEN) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  return url.toString();
};

const normalizeOfficePhotos = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const photos: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const url = normalizePhotoUrl(entry);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    photos.push(url);
    if (photos.length >= ONLINE_CARD_OFFICE_PHOTOS_MAX) break;
  }

  return photos;
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
  const ico = normalizeText(row.ico, 24).replace(/\D+/g, "").slice(0, 8);
  const bio = normalizeText(row.bio, 1_000);
  const location = normalizeText(row.location, 120);
  const officeLabel = normalizeText(row.officeLabel, 160);
  const officePhotos = normalizeOfficePhotos(row.officePhotos);

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
    ico,
    bio,
    location,
    officeLabel,
    officePhotos,
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
      ico: parsed.ico,
      bio: parsed.bio,
      location: parsed.location,
      officeLabel: parsed.officeLabel,
      officePhotos: parsed.officePhotos,
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
