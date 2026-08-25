import { randomUUID } from "node:crypto";

import { getStorage } from "firebase-admin/storage";
import { NextResponse, type NextRequest } from "next/server";

import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import {
  prepareOnlineCardOfficePhotoFile,
  type PreparedOnlineCardOfficePhoto,
} from "@/lib/server/onlineCardOfficePhoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_RATE_LIMIT = 30;
const UPLOAD_RATE_WINDOW_MS = 60_000;

type ApiSuccess = { ok: true; url: string };
type ApiError = { ok: false; error: string };

function buildStorageDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    objectPath
  )}?alt=media&token=${encodeURIComponent(token)}`;
}

function normalizeBucketName(value: string): string {
  return value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");
}

function resolveStorageBucketCandidates(): string[] {
  const candidates: string[] = [];
  const append = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeBucketName(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  append(process.env.FIREBASE_STORAGE_BUCKET);
  append(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const explicit = candidates[0] ?? "";
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
    append(`${projectId}.appspot.com`);
    append(`${projectId}.firebasestorage.app`);
  }

  return candidates;
}

function isBucketMissingError(error: unknown): boolean {
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
}

async function uploadPhotoToBucket({
  bucketName,
  photo,
  uploaderUid,
  uploaderEmail,
}: {
  bucketName: string;
  photo: PreparedOnlineCardOfficePhoto;
  uploaderUid: string;
  uploaderEmail: string;
}): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const objectPath = `online-card/offices/${uploaderUid}/${Date.now()}-${randomUUID()}-${photo.safeFileName}`;
  const downloadToken = randomUUID();

  await bucket.file(objectPath).save(photo.bytes, {
    resumable: false,
    contentType: photo.contentType,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        originalName: photo.originalName,
        detectedContentType: photo.contentType,
        uploadedBy: uploaderEmail,
      },
    },
  });

  return buildStorageDownloadUrl(bucket.name, objectPath, downloadToken);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:online-card:office-photo:post",
    limit: UPLOAD_RATE_LIMIT,
    windowMs: UPLOAD_RATE_WINDOW_MS,
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

  const fileRaw = form.get("file");
  if (!(fileRaw instanceof File)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Vyber soubor s fotkou kanceláře." } satisfies ApiError,
        { status: 400 }
      ),
      ctx
    );
  }

  const prepared = await prepareOnlineCardOfficePhotoFile(fileRaw);
  if (!prepared.ok) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: prepared.error } satisfies ApiError,
        { status: 400 }
      ),
      ctx
    );
  }

  const bucketCandidates = resolveStorageBucketCandidates();
  if (!bucketCandidates.length) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Storage bucket není nakonfigurován." } satisfies ApiError,
        { status: 500 }
      ),
      ctx
    );
  }

  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      const url = await uploadPhotoToBucket({
        bucketName,
        photo: prepared.photo,
        uploaderUid: ctx.uid,
        uploaderEmail: ctx.email,
      });
      return withRateLimitHeaders(
        NextResponse.json({ ok: true, url } satisfies ApiSuccess),
        ctx
      );
    } catch (error) {
      lastError = error;
      if (!isBucketMissingError(error)) break;
      console.warn("Online card office upload bucket not found, trying fallback bucket.", {
        bucketName,
      });
    }
  }

  if (isBucketMissingError(lastError)) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: `Storage bucket neexistuje. Zkontroluj FIREBASE_STORAGE_BUCKET (zkoušeno: ${bucketCandidates.join(
            ", "
          )}).`,
        } satisfies ApiError,
        { status: 500 }
      ),
      ctx
    );
  }

  console.error("Online card office photo upload failed:", lastError);
  return withRateLimitHeaders(
    NextResponse.json(
      { ok: false, error: "Fotku kanceláře se nepodařilo nahrát." } satisfies ApiError,
      { status: 500 }
    ),
    ctx
  );
}
