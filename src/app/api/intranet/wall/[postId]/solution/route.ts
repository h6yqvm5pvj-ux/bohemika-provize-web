import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { isWallId } from "@/app/intranet/wallPersonal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ postId: string }> }) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:solution", limit: 60, windowMs: 60_000, allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const respond = (body: object, status = 200) => withRateLimitHeaders(NextResponse.json(body, { status }), ctx);
  if (!adminDb) return respond({ ok: false, error: "Databáze není dostupná." }, 500);
  const { postId } = await context.params;
  const body = await req.json().catch(() => null);
  if (!isWallId(postId) || !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some(key => key !== "commentId") || (body.commentId !== null && !isWallId(body.commentId))) {
    return respond({ ok: false, error: "Neplatné označení řešení." }, 400);
  }
  const commentId: string | null = body.commentId;
  const postRef = adminDb.collection("intranetWallPosts").doc(postId);
  try {
    await adminDb.runTransaction(async tx => {
      const post = await tx.get(postRef);
      if (!post.exists) throw new Error("POST_NOT_FOUND");
      const data = post.data() ?? {};
      if (String(data.createdByEmail ?? "").trim().toLowerCase() !== ctx.email.trim().toLowerCase()) throw new Error("FORBIDDEN");
      if (data.section !== "pomoc") throw new Error("WRONG_SECTION");
      if (commentId) {
        const comment = await tx.get(postRef.collection("comments").doc(commentId));
        if (!comment.exists) throw new Error("COMMENT_NOT_FOUND");
      }
      tx.update(postRef, {
        acceptedCommentId: commentId,
        acceptedByEmail: commentId ? ctx.email : null,
        acceptedAt: commentId ? FieldValue.serverTimestamp() : null,
      });
    });
    return respond({ ok: true, postId, acceptedCommentId: commentId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "FORBIDDEN") return respond({ ok: false, error: "Řešení může vybrat pouze autor otázky." }, 403);
    if (code === "WRONG_SECTION") return respond({ ok: false, error: "Řešení lze označit pouze v sekci Pomoc." }, 400);
    if (code === "POST_NOT_FOUND" || code === "COMMENT_NOT_FOUND") return respond({ ok: false, error: "Příspěvek nebo komentář už neexistuje." }, 404);
    console.error("Intranet solution update failed:", error);
    return respond({ ok: false, error: "Řešení se nepodařilo uložit." }, 500);
  }
}
