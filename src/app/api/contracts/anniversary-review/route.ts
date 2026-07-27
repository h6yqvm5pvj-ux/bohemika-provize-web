import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireContractsEntryGuard } from "../_lib/contractsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const FIRESTORE_IN_QUERY_MAX = 30;
const OCCURRENCE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEETING_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const COLLECTION = "anniversaryReviews";
const CONTACT_OUTCOMES = new Set(["reached", "no_answer", "meeting", "ignore"]);

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

function docIdFor(ownerEmail: string, entryId: string): string {
  return `${ownerEmail}__${entryId}`;
}

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
    : Array.from(allowedOwners).slice(0, FIRESTORE_IN_QUERY_MAX);

  if (requestedOwner && ownersToQuery.length === 0) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Nemáš oprávnění k této smlouvě." }, { status: 403 })
    );
  }
  if (ownersToQuery.length === 0) {
    return withRateLimit(NextResponse.json({ ok: true, reviews: [] }));
  }

  const snap = await adminDb
    .collection(COLLECTION)
    .where("ownerEmail", "in", ownersToQuery)
    .get();

  const reviews = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
      entryId: typeof data.entryId === "string" ? data.entryId : "",
      occurrenceKey: typeof data.occurrenceKey === "string" ? data.occurrenceKey : "",
      contactOutcome:
        typeof data.contactOutcome === "string" && CONTACT_OUTCOMES.has(data.contactOutcome)
          ? data.contactOutcome
          : null,
      note: typeof data.note === "string" ? data.note : null,
      meetingAt: typeof data.meetingAt === "string" ? data.meetingAt : null,
      reviewedBy: typeof data.reviewedBy === "string" ? data.reviewedBy : null,
      handled: Boolean(
        typeof data.reviewedAt !== "undefined" ||
          (typeof data.contactOutcome === "string" && CONTACT_OUTCOMES.has(data.contactOutcome))
      ),
    };
  });

  return withRateLimit(NextResponse.json({ ok: true, reviews }));
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
  const entryId = normalizeText(payload.entryId, 200);

  if (!ownerEmail || !entryId) {
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

  const ref = db.collection(COLLECTION).doc(docIdFor(ownerEmail, entryId));

  if (action === "clearOutcome") {
    const current = await ref.get();
    const note = current.exists ? normalizeText(current.data()?.note, 280) : null;
    if (note) {
      await ref.set(
        {
          ownerEmail,
          entryId,
          contactOutcome: FieldValue.delete(),
          meetingAt: FieldValue.delete(),
          reviewedAt: FieldValue.delete(),
          reviewedBy: FieldValue.delete(),
          updatedBy: email,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await ref.delete();
    }
    return withRateLimit(NextResponse.json({ ok: true, marked: false }));
  }

  if (action === "unmark") {
    await ref.delete();
    return withRateLimit(NextResponse.json({ ok: true, marked: false }));
  }

  if (action !== "mark" && action !== "save") {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neznámá akce." }, { status: 400 })
    );
  }

  const occurrenceKeyRaw = normalizeText(payload.occurrenceKey, 10);
  if (!occurrenceKeyRaw || !OCCURRENCE_KEY_RE.test(occurrenceKeyRaw)) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatné occurrenceKey." }, { status: 400 })
    );
  }
  const contractNumber = normalizeText(payload.contractNumber, 120);
  const noteProvided = hasOwn(payload, "note");
  const contactOutcomeProvided = hasOwn(payload, "contactOutcome");
  const meetingAtProvided = hasOwn(payload, "meetingAt");
  const contactOutcome =
    typeof payload.contactOutcome === "string" ? payload.contactOutcome.trim() : null;
  const meetingAt = typeof payload.meetingAt === "string" ? payload.meetingAt.trim() : null;

  if (contactOutcomeProvided && (!contactOutcome || !CONTACT_OUTCOMES.has(contactOutcome))) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatný výsledek kontaktu." }, { status: 400 })
    );
  }
  if (meetingAtProvided && meetingAt && !MEETING_AT_RE.test(meetingAt)) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatný datum nebo čas schůzky." }, { status: 400 })
    );
  }

  const payloadToSave: Record<string, unknown> = {
    ownerEmail,
    entryId,
    contractNumber,
    occurrenceKey: occurrenceKeyRaw,
    updatedBy: email,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (noteProvided) {
    payloadToSave.note = normalizeText(payload.note, 280) ?? null;
  }
  if (meetingAtProvided) {
    payloadToSave.meetingAt = meetingAt || FieldValue.delete();
  }

  if (action === "mark") {
    payloadToSave.reviewedBy = email;
    payloadToSave.reviewedAt = FieldValue.serverTimestamp();
  }

  if (contactOutcomeProvided && contactOutcome) {
    payloadToSave.contactOutcome = contactOutcome;
    if (contactOutcome !== "meeting") {
      payloadToSave.meetingAt = FieldValue.delete();
    }
    payloadToSave.reviewedBy = email;
    payloadToSave.reviewedAt = FieldValue.serverTimestamp();
  }

  await ref.set(payloadToSave, { merge: true });

  return withRateLimit(NextResponse.json({ ok: true, marked: true }));
}
