import { NextResponse, type NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

import { collectPushTokens } from "@/lib/server/pushTokens";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import {
  prepareIntranetWallAttachmentFile,
  type PreparedIntranetWallAttachmentFile,
} from "@/lib/server/intranetWallAttachments";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import {
  INTRANET_SECTIONS,
  INTRANET_SECTION_KEYS,
  INTRANET_SECTION_LABEL_BY_KEY,
  type IntranetSectionKey,
} from "@/app/intranet/sections";
import {
  parseIntranetWallSourcesJson,
  sanitizeStoredIntranetWallSources,
} from "@/app/intranet/wallSources";
import { loadProfileAvatarsByEmail } from "@/lib/server/userProfileAvatars";

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
const POSTS_SCAN_BATCH_LIMIT = 100;
const COMMENTS_PER_POST_LIMIT = 120;
const TITLE_MAX_LEN = 140;
const TEXT_MAX_LEN = 6000;
const FILES_MAX_COUNT = 6;
const FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FILE_TOTAL_MAX_BYTES = 30 * 1024 * 1024;
const POLL_QUESTION_MAX_LEN = 180;
const POLL_OPTION_MAX_LEN = 100;
const POLL_OPTIONS_MAX_COUNT = 8;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
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
  path?: string;
  bucketName?: string;
};

type WallAuthor = {
  uid: string;
  email: string;
  name: string;
  profileAvatar: string;
};

type WallPollOption = {
  id: string;
  text: string;
  voteCount: number;
};

type WallPoll = {
  id: string;
  question: string;
  totalVotes: number;
  selectedOptionId: string | null;
  options: WallPollOption[];
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
  pinned: boolean;
  readByDay: string | null;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  author: WallAuthor;
  attachments: WallAttachment[];
  sources: string[];
  comments: WallComment[];
  poll: WallPoll | null;
};

type IntranetPushRecipient = {
  email: string;
  tokens: string[];
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeSearchText = (value: unknown): string =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const clampText = (value: string, maxLen: number): string =>
  value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
    .map((row): WallAttachment | null => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const id = normalizeText(item.id);
      const name = normalizeText(item.name);
      const url = normalizeText(item.url);
      const contentType = normalizeText(item.contentType) || "application/octet-stream";
      const path = normalizeText(item.path);
      const bucketName = normalizeText(item.bucketName);
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
        path: path || undefined,
        bucketName: bucketName || undefined,
      };
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

const normalizePollOptionId = (value: unknown): string =>
  normalizeText(value).replace(/[^\w-]/g, "");

const parsePollVotes = (value: unknown): Array<{ email: string; optionId: string }> => {
  if (!Array.isArray(value)) return [];
  const votesByEmail = new Map<string, string>();

  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const email = normalizeEmail(raw.email);
    const optionId = normalizePollOptionId(raw.optionId);
    if (!email || !optionId) continue;
    votesByEmail.set(email, optionId);
  }

  return Array.from(votesByEmail, ([email, optionId]) => ({ email, optionId }));
};

