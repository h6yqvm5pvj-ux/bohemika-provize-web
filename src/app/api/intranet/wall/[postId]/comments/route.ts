import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { INTRANET_SECTION_KEYS, type IntranetSectionKey } from "@/app/intranet/sections";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { collectPushTokens } from "@/lib/server/pushTokens";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTS_COLLECTION = "intranetWallPosts";
const COMMENTS_SUBCOLLECTION = "comments";

const COMMENT_RATE_LIMIT = 60;
const COMMENT_RATE_LIMIT_WINDOW_MS = 60_000;
const COMMENT_MAX_LEN = 2000;
const INTRANET_PUSH_MAX_TOKENS_PER_USER = 8;

type RouteParams = {
  postId: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

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

function resolveCommentId(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw) return "";
  return raw.replace(/[^\w-]/g, "");
}

const isIntranetPushEnabledForSection = (
  profile: Record<string, unknown>,
  section: IntranetSectionKey
): boolean => {
  const settingsRaw = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  if (!settingsRaw) return true;

  const typesRaw = isPlainObject(settingsRaw.types) ? settingsRaw.types : null;
  const channelsRaw = isPlainObject(settingsRaw.channels) ? settingsRaw.channels : null;
  const intranetRaw = isPlainObject(settingsRaw.intranet) ? settingsRaw.intranet : null;

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

async function sendPostCommentNotification({
  req,
  postId,
  section,
  sectionLabel,
  postAuthorEmail,
  commenterEmail,
  commenterName,
}: {
  req: NextRequest;
  postId: string;
  section: IntranetSectionKey;
  sectionLabel: string;
  postAuthorEmail: string;
  commenterEmail: string;
  commenterName: string;
}): Promise<void> {
  if (!adminDb) return;

  const recipientEmail = normalizeEmail(postAuthorEmail);
  if (!recipientEmail || recipientEmail === normalizeEmail(commenterEmail)) return;

  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(recipientEmail).get(),
    adminDb.collection("usersPrivate").doc(recipientEmail).get(),
  ]);

  const mergedProfile = {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };

  if (!isIntranetPushEnabledForSection(mergedProfile, section)) return;

  const actorName = normalizeText(commenterName) || nameFromEmail(commenterEmail);
  const body = `${actorName} právě okomentoval tvůj příspěvek! 👀`;
  const deepLink = `/intranet?section=${encodeURIComponent(
    section
  )}&postId=${encodeURIComponent(postId)}`;
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const webPushLink = `${baseUrl}${deepLink}`;
  const createdAtIso = new Date().toISOString();

  try {
    await writeMailboxEntries({
      recipientEmails: [recipientEmail],
      type: "intranet_comment",
      title: `Intranet • ${sectionLabel}`,
      body,
      deepLink,
      metadata: {
        postId,
        section,
        sectionLabel,
        commenterEmail: normalizeEmail(commenterEmail),
      },
    });
  } catch (error) {
    console.error("Writing mailbox notification for intranet comment failed:", error);
  }

  if (!adminMessaging) return;

  const tokens = collectPushTokens(mergedProfile).slice(0, INTRANET_PUSH_MAX_TOKENS_PER_USER);
  if (tokens.length === 0) return;

  try {
    await adminMessaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `Intranet • ${sectionLabel}`,
        body,
      },
      data: {
        type: "intranet_comment",
        postId,
        section,
        sectionLabel,
        commenterEmail: normalizeEmail(commenterEmail),
        commenterName: actorName,
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
          tag: `bohemika-intranet-comment-${postId}`,
          requireInteraction: false,
        },
      },
    });
  } catch (error) {
    console.warn("Intranet comment push notification failed:", error);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:comment",
    limit: COMMENT_RATE_LIMIT,
    windowMs: COMMENT_RATE_LIMIT_WINDOW_MS,
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
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  const textRaw = payload ? normalizeText(payload.text) : "";
  const parentCommentIdInput = payload ? resolveCommentId(payload.parentCommentId) : "";
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
    const postData = (postSnap.data() as Record<string, unknown> | undefined) ?? {};
    const postAuthorEmail = normalizeEmail(postData.createdByEmail);
    const sectionRaw = normalizeText(postData.section);
    const section = INTRANET_SECTION_KEYS.has(sectionRaw as IntranetSectionKey)
      ? (sectionRaw as IntranetSectionKey)
      : "obecne";
    const sectionLabel = normalizeText(postData.sectionLabel) || "Obecné";

    let parentCommentId: string | null = null;
    if (parentCommentIdInput) {
      const parentRef = postRef.collection(COMMENTS_SUBCOLLECTION).doc(parentCommentIdInput);
      const parentSnap = await parentRef.get();
      if (!parentSnap.exists) {
        return withRateLimitHeaders(
          NextResponse.json(
            { ok: false, error: "Komentář, na který reaguješ, už neexistuje." },
            { status: 404 }
          ),
          ctx
        );
      }

      const parentData = (parentSnap.data() as Record<string, unknown> | undefined) ?? {};
      const parentOfParent = resolveCommentId(parentData.parentCommentId);
      parentCommentId = parentOfParent || parentCommentIdInput;
    }

    const commentRef = postRef.collection(COMMENTS_SUBCOLLECTION).doc();
    const now = FieldValue.serverTimestamp();
    const batch = adminDb.batch();
    batch.set(commentRef, {
      text,
      createdByUid: ctx.uid,
      createdByEmail: ctx.email,
      createdByName: authorName,
      parentCommentId,
      likedByEmails: [],
      likeCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    batch.update(postRef, {
      commentCount: FieldValue.increment(1),
      updatedAt: now,
      lastCommentAt: now,
    });
    await batch.commit();

    try {
      await sendPostCommentNotification({
        req,
        postId,
        section,
        sectionLabel,
        postAuthorEmail,
        commenterEmail: ctx.email,
        commenterName: authorName,
      });
    } catch (pushError) {
      console.warn("Intranet comment notification failed:", pushError);
    }

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
