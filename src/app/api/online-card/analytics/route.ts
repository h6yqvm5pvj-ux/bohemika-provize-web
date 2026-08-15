import { NextResponse, type NextRequest } from "next/server";

import {
  EMPTY_ONLINE_CARD_ANALYTICS_EVENTS,
  isOnlineCardAnalyticsEvent,
  type OnlineCardAnalyticsDay,
  type OnlineCardAnalyticsEventCounts,
} from "@/lib/onlineCardAnalytics";
import { ONLINE_CARD_SLUG_RE, normalizeOnlineCardSlug } from "@/lib/server/onlineCard";
import { recordOnlineCardAnalyticsEvent } from "@/lib/server/onlineCardAnalytics";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireAuthedRateLimited } from "@/lib/server/apiEntryGuard";
import { consumeRateLimit, getRequestIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_RATE_LIMIT = 120;
const EVENT_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PublicAnalyticsRequest = {
  slug?: unknown;
  event?: unknown;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const toSafeNumber = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
};

async function findOnlineCardOwner(slug: string): Promise<{ ownerEmail: string } | null> {
  if (!adminDb) return null;

  const cards = await adminDb.collection("users").where("onlineCard.slug", "==", slug).limit(12).get();
  for (const docSnap of cards.docs) {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const rawCard = data.onlineCard;
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) continue;

    const card = rawCard as Record<string, unknown>;
    if (card.enabled !== true || normalizeOnlineCardSlug(card.slug) !== slug) continue;

    const ownerEmail = [card.email, data.email, docSnap.id]
      .map(normalizeEmail)
      .find((email) => EMAIL_RE.test(email));
    if (ownerEmail) return { ownerEmail };
  }

  return null;
}

function dayKeyBefore(daysAgo: number, today: string): string {
  const date = new Date(`${today}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function pragueDayKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizeRange(value: string | null): number {
  const parsed = Number(value);
  return parsed === 7 || parsed === 90 ? parsed : 30;
}

function readEventCounts(value: unknown): OnlineCardAnalyticsEventCounts {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const events = EMPTY_ONLINE_CARD_ANALYTICS_EVENTS();
  (Object.keys(events) as Array<keyof OnlineCardAnalyticsEventCounts>).forEach((event) => {
    events[event] = toSafeNumber(source[event]);
  });
  return events;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as PublicAnalyticsRequest | null;
  const slug = normalizeOnlineCardSlug(body?.slug);
  if (!slug || slug.length < 3 || !ONLINE_CARD_SLUG_RE.test(slug) || !isOnlineCardAnalyticsEvent(body?.event)) {
    return new NextResponse(null, { status: 204 });
  }

  const rateLimit = await consumeRateLimit({
    namespace: "api:online-card:analytics:event",
    key: `${slug}:${getRequestIp(req)}`,
    limit: EVENT_RATE_LIMIT,
    windowMs: EVENT_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) return new NextResponse(null, { status: 204 });

  try {
    const owner = await findOnlineCardOwner(slug);
    if (!owner) return new NextResponse(null, { status: 204 });

    await recordOnlineCardAnalyticsEvent({
      ownerEmail: owner.ownerEmail,
      slug,
      event: body.event,
    });
  } catch (error) {
    // Analytics must never prevent a visitor from using the public card.
    console.warn("Online card analytics event failed:", error);
  }

  return new NextResponse(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthedRateLimited(req, {
    namespace: "api:online-card:analytics:get",
    limit: 60,
    windowMs: 10 * 60_000,
    allowImpersonation: true,
  });
  if (!auth.ok) return auth.response;
  if (!adminDb) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován." },
      { status: 500 }
    );
  }

  const rangeDays = normalizeRange(req.nextUrl.searchParams.get("days"));
  const today = pragueDayKey();
  const startDay = dayKeyBefore(rangeDays - 1, today);

  try {
    const snapshot = await adminDb
      .collection("onlineCardAnalytics")
      .doc(auth.ctx.email)
      .collection("days")
      .where("day", ">=", startDay)
      .orderBy("day", "asc")
      .get();

    const storedDays = new Map<string, OnlineCardAnalyticsEventCounts>();
    snapshot.docs.forEach((docSnap) => {
      const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
      const day = typeof data.day === "string" ? data.day : "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        storedDays.set(day, readEventCounts(data.events));
      }
    });

    const days: OnlineCardAnalyticsDay[] = Array.from({ length: rangeDays }, (_, index) => {
      const day = dayKeyBefore(rangeDays - 1 - index, today);
      return {
        day,
        events: storedDays.get(day) ?? EMPTY_ONLINE_CARD_ANALYTICS_EVENTS(),
      };
    });

    const totals = days.reduce((result, day) => {
      (Object.keys(result) as Array<keyof OnlineCardAnalyticsEventCounts>).forEach((event) => {
        result[event] += day.events[event];
      });
      return result;
    }, EMPTY_ONLINE_CARD_ANALYTICS_EVENTS());

    return NextResponse.json({ ok: true, rangeDays, days, totals });
  } catch (error) {
    console.error("Online card analytics summary failed:", error);
    return NextResponse.json(
      { ok: false, error: "Přehled návštěvnosti se nepodařilo načíst." },
      { status: 500 }
    );
  }
}
