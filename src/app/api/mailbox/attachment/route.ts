import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "firebase-admin/storage";

import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAILBOX_ATTACHMENT_RATE_LIMIT = 180;
const MAILBOX_ATTACHMENT_RATE_LIMIT_WINDOW_MS = 60_000;

type StoredAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  path: string;
  bucketName?: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeBucketName = (value: string): string =>
  value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");

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

const appendBucketCandidate = (bucketNames: string[], value: string | null | undefined) => {
  if (!value) return;
  const normalized = normalizeBucketName(value);
  if (!normalized || bucketNames.includes(normalized)) return;
  bucketNames.push(normalized);
};

const resolveStorageBucketCandidates = (attachment: StoredAttachment): string[] => {
  const buckets: string[] = [];
  appendBucketCandidate(buckets, attachment.bucketName);
  appendBucketCandidate(buckets, bucketFromDownloadUrl(attachment.url));
  appendBucketCandidate(buckets, process.env.FIREBASE_STORAGE_BUCKET);
  appendBucketCandidate(buckets, process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const explicit = buckets[0] ?? "";
  if (explicit.endsWith(".firebasestorage.app")) {
    appendBucketCandidate(buckets, explicit.replace(/\.firebasestorage\.app$/i, ".appspot.com"));
  } else if (explicit.endsWith(".appspot.com")) {
    appendBucketCandidate(
      buckets,
      explicit.replace(/\.appspot\.com$/i, ".firebasestorage.app")
    );
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  if (projectId) {
    appendBucketCandidate(buckets, `${projectId}.firebasestorage.app`);
    appendBucketCandidate(buckets, `${projectId}.appspot.com`);
  }

  return buckets;
};

const parseAttachments = (metadata: unknown): StoredAttachment[] => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const row = metadata as Record<string, unknown>;
  if (!Array.isArray(row.attachments)) return [];
  return row.attachments
    .map((item): StoredAttachment | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const attachment = item as Record<string, unknown>;
      const id = normalizeText(attachment.id);
      const name = normalizeText(attachment.name);
      const url = normalizeText(attachment.url);
      const contentType = normalizeText(attachment.contentType) || "application/octet-stream";
      const path = normalizeText(attachment.path);
      const bucketName = normalizeText(attachment.bucketName);
      if (!id || !name || !path) return null;
      return {
        id,
        name,
        url,
        contentType,
        path,
        bucketName: bucketName || undefined,
      };
    })
    .filter((item): item is StoredAttachment => item !== null);
};

const loadMailboxMessage = async ({
  email,
  messageId,
}: {
  email: string;
  messageId: string;
}): Promise<Record<string, unknown> | null> => {
  if (!adminDb) return null;
  const mailboxCol = adminDb.collection("usersPrivate").doc(email).collection("mailbox");

  const directSnap = await mailboxCol.doc(messageId).get();
  if (directSnap.exists) {
    return (directSnap.data() ?? {}) as Record<string, unknown>;
  }

  const bySharedMessageIdSnap = await mailboxCol
    .where("metadata.messageId", "==", messageId)
    .limit(1)
    .get();
  if (bySharedMessageIdSnap.empty) return null;

  return (bySharedMessageIdSnap.docs[0]!.data() ?? {}) as Record<string, unknown>;
};

const contentDisposition = (fileName: string, shouldDownload: boolean): string => {
  const safeName = fileName.trim() || "priloha";
  const fallback =
    safeName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "priloha";
  return `${shouldDownload ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    safeName
  )}`;
};

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

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:mailbox:attachment:get",
    limit: MAILBOX_ATTACHMENT_RATE_LIMIT,
    windowMs: MAILBOX_ATTACHMENT_RATE_LIMIT_WINDOW_MS,
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

  const messageId = normalizeText(req.nextUrl.searchParams.get("messageId"));
  const attachmentId = normalizeText(req.nextUrl.searchParams.get("attachmentId"));
  if (!messageId || !attachmentId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Chybí messageId nebo attachmentId." },
        { status: 400 }
      ),
      ctx
    );
  }

  const message = await loadMailboxMessage({
    email: ctx.email,
    messageId,
  });
  if (!message) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Zpráva nebyla nalezena." }, { status: 404 }),
      ctx
    );
  }

  const attachment = parseAttachments(message.metadata).find((item) => item.id === attachmentId);
  if (!attachment) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Příloha nebyla nalezena." }, { status: 404 }),
      ctx
    );
  }

  const bucketCandidates = resolveStorageBucketCandidates(attachment);
  let bytes: Buffer | null = null;
  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      const [downloaded] = await getStorage().bucket(bucketName).file(attachment.path).download();
      bytes = downloaded;
      break;
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) break;
    }
  }

  if (!bytes) {
    const status = isStorageNotFoundError(lastError) ? 404 : 500;
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: status === 404 ? "Soubor nebyl nalezen." : "Soubor se nepodařilo načíst.",
        },
        { status }
      ),
      ctx
    );
  }

  const shouldDownload = req.nextUrl.searchParams.get("download") === "1";
  return withRateLimitHeaders(
    new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": contentDisposition(attachment.name, shouldDownload),
        "Cache-Control": "private, no-store, max-age=0",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    }),
    ctx
  );
}
