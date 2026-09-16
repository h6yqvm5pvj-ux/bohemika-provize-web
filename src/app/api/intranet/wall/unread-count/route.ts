import { NextResponse, type NextRequest } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { INTRANET_SECTION_KEYS, type IntranetSectionKey } from "@/app/intranet/sections";
import { normalizeWallPersonalState } from "@/app/intranet/wallPersonal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BATCH_SIZE = 300;

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
    const db = adminDb;
    const email = ctx.email.trim().toLowerCase();
    // Match the feed's visibility, without loading comments, attachments or author profiles.
    const base = db.collection("intranetWallPosts")
      .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc")
      .select("createdAt", "section", "title", "text").limit(BATCH_SIZE);
    let query: FirebaseFirestore.Query = base;
    let unreadCount = 0;
    while (true) {
      const posts = await query.get();
      if (posts.empty) break;
      const visible = posts.docs.filter(doc => {
        const row = doc.data();
        return typeof row.section === "string" && INTRANET_SECTION_KEYS.has(row.section.trim() as IntranetSectionKey) &&
          typeof row.title === "string" && row.title.trim() &&
          typeof row.text === "string" && row.text.trim();
      });
      if (visible.length) {
        const states = await db.getAll(
          ...visible.map(doc => doc.ref.collection("viewerStates").doc(email)),
          { fieldMask: ["readAtMs"] }
        );
        unreadCount += states.filter(state => normalizeWallPersonalState(state.data()).readAtMs === null).length;
      }
      if (posts.size < BATCH_SIZE) break;
      query = base.startAfter(posts.docs[posts.docs.length - 1]);
    }
    return respond({ ok: true, unreadCount });
  } catch (error) {
    console.error("Intranet unread count failed:", error);
    return respond({ ok: false, error: "Počet nepřečtených příspěvků se nepodařilo načíst." }, 500);
  }
}
