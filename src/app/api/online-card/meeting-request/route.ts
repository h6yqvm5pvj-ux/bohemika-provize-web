import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

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
type ApiSuccess = { ok: true; requestId: string };

const REQUEST_RATE_LIMIT = 10;
const REQUEST_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const CARD_BURST_RATE_LIMIT = 24;
const CARD_BURST_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const CARD_DAILY_RATE_LIMIT = 120;
const CARD_DAILY_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60_000;
const CONTACT_RATE_LIMIT = 3;
const CONTACT_RATE_LIMIT_WINDOW_MS = 60 * 60_000;
const CONTACT_VALUE_RATE_LIMIT = 6;
const DUPLICATE_CONTENT_RATE_LIMIT = 3;
const DUPLICATE_CONTENT_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const MIN_DUPLICATE_CONTENT_LENGTH = 24;
const MAX_PUSH_TOKENS_PER_USER = 16;
const MAX_PUSH_TOKENS_PER_MULTICAST = 500;
const TOO_MANY_REQUESTS_ERROR = "Příliš mnoho požadavků. Zkus to prosím za chvíli.";
const RATE_LIMIT_UNAVAILABLE_ERROR =
  "Bezpečnostní limit není dočasně dostupný. Zkus to prosím za chvíli.";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const URL_RE = /\b(?:https?:\/\/|www\.)/gi;

type PublicOnlineCardOwner = {
  slug: string;
  ownerEmail: string;
  ownerName: string;
};

type IncomingBody = {
  slug?: unknown;
  fullName?: unknown;
  phone?: unknown;
  email?: unknown;
  message?: unknown;
  topics?: unknown;
  company?: unknown;
};

type AntiSpamCheck = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const sanitizeText = (value: unknown, maxLen: number): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(CONTROL_CHARS_RE, "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
};

const sanitizeMeetingTopics = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  value.forEach((entry) => {
    const topic = sanitizeText(entry, 90);
    if (!topic) return;
    out.add(topic);
  });
  return [...out].slice(0, 16);
};

const splitTopicsAndNoteFromMessage = (value: string): { topics: string[]; note: string } => {
  const trimmed = value.trim();
  if (!trimmed) return { topics: [], note: "" };

  const lines = trimmed.split(/\r?\n/);
  const firstLine = (lines[0] ?? "").trim();
  const match = firstLine.match(/^t[ée]mata zájmu:\s*(.+)$/i);
  if (!match) {
    return { topics: [], note: trimmed };
  }

  const topics = match[1]
    .split(",")
    .map((entry) => sanitizeText(entry, 90))
    .filter(Boolean)
    .slice(0, 16);

  const note = lines
    .slice(1)
    .join("\n")
    .trim();

  return { topics, note };
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

function withRateHeaders(res: NextResponse, rateLimit: RateLimitResult) {
  applyRateLimitHeaders(res.headers, rateLimit);
  return res;
}

function rateLimitResponse(rateLimit: RateLimitResult) {
  const status = rateLimit.store === "unavailable" ? 503 : 429;
  return withRateHeaders(
    NextResponse.json(
      {
        ok: false,
        error: status === 503 ? RATE_LIMIT_UNAVAILABLE_ERROR : TOO_MANY_REQUESTS_ERROR,
      } satisfies ApiError,
      { status }
    ),
    rateLimit
  );
}

function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePhoneForRateLimit(value: string): string {
  const digits = value.replace(/\D+/g, "");
  return digits || value.trim().toLowerCase();
}

function normalizeContentForRateLimit(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 320);
}

function countLinks(value: string): number {
  return Array.from(value.matchAll(URL_RE)).length;
}

function buildDuplicateContentKey({
  slug,
  topics,
  message,
}: {
  slug: string;
  topics: string[];
  message: string;
}): string | null {
  const normalizedMessage = normalizeContentForRateLimit(message);
  const normalizedTopics = topics
    .map(normalizeContentForRateLimit)
    .filter(Boolean)
    .sort()
    .join("|");
  const combined = [normalizedTopics, normalizedMessage].filter(Boolean).join("|");
  if (combined.length < MIN_DUPLICATE_CONTENT_LENGTH) return null;
  return `${slug}:${hashRateLimitKey(combined)}`;
}

