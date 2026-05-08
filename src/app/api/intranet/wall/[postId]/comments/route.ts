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

const COMMENT_RATE_LIMIT = 60;
const COMMENT_RATE_LIMIT_WINDOW_MS = 60_000;
const COMMENT_MAX_LEN = 2000;

type RouteParams = {
  postId: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

async function resolveDisplayName({
  email,
  uid,
}: {
  email: string;
  uid: string;
}): Promise<string> {
  if (!adminDb) return nameFromEmail(email);
  const usersCol = adminDb.collection("users");

  const pickName = (value: unknown): string => {
    if (!value || typeof value !== "object") return "";
    const row = value as Record<string, unknown>;
    const fullName = normalizeText(row.fullName);
    const name = normalizeText(row.name);
    return fullName || name;
  };

  const directSnap = await usersCol.doc(email).get();
  if (directSnap.exists) {
    const found = pickName(directSnap.data());
    if (found) return found;
  }

  const byEmailSnap = await usersCol.where("email", "==", email).limit(1).get();
  if (!byEmailSnap.empty) {
    const found = pickName(byEmailSnap.docs[0].data());
    if (found) return found;
  }

  if (uid) {
    const byUidSnap = await usersCol.where("userId", "==", uid).limit(1).get();
    if (!byUidSnap.empty) {
      const found = pickName(byUidSnap.docs[0].data());
      if (found) return found;
    }
  }

  return nameFromEmail(email);
}

function resolvePostId(params: RouteParams): string {
  const raw = normalizeText(params.postId);
  if (!raw) return "";
  return raw.replace(/[^\w-]/g, "");
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:intranet-wall:comment",
    limit: COMMENT_RATE_LIMIT,
    windowMs: COMMENT_RATE_LIMIT_WINDOW_MS,
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

  const { postId: rawPostId } = await context.params;
  const postId = resolvePostId({ postId: rawPostId });
  if (!postId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatné ID příspěvku." },
        { status: 400 }
      ),
      ctx
    );
  }

  const body = await req.json().catch(() => null);
  const textRaw =
    body && typeof body === "object"
      ? normalizeText((body as Record<string, unknown>).text)
      : "";
  const text = textRaw.slice(0, COMMENT_MAX_LEN);
  if (!text) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Text komentáře je povinný." },
        { status: 400 }
      ),
      ctx
    );
  }

  const postRef = adminDb.collection(POSTS_COLLECTION).doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Příspěvek už neexistuje." },
        { status: 404 }
      ),
      ctx
    );
  }

  try {
    const authorName = await resolveDisplayName({
      email: ctx.email,
      uid: ctx.uid,
    });

    const commentRef = postRef.collection(COMMENTS_SUBCOLLECTION).doc();
    const now = FieldValue.serverTimestamp();
    const batch = adminDb.batch();
    batch.set(commentRef, {
      text,
      createdByUid: ctx.uid,
      createdByEmail: ctx.email,
      createdByName: authorName,
      createdAt: now,
      updatedAt: now,
    });
    batch.update(postRef, {
      commentCount: FieldValue.increment(1),
      updatedAt: now,
      lastCommentAt: now,
    });
    await batch.commit();

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        commentId: commentRef.id,
      }),
      ctx
    );
  } catch (error) {
    console.error("Intranet wall comment POST failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se uložit komentář." },
        { status: 500 }
      ),
      ctx
    );
  }
}
