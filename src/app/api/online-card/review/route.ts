import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { resolveOnlineCardPendingTestimonials } from "@/lib/onlineCardI18n";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import { collectPushTokens } from "@/lib/server/pushTokens";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getRequestIp,
  type RateLimitResult,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiError = { ok: false; error: string };
type ApiSuccess = { ok: true; reviewId: string };
type IncomingBody = {
  slug?: unknown;
  author?: unknown;
  context?: unknown;
  quote?: unknown;
  company?: unknown;
  locale?: unknown;
  consent?: unknown;
};

const REQUEST_RATE_LIMIT = 5;
const REQUEST_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const CARD_DAILY_RATE_LIMIT = 50;
const CARD_DAILY_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60_000;
const DUPLICATE_CONTENT_RATE_LIMIT = 2;
const DUPLICATE_CONTENT_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60_000;
const MAX_PENDING_REVIEWS = 30;
const MAX_PUSH_TOKENS = 16;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const URL_RE = /\b(?:https?:\/\/|www\.)/gi;

const sanitizeText = (value: unknown, maxLength: number): string =>
  typeof value === "string"
    ? value.replace(CONTROL_CHARS_RE, "").trim().slice(0, maxLength)
    : "";

const normalizeSlug = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeLocale = (value: unknown): "cs" | "en" | "uk" =>
  value === "en" || value === "uk" ? value : "cs";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

const normalizeForDuplicateCheck = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function withRateHeaders(response: NextResponse, rateLimit: RateLimitResult) {
  applyRateLimitHeaders(response.headers, rateLimit);
  return response;
}

function rateLimitResponse(rateLimit: RateLimitResult) {
  const unavailable = rateLimit.store === "unavailable";
  return withRateHeaders(
    NextResponse.json(
      {
        ok: false,
        error: unavailable
          ? "Bezpečnostní limit není dočasně dostupný. Zkuste to prosím za chvíli."
          : "Příliš mnoho pokusů. Zkuste to prosím později.",
      } satisfies ApiError,
      { status: unavailable ? 503 : 429 }
    ),
    rateLimit
  );
}

async function findCardOwner(slug: string) {
  if (!adminDb) return null;
  const snap = await adminDb.collection("users").where("onlineCard.slug", "==", slug).limit(12).get();
  for (const docSnap of snap.docs) {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const card = data.onlineCard;
    if (!card || typeof card !== "object" || Array.isArray(card)) continue;
    const row = card as Record<string, unknown>;
    if (row.enabled !== true || normalizeSlug(row.slug) !== slug) continue;
    const ownerEmail = [row.ownerEmail, data.email, docSnap.id]
      .map(normalizeEmail)
      .find((email) => EMAIL_RE.test(email));
    if (!ownerEmail) continue;
    return {
      ref: docSnap.ref,
      ownerEmail,
      ownerName: sanitizeText(row.fullName, 120) || "Poradce",
    };
  }
  return null;
}

