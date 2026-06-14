import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import {
  DEFAULT_TOOL_DOCUMENT_EMOJI,
  getDefaultToolDocumentTab,
  isToolDocumentSection,
  isToolDocumentTab,
  normalizeToolDocumentEmoji,
  normalizeToolDocumentTabId,
  normalizeToolDocumentTabLabel,
  TOOL_DOCUMENT_SECTION_CPP_LIFE,
  type ToolDocumentSection,
} from "@/app/lib/toolDocuments";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { prepareSafeUserAttachmentFile } from "@/lib/server/safeUserAttachments";
import {
  canManageToolDocuments,
  loadStoredToolDocument,
  loadToolDocuments,
  resolveStorageBucketName,
  safeToolDocumentId,
  storageBucketCandidates,
  TOOL_DOCUMENTS_COLLECTION,
  TOOL_DOCUMENTS_STORAGE_PREFIX,
} from "@/lib/server/toolDocuments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_MANAGE_RATE_LIMIT = 120;
const DOCUMENT_MANAGE_WINDOW_MS = 60_000;
const DOCUMENT_MUTATION_RATE_LIMIT = 40;
const DOCUMENT_MUTATION_WINDOW_MS = 60_000;
const TITLE_MAX_LEN = 140;
const DESCRIPTION_MAX_LEN = 420;
const BODY_MAX_LEN = 4_000;
const FILE_MAX_BYTES = 12 * 1024 * 1024;

type ApiError = { ok: false; error: string };

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isStorageNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: number | string;
    statusCode?: number;
    message?: string;
  };
  const code = typeof row.code === "string" ? Number(row.code) : row.code;
  if (code === 404 || row.statusCode === 404) return true;
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return message.includes("no such object") || message.includes("not found");
};

const truncateText = (value: string, maxLen: number): string =>
  value.trim().slice(0, maxLen);

const normalizeBodyLines = (value: unknown): string[] =>
  normalizeText(value)
    .slice(0, BODY_MAX_LEN)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);

const responseError = (message: string, status: number, ctx: Parameters<typeof withRateLimitHeaders>[1]) =>
  withRateLimitHeaders(
    NextResponse.json({ ok: false, error: message } satisfies ApiError, { status }),
    ctx
  );

const storedSection = (value: unknown): ToolDocumentSection | null => {
  const section = normalizeText(value);
  return isToolDocumentSection(section) ? section : null;
};

async function loadDocumentForMutation(id: string, section: ToolDocumentSection) {
  const existing = await loadStoredToolDocument(id);
  if (!existing.stored && !existing.fallback) {
    return {
      ok: false as const,
      status: 404,
      error: "Dokument nebyl nalezen.",
    };
  }

  const existingSection =
    existing.publicDoc?.section ??
    storedSection(existing.stored?.section) ??
    existing.fallback?.section ??
    null;
  if (existingSection !== section) {
    return {
      ok: false as const,
      status: 409,
      error: "Dokument nepatří do zadané sekce.",
    };
  }

  return {
    ok: true as const,
    existing,
  };
}

async function deleteStoredDocumentFileBestEffort({
  storagePath,
  bucketName,
}: {
  storagePath: unknown;
  bucketName: unknown;
}) {
  const path = normalizeText(storagePath);
  if (!path || !path.startsWith(`${TOOL_DOCUMENTS_STORAGE_PREFIX}/`)) return;

  for (const candidate of storageBucketCandidates(normalizeText(bucketName))) {
    try {
      await getStorage().bucket(candidate).file(path).delete();
      return;
    } catch (error) {
      if (!isStorageNotFoundError(error)) return;
    }
  }
}