async function consumeMeetingAntiSpamLimits({
  slug,
  ownerEmail,
  fullName,
  phone,
  email,
  topics,
  message,
}: {
  slug: string;
  ownerEmail: string;
  fullName: string;
  phone: string;
  email: string;
  topics: string[];
  message: string;
}): Promise<RateLimitResult | null> {
  const normalizedPhone = normalizePhoneForRateLimit(phone);
  const emailHash = hashRateLimitKey(email);
  const phoneHash = hashRateLimitKey(normalizedPhone);
  const contactHash = hashRateLimitKey(
    [
      normalizeContentForRateLimit(fullName),
      email,
      normalizedPhone,
    ].join("|")
  );
  const duplicateContentKey = buildDuplicateContentKey({ slug, topics, message });
  const checks: AntiSpamCheck[] = [
    {
      namespace: "api:online-card:meeting-request:contact",
      key: `${slug}:${contactHash}`,
      limit: CONTACT_RATE_LIMIT,
      windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
    },
    {
      namespace: "api:online-card:meeting-request:email",
      key: `${slug}:${emailHash}`,
      limit: CONTACT_VALUE_RATE_LIMIT,
      windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
    },
    {
      namespace: "api:online-card:meeting-request:phone",
      key: `${slug}:${phoneHash}`,
      limit: CONTACT_VALUE_RATE_LIMIT,
      windowMs: CONTACT_RATE_LIMIT_WINDOW_MS,
    },
  ];

  if (duplicateContentKey) {
    checks.push({
      namespace: "api:online-card:meeting-request:content",
      key: duplicateContentKey,
      limit: DUPLICATE_CONTENT_RATE_LIMIT,
      windowMs: DUPLICATE_CONTENT_RATE_LIMIT_WINDOW_MS,
    });
  }

  checks.push(
    {
      namespace: "api:online-card:meeting-request:card-burst",
      key: ownerEmail,
      limit: CARD_BURST_RATE_LIMIT,
      windowMs: CARD_BURST_RATE_LIMIT_WINDOW_MS,
    },
    {
      namespace: "api:online-card:meeting-request:card-daily",
      key: ownerEmail,
      limit: CARD_DAILY_RATE_LIMIT,
      windowMs: CARD_DAILY_RATE_LIMIT_WINDOW_MS,
    }
  );

  for (const check of checks) {
    const result = await consumeRateLimit(check);
    if (!result.allowed) return result;
  }

  return null;
}

const isPublicCardEnabled = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return true;
};

function parseCardOwner(
  data: Record<string, unknown>,
  docId: string
): PublicOnlineCardOwner | null {
  if (!isPublicCardEnabled(data.onlineCard)) return null;

  const card = data.onlineCard as Record<string, unknown>;
  if (card.enabled !== true) return null;

  const slug = normalizeSlug(card.slug);
  const ownerName = sanitizeText(card.fullName, 120);
  if (!slug || slug.length < 3 || !SLUG_RE.test(slug)) return null;
  if (!ownerName) return null;

  const cardEmail = normalizeEmail(card.email);
  const profileEmail = normalizeEmail(data.email);
  const docIdEmail = normalizeEmail(docId);
  const ownerEmailCandidate = [cardEmail, profileEmail, docIdEmail].find(
    (email) => email && EMAIL_RE.test(email)
  );
  if (!ownerEmailCandidate) return null;

  return {
    slug,
    ownerEmail: ownerEmailCandidate,
    ownerName,
  };
}

async function findCardOwnerBySlug(slug: string): Promise<PublicOnlineCardOwner | null> {
  if (!adminDb) return null;

  const usersCol = adminDb.collection("users");
  const snap = await usersCol.where("onlineCard.slug", "==", slug).limit(12).get();
  if (snap.empty) return null;

  for (const docSnap of snap.docs) {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const parsed = parseCardOwner(data, docSnap.id);
    if (!parsed || parsed.slug !== slug) continue;

    if (!parsed.ownerEmail || !EMAIL_RE.test(parsed.ownerEmail)) continue;
    return parsed;
  }

  return null;
}

async function loadOwnerPushTokens(ownerEmail: string): Promise<string[]> {
  if (!adminDb) return [];

  const [publicSnap, byEmailSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(ownerEmail).get(),
    adminDb.collection("users").where("email", "==", ownerEmail).limit(6).get(),
    adminDb.collection("usersPrivate").doc(ownerEmail).get(),
  ]);

  const publicMerged = {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };
  byEmailSnap.docs.forEach((docSnap) => {
    const row = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    Object.assign(publicMerged, row);
  });

  const mergedProfile = {
    ...publicMerged,
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };

  return collectPushTokens(mergedProfile).slice(0, MAX_PUSH_TOKENS_PER_USER);
}

async function sendPushNotification({
  req,
  ownerEmail,
  requesterName,
  requestId,
}: {
  req: NextRequest;
  ownerEmail: string;
  requesterName: string;
  requestId: string;
}) {
  if (!adminMessaging) return;

  const tokens = await loadOwnerPushTokens(ownerEmail);
  if (tokens.length === 0) return;

  const title = "Nová žádost o schůzku";
  const body = `${requesterName} chce domluvit schůzku.`;
  const deepLink = "/posta";
  const webPushLink = `${req.nextUrl.protocol}//${req.nextUrl.host}${deepLink}`;
  const createdAtIso = new Date().toISOString();

  for (let i = 0; i < tokens.length; i += MAX_PUSH_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(i, i + MAX_PUSH_TOKENS_PER_MULTICAST);
    if (chunk.length === 0) continue;

    await adminMessaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title,
        body,
      },
      data: {
        type: "online_card_meeting_request",
        title,
        body,
        deepLink,
        requestId,
        requesterName,
        createdAt: createdAtIso,
      },
      webpush: {
        fcmOptions: {
          link: webPushLink,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: `bohemika-online-card-meeting-${requestId}`,
          requireInteraction: false,
        },
      },
    });
  }
}

