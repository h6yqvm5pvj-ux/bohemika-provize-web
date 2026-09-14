import { NextRequest, NextResponse } from "next/server";
import { canAccessClientCards } from "@/app/_klienti/clientAccess";
import { parseClientCardDraft } from "@/app/_klienti/clientCardData";
import { isClientCardSlug } from "@/app/_klienti/clientIdentity";
import type { ClientCardSummary } from "@/app/_klienti/clientDirectory";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdvisorAuthedRateLimited(req, {
      namespace: "api:client-cards:list", limit: 60, windowMs: 60_000, allowImpersonation: false,
    });
    if (!guard.ok) return privateResponse(guard.response);
    const { ctx } = guard;
    if (!canAccessClientCards(ctx.email) || ctx.isImpersonating) {
      return privateResponse(NextResponse.json({ ok: false, error: "Nemáš oprávnění ke klientským kartám." }, { status: 403 }));
    }
    if (!adminDb) return privateResponse(NextResponse.json({ ok: false, error: "Úložiště není dostupné." }, { status: 503 }));
    const snapshot = await adminDb.collection("clientCardsPrivate").doc(ctx.uid).collection("cards").get();
    const cards: ClientCardSummary[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      const card = parseClientCardDraft(data.card);
      if (data.ownerUid !== ctx.uid || !card || !isClientCardSlug(doc.id)) throw new Error("Invalid client card");
      // The directory never receives birth numbers or identity documents.
      return { slug: doc.id, clientName: card.clientName, phone: card.phone, email: card.email, permanentAddress: card.permanentAddress };
    });
    return privateResponse(withRateLimitHeaders(NextResponse.json({ ok: true, cards }), ctx));
  } catch {
    return privateResponse(NextResponse.json({ ok: false, error: "Uložené údaje klientů se nepodařilo načíst." }, { status: 500 }));
  }
}
