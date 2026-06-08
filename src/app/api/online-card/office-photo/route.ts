import { randomUUID } from "node:crypto";

import { getStorage } from "firebase-admin/storage";
import { NextResponse, type NextRequest } from "next/server";

import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_RATE_LIMIT = 30;
const UPLOAD_RATE_WINDOW_MS = 60_000;
const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;
const FILE_NAME_MAX_LEN = 120;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ApiSuccess = { ok: true; url: string };
type ApiError = { ok: false; error: string };

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const sanitizeFileName = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FILE_NAME_MAX_LEN) || "office-photo";

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
  file,
  uploaderUid,
  uploaderEmail,
}: {
  bucketName: string;
  file: File;
  uploaderUid: string;
  uploaderEmail: string;
}): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const originalName = normalizeText(file.name) || "office-photo";
  const contentType = normalizeText(file.type) || "application/octet-stream";
  const fileName = sanitizeFileName(originalName);
  const objectPath = `online-card/offices/${uploaderUid}/${Date.now()}-${randomUUID()}-${fileName}`;
  const downloadToken = randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());

  await bucket.file(objectPath).save(bytes, {
    resumable: false,
    contentType,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        originalName,
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

  const contentType = normalizeText(fileRaw.type).toLowerCase();
  const fileName = normalizeText(fileRaw.name) || "soubor";
  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Podporované formáty jsou JPG, PNG a WEBP." } satisfies ApiError,
        { status: 400 }
      ),
      ctx
    );
  }

  if (fileRaw.size <= 0) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: `Soubor ${fileName} je prázdný.` } satisfies ApiError,
        { status: 400 }
      ),
      ctx
    );
  }

  if (fileRaw.size > MAX_FILE_SIZE_BYTES) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Fotka kanceláře je příliš velká (max 6 MB)." } satisfies ApiError,
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
        file: fileRaw,
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
