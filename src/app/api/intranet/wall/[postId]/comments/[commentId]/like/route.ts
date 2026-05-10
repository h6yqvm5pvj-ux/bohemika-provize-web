import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTS_COLLECTION = "intranetWallPosts";
const COMMENTS_SUBCOLLECTION = "comments";
const COMMENT_LIKE_RATE_LIMIT = 180;
const COMMENT_LIKE_RATE_LIMIT_WINDOW_MS = 60_000;

type RouteParams = {
  postId: string;
  commentId: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveId = (value: unknown): string =>
  normalizeText(value).replace(/[^\w-]/g, "");

const parseLikedByEmails = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const raw of value) {
    const normalized = normalizeEmail(raw);
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:intranet-wall:comment-like",
    limit: COMMENT_LIKE_RATE_LIMIT,
    windowMs: COMMENT_LIKE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firestore)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const params = await context.params;
  const postId = resolveId(params.postId);
  const commentId = resolveId(params.commentId);
  if (!postId || !commentId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatné ID příspěvku nebo komentáře." },
        { status: 400 }
      ),
      ctx
    );
  }

  const viewerEmail = normalizeEmail(ctx.email);
  if (!viewerEmail) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se ověřit uživatele." },
        { status: 401 }
      ),
      ctx
    );
  }

  const commentRef = adminDb
    .collection(POSTS_COLLECTION)
    .doc(postId)
    .collection(COMMENTS_SUBCOLLECTION)
    .doc(commentId);

  const response = {
    likedByMe: false,
    likeCount: 0,
  };

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(commentRef);
      if (!snap.exists) {
        throw new Error("COMMENT_NOT_FOUND");
      }

      const raw = (snap.data() ?? {}) as Record<string, unknown>;
      const likedBySet = new Set(parseLikedByEmails(raw.likedByEmails));
      if (likedBySet.has(viewerEmail)) {
        likedBySet.delete(viewerEmail);
        response.likedByMe = false;
      } else {
        likedBySet.add(viewerEmail);
        response.likedByMe = true;
      }

      const likedByEmails = Array.from(likedBySet);
      response.likeCount = likedByEmails.length;

      tx.update(commentRef, {
        likedByEmails,
        likeCount: response.likeCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        postId,
        commentId,
        likedByMe: response.likedByMe,
        likeCount: response.likeCount,
      }),
      ctx
    );
  } catch (error) {
    if (error instanceof Error && error.message === "COMMENT_NOT_FOUND") {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Komentář už neexistuje." },
          { status: 404 }
        ),
        ctx
      );
    }

    console.error("Intranet wall comment like toggle failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se uložit lajk komentáře." },
        { status: 500 }
      ),
      ctx
    );
  }
}

