import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONVERSATION_RATE_LIMIT = 90;
const CONVERSATION_RATE_LIMIT_WINDOW_MS = 60_000;
const GROUP_CONVERSATION_ID_RE = /^group_[A-Za-z0-9_-]{10,100}$/;
const GROUP_NAME_MAX_LEN = 80;
const GROUP_MAX_PARTICIPANTS = 12;

type Participant = { email: string; name: string };

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string => normalizeText(value).toLowerCase();

const nameFromEmail = (email: string): string => {
  const parts = (email.split("@")[0] ?? "").split(/[.\-_]/).filter(Boolean);
  return parts.length > 0
    ? parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`).join(" ")
    : email;
};

const parseConversationId = (value: unknown): string => {
  const id = normalizeText(value);
  return GROUP_CONVERSATION_ID_RE.test(id) ? id : "";
};

const parseParticipants = (value: unknown): Participant[] => {
  if (!Array.isArray(value)) return [];
  const byEmail = new Map<string, Participant>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const row = entry as Record<string, unknown>;
    const email = normalizeEmail(row.email);
    if (!email) return;
    byEmail.set(email, {
      email,
      name: normalizeText(row.name) || nameFromEmail(email),
    });
  });
  return [...byEmail.values()];
};

const loadUserByEmail = async (email: string): Promise<Participant | null> => {
  if (!adminDb) return null;
  const users = adminDb.collection("users");
  const direct = await users.doc(email).get();
  if (direct.exists) {
    const data = (direct.data() ?? {}) as Record<string, unknown>;
    return {
      email,
      name: normalizeText(data.fullName) || normalizeText(data.name) || nameFromEmail(email),
    };
  }
  const byEmail = await users.where("email", "==", email).limit(1).get();
  const match = byEmail.docs[0];
  if (!match) return null;
  const data = (match.data() ?? {}) as Record<string, unknown>;
  const resolvedEmail = normalizeEmail(data.email) || normalizeEmail(match.id) || email;
  return {
    email: resolvedEmail,
    name:
      normalizeText(data.fullName) || normalizeText(data.name) || nameFromEmail(resolvedEmail),
  };
};

const conversationPayload = ({
  conversationId,
  data,
  currentEmail,
}: {
  conversationId: string;
  data: Record<string, unknown>;
  currentEmail: string;
}) => {
  const participants = parseParticipants(data.participants);
  const participantEmails = participants.map((participant) => participant.email);
  const ownerEmail =
    normalizeEmail(data.groupOwnerEmail) ||
    normalizeEmail(data.createdByEmail) ||
    participantEmails[0] ||
    "";
  return {
    ok: true,
    conversationId,
    groupName: normalizeText(data.groupName) || "Skupinová konverzace",
    ownerEmail,
    participants,
    participantEmails,
    muted: data.muted === true,
    active: data.active !== false,
    canManage: ownerEmail === currentEmail && data.active !== false,
  };
};

const loadConversation = async (email: string, conversationId: string) => {
  if (!adminDb) throw new Error("Firebase Admin není nakonfigurován.");
  const ref = adminDb
    .collection("usersPrivate")
    .doc(email)
    .collection("mailboxConversations")
    .doc(conversationId);
  const snapshot = await ref.get();
  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  if (!snapshot.exists || data.groupConversation !== true) return null;
  return { ref, data };
};

const propagateGroupMetadata = async ({
  conversationId,
  participants,
  ownerEmail,
  groupName,
}: {
  conversationId: string;
  participants: Participant[];
  ownerEmail: string;
  groupName: string;
}) => {
  if (!adminDb) return;
  const participantEmails = participants.map((participant) => participant.email);
  const snapshots = await Promise.all(
    participantEmails.map((email) =>
      adminDb!
        .collection("usersPrivate")
        .doc(email)
        .collection("mailbox")
        .where("metadata.conversationId", "==", conversationId)
        .get()
    )
  );
  const refs = snapshots.flatMap((snapshot) => snapshot.docs.map((document) => document.ref));
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = adminDb.batch();
    refs.slice(offset, offset + 400).forEach((ref) => {
      batch.update(ref, {
        "metadata.groupName": groupName,
        "metadata.groupOwnerEmail": ownerEmail,
        "metadata.participants": participants,
        "metadata.participantEmails": participantEmails,
      });
    });
    await batch.commit();
  }
};

const guardRequest = (req: NextRequest, action: string) =>
  requireAuthedRateLimited(req, {
    namespace: `api:mailbox:conversation:${action}`,
    limit: CONVERSATION_RATE_LIMIT,
    windowMs: CONVERSATION_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });

export async function GET(req: NextRequest) {
  const guard = await guardRequest(req, "get");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const conversationId = parseConversationId(req.nextUrl.searchParams.get("conversationId"));
  if (!conversationId) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatná skupinová konverzace." }, { status: 400 }),
      ctx
    );
  }
  try {
    const conversation = await loadConversation(ctx.email, conversationId);
    if (!conversation) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Skupinová konverzace nebyla nalezena." }, { status: 404 }),
        ctx
      );
    }
    return withRateLimitHeaders(
      NextResponse.json(conversationPayload({ conversationId, data: conversation.data, currentEmail: ctx.email })),
      ctx
    );
  } catch (error) {
    console.error("GET /api/mailbox/conversation failed", error);
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Nastavení skupiny se nepodařilo načíst." }, { status: 500 }),
      ctx
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await guardRequest(req, "patch");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 }),
      ctx
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { conversationId?: unknown; action?: unknown; muted?: unknown; groupName?: unknown; email?: unknown }
    | null;
  const conversationId = parseConversationId(body?.conversationId);
  const action = normalizeText(body?.action);
  if (!conversationId || !["mute", "rename", "add", "remove"].includes(action)) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatná změna skupinové konverzace." }, { status: 400 }),
      ctx
    );
  }

  try {
    const loaded = await loadConversation(ctx.email, conversationId);
    if (!loaded) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Skupinová konverzace nebyla nalezena." }, { status: 404 }),
        ctx
      );
    }
    if (loaded.data.active === false) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Už nejsi členem této skupiny." }, { status: 403 }),
        ctx
      );
    }

    if (action === "mute") {
      if (typeof body?.muted !== "boolean") {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Neplatné nastavení ztlumení." }, { status: 400 }),
          ctx
        );
      }
      await loaded.ref.set(
        body.muted
          ? { muted: true, mutedAtMs: Date.now(), mutedAt: FieldValue.serverTimestamp() }
          : { muted: false, mutedAtMs: FieldValue.delete(), mutedAt: FieldValue.delete() },
        { merge: true }
      );
      const nextData = { ...loaded.data, muted: body.muted };
      return withRateLimitHeaders(
        NextResponse.json(conversationPayload({ conversationId, data: nextData, currentEmail: ctx.email })),
        ctx
      );
    }

    const currentParticipants = parseParticipants(loaded.data.participants);
    const currentEmails = currentParticipants.map((participant) => participant.email);
    const ownerEmail =
      normalizeEmail(loaded.data.groupOwnerEmail) ||
      normalizeEmail(loaded.data.createdByEmail) ||
      currentEmails[0] ||
      "";
    if (!ownerEmail || ownerEmail !== ctx.email) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Skupinu může spravovat pouze její zakladatel." }, { status: 403 }),
        ctx
      );
    }

    let participants = currentParticipants;
    let groupName = normalizeText(loaded.data.groupName) || "Skupinová konverzace";
    let removedEmail = "";
    if (action === "rename") {
      groupName = normalizeText(body?.groupName).slice(0, GROUP_NAME_MAX_LEN);
      if (!groupName) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Název skupiny nemůže být prázdný." }, { status: 400 }),
          ctx
        );
      }
    } else if (action === "add") {
      const email = normalizeEmail(body?.email);
      if (!email || currentEmails.includes(email)) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Tento uživatel už je ve skupině nebo není platný." }, { status: 400 }),
          ctx
        );
      }
      if (participants.length >= GROUP_MAX_PARTICIPANTS) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: `Skupina může mít nejvýše ${GROUP_MAX_PARTICIPANTS} členů.` }, { status: 400 }),
          ctx
        );
      }
      const participant = await loadUserByEmail(email);
      if (!participant) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Uživatel nebyl v systému nalezen." }, { status: 404 }),
          ctx
        );
      }
      participants = [...participants, participant];
    } else {
      removedEmail = normalizeEmail(body?.email);
      if (!removedEmail || !currentEmails.includes(removedEmail)) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Uživatel není členem této skupiny." }, { status: 400 }),
          ctx
        );
      }
      if (removedEmail === ownerEmail) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Zakladatele skupiny nelze odebrat." }, { status: 400 }),
          ctx
        );
      }
      if (participants.length <= 3) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Skupinový chat musí mít alespoň tři členy." }, { status: 400 }),
          ctx
        );
      }
      participants = participants.filter((participant) => participant.email !== removedEmail);
    }

    const participantEmails = participants.map((participant) => participant.email);
    const nowMs = Date.now();
    const batch = adminDb.batch();
    participants.forEach((participant) => {
      batch.set(
        adminDb!
          .collection("usersPrivate")
          .doc(participant.email)
          .collection("mailboxConversations")
          .doc(conversationId),
        {
          conversationId,
          groupConversation: true,
          groupName,
          groupOwnerEmail: ownerEmail,
          participants,
          participantEmails,
          active: true,
          removedAtMs: FieldValue.delete(),
          removedAt: FieldValue.delete(),
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
          ...(action === "add" && participant.email === normalizeEmail(body?.email)
            ? { joinedAtMs: nowMs, joinedAt: FieldValue.serverTimestamp() }
            : {}),
        },
        { merge: true }
      );
    });
    if (removedEmail) {
      batch.set(
        adminDb
          .collection("usersPrivate")
          .doc(removedEmail)
          .collection("mailboxConversations")
          .doc(conversationId),
        {
          conversationId,
          groupConversation: true,
          groupName,
          groupOwnerEmail: ownerEmail,
          participants,
          participantEmails,
          active: false,
          removedAtMs: nowMs,
          removedAt: FieldValue.serverTimestamp(),
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
    try {
      await propagateGroupMetadata({ conversationId, participants, ownerEmail, groupName });
    } catch (metadataError) {
      console.warn("Mailbox group message metadata propagation failed", metadataError);
    }

    const nextData = {
      ...loaded.data,
      groupName,
      groupOwnerEmail: ownerEmail,
      participants,
      participantEmails,
      active: true,
    };
    return withRateLimitHeaders(
      NextResponse.json(conversationPayload({ conversationId, data: nextData, currentEmail: ctx.email })),
      ctx
    );
  } catch (error) {
    console.error("PATCH /api/mailbox/conversation failed", error);
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Změnu skupiny se nepodařilo uložit." }, { status: 500 }),
      ctx
    );
  }
}
