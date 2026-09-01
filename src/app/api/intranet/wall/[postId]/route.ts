import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  prepareIntranetWallAttachmentFile,
  type PreparedIntranetWallAttachmentFile,
} from "@/lib/server/intranetWallAttachments";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import {
  INTRANET_SECTION_KEYS,
  INTRANET_SECTION_LABEL_BY_KEY,
  type IntranetSectionKey,
} from "@/app/intranet/sections";
import {
  parseIntranetWallSources,
  parseIntranetWallSourcesJson,
} from "@/app/intranet/wallSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTS_COLLECTION = "intranetWallPosts";
const COMMENTS_SUBCOLLECTION = "comments";
const DELETE_RATE_LIMIT = 30;
const DELETE_RATE_LIMIT_WINDOW_MS = 60_000;
const PATCH_RATE_LIMIT = 40;
const PATCH_RATE_LIMIT_WINDOW_MS = 60_000;
const TITLE_MAX_LEN = 140;
const TEXT_MAX_LEN = 6000;
const FILES_MAX_COUNT = 6;
const FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FILE_TOTAL_MAX_BYTES = 30 * 1024 * 1024;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type RouteParams = {
  postId: string;
};

type StoredAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
  path?: string;
  bucketName?: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolvePostId = (raw: string): string =>
  normalizeText(raw).replace(/[^\w-]/g, "");

const normalizeAttachmentId = (value: unknown): string =>
  normalizeText(value).replace(/[^\w-]/g, "");

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const parseSection = (value: unknown): IntranetSectionKey | null => {
  if (typeof value !== "string") return null;
  const section = value.trim() as IntranetSectionKey;
  return INTRANET_SECTION_KEYS.has(section) ? section : null;
};

const sanitizeFileName = (value: string): string => {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "priloha";
  return cleaned.slice(0, 120);
};

