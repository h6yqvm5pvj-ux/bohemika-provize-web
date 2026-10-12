import { randomUUID } from "node:crypto";
import { resolveProfileAvatarBuckets } from "@/lib/server/profileAvatarStorage";

import { getStorage } from "firebase-admin/storage";
import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import {
  prepareProfileAvatarFile,
  type PreparedProfileAvatar,
} from "@/lib/server/profileAvatarUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_RATE_LIMIT = 20;
const UPLOAD_RATE_WINDOW_MS = 60_000;

type ApiSuccess = { ok: true; avatar: string };
type ApiError = { ok: false; error: string };

const isBucketMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: number | string; statusCode?: number; message?: string };
  const code = typeof row.code === "string" ? Number(row.code) : row.code;
  if (code === 404 || row.statusCode === 404) return true;
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return message.includes("bucket") && message.includes("does not exist");
};

const buildStorageDownloadUrl = (
  bucketName: string,
  objectPath: string,
  token: string
): string =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    objectPath
  )}?alt=media&token=${encodeURIComponent(token)}`;

async function uploadAvatar({
  bucketName,
  avatar,
  uploaderUid,
  uploaderEmail,
}: {
  bucketName: string;
  avatar: PreparedProfileAvatar;
  uploaderUid: string;
  uploaderEmail: string;
}): Promise<string> {
  const bucket = getStorage().bucket(bucketName);
  const objectPath = `profile-avatars/${uploaderUid}/${Date.now()}-${randomUUID()}-${avatar.safeFileName}`;
  const downloadToken = randomUUID();
  await bucket.file(objectPath).save(avatar.bytes, {
    resumable: false,
    contentType: avatar.contentType,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        originalName: avatar.originalName,
        uploadedBy: uploaderEmail,
      },
    },
  });
  return buildStorageDownloadUrl(bucket.name, objectPath, downloadToken);
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-profile-avatar:post",
    limit: UPLOAD_RATE_LIMIT,
    windowMs: UPLOAD_RATE_WINDOW_MS,
    enforceAdvisorSetup: false,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný formát požadavku." } satisfies ApiError,
        { status: 400 }
      ),
      ctx
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Vyber profilovou fotografii." } satisfies ApiError,
        { status: 400 }
      ),
      ctx
    );
  }

  const prepared = await prepareProfileAvatarFile(file);
  if (!prepared.ok) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: prepared.error } satisfies ApiError,
        { status: 400 }
      ),
      ctx
    );
  }

  const buckets = resolveProfileAvatarBuckets();
  if (buckets.length === 0) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Storage bucket není nakonfigurován." } satisfies ApiError,
        { status: 500 }
      ),
      ctx
    );
  }

  let lastError: unknown = null;
  for (const bucketName of buckets) {
    try {
      const avatar = await uploadAvatar({
        bucketName,
        avatar: prepared.avatar,
        uploaderUid: ctx.uid,
        uploaderEmail: ctx.email,
      });
      return withRateLimitHeaders(
        NextResponse.json({ ok: true, avatar } satisfies ApiSuccess),
        ctx
      );
    } catch (error) {
      lastError = error;
      if (!isBucketMissingError(error)) break;
    }
  }

  console.error("Profile avatar upload failed:", lastError);
  return withRateLimitHeaders(
    NextResponse.json(
      { ok: false, error: "Profilovou fotografii se nepodařilo nahrát." } satisfies ApiError,
      { status: 500 }
    ),
    ctx
  );
}
