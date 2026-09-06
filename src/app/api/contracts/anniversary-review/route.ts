import { NextResponse, type NextRequest } from "next/server";

import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { CONTACT_OUTCOMES, type ContactOutcome } from "@/app/lib/anniversaryReviews";
import { appendReviewHistory, readReviewHistory, reviewDto, ReviewMutationError, REVIEWS_COLLECTION as COLLECTION, safeId, type ReviewMutation } from "./history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const FIRESTORE_IN_QUERY_MAX = 30;
const OCCURRENCE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEETING_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const validDay = (value: string): boolean => {
  if (!OCCURRENCE_KEY_RE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown, maxLen: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export async function GET(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:anniversary-review:get",
    limit: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  if (ctx.accountType === "tipster") {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Nedostupné pro tipařský účet." }, { status: 403 })
    );
  }
  if (!adminDb) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 })
    );
  }
  const { email, contractAccessEmails } = ctx;

  const requestedOwner = normalizeEmail(req.nextUrl.searchParams.get("ownerEmail"));
  const allowedOwners = new Set<string>([email, ...contractAccessEmails]);
  const ownersToQuery = requestedOwner
    ? allowedOwners.has(requestedOwner)
      ? [requestedOwner]
      : []
    : Array.from(allowedOwners);

  if (requestedOwner && ownersToQuery.length === 0) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Nemáš oprávnění k této smlouvě." }, { status: 403 })
    );
  }
  if (req.nextUrl.searchParams.get("history") === "1") {
    const entryId = req.nextUrl.searchParams.get("entryId");
    const beforeRaw = req.nextUrl.searchParams.get("before");
    const before = beforeRaw === null ? null : Number(beforeRaw);
    if (!requestedOwner || !safeId(entryId) || (before !== null && (!Number.isSafeInteger(before) || before < 1))) {
      return withRateLimit(NextResponse.json({ ok: false, error: "Neplatný výběr historie." }, { status: 400 }));
    }
    const history = await readReviewHistory(adminDb, requestedOwner, entryId, before);
    return withRateLimit(NextResponse.json({ ok: true, ...history }, { headers: { "Cache-Control": "private, no-store" } }));
  }
  if (ownersToQuery.length === 0) {
    return withRateLimit(NextResponse.json({ ok: true, reviews: [] }));
  }

  // Firestore limits each `in` query, not the size of the accessible team.
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < ownersToQuery.length; i += FIRESTORE_IN_QUERY_MAX) {
    const snap = await adminDb
      .collection(COLLECTION)
      .where("ownerEmail", "in", ownersToQuery.slice(i, i + FIRESTORE_IN_QUERY_MAX))
      .get();
    docs.push(...snap.docs);
  }

  const reviews = docs.map((doc) => reviewDto(doc.data()));

  return withRateLimit(NextResponse.json({ ok: true, reviews }, { headers: { "Cache-Control": "private, no-store" } }));
}

export async function POST(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:anniversary-review:post",
    limit: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  if (ctx.accountType === "tipster") {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Nedostupné pro tipařský účet." }, { status: 403 })
    );
  }
  if (!adminDb) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 })
    );
  }
  const db = adminDb;
  const { email, contractAccessEmails } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatný JSON payload." }, { status: 400 })
    );
  }
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const action = typeof payload.action === "string" ? payload.action.trim() : "";
  const ownerEmail = normalizeEmail(payload.ownerEmail);
  const entryId = typeof payload.entryId === "string" ? payload.entryId.trim() : null;

  if (!ownerEmail || !safeId(entryId)) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Chybí ownerEmail nebo entryId." }, { status: 400 })
    );
  }

  const allowedOwners = new Set<string>([email, ...contractAccessEmails]);
  if (!allowedOwners.has(ownerEmail)) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Nemáš oprávnění upravit tuto smlouvu." }, { status: 403 })
    );
  }

  if (action !== "mark" && action !== "save" && action !== "clearOutcome" && action !== "unmark" && action !== "complete" && action !== "reopen") {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neznámá akce." }, { status: 400 })
    );
  }

  const occurrenceKeyRaw = typeof payload.occurrenceKey === "string" ? payload.occurrenceKey.trim() : null;
  if ((action === "mark" || action === "save" || action === "complete" || action === "reopen" || payload.occurrenceKey != null) && (!occurrenceKeyRaw || !validDay(occurrenceKeyRaw))) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatné occurrenceKey." }, { status: 400 })
    );
  }
  const contractNumber = normalizeText(payload.contractNumber, 120);
  const noteProvided = hasOwn(payload, "note");
  const contactOutcomeProvided = hasOwn(payload, "contactOutcome");
  const meetingAtProvided = hasOwn(payload, "meetingAt");
  if ((action === "complete" || action === "reopen") && (noteProvided || contactOutcomeProvided || meetingAtProvided)) {
    return withRateLimit(NextResponse.json({ ok: false, error: "Změnu stavu zapiš samostatně od kontaktu a poznámky." }, { status: 400 }));
  }
  const contactOutcome =
    typeof payload.contactOutcome === "string" ? payload.contactOutcome.trim() : null;
  const meetingAt = typeof payload.meetingAt === "string" ? payload.meetingAt.trim() : null;

  if (contactOutcomeProvided && (!contactOutcome || !CONTACT_OUTCOMES.has(contactOutcome as ContactOutcome))) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatný výsledek kontaktu." }, { status: 400 })
    );
  }
  if (meetingAtProvided && meetingAt && (!MEETING_AT_RE.test(meetingAt) || !validDay(meetingAt.slice(0, 10)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(meetingAt.slice(11)))) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatný datum nebo čas schůzky." }, { status: 400 })
    );
  }

  if (hasOwn(payload, "requestId") && (typeof payload.requestId !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(payload.requestId))) {
    return withRateLimit(NextResponse.json({ ok: false, error: "Neplatné ID zápisu." }, { status: 400 }));
  }
  const mutation: ReviewMutation = {
    action,
    ownerEmail,
    entryId,
    contractNumber,
    occurrenceKey: occurrenceKeyRaw,
    requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
  };
  if (noteProvided) mutation.note = normalizeText(payload.note, 280);
  if (meetingAtProvided) mutation.meetingAt = meetingAt || null;
  if (contactOutcomeProvided && contactOutcome) mutation.contactOutcome = contactOutcome as ContactOutcome;
  try {
    const review = await appendReviewHistory(db, mutation, ctx.actorEmail || email);
    return withRateLimit(NextResponse.json({ ok: true, marked: review.handled, review }, { headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) {
    if (error instanceof ReviewMutationError) return withRateLimit(NextResponse.json({ ok: false, error: error.message }, { status: error.status }));
    console.error("Anniversary contact could not be saved", error);
    return withRateLimit(NextResponse.json({ ok: false, error: "Záznam se nepodařilo uložit. Zkus to prosím znovu." }, { status: 503 }));
  }
}
