import type { PremiumOnlineCardValue } from "@/components/PremiumOnlineCardPreview";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { resolveOnlineCardTranslations } from "@/lib/onlineCardI18n";

export const ONLINE_CARD_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export const normalizeOnlineCardSlug = (value: unknown): string => {
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

const parseOnlineCard = (
  value: unknown
): (PremiumOnlineCardValue & { enabled: boolean; slug: string }) | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const enabled = row.enabled === true;
  const slug = normalizeOnlineCardSlug(row.slug);
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
  const translations = resolveOnlineCardTranslations(row.translations);

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
    translations,
  };
};

export async function loadOnlineCardBySlug(
  slug: string
): Promise<PremiumOnlineCardValue | null> {
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
      translations: parsed.translations,
    };
  }

  return null;
}
