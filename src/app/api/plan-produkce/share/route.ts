import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_SHARE_RATE_LIMIT = 60;
const PLAN_SHARE_RATE_LIMIT_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PlanShareSuccess = {
  ok: true;
  recipientEmail: string;
  recipientName: string;
  written: number;
};

type PlanShareError = {
  ok: false;
  error: string;
};

type PlanSnapshot = {
  lifeContracts: number;
  lifePremium: number;
  autoContracts: number;
  autoPremium: number;
  propertyContracts: number;
  propertyPremium: number;
  totalImmediate: number;
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

const parsePlanSnapshot = (raw: unknown): PlanSnapshot => {
  const row = isPlainObject(raw) ? raw : {};
  return {
    lifeContracts: parseNonNegativeInt(row.lifeContracts),
    lifePremium: parseNonNegativeNumber(row.lifePremium),
    autoContracts: parseNonNegativeInt(row.autoContracts),
    autoPremium: parseNonNegativeNumber(row.autoPremium),
    propertyContracts: parseNonNegativeInt(row.propertyContracts),
    propertyPremium: parseNonNegativeNumber(row.propertyPremium),
    totalImmediate: parseNonNegativeNumber(row.totalImmediate),
  };
};

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:plan-produkce:share:post",
    limit: PLAN_SHARE_RATE_LIMIT,
    windowMs: PLAN_SHARE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies PlanShareError,
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
          plan?: unknown;
        }
      | null;

    const recipientEmail = normalizeEmail(body?.recipientEmail);
    if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Vyber platného příjemce." } satisfies PlanShareError,
          { status: 400 }
        ),
        ctx
      );
    }

    const recipient = await loadUserByEmail(recipientEmail);
    if (!recipient) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Příjemce nebyl v systému nalezen." } satisfies PlanShareError,
          { status: 404 }
        ),
        ctx
      );
    }

    const plan = parsePlanSnapshot(body?.plan);
    const noteText = clampText(body?.noteText, 240);
    const senderName = await resolveSenderName(ctx.email, ctx.uid);
    const withNote = noteText ? ` Zpráva: ${noteText}` : "";
    const bodyText = `${senderName} ti sdílel(a) plán produkce. Odhad okamžité provize: ${formatMoney(
      plan.totalImmediate
    )}.${withNote}`;

    const { written } = await writeMailboxEntries({
      recipientEmails: [recipient.email],
      type: "production_plan_share",
      title: "Sdílený plán produkce",
      body: bodyText,
      deepLink: "/pomucky/plan-produkce",
      metadata: {
        senderEmail: ctx.email,
        senderName,
        noteText,
        lifeContracts: plan.lifeContracts,
        lifePremium: Math.round(plan.lifePremium),
        autoContracts: plan.autoContracts,
        autoPremium: Math.round(plan.autoPremium),
        propertyContracts: plan.propertyContracts,
        propertyPremium: Math.round(plan.propertyPremium),
        totalImmediate: Math.round(plan.totalImmediate),
      },
    });

    await writeMailboxEntries({
      recipientEmails: [ctx.email],
      type: "production_plan_share",
      title: "Odeslaný plán produkce",
      body: `Odeslal(a) jsi plán produkce uživateli ${recipient.name}.`,
      deepLink: "/pomucky/plan-produkce",
      read: true,
      metadata: {
        senderEmail: ctx.email,
        senderName,
        mailboxDirection: "sent",
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        noteText,
        lifeContracts: plan.lifeContracts,
        lifePremium: Math.round(plan.lifePremium),
        autoContracts: plan.autoContracts,
        autoPremium: Math.round(plan.autoPremium),
        propertyContracts: plan.propertyContracts,
        propertyPremium: Math.round(plan.propertyPremium),
        totalImmediate: Math.round(plan.totalImmediate),
      },
    });

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        written,
      } satisfies PlanShareSuccess),
      ctx
    );
  } catch (error) {
    console.error("POST /api/plan-produkce/share failed", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Plán produkce se nepodařilo odeslat." } satisfies PlanShareError,
        { status: 500 }
      ),
      ctx
    );
  }
}
