import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { canAccessClientCards } from "@/app/_klienti/clientAccess";
import { isClientCardSlug } from "@/app/_klienti/clientIdentity";
import { isClientNoteId, normalizeClientNote } from "@/app/_klienti/clientNotes";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { CLIENT_NOTE_REMINDERS_COLLECTION, clientNoteDto, clientNoteQueueId } from "@/lib/server/clientNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const PAGE_SIZE = 50;
const MAX_BYTES = 16_384;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}
const errorResponse = (status: number, error: string) => noStore(NextResponse.json({ ok: false, error }, { status }));

async function authorize(req: NextRequest, context: Context) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: `api:client-notes:${req.method.toLowerCase()}`, limit: req.method === "GET" ? 60 : 30,
    windowMs: 60_000, allowImpersonation: false,
  });
  if (!guard.ok) return { ok: false as const, response: noStore(guard.response) };
  const { ctx } = guard;
  if (!canAccessClientCards(ctx.email) || ctx.isImpersonating) {
    return { ok: false as const, response: errorResponse(403, "Nemáš oprávnění ke klientským poznámkám.") };
  }
  const { slug } = await context.params;
  if (!isClientCardSlug(slug)) return { ok: false as const, response: errorResponse(404, "Karta klienta nebyla nalezena.") };
  if (!adminDb) return { ok: false as const, response: errorResponse(503, "Úložiště poznámek není dostupné.") };
  const cardRef = adminDb.collection("clientCardsPrivate").doc(ctx.uid).collection("cards").doc(slug);
  return { ok: true as const, ctx, slug, db: adminDb, notesRef: cardRef.collection("clientNotes") };
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid-body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("body-too-large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-body");
  return value as Record<string, unknown>;
}

export async function GET(req: NextRequest, context: Context) {
  try {
    const access = await authorize(req, context);
    if (!access.ok) return access.response;
    const before = req.nextUrl.searchParams.get("before");
    const noteId = req.nextUrl.searchParams.get("noteId");
    if ((before && !isClientNoteId(before)) || (noteId && !isClientNoteId(noteId))) {
      return errorResponse(400, "Neplatný odkaz na poznámku.");
    }
    let query = access.notesRef.orderBy("createdAtMs", "desc").limit(PAGE_SIZE + 1);
    if (before) {
      const cursor = await access.notesRef.doc(before).get();
      if (!cursor.exists) return errorResponse(409, "Historie se změnila. Načti ji znovu.");
      query = query.startAfter(cursor);
    }
    const [snapshot, focused] = await Promise.all([
      query.get(), noteId ? access.notesRef.doc(noteId).get() : Promise.resolve(null),
    ]);
    const notes = snapshot.docs.slice(0, PAGE_SIZE).map(doc => clientNoteDto(doc.id, doc.data(), access.ctx.uid));
    return noStore(withRateLimitHeaders(NextResponse.json({
      ok: true, notes,
      nextCursor: snapshot.size > PAGE_SIZE ? notes.at(-1)!.id : null,
      focusedNote: focused?.exists ? clientNoteDto(focused.id, focused.data()!, access.ctx.uid) : null,
    }), access.ctx));
  } catch { return errorResponse(500, "Historii jednání se nepodařilo načíst."); }
}

async function mutate(req: NextRequest, context: Context) {
  try {
    const access = await authorize(req, context);
    if (!access.ok) return access.response;
    let body: Record<string, unknown>;
    try { body = await readBody(req); }
    catch (error) { return errorResponse(error instanceof Error && error.message === "body-too-large" ? 413 : 400, "Neplatná nebo příliš velká data poznámky."); }
    const deleting = req.method === "DELETE";
    const creating = req.method === "POST";
    const allowed = deleting ? ["noteId", "expectedRevision"] : ["noteId", "expectedRevision", "clientName", "kind", "text", "reminderEnabled", "reminderAtMs"];
    if (Object.keys(body).some(key => !allowed.includes(key)) || !isClientNoteId(body.noteId) ||
        !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < (creating ? 0 : 1) ||
        Number(body.expectedRevision) >= Number.MAX_SAFE_INTEGER || (creating && body.expectedRevision !== 0)) {
      return errorResponse(400, "Neplatná identifikace nebo verze poznámky.");
    }
    const normalized = deleting ? null : normalizeClientNote(body);
    if (normalized && !normalized.ok) return errorResponse(400, normalized.error);
    const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
    if (!deleting && (!clientName || clientName.length > 200 || /[\u0000-\u001f\u007f]/.test(clientName))) {
      return errorResponse(400, "Chybí platné jméno klienta.");
    }
    const ref = access.notesRef.doc(body.noteId);
    const queueRef = access.db.collection(CLIENT_NOTE_REMINDERS_COLLECTION).doc(clientNoteQueueId(ref.path));
    const result = await access.db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const data = snap.data();
      const current = snap.exists ? clientNoteDto(snap.id, data!, access.ctx.uid) : null;
      if (creating && current && current.revision === 1 && normalized?.ok &&
          current.text === normalized.value.text && current.kind === normalized.value.kind &&
          current.reminderEnabled === normalized.value.reminderEnabled && current.reminderAtMs === normalized.value.reminderAtMs) {
        return { ok: true as const, note: current }; // Retry of the same creation request.
      }
      if ((current?.revision ?? 0) !== body.expectedRevision) return null;
      if (!creating && !current) return null;
      if (deleting) {
        transaction.delete(ref);
        transaction.delete(queueRef);
        return { ok: true as const };
      }
      if (!normalized?.ok) throw new Error("invalid-note");
      const nowMs = Date.now();
      const revision = (current?.revision ?? 0) + 1;
      const next = {
        ...normalized.value, ownerUid: access.ctx.uid, authorEmail: current?.authorEmail ?? access.ctx.email,
        createdAtMs: current?.createdAtMs ?? nowMs, updatedAtMs: nowMs, revision,
        reminderSentAtMs: normalized.value.reminderEnabled ? null : current?.reminderSentAtMs ?? null,
      };
      transaction.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() });
      if (next.reminderEnabled) {
        transaction.set(queueRef, {
          ownerUid: access.ctx.uid, recipientEmail: access.ctx.email, slug: access.slug, noteId: snap.id,
          clientName, reminderAtMs: next.reminderAtMs, revision,
        });
      } else transaction.delete(queueRef);
      return { ok: true as const, note: clientNoteDto(snap.id, next, access.ctx.uid) };
    });
    if (!result) return errorResponse(409, "Poznámka byla mezitím změněna nebo odstraněna. Načti historii znovu.");
    return noStore(withRateLimitHeaders(NextResponse.json(result), access.ctx));
  } catch { return errorResponse(500, "Změnu poznámky se nepodařilo uložit."); }
}

export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