const parsePoll = (
  pollRaw: unknown,
  votesRaw: unknown,
  viewerEmail: string
): WallPoll | null => {
  if (!isPlainObject(pollRaw)) return null;
  const id = normalizeText(pollRaw.id) || "poll";
  const question = normalizeText(pollRaw.question);
  const optionsRaw = Array.isArray(pollRaw.options) ? pollRaw.options : [];
  const options = optionsRaw
    .map((optionRaw): { id: string; text: string } | null => {
      if (!isPlainObject(optionRaw)) return null;
      const optionId = normalizePollOptionId(optionRaw.id);
      const text = normalizeText(optionRaw.text);
      if (!optionId || !text) return null;
      return { id: optionId, text };
    })
    .filter((option): option is { id: string; text: string } => option !== null);

  if (!question || options.length < 2) return null;

  const optionIds = new Set(options.map((option) => option.id));
  const countsByOptionId = new Map(options.map((option) => [option.id, 0]));
  const votes = parsePollVotes(votesRaw).filter((vote) => optionIds.has(vote.optionId));
  votes.forEach((vote) => {
    countsByOptionId.set(vote.optionId, (countsByOptionId.get(vote.optionId) ?? 0) + 1);
  });

  const viewerVote = viewerEmail
    ? votes.find((vote) => vote.email === viewerEmail)?.optionId ?? null
    : null;

  return {
    id,
    question,
    totalVotes: votes.length,
    selectedOptionId: viewerVote,
    options: options.map((option) => ({
      ...option,
      voteCount: countsByOptionId.get(option.id) ?? 0,
    })),
  };
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
    profileAvatar: "",
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

function buildAttachmentApiUrl(postId: string, attachmentId: string): string {
  const params = new URLSearchParams({
    postId,
    attachmentId,
  });
  return `/api/intranet/wall/attachment?${params.toString()}`;
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
  files: PreparedIntranetWallAttachmentFile[];
  uploaderEmail: string;
}): Promise<WallAttachment[]> {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const attachments: WallAttachment[] = [];
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
}: {
  postId: string;
  files: PreparedIntranetWallAttachmentFile[];
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
  const attachments = parseAttachments(raw.attachments).map(
    ({ id, name, contentType, sizeBytes, isImage }) => ({
      id,
      name,
      url: buildAttachmentApiUrl(docId, id),
      contentType,
      sizeBytes,
      isImage,
    })
  );
  const sources = sanitizeStoredIntranetWallSources(raw.sources);
  const poll = parsePoll(raw.poll, raw.pollVotes, viewerEmail);

  return {
    id: docId,
    title,
    text,
    section,
    sectionLabel: INTRANET_SECTION_LABEL_BY_KEY.get(section) ?? section,
    createdAtMs: toMillis(raw.createdAt),
    updatedAtMs: toMillis(raw.updatedAt),
    pinned: raw.pinned === true,
    readByDay: (() => {
      const value = normalizeText(raw.readByDay);
      return isIsoDay(value) ? value : null;
    })(),
    commentCount,
    likeCount,
    likedByMe,
    author,
    attachments,
    sources,
    comments,
    poll,
  };
}

