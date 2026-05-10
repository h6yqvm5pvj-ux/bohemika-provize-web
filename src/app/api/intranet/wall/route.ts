import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

import { collectPushTokens } from "@/lib/server/pushTokens";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import {
  INTRANET_SECTIONS,
  INTRANET_SECTION_KEYS,
  INTRANET_SECTION_LABEL_BY_KEY,
  type IntranetSectionKey,
} from "@/app/intranet/sections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTS_COLLECTION = "intranetWallPosts";
const COMMENTS_SUBCOLLECTION = "comments";

const GET_RATE_LIMIT = 120;
const GET_RATE_LIMIT_WINDOW_MS = 60_000;
const POST_RATE_LIMIT = 20;
const POST_RATE_LIMIT_WINDOW_MS = 60_000;

const POSTS_DEFAULT_LIMIT = 30;
const POSTS_MAX_LIMIT = 50;
const COMMENTS_PER_POST_LIMIT = 120;
const TITLE_MAX_LEN = 140;
const TEXT_MAX_LEN = 6000;
const FILES_MAX_COUNT = 6;
const FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FILE_TOTAL_MAX_BYTES = 30 * 1024 * 1024;
const INTRANET_PUSH_MAX_RECIPIENTS = 350;
const INTRANET_PUSH_MAX_TOKENS_PER_USER = 8;
const INTRANET_PUSH_MAX_TOKENS_PER_MULTICAST = 500;

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

type WallAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
  path: string;
};

type WallAuthor = {
  uid: string;
  email: string;
  name: string;
};

type WallComment = {
  id: string;
  text: string;
  createdAtMs: number | null;
  author: WallAuthor;
  likeCount: number;
  likedByMe: boolean;
  parentCommentId: string | null;
  replies: WallCommentReply[];
};

type WallCommentReply = {
  id: string;
  text: string;
  createdAtMs: number | null;
  author: WallAuthor;
  likeCount: number;
  likedByMe: boolean;
  parentCommentId: string;
};

type WallPost = {
  id: string;
  title: string;
  text: string;
  section: IntranetSectionKey;
  sectionLabel: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  author: WallAuthor;
  attachments: WallAttachment[];
  comments: WallComment[];
};

type IntranetPushRecipient = {
  email: string;
  tokens: string[];
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const clampText = (value: string, maxLen: number): string =>
  value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;

const sanitizeFileName = (value: string): string => {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "priloha";
  return cleaned.slice(0, 120);
};

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const ts = value as FirestoreTimestamp;
    if (typeof ts.toDate === "function") {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (
      typeof ts.seconds === "number" &&
      Number.isFinite(ts.seconds) &&
      typeof ts.nanoseconds === "number" &&
      Number.isFinite(ts.nanoseconds)
    ) {
      return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000);
    }
  }
  return null;
};

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const parseSection = (value: unknown): IntranetSectionKey | null => {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const item of INTRANET_SECTIONS) {
    const labelNormalized = item.label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalized === item.key || normalized === labelNormalized) {
      return item.key;
    }
  }
  return null;
};

const parseAttachments = (value: unknown): WallAttachment[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const id = normalizeText(item.id);
      const name = normalizeText(item.name);
      const url = normalizeText(item.url);
      const contentType = normalizeText(item.contentType) || "application/octet-stream";
      const path = normalizeText(item.path);
      const sizeRaw = Number(item.sizeBytes);
      const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.floor(sizeRaw) : 0;
      const isImage = item.isImage === true;

      if (!id || !name || !url) return null;
      return {
        id,
        name,
        url,
        contentType,
        sizeBytes,
        isImage,
        path,
      } satisfies WallAttachment;
    })
    .filter((item): item is WallAttachment => item !== null);
};

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

const parseAuthor = (
  raw: Record<string, unknown>,
  fallbackEmail = ""
): WallAuthor => {
  const email = normalizeEmail(raw.createdByEmail) || fallbackEmail;
  const uid = normalizeText(raw.createdByUid);
  const name = normalizeText(raw.createdByName) || (email ? nameFromEmail(email) : "Neznámý");
  return {
    uid,
    email,
    name,
  };
};

