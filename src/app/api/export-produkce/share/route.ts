import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import {
  clampText,
  formatMoney,
  isPlainObject,
  isValidEmail,
  loadUserByEmail,
  normalizeEmail,
  parseNonNegativeInt,
  parseNonNegativeNumber,
  resolveSenderName,
} from "@/lib/server/productionShare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_SHARE_RATE_LIMIT = 60;
const EXPORT_SHARE_RATE_LIMIT_WINDOW_MS = 60_000;

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

export async function POST(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:export-produkce:share:post",
    limit: EXPORT_SHARE_RATE_LIMIT,
    windowMs: EXPORT_SHARE_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
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
          snapshot?: unknown;
        }
      | null;

    const recipientEmail = normalizeEmail(body?.recipientEmail);
    if (!isValidEmail(recipientEmail)) {
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
    const noteText = clampText(body?.noteText, 240);
    const senderName = await resolveSenderName(ctx.email, ctx.uid);

    const sharedPreviewRef = adminDb.collection("mailboxSharedPayloads").doc();
    const createdAtMs = Date.now();

    await sharedPreviewRef.set({
      type: "production_export_share",
      senderEmail: ctx.email,
      senderName,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      noteText,
      previewStorage: "structured",
      snapshot,
      createdAtMs,
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
