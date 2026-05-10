import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_SHARE_RATE_LIMIT = 60;
const EXPORT_SHARE_RATE_LIMIT_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PREVIEW_HTML_LEN = 900_000;

type ExportShareSuccess = {
  ok: true;
  recipientEmail: string;
  recipientName: string;
  written: number;
};

type ExportShareError = {
  ok: false;
  error: string;
};

type ExportSnapshot = {
  scopeLabel: string;
  dateRangeLabel: string;
  periodFrom: string;
  periodTo: string;
  generatedLabel: string;
  adviserName: string;
  adviserEmail: string;
  selectedCategoryLabel: string;
  selectedAdvisersLabel: string;
  totalContracts: number;
  totalAnnual: number;
  lifeContracts: number;
  lifeAnnual: number;
  nonLifeContracts: number;
  nonLifeAnnual: number;
  autoContracts: number;
  autoAnnual: number;
  propertyContracts: number;
  propertyAnnual: number;
  goldContracts: number;
  goldTotal: number;
  topProductName: string;
  topProductAnnual: number;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const clampText = (value: unknown, maxLen: number): string => {
  const text = normalizeText(value);
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
};

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
};

const parseFiniteNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(",", ".").trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const parseNonNegativeInt = (value: unknown): number => {
  const parsed = parseFiniteNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const parseNonNegativeNumber = (value: unknown): number => {
  const parsed = parseFiniteNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

const formatMoney = (value: number): string => {
  try {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} Kč`;
  }
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const pickDisplayName = (raw: Record<string, unknown> | null, email: string): string => {
  if (!raw) return nameFromEmail(email);
  const fullName = normalizeText(raw.fullName);
  if (fullName) return fullName;
  const name = normalizeText(raw.name);
  if (name) return name;
  return nameFromEmail(email);
};

const loadUserByEmail = async (
  email: string
): Promise<{ email: string; name: string; managerEmail: string | null } | null> => {
  if (!adminDb) return null;
  const usersCol = adminDb.collection("users");

  const directSnap = await usersCol.doc(email).get();
  if (directSnap.exists) {
    const data = (directSnap.data() as Record<string, unknown> | undefined) ?? {};
    return {
      email,
      name: pickDisplayName(data, email),
      managerEmail: normalizeEmail(data.managerEmail) || null,
    };
  }

  const byEmailSnap = await usersCol.where("email", "==", email).limit(1).get();
  if (!byEmailSnap.empty) {
    const first = byEmailSnap.docs[0];
    const data = (first?.data() as Record<string, unknown> | undefined) ?? {};
    const resolvedEmail = normalizeEmail(data.email) || normalizeEmail(first?.id) || email;
    return {
      email: resolvedEmail,
      name: pickDisplayName(data, resolvedEmail),
      managerEmail: normalizeEmail(data.managerEmail) || null,
    };
  }

  return null;
};

const resolveSenderName = async (senderEmail: string, senderUid: string): Promise<string> => {
  if (!adminDb) return nameFromEmail(senderEmail);
  const usersCol = adminDb.collection("users");

  const directSnap = await usersCol.doc(senderEmail).get();
  if (directSnap.exists) {
    const name = pickDisplayName(
      (directSnap.data() as Record<string, unknown> | undefined) ?? null,
      senderEmail
    );
    if (name) return name;
  }

  const byEmailSnap = await usersCol.where("email", "==", senderEmail).limit(1).get();
  if (!byEmailSnap.empty) {
    const first = byEmailSnap.docs[0];
    const name = pickDisplayName(
      (first?.data() as Record<string, unknown> | undefined) ?? null,
      senderEmail
    );
    if (name) return name;
  }

  if (senderUid) {
    const byUidSnap = await usersCol.where("userId", "==", senderUid).limit(1).get();
    if (!byUidSnap.empty) {
      const first = byUidSnap.docs[0];
      const name = pickDisplayName(
        (first?.data() as Record<string, unknown> | undefined) ?? null,
        senderEmail
      );
      if (name) return name;
    }
  }

  return nameFromEmail(senderEmail);
};

const parseSnapshot = (raw: unknown): ExportSnapshot => {
  const row = isPlainObject(raw) ? raw : {};
  return {
    scopeLabel: clampText(row.scopeLabel, 80) || "Vlastní produkce",
    dateRangeLabel: clampText(row.dateRangeLabel, 80) || "Aktuální období",
    periodFrom: clampText(row.periodFrom, 50) || "N/A",
    periodTo: clampText(row.periodTo, 50) || "N/A",
    generatedLabel: clampText(row.generatedLabel, 80) || "N/A",
    adviserName: clampText(row.adviserName, 120) || "Poradce",
    adviserEmail: clampText(row.adviserEmail, 120) || "",
    selectedCategoryLabel: clampText(row.selectedCategoryLabel, 120) || "Všechny kategorie",
    selectedAdvisersLabel: clampText(row.selectedAdvisersLabel, 120) || "Bez týmu",
    totalContracts: parseNonNegativeInt(row.totalContracts),
    totalAnnual: parseNonNegativeNumber(row.totalAnnual),
    lifeContracts: parseNonNegativeInt(row.lifeContracts),
    lifeAnnual: parseNonNegativeNumber(row.lifeAnnual),
    nonLifeContracts: parseNonNegativeInt(row.nonLifeContracts),
    nonLifeAnnual: parseNonNegativeNumber(row.nonLifeAnnual),
    autoContracts: parseNonNegativeInt(row.autoContracts),
    autoAnnual: parseNonNegativeNumber(row.autoAnnual),
    propertyContracts: parseNonNegativeInt(row.propertyContracts),
    propertyAnnual: parseNonNegativeNumber(row.propertyAnnual),
    goldContracts: parseNonNegativeInt(row.goldContracts),
    goldTotal: parseNonNegativeNumber(row.goldTotal),
    topProductName: clampText(row.topProductName, 120),
    topProductAnnual: parseNonNegativeNumber(row.topProductAnnual),
  };
};

const parsePreviewHtml = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  const html = raw.trim();
  if (!html) return "";
  if (html.length > MAX_PREVIEW_HTML_LEN) {
    throw new Error("Náhled exportu je příliš velký pro sdílení.");
  }
  return html;
};

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:export-produkce:share:post",
    limit: EXPORT_SHARE_RATE_LIMIT,
    windowMs: EXPORT_SHARE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies ExportShareError,
        { status: 500 }
      ),
      ctx
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | {
          recipientEmail?: unknown;
          noteText?: unknown;
          previewHtml?: unknown;
          snapshot?: unknown;
        }
      | null;

    const recipientEmail = normalizeEmail(body?.recipientEmail);
    if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Vyber platného příjemce." } satisfies ExportShareError,
          { status: 400 }
        ),
        ctx
      );
    }

    const recipient = await loadUserByEmail(recipientEmail);
    if (!recipient) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Příjemce nebyl v systému nalezen." } satisfies ExportShareError,
          { status: 404 }
        ),
        ctx
      );
    }

    const snapshot = parseSnapshot(body?.snapshot);
    const previewHtml = parsePreviewHtml(body?.previewHtml);
    if (!previewHtml) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Náhled exportu chybí. Nejprve vygeneruj náhled a zkus to znovu." } satisfies ExportShareError,
          { status: 400 }
        ),
        ctx
      );
    }
    const noteText = clampText(body?.noteText, 240);
    const senderName = await resolveSenderName(ctx.email, ctx.uid);

    const sharedPreviewRef = adminDb.collection("mailboxSharedPayloads").doc();
    await sharedPreviewRef.set({
      type: "production_export_share",
      senderEmail: ctx.email,
      recipientEmail: recipient.email,
      html: previewHtml,
      createdAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });

    const withNote = noteText ? ` Zpráva: ${noteText}` : "";
    const bodyText =
      `${senderName} ti sdílel(a) export produkce (${snapshot.scopeLabel}, ${snapshot.dateRangeLabel}). ` +
      `Smluv: ${snapshot.totalContracts}, celkem: ${formatMoney(snapshot.totalAnnual)}.${withNote}`;

    const { written } = await writeMailboxEntries({
      recipientEmails: [recipient.email],
      type: "production_export_share",
      title: "Sdílený export produkce",
      body: bodyText,
      deepLink: "/pomucky/export-produkce",
      metadata: {
        senderEmail: ctx.email,
        senderName,
        payloadId: sharedPreviewRef.id,
        noteText,
        scopeLabel: snapshot.scopeLabel,
        dateRangeLabel: snapshot.dateRangeLabel,
        periodFrom: snapshot.periodFrom,
        periodTo: snapshot.periodTo,
        generatedLabel: snapshot.generatedLabel,
        adviserName: snapshot.adviserName,
        adviserEmail: snapshot.adviserEmail,
        selectedCategoryLabel: snapshot.selectedCategoryLabel,
        selectedAdvisersLabel: snapshot.selectedAdvisersLabel,
        totalContracts: snapshot.totalContracts,
        totalAnnual: Math.round(snapshot.totalAnnual),
        lifeContracts: snapshot.lifeContracts,
        lifeAnnual: Math.round(snapshot.lifeAnnual),
        nonLifeContracts: snapshot.nonLifeContracts,
        nonLifeAnnual: Math.round(snapshot.nonLifeAnnual),
        autoContracts: snapshot.autoContracts,
        autoAnnual: Math.round(snapshot.autoAnnual),
        propertyContracts: snapshot.propertyContracts,
        propertyAnnual: Math.round(snapshot.propertyAnnual),
        goldContracts: snapshot.goldContracts,
        goldTotal: Math.round(snapshot.goldTotal),
        topProductName: snapshot.topProductName,
        topProductAnnual: Math.round(snapshot.topProductAnnual),
      },
    });

    await writeMailboxEntries({
      recipientEmails: [ctx.email],
      type: "production_export_share",
      title: "Odeslaný export produkce",
      body: `Odeslal(a) jsi export produkce uživateli ${recipient.name}.`,
      deepLink: "/pomucky/export-produkce",
      read: true,
      metadata: {
        senderEmail: ctx.email,
        senderName,
        payloadId: sharedPreviewRef.id,
        mailboxDirection: "sent",
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        noteText,
        scopeLabel: snapshot.scopeLabel,
        dateRangeLabel: snapshot.dateRangeLabel,
        periodFrom: snapshot.periodFrom,
        periodTo: snapshot.periodTo,
        generatedLabel: snapshot.generatedLabel,
        adviserName: snapshot.adviserName,
        adviserEmail: snapshot.adviserEmail,
        selectedCategoryLabel: snapshot.selectedCategoryLabel,
        selectedAdvisersLabel: snapshot.selectedAdvisersLabel,
        totalContracts: snapshot.totalContracts,
        totalAnnual: Math.round(snapshot.totalAnnual),
        lifeContracts: snapshot.lifeContracts,
        lifeAnnual: Math.round(snapshot.lifeAnnual),
        nonLifeContracts: snapshot.nonLifeContracts,
        nonLifeAnnual: Math.round(snapshot.nonLifeAnnual),
        autoContracts: snapshot.autoContracts,
        autoAnnual: Math.round(snapshot.autoAnnual),
        propertyContracts: snapshot.propertyContracts,
        propertyAnnual: Math.round(snapshot.propertyAnnual),
        goldContracts: snapshot.goldContracts,
        goldTotal: Math.round(snapshot.goldTotal),
        topProductName: snapshot.topProductName,
        topProductAnnual: Math.round(snapshot.topProductAnnual),
      },
    });

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        written,
      } satisfies ExportShareSuccess),
      ctx
    );
  } catch (error) {
    console.error("POST /api/export-produkce/share failed", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Export produkce se nepodařilo odeslat." } satisfies ExportShareError,
        { status: 500 }
      ),
      ctx
    );
  }
}