const isIntranetPushEnabledForSection = (
  profile: Record<string, unknown>,
  section: IntranetSectionKey
): boolean => {
  const settingsRaw = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  if (!settingsRaw) return true;

  const typesRaw = isPlainObject(settingsRaw.types) ? settingsRaw.types : null;
  const channelsRaw = isPlainObject(settingsRaw.channels)
    ? settingsRaw.channels
    : null;
  const intranetRaw = isPlainObject(settingsRaw.intranet)
    ? settingsRaw.intranet
    : null;

  const intranetTypeRaw = typesRaw?.intranet;
  const pushChannelRaw = channelsRaw?.push;
  const intranetTypeEnabled =
    typeof intranetTypeRaw === "boolean" ? intranetTypeRaw : true;
  const pushChannelEnabled =
    typeof pushChannelRaw === "boolean" ? pushChannelRaw : true;
  if (!intranetTypeEnabled || !pushChannelEnabled) return false;

  const mode = intranetRaw?.mode === "selected" ? "selected" : "all";
  if (mode === "all") return true;

  const sections = Array.isArray(intranetRaw?.sections)
    ? intranetRaw.sections
        .map((raw) =>
          typeof raw === "string" ? (raw.trim() as IntranetSectionKey) : ""
        )
        .filter((key) => INTRANET_SECTION_KEYS.has(key as IntranetSectionKey))
    : [];
  return sections.includes(section);
};

const loadIntranetPushRecipients = async ({
  authorEmail,
  section,
}: {
  authorEmail: string;
  section: IntranetSectionKey;
}): Promise<IntranetPushRecipient[]> => {
  if (!adminDb) return [];
  const usersSnap = await adminDb.collection("users").get();

  const candidates = new Map<string, Record<string, unknown>>();
  for (const doc of usersSnap.docs) {
    const profile = (doc.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(profile.email) || normalizeEmail(doc.id);
    if (!email || email === authorEmail || candidates.has(email)) continue;
    if (!isIntranetPushEnabledForSection(profile, section)) continue;
    candidates.set(email, profile);
    if (candidates.size >= INTRANET_PUSH_MAX_RECIPIENTS) break;
  }

  if (candidates.size === 0) return [];
  const privateCol = adminDb.collection("usersPrivate");
  const recipients = await Promise.all(
    [...candidates.entries()].map(async ([email, publicProfile]) => {
      const privateSnap = await privateCol.doc(email).get();
      const mergedProfile = {
        ...publicProfile,
        ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
      };
      if (!isIntranetPushEnabledForSection(mergedProfile, section)) return null;

      const tokens = collectPushTokens(mergedProfile).slice(
        0,
        INTRANET_PUSH_MAX_TOKENS_PER_USER
      );
      return { email, tokens } satisfies IntranetPushRecipient;
    })
  );

  return recipients.filter(
    (row): row is IntranetPushRecipient => row !== null
  );
};

const sendIntranetPostPushNotification = async ({
  req,
  authorEmail,
  authorName,
  section,
  sectionLabel,
  title,
  text,
  postId,
}: {
  req: NextRequest;
  authorEmail: string;
  authorName: string;
  section: IntranetSectionKey;
  sectionLabel: string;
  title: string;
  text: string;
  postId: string;
}): Promise<void> => {
  if (!adminDb) return;

  const recipients = await loadIntranetPushRecipients({ authorEmail, section });
  if (recipients.length === 0) return;

  const authorDisplay = normalizeText(authorName) || authorEmail;
  const cleanTitle = normalizeText(title);
  const cleanText = normalizeText(text).replace(/\s+/g, " ");
  const body = clampText(
    cleanTitle
      ? `${authorDisplay} přidal(a) příspěvek: ${cleanTitle}`
      : `${authorDisplay} přidal(a) nový příspěvek${cleanText ? `: ${cleanText}` : ""}`,
    180
  );

  const deepLink = `/intranet?section=${encodeURIComponent(
    section
  )}&postId=${encodeURIComponent(postId)}`;
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const webPushLink = `${baseUrl}${deepLink}`;
  const createdAtIso = new Date().toISOString();

  try {
    await writeMailboxEntries({
      recipientEmails: recipients.map((row) => row.email),
      type: "intranet_post",
      title: `Intranet • ${sectionLabel}`,
      body,
      deepLink,
      metadata: {
        postId,
        section,
        sectionLabel,
        authorEmail,
      },
    });
  } catch (error) {
    console.error("Writing mailbox notification for intranet post failed:", error);
  }

  if (!adminMessaging) return;

  const tokenSet = new Set<string>();
  recipients.forEach((recipient) => {
    recipient.tokens.forEach((token) => tokenSet.add(token));
  });
  const tokens = [...tokenSet];
  if (tokens.length === 0) return;

  for (let i = 0; i < tokens.length; i += INTRANET_PUSH_MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(i, i + INTRANET_PUSH_MAX_TOKENS_PER_MULTICAST);
    await adminMessaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: `Intranet • ${sectionLabel}`,
        body,
      },
      data: {
        type: "intranet_post",
        postId,
        authorEmail,
        section,
        sectionLabel,
        title: clampText(cleanTitle, 140),
        createdAt: createdAtIso,
        deepLink,
      },
      webpush: {
        fcmOptions: {
          link: webPushLink,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: `bohemika-intranet-${postId}`,
          requireInteraction: false,
        },
      },
    });
  }
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

function buildStorageDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    objectPath
  )}?alt=media&token=${encodeURIComponent(token)}`;
}

function normalizeBucketName(value: string): string {
  const trimmed = value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");
  return trimmed;
}

function resolveStorageBucketCandidates(): string[] {
  const candidates: string[] = [];
  const append = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeBucketName(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
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

async function uploadAttachmentsToBucket({
  bucketName,
  postId,
  files,
  uploaderEmail,
}: {
  bucketName: string;
  postId: string;
  files: File[];
  uploaderEmail: string;
}): Promise<WallAttachment[]> {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const attachments: WallAttachment[] = [];
  const uploadPrefix = `intranet-wall/${postId}`;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const contentType = normalizeText(file.type) || "application/octet-stream";
    const originalName = sanitizeFileName(normalizeText(file.name) || "priloha");
    const objectPath = `${uploadPrefix}/${Date.now()}-${index}-${originalName}`;
    const downloadToken = randomUUID();
    const storageFile = bucket.file(objectPath);
    const bytes = Buffer.from(await file.arrayBuffer());

    await storageFile.save(bytes, {
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

    attachments.push({
      id: randomUUID(),
      name: normalizeText(file.name) || originalName,
      url: buildStorageDownloadUrl(bucket.name, objectPath, downloadToken),
      contentType,
      sizeBytes: file.size,
      isImage: contentType.startsWith("image/") && contentType !== "image/svg+xml",
      path: objectPath,
    });
  }

  return attachments;
}

async function uploadAttachmentsToStorage({
  postId,
  files,
  uploaderEmail,
}: {
  postId: string;
  files: File[];
  uploaderEmail: string;
}): Promise<WallAttachment[]> {
  if (!files.length) return [];

  const bucketCandidates = resolveStorageBucketCandidates();
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

async function loadCommentsForPost(
  postId: string,
  viewerEmail: string
): Promise<WallComment[]> {
  if (!adminDb) return [];
  const viewerEmailNormalized = normalizeEmail(viewerEmail);
  const snap = await adminDb
    .collection(POSTS_COLLECTION)
    .doc(postId)
    .collection(COMMENTS_SUBCOLLECTION)
    .orderBy("createdAt", "asc")
    .limit(COMMENTS_PER_POST_LIMIT)
    .get();

  type ParsedCommentNode = {
    id: string;
    text: string;
    createdAtMs: number | null;
    author: WallAuthor;
    likeCount: number;
    likedByMe: boolean;
    parentCommentId: string | null;
  };

  const parsedNodes: ParsedCommentNode[] = snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const author = parseAuthor(data);
    const parentRaw = normalizeText(data.parentCommentId);
    const parentCommentId = parentRaw ? parentRaw.replace(/[^\w-]/g, "") : "";
    const likedByEmails = parseLikedByEmails(data.likedByEmails);
    const likeCountRaw = Number(data.likeCount);
    const likeCount = Number.isFinite(likeCountRaw)
      ? Math.max(0, Math.floor(likeCountRaw))
      : likedByEmails.length;

    return {
      id: doc.id,
      text: normalizeText(data.text),
      createdAtMs: toMillis(data.createdAt),
      author,
      likeCount,
      likedByMe: viewerEmailNormalized
        ? likedByEmails.includes(viewerEmailNormalized)
        : false,
      parentCommentId: parentCommentId || null,
    };
  });

  const topLevelMap = new Map<string, WallComment>();
  const repliesByParent = new Map<string, WallCommentReply[]>();

  parsedNodes.forEach((node) => {
    if (!node.parentCommentId) {
      topLevelMap.set(node.id, {
        id: node.id,
        text: node.text,
        createdAtMs: node.createdAtMs,
        author: node.author,
        likeCount: node.likeCount,
        likedByMe: node.likedByMe,
        parentCommentId: null,
        replies: [],
      });
      return;
    }

    const reply: WallCommentReply = {
      id: node.id,
      text: node.text,
      createdAtMs: node.createdAtMs,
      author: node.author,
      likeCount: node.likeCount,
      likedByMe: node.likedByMe,
      parentCommentId: node.parentCommentId,
    };
    const bucket = repliesByParent.get(node.parentCommentId) ?? [];
    bucket.push(reply);
    repliesByParent.set(node.parentCommentId, bucket);
  });

  const orderedTopLevel: WallComment[] = [];
  parsedNodes.forEach((node) => {
    if (node.parentCommentId) return;
    const topLevel = topLevelMap.get(node.id);
    if (!topLevel) return;
    const replies = repliesByParent.get(node.id) ?? [];
    topLevel.replies = replies;
    orderedTopLevel.push(topLevel);
  });

  repliesByParent.forEach((orphanReplies, parentId) => {
    if (topLevelMap.has(parentId)) return;
    orphanReplies.forEach((reply) => {
      orderedTopLevel.push({
        id: reply.id,
        text: reply.text,
        createdAtMs: reply.createdAtMs,
        author: reply.author,
        likeCount: reply.likeCount,
        likedByMe: reply.likedByMe,
        parentCommentId: null,
        replies: [],
      });
    });
  });

  return orderedTopLevel;
}

function mapPostFromDoc(
  docId: string,
  raw: Record<string, unknown>,
  comments: WallComment[],
  viewerEmail: string
): WallPost | null {
  const title = normalizeText(raw.title);
  const text = normalizeText(raw.text);
  const sectionRaw = normalizeText(raw.section);
  const section = INTRANET_SECTION_KEYS.has(sectionRaw as IntranetSectionKey)
    ? (sectionRaw as IntranetSectionKey)
    : null;
  if (!title || !text || !section) return null;

  const author = parseAuthor(raw);
  const commentCountRaw = Number(raw.commentCount);
  const derivedCommentCount = comments.reduce(
    (total, comment) => total + 1 + comment.replies.length,
    0
  );
  const commentCount = Number.isFinite(commentCountRaw)
    ? Math.max(0, Math.floor(commentCountRaw))
    : derivedCommentCount;
  const likedByEmails = parseLikedByEmails(raw.likedByEmails);
  const likeCountRaw = Number(raw.likeCount);
  const likeCount = Number.isFinite(likeCountRaw)
    ? Math.max(0, Math.floor(likeCountRaw))
    : likedByEmails.length;
  const likedByMe = viewerEmail ? likedByEmails.includes(viewerEmail) : false;
  const attachments = parseAttachments(raw.attachments);

  return {
    id: docId,
    title,
    text,
    section,
    sectionLabel: INTRANET_SECTION_LABEL_BY_KEY.get(section) ?? section,
    createdAtMs: toMillis(raw.createdAt),
    updatedAtMs: toMillis(raw.updatedAt),
    commentCount,
    likeCount,
    likedByMe,
    author,
    attachments,
    comments,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:intranet-wall:get",
    limit: GET_RATE_LIMIT,
    windowMs: GET_RATE_LIMIT_WINDOW_MS,
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

  const sectionParam = req.nextUrl.searchParams.get("section");
  const section = sectionParam ? parseSection(sectionParam) : null;
  if (sectionParam && !section) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatná sekce." },
        { status: 400 }
      ),
      ctx
    );
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.max(1, Math.floor(limitRaw)), POSTS_MAX_LIMIT)
      : POSTS_DEFAULT_LIMIT;

  try {
    const viewerEmail = normalizeEmail(ctx.email);
    const queryLimit = section ? Math.max(limit * 4, 80) : limit;
    const query = adminDb
      .collection(POSTS_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(queryLimit);
    const postsSnap = await query.get();

    const posts = await Promise.all(
      postsSnap.docs.map(async (doc) => {
        const raw = doc.data() as Record<string, unknown>;
        const comments = await loadCommentsForPost(doc.id, viewerEmail);
        return mapPostFromDoc(doc.id, raw, comments, viewerEmail);
      })
    );

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        sections: INTRANET_SECTIONS,
        posts: posts
          .filter((post): post is WallPost => post !== null)
          .filter((post) => (section ? post.section === section : true))
          .slice(0, limit),
      }),
      ctx
    );
  } catch (error) {
    console.error("Intranet wall GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst příspěvky." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:intranet-wall:post",
    limit: POST_RATE_LIMIT,
    windowMs: POST_RATE_LIMIT_WINDOW_MS,
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný formát požadavku." },
        { status: 400 }
      ),
      ctx
    );
  }

  const title = normalizeText(form.get("title")).slice(0, TITLE_MAX_LEN);
  const text = normalizeText(form.get("text")).slice(0, TEXT_MAX_LEN);
  const sectionInput = form.get("section");
  const section = parseSection(sectionInput) ?? "obecne";

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

  const filesRaw = form.getAll("files");
  const files = filesRaw.filter((entry): entry is File => entry instanceof File);
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

  try {
    const authorName = await resolveDisplayName({
      email: ctx.email,
      uid: ctx.uid,
    });

    const postRef = adminDb.collection(POSTS_COLLECTION).doc();
    const attachments = await uploadAttachmentsToStorage({
      postId: postRef.id,
      files,
      uploaderEmail: ctx.email,
    });

    const timestamp = FieldValue.serverTimestamp();
    const sectionLabel = INTRANET_SECTION_LABEL_BY_KEY.get(section) ?? section;
    await postRef.set({
      title,
      text,
      section,
      sectionLabel,
      createdByUid: ctx.uid,
      createdByEmail: ctx.email,
      createdByName: authorName,
      attachments,
      commentCount: 0,
      likeCount: 0,
      likedByEmails: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    try {
      await sendIntranetPostPushNotification({
        req,
        authorEmail: ctx.email,
        authorName,
        section,
        sectionLabel,
        title,
        text,
        postId: postRef.id,
      });
    } catch (pushError) {
      console.warn("Intranet wall push notification failed:", pushError);
    }

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        postId: postRef.id,
      }),
      ctx
    );
  } catch (error) {
    console.error("Intranet wall POST failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error && error.message
              ? error.message
              : "Nepodařilo se vytvořit příspěvek.",
        },
        { status: 500 }
      ),
      ctx
    );
  }
}
