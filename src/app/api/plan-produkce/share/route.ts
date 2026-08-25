import { NextResponse, type NextRequest } from "next/server";

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

const PLAN_SHARE_RATE_LIMIT = 60;
const PLAN_SHARE_RATE_LIMIT_WINDOW_MS = 60_000;

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
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:plan-produkce:share:post",
    limit: PLAN_SHARE_RATE_LIMIT,
    windowMs: PLAN_SHARE_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
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
    if (!isValidEmail(recipientEmail)) {
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