async function sendReviewPush({
  req,
  ownerEmail,
  author,
  reviewId,
}: {
  req: NextRequest;
  ownerEmail: string;
  author: string;
  reviewId: string;
}) {
  if (!adminDb || !adminMessaging) return;

  const [publicDoc, byEmail, privateDoc] = await Promise.all([
    adminDb.collection("users").doc(ownerEmail).get(),
    adminDb.collection("users").where("email", "==", ownerEmail).limit(6).get(),
    adminDb.collection("usersPrivate").doc(ownerEmail).get(),
  ]);
  const publicProfile = {
    ...((publicDoc.data() as Record<string, unknown> | undefined) ?? {}),
  };
  byEmail.docs.forEach((docSnap) => {
    Object.assign(publicProfile, (docSnap.data() as Record<string, unknown> | undefined) ?? {});
  });
  const merged = {
    ...publicProfile,
    ...((privateDoc.data() as Record<string, unknown> | undefined) ?? {}),
  };
  const tokens = collectPushTokens(merged).slice(0, MAX_PUSH_TOKENS);
  if (tokens.length === 0) return;

  const title = "Nová recenze ke schválení";
  const body = `${author} poslal(a) recenzi z online vizitky.`;
  const deepLink = "/nastaveni#online-card-reviews";
  await adminMessaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      type: "online_card_review_pending",
      title,
      body,
      deepLink,
      reviewId,
    },
    webpush: {
      fcmOptions: { link: `${req.nextUrl.protocol}//${req.nextUrl.host}${deepLink}` },
      notification: {
        icon: "/pwa/icon-192.png",
        badge: "/pwa/icon-192.png",
        tag: `bohemika-online-card-review-${reviewId}`,
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const ip = getRequestIp(req);
  const initialLimit = await consumeRateLimit({
    namespace: "api:online-card:review:ip",
    key: ip,
    limit: REQUEST_RATE_LIMIT,
    windowMs: REQUEST_RATE_LIMIT_WINDOW_MS,
  });
  if (!initialLimit.allowed) return rateLimitResponse(initialLimit);

  try {
    if (!adminDb) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Server není správně nakonfigurován." } satisfies ApiError,
          { status: 500 }
        ),
        initialLimit
      );
    }

    const body = (await req.json().catch(() => null)) as IncomingBody | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return withRateHeaders(
        NextResponse.json({ ok: false, error: "Neplatný formát požadavku." } satisfies ApiError, { status: 400 }),
        initialLimit
      );
    }

    const slug = normalizeSlug(body.slug);
    const author = sanitizeText(body.author, 80);
    const context = sanitizeText(body.context, 120);
    const quote = sanitizeText(body.quote, 600);
    const honeypot = sanitizeText(body.company, 120);
    const locale = normalizeLocale(body.locale);
    if (!slug || slug.length < 3 || !SLUG_RE.test(slug)) {
      return withRateHeaders(
        NextResponse.json({ ok: false, error: "Veřejná vizitka není dostupná." } satisfies ApiError, { status: 404 }),
        initialLimit
      );
    }
    if (author.length < 2 || quote.length < 15 || body.consent !== true) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Vyplňte jméno, text recenze a souhlas se zveřejněním." } satisfies ApiError,
          { status: 400 }
        ),
        initialLimit
      );
    }
    if (Array.from(author.matchAll(URL_RE)).length > 0 || Array.from(quote.matchAll(URL_RE)).length > 0) {
      return withRateHeaders(
        NextResponse.json({ ok: false, error: "Recenze nesmí obsahovat odkazy." } satisfies ApiError, { status: 400 }),
        initialLimit
      );
    }
    if (honeypot) {
      return withRateHeaders(NextResponse.json({ ok: true, reviewId: "filtered" } satisfies ApiSuccess), initialLimit);
    }

    const owner = await findCardOwner(slug);
    if (!owner) {
      return withRateHeaders(
        NextResponse.json({ ok: false, error: "Veřejná vizitka nebyla nalezena." } satisfies ApiError, { status: 404 }),
        initialLimit
      );
    }

    const normalizedReview = normalizeForDuplicateCheck(`${author}|${quote}`);
    const [cardLimit, duplicateLimit] = await Promise.all([
      consumeRateLimit({
        namespace: "api:online-card:review:card-daily",
        key: slug,
        limit: CARD_DAILY_RATE_LIMIT,
        windowMs: CARD_DAILY_RATE_LIMIT_WINDOW_MS,
      }),
      consumeRateLimit({
        namespace: "api:online-card:review:duplicate",
        key: `${slug}:${hash(normalizedReview)}`,
        limit: DUPLICATE_CONTENT_RATE_LIMIT,
        windowMs: DUPLICATE_CONTENT_RATE_LIMIT_WINDOW_MS,
      }),
    ]);
    if (!cardLimit.allowed) return rateLimitResponse(cardLimit);
    if (!duplicateLimit.allowed) return rateLimitResponse(duplicateLimit);

    const reviewId = `review-${Date.now()}-${hash(`${ip}:${Math.random()}`).slice(0, 12)}`;
    const submittedAt = new Date().toISOString();
    const pendingReview = { reviewId, author, context, quote, locale, submittedAt };

    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(owner.ref);
      const data = (snap.data() as Record<string, unknown> | undefined) ?? {};
      const card = data.onlineCard;
      if (!card || typeof card !== "object" || Array.isArray(card)) throw new Error("CARD_NOT_FOUND");
      const row = card as Record<string, unknown>;
      if (row.enabled !== true || normalizeSlug(row.slug) !== slug) throw new Error("CARD_NOT_FOUND");
      const pending = resolveOnlineCardPendingTestimonials(row.pendingTestimonials);
      if (pending.length >= MAX_PENDING_REVIEWS) throw new Error("PENDING_LIMIT");
      transaction.update(owner.ref, {
        "onlineCard.pendingTestimonials": [
          ...pending,
          { id: reviewId, author, context, quote, locale, submittedAt },
        ],
      });
    });

    try {
      await writeMailboxEntries({
        recipientEmails: [owner.ownerEmail],
        type: "online_card_review_pending",
        title: "Nová recenze ke schválení",
        body: `${author} poslal(a) recenzi k vizitce ${owner.ownerName}.`,
        deepLink: "/nastaveni#online-card-reviews",
        metadata: {
          reviewId,
          slug,
          reviewAuthor: author,
          reviewContext: context,
          reviewQuote: quote,
          reviewLocale: locale,
        },
      });
    } catch (notificationError) {
      console.error("Online card review notification failed:", notificationError);
    }
    try {
      await sendReviewPush({ req, ownerEmail: owner.ownerEmail, author, reviewId });
    } catch (notificationError) {
      console.error("Online card review push notification failed:", notificationError);
    }

    return withRateHeaders(
      NextResponse.json({ ok: true, reviewId: pendingReview.reviewId } satisfies ApiSuccess),
      initialLimit
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "CARD_NOT_FOUND") {
      return withRateHeaders(
        NextResponse.json({ ok: false, error: "Veřejná vizitka nebyla nalezena." } satisfies ApiError, { status: 404 }),
        initialLimit
      );
    }
    if (reason === "PENDING_LIMIT") {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Poradce má příliš mnoho recenzí čekajících na schválení." } satisfies ApiError,
          { status: 429 }
        ),
        initialLimit
      );
    }
    console.error("Online card review submission failed:", error);
    return withRateHeaders(
      NextResponse.json({ ok: false, error: "Recenzi se nepodařilo odeslat." } satisfies ApiError, { status: 500 }),
      initialLimit
    );
  }
}
