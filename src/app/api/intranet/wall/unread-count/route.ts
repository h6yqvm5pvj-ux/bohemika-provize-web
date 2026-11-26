import { NextResponse, type NextRequest } from "next/server";
import { loadWallUnreadCount } from "@/lib/server/intranetUnreadCount";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:unread-count", limit: 120, windowMs: 60_000, allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const respond = (body: object, status = 200) => withRateLimitHeaders(
    NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } }), ctx
  );
  if (!adminDb) return respond({ ok: false, error: "Databáze není dostupná." }, 500);

  try {
    const unreadCount = await loadWallUnreadCount(adminDb, ctx.email.trim().toLowerCase());
    return respond({ ok: true, unreadCount });
  } catch {
    console.error("Intranet unread count failed.");
    return respond({ ok: false, error: "Počet nepřečtených příspěvků se nepodařilo načíst." }, 500);
  }
}
