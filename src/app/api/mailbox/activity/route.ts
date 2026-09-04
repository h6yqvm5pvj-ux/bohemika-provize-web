import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  mailboxConversationId,
  mailboxConversationParticipantId,
} from "@/lib/server/mailboxConversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACTIVITY_RATE_LIMIT = 180;
const ACTIVITY_RATE_LIMIT_WINDOW_MS = 60_000;
const TYPING_TTL_MS = 8_000;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const ms = (value as { toDate: () => Date }).toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
  }
  return null;
};

const mailboxCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("mailbox");

async function hasConversation(email: string, targetEmail: string, conversationId: string) {
  const mailbox = mailboxCollection(email);
  const byConversation = await mailbox
    .where("metadata.conversationId", "==", conversationId)
    .limit(1)
    .get();
  if (!byConversation.empty) return true;

  const [bySender, byRecipient] = await Promise.all([
    mailbox.where("metadata.senderEmail", "==", targetEmail).limit(1).get(),
    mailbox.where("metadata.recipientEmail", "==", targetEmail).limit(1).get(),
  ]);
  return [...bySender.docs, ...byRecipient.docs].some((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const metadata =
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};
    return data.type === "direct_message" && metadata.tipsterTip !== true;
  });
}

async function loadUserLastActive(email: string): Promise<number | null> {
  const users = adminDb!.collection("users");
  const direct = await users.doc(email).get();
  if (direct.exists) return toMillis(direct.data()?.lastActive);
  const byEmail = await users.where("email", "==", email).limit(1).get();
  return byEmail.empty ? null : toMillis(byEmail.docs[0]?.data().lastActive);
}

async function guardConversation(req: NextRequest, targetEmail: string) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: `api:mailbox:activity:${req.method.toLowerCase()}`,
    limit: ACTIVITY_RATE_LIMIT,
    windowMs: ACTIVITY_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard;
  if (!adminDb) {
    return {
      ok: false as const,
      response: withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 }),
        guard.ctx
      ),
    };
  }
  if (!EMAIL_RE.test(targetEmail) || targetEmail === guard.ctx.email) {
    return {
      ok: false as const,
      response: withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Neplatný účastník konverzace." }, { status: 400 }),
        guard.ctx
      ),
    };
  }
  const conversationId = mailboxConversationId(guard.ctx.email, targetEmail);
  if (!(await hasConversation(guard.ctx.email, targetEmail, conversationId))) {
    return {
      ok: false as const,
      response: withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Konverzace nebyla nalezena." }, { status: 404 }),
        guard.ctx
      ),
    };
  }
  return { ok: true as const, ctx: guard.ctx, conversationId };
}

export async function GET(req: NextRequest) {
  const targetEmail = normalizeEmail(req.nextUrl.searchParams.get("email"));
  const guard = await guardConversation(req, targetEmail);
  if (!guard.ok) return guard.response;

  try {
    const nowMs = Date.now();
    const participantRef = adminDb!
      .collection("mailboxChatActivity")
      .doc(guard.conversationId)
      .collection("participants")
      .doc(mailboxConversationParticipantId(targetEmail));
    const [lastActiveAtMs, participant] = await Promise.all([
      loadUserLastActive(targetEmail),
      participantRef.get(),
    ]);
    const typingExpiresAtMs = toMillis(participant.data()?.typingExpiresAtMs) ?? 0;

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        conversationId: guard.conversationId,
        email: targetEmail,
        lastActiveAtMs,
        typing: participant.data()?.typing === true && typingExpiresAtMs > nowMs,
        serverNowMs: nowMs,
      }),
      guard.ctx
    );
  } catch (error) {
    console.error("Mailbox activity GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Aktivitu se nepodařilo načíst." }, { status: 500 }),
      guard.ctx
    );
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; typing?: unknown }
    | null;
  const targetEmail = normalizeEmail(body?.email);
  const guard = await guardConversation(req, targetEmail);
  if (!guard.ok) return guard.response;
  if (typeof body?.typing !== "boolean") {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Chybí stav psaní." }, { status: 400 }),
      guard.ctx
    );
  }

  try {
    const nowMs = Date.now();
    await adminDb!
      .collection("mailboxChatActivity")
      .doc(guard.conversationId)
      .collection("participants")
      .doc(mailboxConversationParticipantId(guard.ctx.email))
      .set(
        {
          email: guard.ctx.email,
          counterpartEmail: targetEmail,
          typing: body.typing,
          typingExpiresAtMs: body.typing ? nowMs + TYPING_TTL_MS : nowMs,
          updatedAtMs: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return withRateLimitHeaders(
      NextResponse.json({ ok: true, conversationId: guard.conversationId }),
      guard.ctx
    );
  } catch (error) {
    console.error("Mailbox activity POST failed:", error);
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Stav psaní se nepodařilo uložit." }, { status: 500 }),
      guard.ctx
    );
  }
}