async function requireDocumentsManager(
  req: NextRequest,
  options: { namespace: string; limit: number; windowMs: number }
) {
  const guard = await requireAdvisorAuthedRateLimited(req, options);
  if (!guard.ok) return guard;

  const canManage = await canManageToolDocuments({
    email: guard.ctx.email,
    uid: guard.ctx.uid,
    decoded: guard.ctx.decoded as Record<string, unknown>,
  });
  if (!canManage) {
    return {
      ok: false as const,
      response: responseError("Spravovat dokumenty může jen specialista nebo admin.", 403, guard.ctx),
    };
  }

  return {
    ok: true as const,
    ctx: guard.ctx,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:documents:manage:get",
    limit: DOCUMENT_MANAGE_RATE_LIMIT,
    windowMs: DOCUMENT_MANAGE_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  const sectionRaw = normalizeText(req.nextUrl.searchParams.get("section")) || TOOL_DOCUMENT_SECTION_CPP_LIFE;
  if (!isToolDocumentSection(sectionRaw)) {
    return responseError("Neznámá sekce dokumentů.", 400, guard.ctx);
  }

  const [documents, canManage] = await Promise.all([
    loadToolDocuments(sectionRaw),
    canManageToolDocuments({
      email: guard.ctx.email,
      uid: guard.ctx.uid,
      decoded: guard.ctx.decoded as Record<string, unknown>,
    }),
  ]);

  return withRateLimitHeaders(
    NextResponse.json({
      ok: true,
      canManage,
      documents,
    }),
    guard.ctx
  );
}

export async function POST(req: NextRequest) {
  const guard = await requireDocumentsManager(req, {
    namespace: "api:documents:manage:post",
    limit: DOCUMENT_MUTATION_RATE_LIMIT,
    windowMs: DOCUMENT_MUTATION_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  if (!adminDb) return responseError("Server není správně nakonfigurován (Firestore).", 500, guard.ctx);

  const form = await req.formData().catch(() => null);
  if (!form) return responseError("Neplatný formulář.", 400, guard.ctx);

  const section = normalizeText(form.get("section"));
  const tab = normalizeToolDocumentTabId(form.get("tab"));
  if (!isToolDocumentSection(section) || !isToolDocumentTab(tab)) {
    return responseError("Neplatná sekce nebo záložka.", 400, guard.ctx);
  }
  const tabDefaults = getDefaultToolDocumentTab(tab);
  const tabLabel = normalizeToolDocumentTabLabel(form.get("tabLabel"), tabDefaults?.label ?? tab);
  const emoji = normalizeToolDocumentEmoji(
    form.get("emoji"),
    tabDefaults?.emoji ?? DEFAULT_TOOL_DOCUMENT_EMOJI
  );

  const title = truncateText(normalizeText(form.get("title")), TITLE_MAX_LEN);
  if (!title) return responseError("Název dokumentu je povinný.", 400, guard.ctx);

  const rawFile = form.get("file");
  if (!(rawFile instanceof File) || rawFile.size <= 0) {
    return responseError("Přilož PDF nebo obrázek.", 400, guard.ctx);
  }
  if (rawFile.size > FILE_MAX_BYTES) {
    return responseError("Soubor může mít maximálně 12 MB.", 400, guard.ctx);
  }

  const prepared = await prepareSafeUserAttachmentFile(rawFile);
  if (!prepared.ok) return responseError(prepared.error, 400, guard.ctx);

  const bucketName = resolveStorageBucketName();
  if (!bucketName) {
    return responseError("Není nastavený Firebase Storage bucket.", 500, guard.ctx);
  }

  const docRef = adminDb.collection(TOOL_DOCUMENTS_COLLECTION).doc();
  const safeFileName =
    rawFile.name
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "dokument";
  const storagePath = `${TOOL_DOCUMENTS_STORAGE_PREFIX}/${section}/${docRef.id}/${Date.now()}-${safeFileName}`;

  await getStorage().bucket(bucketName).file(storagePath).save(prepared.file.bytes, {
    resumable: false,
    metadata: {
      contentType: prepared.file.contentType,
      cacheControl: "private, no-store, max-age=0",
    },
  });

  try {
    await docRef.set({
      section,
      tab,
      tabLabel,
      emoji,
      title,
      description: truncateText(normalizeText(form.get("description")), DESCRIPTION_MAX_LEN),
      body: normalizeBodyLines(form.get("body")),
      fileName: rawFile.name.trim() || safeFileName,
      contentType: prepared.file.contentType,
      isImage: prepared.file.isImage,
      fileSize: prepared.file.bytes.length,
      storagePath,
      bucketName,
      createdAt: FieldValue.serverTimestamp(),
      createdByEmail: guard.ctx.email,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: guard.ctx.email,
      disabled: false,
    });
  } catch (error) {
    await deleteStoredDocumentFileBestEffort({ storagePath, bucketName });
    throw error;
  }

  const documents = await loadToolDocuments(section as ToolDocumentSection);
  return withRateLimitHeaders(
    NextResponse.json({ ok: true, id: docRef.id, documents }),
    guard.ctx
  );
}

export async function PATCH(req: NextRequest) {
  const guard = await requireDocumentsManager(req, {
    namespace: "api:documents:manage:patch",
    limit: DOCUMENT_MUTATION_RATE_LIMIT,
    windowMs: DOCUMENT_MUTATION_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  if (!adminDb) return responseError("Server není správně nakonfigurován (Firestore).", 500, guard.ctx);

  const form = await req.formData().catch(() => null);
  if (!form) return responseError("Neplatný formulář.", 400, guard.ctx);

  const id = safeToolDocumentId(form.get("id"));
  if (!id) return responseError("Chybí ID dokumentu.", 400, guard.ctx);

  const section = normalizeText(form.get("section"));
  const tab = normalizeToolDocumentTabId(form.get("tab"));
  if (!isToolDocumentSection(section) || !isToolDocumentTab(tab)) {
    return responseError("Neplatná sekce nebo záložka.", 400, guard.ctx);
  }
  const mutationTarget = await loadDocumentForMutation(id, section);
  if (!mutationTarget.ok) {
    return responseError(mutationTarget.error, mutationTarget.status, guard.ctx);
  }
  const tabDefaults = getDefaultToolDocumentTab(tab);
  const tabLabel = normalizeToolDocumentTabLabel(form.get("tabLabel"), tabDefaults?.label ?? tab);
  const emoji = normalizeToolDocumentEmoji(
    form.get("emoji"),
    tabDefaults?.emoji ?? DEFAULT_TOOL_DOCUMENT_EMOJI
  );

  const title = truncateText(normalizeText(form.get("title")), TITLE_MAX_LEN);
  if (!title) return responseError("Název dokumentu je povinný.", 400, guard.ctx);

  const patch: Record<string, unknown> = {
    section,
    tab,
    tabLabel,
    emoji,
    title,
    description: truncateText(normalizeText(form.get("description")), DESCRIPTION_MAX_LEN),
    body: normalizeBodyLines(form.get("body")),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByEmail: guard.ctx.email,
    disabled: false,
  };

  const rawFile = form.get("file");
  let newStoragePath: string | null = null;
  let newBucketName: string | null = null;
  if (rawFile instanceof File && rawFile.size > 0) {
    if (rawFile.size > FILE_MAX_BYTES) {
      return responseError("Soubor může mít maximálně 12 MB.", 400, guard.ctx);
    }

    const prepared = await prepareSafeUserAttachmentFile(rawFile);
    if (!prepared.ok) return responseError(prepared.error, 400, guard.ctx);

    const bucketName = resolveStorageBucketName();
    if (!bucketName) {
      return responseError("Není nastavený Firebase Storage bucket.", 500, guard.ctx);
    }

    const safeFileName =
      rawFile.name
        .trim()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 120) || "dokument";
    const storagePath = `${TOOL_DOCUMENTS_STORAGE_PREFIX}/${section}/${id}/${Date.now()}-${safeFileName}`;

    await getStorage().bucket(bucketName).file(storagePath).save(prepared.file.bytes, {
      resumable: false,
      metadata: {
        contentType: prepared.file.contentType,
        cacheControl: "private, no-store, max-age=0",
      },
    });

    patch.fileName = rawFile.name.trim() || safeFileName;
    patch.contentType = prepared.file.contentType;
    patch.isImage = prepared.file.isImage;
    patch.fileSize = prepared.file.bytes.length;
    patch.storagePath = storagePath;
    patch.bucketName = bucketName;
    newStoragePath = storagePath;
    newBucketName = bucketName;
  }

  try {
    await adminDb.collection(TOOL_DOCUMENTS_COLLECTION).doc(id).set(patch, { merge: true });
  } catch (error) {
    if (newStoragePath) {
      await deleteStoredDocumentFileBestEffort({
        storagePath: newStoragePath,
        bucketName: newBucketName,
      });
    }
    throw error;
  }

  if (newStoragePath) {
    await deleteStoredDocumentFileBestEffort({
      storagePath: mutationTarget.existing.stored?.storagePath,
      bucketName: mutationTarget.existing.stored?.bucketName,
    });
  }

  const documents = await loadToolDocuments(section as ToolDocumentSection);
  return withRateLimitHeaders(
    NextResponse.json({ ok: true, id, documents }),
    guard.ctx
  );
}

export async function DELETE(req: NextRequest) {
  const guard = await requireDocumentsManager(req, {
    namespace: "api:documents:manage:delete",
    limit: DOCUMENT_MUTATION_RATE_LIMIT,
    windowMs: DOCUMENT_MUTATION_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  if (!adminDb) return responseError("Server není správně nakonfigurován (Firestore).", 500, guard.ctx);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return responseError("Neplatný payload.", 400, guard.ctx);
  }

  const id = safeToolDocumentId((body as Record<string, unknown>).id);
  const sectionRaw = normalizeText((body as Record<string, unknown>).section) || TOOL_DOCUMENT_SECTION_CPP_LIFE;
  if (!id || !isToolDocumentSection(sectionRaw)) {
    return responseError("Chybí ID nebo sekce dokumentu.", 400, guard.ctx);
  }
  const mutationTarget = await loadDocumentForMutation(id, sectionRaw);
  if (!mutationTarget.ok) {
    return responseError(mutationTarget.error, mutationTarget.status, guard.ctx);
  }

  await adminDb.collection(TOOL_DOCUMENTS_COLLECTION).doc(id).set(
    {
      section: sectionRaw,
      disabled: true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByEmail: guard.ctx.email,
    },
    { merge: true }
  );

  const documents = await loadToolDocuments(sectionRaw);
  return withRateLimitHeaders(
    NextResponse.json({ ok: true, id, documents }),
    guard.ctx
  );
}
