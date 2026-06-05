import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADVISOR_TIPS_GET_RATE_LIMIT = 120;
const ADVISOR_TIPS_GET_RATE_LIMIT_WINDOW_MS = 60_000;
const ADVISOR_TIPS_PATCH_RATE_LIMIT = 90;
const ADVISOR_TIPS_PATCH_RATE_LIMIT_WINDOW_MS = 60_000;
const ADVISOR_TIPS_SCAN_LIMIT = 260;
const STATUS_VALUES = new Set(["pending", "contracted", "failed"]);

type TipStatus = "pending" | "contracted" | "failed";
type TipFilterStatus = "all" | "new" | "contracted";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
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

const parseMessageFields = (textRaw: string) => {
  const fields: Array<{ label: string; value: string }> = [];
  let current: { label: string; value: string } | null = null;

  textRaw.split(/\r?\n/).forEach((lineRaw) => {
    const line = lineRaw.trim();
    if (!line || /^nový tip z tipařského formuláře$/i.test(line)) return;

    const match = line.match(/^([^:]{1,90}):\s*(.*)$/);
    if (match) {
      const label = match[1]?.trim() ?? "";
      const value = match[2]?.trim() ?? "";
      if (!label) return;
      current = { label, value };
      fields.push(current);
      return;
    }

    if (current) {
      current.value = `${current.value}\n${line}`.trim();
    }
  });

  return fields.filter((field) => {
    const label = field.label.trim().toLowerCase().replace(/\s+/g, " ");
    return (
      label !== "produkt" &&
      label !== "tipař" &&
      label !== "e-mail tipaře" &&
      label !== "tp přední strana" &&
      label !== "tp zadní strana" &&
      field.value.trim().length > 0
    );
  });
};

const parseAttachments = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const name = normalizeText(row.name);
      const url = normalizeText(row.url);
      if (!name || !url) return null;
      const id = normalizeText(row.id) || `${name}-${url}`;
      const contentType = normalizeText(row.contentType) || "application/octet-stream";
      const sizeBytes =
        typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes)
          ? Math.max(0, Math.round(row.sizeBytes))
          : 0;
      return { id, name, url, contentType, sizeBytes };
    })
    .filter(
      (entry): entry is {
        id: string;
        name: string;
        url: string;
        contentType: string;
        sizeBytes: number;
      } => entry !== null
    );
};

const statusCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("advisorTipStatuses");

const mailboxCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("mailbox");

const parseStatus = (value: unknown): TipStatus => {
  if (value === "failed") return "failed";
  if (value === "paid" || value === "contracted") return "contracted";
  return "pending";
};

const parseFilterStatus = (value: unknown): TipFilterStatus => {
  if (value === "new" || value === "contracted") return value;
  return "all";
};

