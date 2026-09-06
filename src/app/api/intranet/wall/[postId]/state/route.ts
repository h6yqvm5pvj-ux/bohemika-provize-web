import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { isWallId, normalizeWallPersonalState, parseWallPersonalAction, wallPersonalPatch } from "@/app/intranet/wallPersonal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ postId: string }> }) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:state", limit: 180, windowMs: 60_000, allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const respond = (body: object, status = 200) => withRateLimitHeaders(NextResponse.json(body, { status }), ctx);
  if (!adminDb) return respond({ ok: false, error: "Databáze není dostupná." }, 500);
  const { postId } = await context.params;
  const action = parseWallPersonalAction(await req.json().catch(() => null));
  if (!isWallId(postId) || !action) return respond({ ok: false, error: "Neplatná změna příspěvku." }, 400);
  const email = ctx.email.trim().toLowerCase();
  const postRef = adminDb.collection("intranetWallPosts").doc(postId);
  const stateRef = postRef.collection("viewerStates").doc(email);
  try {
    const state = await adminDb.runTransaction(async tx => {
      const [post, existing] = await Promise.all([tx.get(postRef), tx.get(stateRef)]);
      if (!post.exists) throw new Error("POST_NOT_FOUND");
      const previous = normalizeWallPersonalState(existing.data(), String(post.data()?.createdByEmail ?? "").trim().toLowerCase() === email);
      const patch = wallPersonalPatch(previous, action, Date.now());
      tx.set(stateRef, { ...patch, email }, { merge: true });
      return { ...previous, ...patch };
    });
    return respond({ ok: true, postId, state });
  } catch (error) {
    if (error instanceof Error && error.message === "POST_NOT_FOUND") return respond({ ok: false, error: "Příspěvek už neexistuje." }, 404);
    console.error("Intranet personal state update failed:", error);
    return respond({ ok: false, error: "Změnu se nepodařilo uložit. Zkus to znovu." }, 500);
  }
}
