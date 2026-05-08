import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "firebase-admin/storage";

import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTS_COLLECTION = "intranetWallPosts";
const COMMENTS_SUBCOLLECTION = "comments";
const DELETE_RATE_LIMIT = 30;
const DELETE_RATE_LIMIT_WINDOW_MS = 60_000;

type RouteParams = {
  postId: string;
};

type StoredAttachment = {
  path: string;
  url: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolvePostId = (raw: string): string =>
  normalizeText(raw).replace(/[^\w-]/g, "");

const normalizeBucketName = (value: string): string =>
  value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");

const isBucketMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: number | string;
    statusCode?: number;
    message?: string;
  };
  const code = typeof row.code === "string" ? Number(row.code) : row.code;
  if (code === 404 || row.statusCode === 404) return true;
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return message.includes("bucket") && message.includes("does not exist");
};

const parseAttachments = (value: unknown): StoredAttachment[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const path = normalizeText(row.path);
      const url = normalizeText(row.url);
      if (!path) return null;
      return { path, url };
    })
    .filter((row): row is StoredAttachment => row !== null);
};

const bucketFromDownloadUrl = (value: string): string | null => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/\/b\/([^/]+)\/o\//i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const resolveStorageBucketCandidates = (attachments: StoredAttachment[]): string[] => {
  const buckets: string[] = [];
  const append = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeBucketName(value);
    if (!normalized) return;
    if (!buckets.includes(normalized)) {
      buckets.push(normalized);
    }
  };

  attachments.forEach((attachment) => append(bucketFromDownloadUrl(attachment.url)));

  append(process.env.FIREBASE_STORAGE_BUCKET);
  append(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const explicit = buckets[0] ?? "";
  if (explicit.endsWith(".firebasestorage.app")) {
    append(explicit.replace(/\.firebasestorage\.app$/i, ".appspot.com"));
  } else if (explicit.endsWith(".appspot.com")) {
    append(explicit.replace(/\.appspot\.com$/i, ".firebasestorage.app"));
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  if (projectId) {
    append(`${projectId}.firebasestorage.app`);
    append(`${projectId}.appspot.com`);
  }

  return buckets;
};

const deleteAttachmentsBestEffort = async (attachments: StoredAttachment[]): Promise<void> => {
  if (!attachments.length) return;
  const storage = getStorage();
  const buckets = resolveStorageBucketCandidates(attachments);
  if (!buckets.length) return;

  for (const attachment of attachments) {
    let deleted = false;
    for (const bucketName of buckets) {
      try {
        await storage
          .bucket(bucketName)
          .file(attachment.path)
          .delete({ ignoreNotFound: true });
        deleted = true;
        break;
      } catch (error) {
        if (isBucketMissingError(error)) continue;
        console.warn("Intranet wall attachment delete failed for bucket.", {
          bucketName,
          path: attachment.path,
          error,
        });
      }
    }
    if (!deleted) {
      console.warn("Intranet wall attachment could not be deleted.", {
        path: attachment.path,
      });
    }
  }
};

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:intranet-wall:delete",
    limit: DELETE_RATE_LIMIT,
    windowMs: DELETE_RATE_LIMIT_WINDOW_MS,
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
  const postId = resolvePostId(params.postId);
  if (!postId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatné ID příspěvku." },
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
        { ok: false, error: "Příspěvek neexistuje." },
        { status: 404 }
      ),
      ctx
    );
  }

  const postRaw = (postSnap.data() ?? {}) as Record<string, unknown>;
  const ownerEmail = normalizeEmail(postRaw.createdByEmail);
  const requesterEmail = normalizeEmail(ctx.email);
  if (!ownerEmail || !requesterEmail || ownerEmail !== requesterEmail) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Příspěvek může smazat pouze autor." },
        { status: 403 }
      ),
      ctx
    );
  }

  const attachments = parseAttachments(postRaw.attachments);

  try {
    await deleteAttachmentsBestEffort(attachments);
  } catch (error) {
    console.warn("Intranet wall attachment cleanup skipped due to error.", error);
  }

  try {
    const commentsSnap = await postRef.collection(COMMENTS_SUBCOLLECTION).get();
    const batch = adminDb.batch();
    commentsSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    batch.delete(postRef);
    await batch.commit();

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, postId }),
      ctx
    );
  } catch (error) {
    console.error("Intranet wall delete failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se smazat příspěvek." },
        { status: 500 }
      ),
      ctx
    );
  }
}