const statusMatchesFilter = (status: TipStatus, filter: TipFilterStatus): boolean => {
  if (filter === "all") return true;
  if (filter === "new") return status === "pending";
  return status === "contracted";
};

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:advisor-tips:get",
    limit: ADVISOR_TIPS_GET_RATE_LIMIT,
    windowMs: ADVISOR_TIPS_GET_RATE_LIMIT_WINDOW_MS,
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
    const filterStatus = parseFilterStatus(req.nextUrl.searchParams.get("status"));
    const mailboxSnap = await mailboxCollection(ctx.email)
      .orderBy("createdAtMs", "desc")
      .limit(ADVISOR_TIPS_SCAN_LIMIT)
      .get();

    const tipDocs = mailboxSnap.docs.filter((docSnap) => {
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      const metadata =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      return (
        data.type === "direct_message" &&
        metadata.tipsterTip === true &&
        metadata.mailboxDirection === "received"
      );
    });

    const statusSnaps = await Promise.all(
      tipDocs.map((docSnap) => statusCollection(ctx.email).doc(docSnap.id).get())
    );
    const statusById = new Map<string, TipStatus>();
    statusSnaps.forEach((statusSnap) => {
      if (!statusSnap.exists) return;
      const data = (statusSnap.data() as Record<string, unknown> | undefined) ?? {};
      statusById.set(statusSnap.id, parseStatus(data.status));
    });

    const allItems = tipDocs.map((docSnap) => {
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      const metadata =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      const messageText = normalizeText(metadata.messageText) || normalizeText(data.body);
      const fields = parseMessageFields(messageText);
      const productLabel =
        normalizeText(metadata.tipProductLabel) ||
        fields.find((field) => field.label.toLowerCase() === "produkt")?.value ||
        normalizeText(data.title).replace(/^nový tip\s*-\s*/i, "") ||
        "Tip";
      const createdAtMs =
        (typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
          ? Math.round(data.createdAtMs)
          : null) ?? toMillis(data.createdAt);
      const status = statusById.get(docSnap.id) ?? "pending";

      return {
        id: docSnap.id,
        title: normalizeText(data.title) || `Nový tip - ${productLabel}`,
        product: normalizeText(metadata.tipProduct) || "other",
        productLabel,
        status,
        recipientEmail: ctx.email,
        recipientName: "",
        tipsterEmail: normalizeEmail(metadata.senderEmail),
        tipsterName: normalizeText(metadata.senderName),
        messageText,
        fields,
        attachments: parseAttachments(metadata.attachments),
        attachmentCount:
          typeof metadata.attachmentCount === "number" && Number.isFinite(metadata.attachmentCount)
            ? Math.max(0, Math.round(metadata.attachmentCount))
            : parseAttachments(metadata.attachments).length,
        mailboxMessageId: normalizeText(metadata.messageId),
        recipientMailboxId: docSnap.id,
        senderMailboxId: "",
        createdAtMs,
      };
    });

    const counts = allItems.reduce(
      (acc, item) => {
        const status = parseStatus(item.status);
        acc.all += 1;
        if (status === "pending") acc.new += 1;
        if (status === "contracted") acc.contracted += 1;
        return acc;
      },
      { all: 0, new: 0, contracted: 0 }
    );
    const items = allItems.filter((item) => statusMatchesFilter(parseStatus(item.status), filterStatus));

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, items, counts }),
      ctx
    );
  } catch (error) {
    console.error("Advisor tips GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Přijaté tipy se nepodařilo načíst." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:advisor-tips:patch",
    limit: ADVISOR_TIPS_PATCH_RATE_LIMIT,
    windowMs: ADVISOR_TIPS_PATCH_RATE_LIMIT_WINDOW_MS,
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

  const body = await req.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id.trim() : "";
  const statusRaw = body && typeof body.status === "string" ? body.status.trim() : "";
  if (!id || id.length > 240 || !STATUS_VALUES.has(statusRaw)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný požadavek na změnu stavu tipu." },
        { status: 400 }
      ),
      ctx
    );
  }
  const nextStatus = statusRaw as TipStatus;

  try {
    const mailboxSnap = await mailboxCollection(ctx.email).doc(id).get();
    if (!mailboxSnap.exists) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Tip nebyl nalezen." }, { status: 404 }),
        ctx
      );
    }
    const data = (mailboxSnap.data() ?? {}) as Record<string, unknown>;
    const metadata =
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};
    if (
      data.type !== "direct_message" ||
      metadata.tipsterTip !== true ||
      metadata.mailboxDirection !== "received"
    ) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Zpráva není tip." }, { status: 400 }),
        ctx
      );
    }

    const nowMs = Date.now();
    const batch = adminDb.batch();
    batch.set(
      statusCollection(ctx.email).doc(id),
      {
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    const tipsterEmail = normalizeEmail(metadata.senderEmail);
    const mailboxMessageId = normalizeText(metadata.messageId);
    if (tipsterEmail) {
      const tipsterTipsCol = adminDb
        .collection("usersPrivate")
        .doc(tipsterEmail)
        .collection("tipsterTips");
      const tipSnap = await tipsterTipsCol
        .where("recipientMailboxId", "==", id)
        .limit(1)
        .get();
      const fallbackSnap =
        tipSnap.empty && mailboxMessageId
          ? await tipsterTipsCol
              .where("mailboxMessageId", "==", mailboxMessageId)
              .limit(1)
              .get()
          : null;
      const tipDoc = tipSnap.docs[0] ?? fallbackSnap?.docs[0] ?? null;
      if (tipDoc) {
        batch.set(
          tipDoc.ref,
          {
            status: nextStatus,
            statusUpdatedAt: FieldValue.serverTimestamp(),
            statusUpdatedAtMs: nowMs,
            statusUpdatedByEmail: ctx.email,
          },
          { merge: true }
        );
      }
    }
    await batch.commit();

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, id, status: nextStatus }),
      ctx
    );
  } catch (error) {
    console.error("Advisor tips PATCH failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Stav tipu se nepodařilo uložit." },
        { status: 500 }
      ),
      ctx
    );
  }
}