export async function POST(req: NextRequest) {
  const ip = getRequestIp(req);
  const rateLimit = await consumeRateLimit({
    namespace: "api:online-card:meeting-request:post",
    key: ip,
    limit: REQUEST_RATE_LIMIT,
    windowMs: REQUEST_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    if (!adminDb) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies ApiError,
          { status: 500 }
        ),
        rateLimit
      );
    }

    const body = (await req.json().catch(() => null)) as IncomingBody | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Neplatný formát požadavku." } satisfies ApiError,
          { status: 400 }
        ),
        rateLimit
      );
    }

    const slug = normalizeSlug(body.slug);
    const fullName = sanitizeText(body.fullName, 120);
    const phone = sanitizeText(body.phone, 80);
    const email = normalizeEmail(body.email);
    const messageRaw = sanitizeText(body.message, 1200);
    const topicsRaw = sanitizeMeetingTopics(body.topics);
    const honeypot = sanitizeText(body.company, 120);
    const parsedLegacy = splitTopicsAndNoteFromMessage(messageRaw);
    const topics = topicsRaw.length > 0 ? topicsRaw : parsedLegacy.topics;
    const message = topicsRaw.length > 0 ? messageRaw : parsedLegacy.note;

    if (!slug || slug.length < 3 || !SLUG_RE.test(slug)) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Veřejná vizitka není dostupná." } satisfies ApiError,
          { status: 404 }
        ),
        rateLimit
      );
    }

    if (!fullName || fullName.length < 3) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Vyplň prosím jméno a příjmení." } satisfies ApiError,
          { status: 400 }
        ),
        rateLimit
      );
    }

    if (!phone || phone.length < 6) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Vyplň prosím telefon." } satisfies ApiError,
          { status: 400 }
        ),
        rateLimit
      );
    }

    if (!email || !EMAIL_RE.test(email)) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Vyplň prosím platný e-mail." } satisfies ApiError,
          { status: 400 }
        ),
        rateLimit
      );
    }

    if (countLinks(fullName) > 0 || countLinks(message) > 1) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Formulář obsahuje příliš mnoho odkazů." } satisfies ApiError,
          { status: 400 }
        ),
        rateLimit
      );
    }

    if (honeypot) {
      return withRateHeaders(
        NextResponse.json({ ok: true, requestId: "filtered" } satisfies ApiSuccess),
        rateLimit
      );
    }

    const owner = await findCardOwnerBySlug(slug);
    if (!owner) {
      return withRateHeaders(
        NextResponse.json(
          { ok: false, error: "Veřejná vizitka nebyla nalezena." } satisfies ApiError,
          { status: 404 }
        ),
        rateLimit
      );
    }

    const antiSpamLimit = await consumeMeetingAntiSpamLimits({
      slug,
      ownerEmail: owner.ownerEmail,
      fullName,
      phone,
      email,
      topics,
      message,
    });
    if (antiSpamLimit) {
      return rateLimitResponse(antiSpamLimit);
    }

    const requestRef = adminDb.collection("onlineCardMeetingRequests").doc();
    const createdAtMs = Date.now();

    await requestRef.set({
      requestId: requestRef.id,
      slug,
      ownerEmail: owner.ownerEmail,
      ownerName: owner.ownerName,
      requester: {
        fullName,
        phone,
        email,
        topics,
        message,
        ip,
        userAgent: req.headers.get("user-agent")?.slice(0, 240) || "",
      },
      source: {
        host: req.nextUrl.host,
        protocol: req.nextUrl.protocol,
        pagePath: `/vizitka/${slug}`,
        rateLimitStore: rateLimit.store,
        ipResolved: ip !== "unknown",
        antiSpamVersion: 1,
      },
      createdAtMs,
      createdAt: FieldValue.serverTimestamp(),
    });

    const mailboxTitle = "Nová žádost o schůzku";
    const mailboxBody = `${fullName} (${phone}) • ${email}`;

    await writeMailboxEntries({
      recipientEmails: [owner.ownerEmail],
      type: "online_card_meeting_request",
      title: mailboxTitle,
      body: mailboxBody,
      deepLink: "/posta",
      createdAtMs,
      metadata: {
        requestId: requestRef.id,
        slug,
        requesterName: fullName,
        requesterPhone: phone,
        requesterEmail: email,
        requesterTopics: topics.join("||"),
        requesterMessage: message,
        meetingOwnerName: owner.ownerName,
      },
    });

    try {
      await sendPushNotification({
        req,
        ownerEmail: owner.ownerEmail,
        requesterName: fullName,
        requestId: requestRef.id,
      });
    } catch (error) {
      console.warn("Online card meeting push notification failed:", error);
    }

    return withRateHeaders(
      NextResponse.json({ ok: true, requestId: requestRef.id } satisfies ApiSuccess),
      rateLimit
    );
  } catch (error) {
    console.error("Online card meeting request failed:", error);
    return withRateHeaders(
      NextResponse.json(
        { ok: false, error: "Žádost se nepodařilo odeslat." } satisfies ApiError,
        { status: 500 }
      ),
      rateLimit
    );
  }
}
