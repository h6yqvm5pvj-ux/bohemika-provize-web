import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPS_DETAIL_GET_RATE_LIMIT = 120;
const TIPS_DETAIL_GET_RATE_LIMIT_WINDOW_MS = 60_000;
const TIPS_DETAIL_DELETE_RATE_LIMIT = 40;
const TIPS_DETAIL_DELETE_RATE_LIMIT_WINDOW_MS = 60_000;

type AccountType = "advisor" | "tipster";
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

const normalizeId = (value: unknown): string => {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length > 240 || normalized.includes("/")) return "";
  return normalized;
};

const resolveAccountType = (data: Record<string, unknown>): AccountType => {
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

const loadAccountType = async (email: string): Promise<AccountType> => {
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

const parseStatus = (value: unknown): TipStatus => {
  if (value === "failed") return "failed";
  if (value === "paid" || value === "contracted") return "contracted";
  return "pending";
};

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};

const statusCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("advisorTipStatuses");

const mailboxCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("mailbox");

const loadLinkedContractSummary = async ({
  ownerEmail,
  entryId,
  expectedTipsterEmail,
  expectedSourceTipId,
  viewerEmail,
  includeAdvisorFinancials,
}: {
  ownerEmail: string;
  entryId: string;
  expectedTipsterEmail: string;
  expectedSourceTipId: string;
  viewerEmail: string;
  includeAdvisorFinancials: boolean;
}) => {
  if (!adminDb) return null;
  const normalizedOwner = normalizeEmail(ownerEmail);
  const normalizedEntryId = normalizeText(entryId);
  if (!normalizedOwner || !normalizedEntryId || normalizedEntryId.includes("/")) return null;

  const contractSnap = await adminDb
    .collection("users")
    .doc(normalizedOwner)
    .collection("entries")
    .doc(normalizedEntryId)
    .get();
  if (!contractSnap.exists) return null;

  const data = (contractSnap.data() ?? {}) as Record<string, unknown>;
  const contractTipsterEmail = normalizeEmail(data.tipContractTipsterEmail);
  const normalizedExpectedTipster = normalizeEmail(expectedTipsterEmail);
  const sourceTipId = normalizeText(data.tipContractSourceTipId);
  const normalizedExpectedSourceTipId = normalizeText(expectedSourceTipId);
  const normalizedViewerEmail = normalizeEmail(viewerEmail);

  if (
    normalizedExpectedTipster &&
    contractTipsterEmail &&
    contractTipsterEmail !== normalizedExpectedTipster
  ) {
    return null;
  }
  if (
    normalizedExpectedSourceTipId &&
    sourceTipId &&
    sourceTipId !== normalizedExpectedSourceTipId
  ) {
    return null;
  }
  if (
    normalizedViewerEmail !== normalizedOwner &&
    normalizedViewerEmail !== contractTipsterEmail
  ) {
    return null;
  }

  return {
    ownerEmail: normalizedOwner,
    entryId: normalizedEntryId,
    path: `users/${normalizedOwner}/entries/${normalizedEntryId}`,
    number: normalizeText(data.contractNumber),
    tipsterPercent: parseFiniteNumber(data.tipContractTipsterPercent),
    immediateGrossFirstYear: includeAdvisorFinancials
      ? parseFiniteNumber(data.tipContractImmediateFirstYearGross)
      : null,
    immediateNetFirstYear: includeAdvisorFinancials
      ? parseFiniteNumber(data.tipContractImmediateFirstYearNet)
      : null,
    tipsterAmountFirstYear: parseFiniteNumber(data.tipContractTipsterAmountFirstYear),
  };
};

const parseTipsterTipDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const attachments = parseAttachments(data.attachments);
  const createdAtMs =
    (typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
      ? Math.round(data.createdAtMs)
      : null) ?? toMillis(data.createdAt);

  return {
    id: docSnap.id,
    title: normalizeText(data.title) || "Nový tip",
    product: normalizeText(data.product) || "other",
    productLabel: normalizeText(data.productLabel) || "Tip",
    status: parseStatus(data.status),
    recipientEmail: normalizeEmail(data.recipientEmail),
    recipientName: normalizeText(data.recipientName),
    tipsterEmail: normalizeEmail(data.tipsterEmail),
    tipsterName: normalizeText(data.tipsterName),
    messageText: normalizeText(data.messageText),
    fields: parseFields(data.fields),
    attachments,
    attachmentCount:
      typeof data.attachmentCount === "number" && Number.isFinite(data.attachmentCount)
        ? Math.max(0, Math.round(data.attachmentCount))
        : attachments.length,
    mailboxMessageId: normalizeText(data.mailboxMessageId),
    recipientMailboxId: normalizeText(data.recipientMailboxId),
    senderMailboxId: normalizeText(data.senderMailboxId),
    linkedContractOwnerEmail: normalizeEmail(data.linkedContractOwnerEmail),
    linkedContractEntryId: normalizeText(data.linkedContractEntryId),
    linkedContractPath: normalizeText(data.linkedContractPath),
    linkedContractNumber: normalizeText(data.linkedContractNumber),
    createdAtMs,
  };
};

const parseAdvisorTipDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  recipientEmail: string,
  status: TipStatus,
  statusData: Record<string, unknown>
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const messageText = normalizeText(metadata.messageText) || normalizeText(data.body);
  const fields = parseMessageFields(messageText);
  const attachments = parseAttachments(metadata.attachments);
  const productLabel =
    normalizeText(metadata.tipProductLabel) ||
    fields.find((field) => field.label.toLowerCase() === "produkt")?.value ||
    normalizeText(data.title).replace(/^nový tip\s*-\s*/i, "") ||
    "Tip";
  const createdAtMs =
    (typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
      ? Math.round(data.createdAtMs)
      : null) ?? toMillis(data.createdAt);

  return {
    id: docSnap.id,
    title: normalizeText(data.title) || `Nový tip - ${productLabel}`,
    product: normalizeText(metadata.tipProduct) || "other",
    productLabel,
    status,
    recipientEmail,
    recipientName: "",
    tipsterEmail: normalizeEmail(metadata.senderEmail),
    tipsterName: normalizeText(metadata.senderName),
    messageText,
    fields,
    attachments,
    attachmentCount:
      typeof metadata.attachmentCount === "number" && Number.isFinite(metadata.attachmentCount)
        ? Math.max(0, Math.round(metadata.attachmentCount))
        : attachments.length,
    mailboxMessageId: normalizeText(metadata.messageId),
    recipientMailboxId: docSnap.id,
    senderMailboxId: "",
    linkedContractOwnerEmail: normalizeEmail(statusData.linkedContractOwnerEmail),
    linkedContractEntryId: normalizeText(statusData.linkedContractEntryId),
    linkedContractPath: normalizeText(statusData.linkedContractPath),
    linkedContractNumber: normalizeText(statusData.linkedContractNumber),
    createdAtMs,
  };
};

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:tips-detail:get",
    limit: TIPS_DETAIL_GET_RATE_LIMIT,
    windowMs: TIPS_DETAIL_GET_RATE_LIMIT_WINDOW_MS,
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

  const id = normalizeId(req.nextUrl.searchParams.get("id"));
  if (!id) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatné ID tipu." }, { status: 400 }),
      ctx
    );
  }

  try {
    const accountType = await loadAccountType(ctx.email);

    if (accountType === "tipster") {
      const tipSnap = await adminDb
        .collection("usersPrivate")
        .doc(ctx.email)
        .collection("tipsterTips")
        .doc(id)
        .get();

      if (!tipSnap.exists) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Tip nebyl nalezen." }, { status: 404 }),
          ctx
        );
      }

      const item = parseTipsterTipDoc(tipSnap);
      const linkedContract = await loadLinkedContractSummary({
        ownerEmail: item.linkedContractOwnerEmail,
        entryId: item.linkedContractEntryId,
        expectedTipsterEmail: item.tipsterEmail || ctx.email,
        expectedSourceTipId: item.recipientMailboxId || item.id,
        viewerEmail: ctx.email,
        includeAdvisorFinancials: false,
      });

      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          accountType,
          item: {
            ...item,
            linkedContract,
          },
        }),
        ctx
      );
    }

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

    const statusSnap = await statusCollection(ctx.email).doc(id).get();
    const statusData = (statusSnap.data() as Record<string, unknown> | undefined) ?? {};
    const status = statusSnap.exists ? parseStatus(statusData.status) : "pending";

    const item = parseAdvisorTipDoc(mailboxSnap, ctx.email, status, statusData);
    const linkedContract = await loadLinkedContractSummary({
      ownerEmail: item.linkedContractOwnerEmail,
      entryId: item.linkedContractEntryId,
      expectedTipsterEmail: item.tipsterEmail,
      expectedSourceTipId: item.id,
      viewerEmail: ctx.email,
      includeAdvisorFinancials: true,
    });

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        accountType,
        item: {
          ...item,
          linkedContract,
        },
      }),
      ctx
    );
  } catch (error) {
    console.error("Tip detail GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Detail tipu se nepodařilo načíst." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:tips-detail:delete",
    limit: TIPS_DETAIL_DELETE_RATE_LIMIT,
    windowMs: TIPS_DETAIL_DELETE_RATE_LIMIT_WINDOW_MS,
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

  const id = normalizeId(req.nextUrl.searchParams.get("id"));
  if (!id) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatné ID tipu." }, { status: 400 }),
      ctx
    );
  }

  try {
    const accountType = await loadAccountType(ctx.email);

    if (accountType === "tipster") {
      const tipRef = adminDb
        .collection("usersPrivate")
        .doc(ctx.email)
        .collection("tipsterTips")
        .doc(id);
      const tipSnap = await tipRef.get();
      if (!tipSnap.exists) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Tip nebyl nalezen." }, { status: 404 }),
          ctx
        );
      }

      await tipRef.delete();
      return withRateLimitHeaders(NextResponse.json({ ok: true, id }), ctx);
    }

    const mailboxRef = mailboxCollection(ctx.email).doc(id);
    const mailboxSnap = await mailboxRef.get();
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

    const batch = adminDb.batch();
    batch.delete(mailboxRef);
    batch.delete(statusCollection(ctx.email).doc(id));
    await batch.commit();

    return withRateLimitHeaders(NextResponse.json({ ok: true, id }), ctx);
  } catch (error) {
    console.error("Tip detail DELETE failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Tip se nepodařilo smazat." },
        { status: 500 }
      ),
      ctx
    );
  }
}
