import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { canAccessClientCards, TEST_CLIENT_SLUG } from "@/app/_klienti/clientAccess";
import {
  MAX_CLIENT_CARD_REQUEST_BYTES,
  parseClientCardDraft,
  type ClientCardResponse,
} from "@/app/_klienti/clientCardData";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

function errorResponse(status: number, error: string) {
  return noStore(NextResponse.json({ ok: false, error }, { status }));
}

async function authorize(req: NextRequest, context: RouteContext) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: `api:client-cards:${req.method.toLowerCase()}`,
    limit: req.method === "GET" ? 60 : 20,
    windowMs: 60_000,
    allowImpersonation: false,
  });
  if (!guard.ok) return { ok: false as const, response: noStore(guard.response) };
  const { ctx } = guard;
  if (!canAccessClientCards(ctx.email) || ctx.isImpersonating) {
    return { ok: false as const, response: errorResponse(403, "Nemáš oprávnění ke klientským kartám.") };
  }
  const { slug } = await context.params;
  if (slug !== TEST_CLIENT_SLUG) {
    return { ok: false as const, response: errorResponse(404, "Karta klienta nebyla nalezena.") };
  }
  if (!adminDb) {
    return { ok: false as const, response: errorResponse(503, "Úložiště klientských karet není dostupné.") };
  }

  // This collection is denied to every client by the existing Firestore
  // fallback rules. Only this authorized Admin SDK endpoint can access it.
  const ref = adminDb.collection("clientCardsPrivate").doc(ctx.uid).collection("cards").doc(slug);
  return { ok: true as const, ctx, ref, db: adminDb };
}

function storedCard(data: Record<string, unknown> | undefined, uid: string): ClientCardResponse {
  if (!data) return { ok: true, card: null, revision: 0 };
  const card = parseClientCardDraft(data.card);
  if (data.ownerUid !== uid || !card || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1) {
    throw new Error("Invalid stored client card");
  }
  return { ok: true, card, revision: Number(data.revision) };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const access = await authorize(req, context);
    if (!access.ok) return access.response;
    const snap = await access.ref.get();
    return noStore(withRateLimitHeaders(
      NextResponse.json(storedCard(snap.data(), access.ctx.uid)), access.ctx,
    ));
  } catch {
    // Do not log request bodies or Firestore records containing personal data.
    return errorResponse(500, "Kartu klienta se nepodařilo načíst.");
  }
}

async function readBoundedJson(req: NextRequest): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid-body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CLIENT_CARD_REQUEST_BYTES) {
        await reader.cancel();
        throw new Error("body-too-large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const access = await authorize(req, context);
    if (!access.ok) return access.response;
    let raw: unknown;
    try {
      raw = await readBoundedJson(req);
    } catch (error) {
      return errorResponse(error instanceof Error && error.message === "body-too-large" ? 413 : 400, "Neplatná nebo příliš velká data klientské karty.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return errorResponse(400, "Neplatná data klientské karty.");
    const body = raw as Record<string, unknown>;
    const card = parseClientCardDraft(body.card);
    if (Object.keys(body).some((key) => key !== "card" && key !== "expectedRevision") || !card || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) >= Number.MAX_SAFE_INTEGER) {
      return errorResponse(400, "Zkontroluj údaje, formát dat a počet dokladů (nejvýše 10).");
    }

    const saved = await access.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(access.ref);
      const current = storedCard(snap.data(), access.ctx.uid);
      if (current.revision !== body.expectedRevision) return null;
      const revision = current.revision + 1;
      transaction.set(access.ref, {
        ownerUid: access.ctx.uid,
        card,
        revision,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: true as const, card, revision };
    });
    if (!saved) return errorResponse(409, "Karta byla mezitím změněna v jiném okně. Před dalším uložením načti aktuální verzi.");
    return noStore(withRateLimitHeaders(NextResponse.json(saved), access.ctx));
  } catch {
    return errorResponse(500, "Změny klientské karty se nepodařilo uložit.");
  }
}
