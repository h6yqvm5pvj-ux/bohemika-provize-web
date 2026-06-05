import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADVISOR_TIPS_BY_USER_RATE_LIMIT = 120;
const ADVISOR_TIPS_BY_USER_RATE_LIMIT_WINDOW_MS = 60_000;
const ADVISOR_TIPS_BY_USER_SCAN_LIMIT = 260;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TipStatus = "pending" | "contracted" | "failed";

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

const parseStatus = (value: unknown): TipStatus => {
  if (value === "failed") return "failed";
  if (value === "paid" || value === "contracted") return "contracted";
  return "pending";
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

const statusCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("advisorTipStatuses");

const mailboxCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("mailbox");

const fieldValue = (fields: Array<{ label: string; value: string }>, labels: string[]): string => {
  const normalizedLabels = new Set(labels.map((label) => label.toLowerCase()));
  return (
    fields.find((field) =>
      normalizedLabels.has(field.label.trim().toLowerCase().replace(/\s+/g, " "))
    )?.value.trim() ?? ""
  );
};

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:advisor-tips-by-user:get",
    limit: ADVISOR_TIPS_BY_USER_RATE_LIMIT,
    windowMs: ADVISOR_TIPS_BY_USER_RATE_LIMIT_WINDOW_MS,
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

  const tipsterEmail = normalizeEmail(req.nextUrl.searchParams.get("email"));
  if (!tipsterEmail || !EMAIL_RE.test(tipsterEmail)) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatný e-mail uživatele." }, { status: 400 }),
      ctx
    );
  }

  try {
    const mailboxSnap = await mailboxCollection(ctx.email)
      .orderBy("createdAtMs", "desc")
      .limit(ADVISOR_TIPS_BY_USER_SCAN_LIMIT)
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
        metadata.mailboxDirection === "received" &&
        normalizeEmail(metadata.senderEmail) === tipsterEmail
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

    const items = tipDocs.map((docSnap) => {
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      const metadata =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      const messageText = normalizeText(metadata.messageText) || normalizeText(data.body);
      const fields = parseMessageFields(messageText);
      const productLabel =
        normalizeText(metadata.tipProductLabel) ||
        normalizeText(data.title).replace(/^nový tip\s*-\s*/i, "") ||
        "Tip";
      const createdAtMs =
        (typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
          ? Math.round(data.createdAtMs)
          : null) ?? toMillis(data.createdAt);
      const clientName =
        fieldValue(fields, ["jméno a příjmení", "jméno a příjmení / název firmy", "název firmy"]) ||
        "Klient neuveden";
      const phone = fieldValue(fields, ["telefon"]);
      const email = fieldValue(fields, ["e-mail", "email"]);

      return {
        id: docSnap.id,
        title: normalizeText(data.title) || `Nový tip - ${productLabel}`,
        product: normalizeText(metadata.tipProduct) || "other",
        productLabel,
        status: statusById.get(docSnap.id) ?? "pending",
        tipsterEmail,
        tipsterName: normalizeText(metadata.senderName),
        clientName,
        phone,
        email,
        createdAtMs,
      };
    });

    return withRateLimitHeaders(NextResponse.json({ ok: true, items }), ctx);
  } catch (error) {
    console.error("GET /api/advisor-tips/by-user failed", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Tipy vybraného uživatele se nepodařilo načíst." },
        { status: 500 }
      ),
      ctx
    );
  }
}