function buildAttachmentApiUrl(postId: string, attachmentId: string): string {
  const params = new URLSearchParams({
    postId,
    attachmentId,
  });
  return `/api/intranet/wall/attachment?${params.toString()}`;
}

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
    .map((item): StoredAttachment | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = normalizeText(row.id);
      const name = normalizeText(row.name);
      const url = normalizeText(row.url);
      const contentType = normalizeText(row.contentType) || "application/octet-stream";
      const sizeRaw = Number(row.sizeBytes);
      const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.floor(sizeRaw) : 0;
      const isImage = row.isImage === true;
      const path = normalizeText(row.path);
      const bucketName = normalizeText(row.bucketName);
      if (!path) return null;
      return {
        id: id || randomUUID(),
        name: name || "Příloha",
        url,
        contentType,
        sizeBytes,
        isImage,
        path,
        bucketName: bucketName || undefined,
      };
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

  attachments.forEach((attachment) => {
    append(attachment.bucketName);
    append(bucketFromDownloadUrl(attachment.url));
  });

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
    if (!attachment.path) continue;
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

async function uploadAttachmentsToBucket({
  bucketName,
  postId,
  files,
  uploaderEmail,
}: {
  bucketName: string;
  postId: string;
  files: PreparedIntranetWallAttachmentFile[];
  uploaderEmail: string;
}): Promise<StoredAttachment[]> {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const attachments: StoredAttachment[] = [];
  const uploadPrefix = `intranet-wall/${postId}`;

  for (let index = 0; index < files.length; index += 1) {
    const preparedFile = files[index]!;
    const { file, bytes, contentType, isImage } = preparedFile;
    const originalName = sanitizeFileName(normalizeText(file.name) || "priloha");
    const objectPath = `${uploadPrefix}/${Date.now()}-${index}-${originalName}`;
    const attachmentId = randomUUID();
    const storageFile = bucket.file(objectPath);

    await storageFile.save(bytes, {
      resumable: false,
      contentType,
      metadata: {
        metadata: {
          originalName,
          uploadedBy: uploaderEmail,
        },
      },
    });

    attachments.push({
      id: attachmentId,
      name: normalizeText(file.name) || originalName,
      url: buildAttachmentApiUrl(postId, attachmentId),
      contentType,
      sizeBytes: file.size,
      isImage,
      path: objectPath,
      bucketName: bucket.name,
    });
  }

  return attachments;
}

async function uploadAttachmentsToStorage({
  postId,
  files,
  uploaderEmail,
  existingAttachments,
}: {
  postId: string;
  files: PreparedIntranetWallAttachmentFile[];
  uploaderEmail: string;
  existingAttachments: StoredAttachment[];
}): Promise<StoredAttachment[]> {
  if (!files.length) return [];

  const bucketCandidates = resolveStorageBucketCandidates(existingAttachments);
  if (!bucketCandidates.length) {
    throw new Error("Storage bucket není nakonfigurován.");
  }

  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      return await uploadAttachmentsToBucket({
        bucketName,
        postId,
        files,
        uploaderEmail,
      });
    } catch (error) {
      lastError = error;
      if (!isBucketMissingError(error)) {
        throw error;
      }
      console.warn("Intranet wall upload bucket not found, trying fallback bucket.", {
        bucketName,
      });
    }
  }

  if (isBucketMissingError(lastError)) {
    throw new Error(
      `Storage bucket neexistuje. Zkontroluj FIREBASE_STORAGE_BUCKET (zkoušeno: ${bucketCandidates.join(
        ", "
      )}).`
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Nepodařilo se nahrát přílohy do Storage.");
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:update",
    limit: PATCH_RATE_LIMIT,
    windowMs: PATCH_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
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

  let title = "";
  let text = "";
  let section: IntranetSectionKey | null = null;
  let pinned = false;
  let readByDay: string | null = null;
  let sources: string[] | null = null;
  let sourcesError: string | null = null;
  let files: File[] = [];
  let removedAttachmentIds: string[] = [];
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      title = normalizeText(form.get("title")).slice(0, TITLE_MAX_LEN);
      text = normalizeText(form.get("text")).slice(0, TEXT_MAX_LEN);
      section = parseSection(form.get("section"));
      pinned = normalizeText(form.get("pinned")) === "1";
      const readByDayRaw = normalizeText(form.get("readByDay"));
      readByDay = readByDayRaw || null;
      if (form.has("sources")) {
        const result = parseIntranetWallSourcesJson(form.get("sources"));
        if (result.ok) sources = result.sources;
        else sourcesError = result.error;
      }
      files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
      removedAttachmentIds = Array.from(
        new Set(
          form
            .getAll("removedAttachmentIds")
            .map(normalizeAttachmentId)
            .filter(Boolean)
        )
      );
    } else {
      const body = await req.json();
      if (!isPlainObject(body)) {
        throw new Error("Invalid body");
      }
      title = normalizeText(body.title).slice(0, TITLE_MAX_LEN);
      text = normalizeText(body.text).slice(0, TEXT_MAX_LEN);
      section = parseSection(body.section);
      pinned = body.pinned === true;
      const readByDayRaw = normalizeText(body.readByDay);
      readByDay = readByDayRaw || null;
      if (Object.prototype.hasOwnProperty.call(body, "sources")) {
        const result = parseIntranetWallSources(body.sources);
        if (result.ok) sources = result.sources;
        else sourcesError = result.error;
      }
      removedAttachmentIds = Array.isArray(body.removedAttachmentIds)
        ? Array.from(
            new Set(body.removedAttachmentIds.map(normalizeAttachmentId).filter(Boolean))
          )
        : [];
    }
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný formát požadavku." },
        { status: 400 }
      ),
      ctx
    );
  }

  if (!title) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Titulek je povinný." },
        { status: 400 }
      ),
      ctx
    );
  }
  if (!text) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Text příspěvku je povinný." },
        { status: 400 }
      ),
      ctx
    );
  }
  if (!section) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatná sekce." },
        { status: 400 }
      ),
      ctx
    );
  }
  if (readByDay && !isIsoDay(readByDay)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Termín přečtení musí být platné datum." },
        { status: 400 }
      ),
      ctx
    );
  }
  if (sourcesError) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: sourcesError },
        { status: 400 }
      ),
      ctx
    );
  }
  if (files.length > FILES_MAX_COUNT) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: `Můžeš nahrát maximálně ${FILES_MAX_COUNT} souborů.`,
        },
        { status: 400 }
      ),
      ctx
    );
  }

  let totalBytes = 0;
  const preparedFiles: PreparedIntranetWallAttachmentFile[] = [];
  for (const file of files) {
    const name = normalizeText(file.name);
    if (!name) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Soubor bez názvu nelze nahrát." },
          { status: 400 }
        ),
        ctx
      );
    }
    if (file.size <= 0) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: `Soubor ${name} je prázdný.` },
          { status: 400 }
        ),
        ctx
      );
    }
    if (file.size > FILE_MAX_SIZE_BYTES) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: `Soubor ${name} je příliš velký (max ${Math.floor(
              FILE_MAX_SIZE_BYTES / (1024 * 1024)
            )} MB).`,
          },
          { status: 400 }
        ),
        ctx
      );
    }
    const prepared = await prepareIntranetWallAttachmentFile(file);
    if (!prepared.ok) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: `Soubor ${name} není podporovaný. ${prepared.error}` },
          { status: 400 }
        ),
        ctx
      );
    }
    preparedFiles.push(prepared.file);
    totalBytes += file.size;
  }
  if (totalBytes > FILE_TOTAL_MAX_BYTES) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Celková velikost příloh je příliš vysoká (max 30 MB)." },
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
        { ok: false, error: "Příspěvek může upravit pouze autor." },
        { status: 403 }
      ),
      ctx
    );
  }

  const existingAttachments = parseAttachments(postRaw.attachments);
  const existingAttachmentIds = new Set(existingAttachments.map((attachment) => attachment.id));
  const unknownRemovedAttachmentId = removedAttachmentIds.find(
    (attachmentId) => !existingAttachmentIds.has(attachmentId)
  );
  if (unknownRemovedAttachmentId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Některá příloha k odebrání nebyla nalezena." },
        { status: 400 }
      ),
      ctx
    );
  }

  const removedAttachmentIdSet = new Set(removedAttachmentIds);
  const keptAttachments = existingAttachments.filter(
    (attachment) => !removedAttachmentIdSet.has(attachment.id)
  );
  const removedAttachments = existingAttachments.filter((attachment) =>
    removedAttachmentIdSet.has(attachment.id)
  );

  if (keptAttachments.length + files.length > FILES_MAX_COUNT) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: `Příspěvek může mít maximálně ${FILES_MAX_COUNT} příloh.`,
        },
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    const sectionLabel = INTRANET_SECTION_LABEL_BY_KEY.get(section) ?? section;
    const uploadedAttachments = await uploadAttachmentsToStorage({
      postId,
      files: preparedFiles,
      uploaderEmail: ctx.email,
      existingAttachments,
    });
    const attachments = [...keptAttachments, ...uploadedAttachments];

    await postRef.update({
      title,
      text,
      section,
      sectionLabel,
      attachments,
      ...(sources ? { sources } : {}),
      pinned,
      readByDay,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await deleteAttachmentsBestEffort(removedAttachments);

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, postId }),
      ctx
    );
  } catch (error) {
    console.error("Intranet wall update failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se upravit příspěvek." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:delete",
    limit: DELETE_RATE_LIMIT,
    windowMs: DELETE_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
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