async function hydrateWallAuthorAvatars(posts: WallPost[]): Promise<WallPost[]> {
  const authorEmails = new Set<string>();
  posts.forEach((post) => {
    if (post.author.email) authorEmails.add(post.author.email);
    post.comments.forEach((comment) => {
      if (comment.author.email) authorEmails.add(comment.author.email);
      comment.replies.forEach((reply) => {
        if (reply.author.email) authorEmails.add(reply.author.email);
      });
    });
  });
  const avatars = await loadProfileAvatarsByEmail(authorEmails);
  const hydrateAuthor = (author: WallAuthor): WallAuthor => ({
    ...author,
    profileAvatar: avatars[author.email] || "",
  });

  return posts.map((post) => ({
    ...post,
    author: hydrateAuthor(post.author),
    comments: post.comments.map((comment) => ({
      ...comment,
      author: hydrateAuthor(comment.author),
      replies: comment.replies.map((reply) => ({
        ...reply,
        author: hydrateAuthor(reply.author),
      })),
    })),
  }));
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:get",
    limit: GET_RATE_LIMIT,
    windowMs: GET_RATE_LIMIT_WINDOW_MS,
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

  const searchQuery = normalizeText(req.nextUrl.searchParams.get("q")).slice(0, 120);
  const normalizedSearchQuery = normalizeSearchText(searchQuery);

  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.max(1, Math.floor(limitRaw)), POSTS_MAX_LIMIT)
      : POSTS_DEFAULT_LIMIT;
  const cursorRaw = Number(req.nextUrl.searchParams.get("cursorMs"));
  const cursorMs =
    Number.isFinite(cursorRaw) && cursorRaw > 0 ? Math.floor(cursorRaw) : null;

  try {
    const viewerEmail = normalizeEmail(ctx.email);
    const batchLimit = Math.max(limit + 1, POSTS_SCAN_BATCH_LIMIT);
    const matchingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let query: FirebaseFirestore.Query = adminDb
      .collection(POSTS_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(batchLimit);
    if (cursorMs) {
      query = query.startAfter(Timestamp.fromMillis(cursorMs));
    }

    while (matchingDocs.length <= limit) {
      const postsSnap = await query.get();
      if (postsSnap.empty) break;

      for (const doc of postsSnap.docs) {
        const raw = doc.data() as Record<string, unknown>;
        const docSection = parseSection(raw.section);
        const matchesSection = !section || docSection === section;
        const matchesSearch =
          !normalizedSearchQuery ||
          [
            raw.title,
            raw.text,
            raw.createdByName,
            raw.createdByEmail,
            sanitizeStoredIntranetWallSources(raw.sources).join(" "),
          ].some((value) => normalizeSearchText(value).includes(normalizedSearchQuery));
        if (matchesSection && matchesSearch) {
          matchingDocs.push(doc);
          if (matchingDocs.length > limit) break;
        }
      }

      if (matchingDocs.length > limit || postsSnap.size < batchLimit) break;
      const lastDoc = postsSnap.docs[postsSnap.docs.length - 1];
      if (!lastDoc) break;
      query = adminDb
        .collection(POSTS_COLLECTION)
        .orderBy("createdAt", "desc")
        .startAfter(lastDoc)
        .limit(batchLimit);
    }

    const docsToReturn = matchingDocs.slice(0, limit);
    const hasMoreCandidate = matchingDocs.length > limit;
    const lastReturnedDoc = docsToReturn[docsToReturn.length - 1] ?? null;
    const nextCursorMs = hasMoreCandidate
      ? toMillis(lastReturnedDoc?.data().createdAt) ?? null
      : null;
    const hasMore = hasMoreCandidate && nextCursorMs !== null;

    const parsedPosts = await Promise.all(
      docsToReturn.map(async (doc) => {
        const raw = doc.data() as Record<string, unknown>;
        const comments = await loadCommentsForPost(doc.id, viewerEmail);
        return mapPostFromDoc(doc.id, raw, comments, viewerEmail);
      })
    );
    const posts = await hydrateWallAuthorAvatars(
      parsedPosts.filter((post): post is WallPost => post !== null)
    );

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        sections: INTRANET_SECTIONS,
        posts: posts
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
          })
          .slice(0, limit),
        hasMore,
        nextCursorMs,
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
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:post",
    limit: POST_RATE_LIMIT,
    windowMs: POST_RATE_LIMIT_WINDOW_MS,
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
  const pollEnabled = normalizeText(form.get("pollEnabled")) === "1";
  const pinned = normalizeText(form.get("pinned")) === "1";
  const readByDayRaw = normalizeText(form.get("readByDay"));
  const readByDay = readByDayRaw || null;
  const pollQuestion = normalizeText(form.get("pollQuestion")).slice(0, POLL_QUESTION_MAX_LEN);
  const pollOptions = form
    .getAll("pollOptions")
    .map((option) => normalizeText(option).slice(0, POLL_OPTION_MAX_LEN))
    .filter(Boolean)
    .slice(0, POLL_OPTIONS_MAX_COUNT);
  const sourcesResult = parseIntranetWallSourcesJson(form.get("sources"));

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
  if (readByDay && !isIsoDay(readByDay)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Termín přečtení musí být platné datum." },
        { status: 400 }
      ),
      ctx
    );
  }
  if (!sourcesResult.ok) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: sourcesResult.error },
        { status: 400 }
      ),
      ctx
    );
  }
  if (pollEnabled) {
    if (!pollQuestion) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Otázka ankety je povinná." },
          { status: 400 }
        ),
        ctx
      );
    }
    if (pollOptions.length < 2) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Anketa musí mít alespoň dvě možnosti." },
          { status: 400 }
        ),
        ctx
      );
    }
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

  try {
    const authorName = await resolveDisplayName({
      email: ctx.email,
      uid: ctx.uid,
    });

    const postRef = adminDb.collection(POSTS_COLLECTION).doc();
    const attachments = await uploadAttachmentsToStorage({
      postId: postRef.id,
      files: preparedFiles,
      uploaderEmail: ctx.email,
    });

    const timestamp = FieldValue.serverTimestamp();
    const sectionLabel = INTRANET_SECTION_LABEL_BY_KEY.get(section) ?? section;
    const poll = pollEnabled
      ? {
          id: randomUUID(),
          question: pollQuestion,
          options: pollOptions.map((option) => ({
            id: randomUUID(),
            text: option,
          })),
        }
      : null;
    const postData: Record<string, unknown> = {
      title,
      text,
      section,
      sectionLabel,
      createdByUid: ctx.uid,
      createdByEmail: ctx.email,
      createdByName: authorName,
      attachments,
      sources: sourcesResult.sources,
      commentCount: 0,
      likeCount: 0,
      likedByEmails: [],
      pinned,
      readByDay,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (poll) {
      postData.poll = poll;
      postData.pollVotes = [];
    }
    await postRef.set(postData);

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
