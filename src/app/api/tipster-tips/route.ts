import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPSTER_TIPS_GET_RATE_LIMIT = 120;
const TIPSTER_TIPS_GET_RATE_LIMIT_WINDOW_MS = 60_000;
const TIPS_LIST_DEFAULT_LIMIT = 80;
const TIPS_LIST_MAX_LIMIT = 200;

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveAccountType = (data: Record<string, unknown>): "advisor" | "tipster" => {
  const raw =
    typeof data.accountType === "string"
      ? data.accountType
      : typeof data.userRole === "string"
        ? data.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
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

const parseLimit = (value: string | null): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return TIPS_LIST_DEFAULT_LIMIT;
  return Math.min(TIPS_LIST_MAX_LIMIT, Math.max(1, Math.floor(parsed)));
};

const loadAccountType = async (email: string): Promise<"advisor" | "tipster"> => {
  if (!adminDb) return "advisor";
  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(email).get(),
    adminDb.collection("usersPrivate").doc(email).get(),
  ]);
  const merged = {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };
  return resolveAccountType(merged);
};

const parseFields = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const label = normalizeText(row.label);
      const fieldValue = normalizeText(row.value);
      if (!label || !fieldValue) return null;
      return { label, value: fieldValue };
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);
};

const countRawAttachments = (value: unknown): number => {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)).length;
};

const normalizeTipStatus = (value: unknown): "pending" | "contracted" | "failed" => {
  if (value === "failed") return "failed";
  if (value === "paid" || value === "contracted") return "contracted";
  return "pending";
};

const parseTipDoc = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const attachmentCount =
    typeof data.attachmentCount === "number" && Number.isFinite(data.attachmentCount)
      ? Math.max(0, Math.round(data.attachmentCount))
      : countRawAttachments(data.attachments);
  const createdAtMs =
    (typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
      ? Math.round(data.createdAtMs)
      : null) ?? toMillis(data.createdAt);

  return {
    id: docSnap.id,
    title: normalizeText(data.title) || "Nový tip",
    product: normalizeText(data.product) || "other",
    productLabel: normalizeText(data.productLabel) || "Tip",
    status: normalizeTipStatus(data.status),
    recipientEmail: normalizeEmail(data.recipientEmail),
    recipientName: normalizeText(data.recipientName),
    tipsterEmail: normalizeEmail(data.tipsterEmail),
    tipsterName: normalizeText(data.tipsterName),
    messageText: normalizeText(data.messageText),
    fields: parseFields(data.fields),
    attachments: [],
    attachmentCount,
    mailboxMessageId: normalizeText(data.mailboxMessageId),
    recipientMailboxId: normalizeText(data.recipientMailboxId),
    senderMailboxId: normalizeText(data.senderMailboxId),
    createdAtMs,
  };
};

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:tipster-tips:get",
    limit: TIPSTER_TIPS_GET_RATE_LIMIT,
    windowMs: TIPSTER_TIPS_GET_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  try {
    const accountType = await loadAccountType(ctx.email);
    if (accountType !== "tipster") {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Seznam tipů je dostupný pouze pro tipařské účty." },
          { status: 403 }
        ),
        ctx
      );
    }

    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const snap = await adminDb
      .collection("usersPrivate")
      .doc(ctx.email)
      .collection("tipsterTips")
      .orderBy("createdAtMs", "desc")
      .limit(limit)
      .get();

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        items: snap.docs.map((docSnap) => parseTipDoc(docSnap)),
      }),
      ctx
    );
  } catch (error) {
    console.error("Tipster tips GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Tipy se nepodařilo načíst." },
        { status: 500 }
      ),
      ctx
    );
  }
}
