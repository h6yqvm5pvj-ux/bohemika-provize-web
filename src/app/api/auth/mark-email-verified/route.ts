import { NextResponse } from "next/server";

import {
  adminAuthErrorResponse,
  getAdminAuthContext,
} from "@/lib/server/adminAuth";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const MARK_EMAIL_VERIFIED_RATE_LIMIT = 5;
const MARK_EMAIL_VERIFIED_WINDOW_MS = 60_000;

type MarkEmailVerifiedBody = {
  targetUid?: unknown;
  targetEmail?: unknown;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

export async function POST(req: Request) {
  try {
    if (!adminAuth) {
      return NextResponse.json(
        { ok: false, error: "Server není nakonfigurovaný (Firebase Admin)." },
        { status: 500 }
      );
    }

    const ctx = await getAdminAuthContext(req, {
      minimumRole: "admin",
      actionLabel: "ruční ověření e-mailu",
    });
    if ("error" in ctx) return adminAuthErrorResponse(ctx);

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:mark-email-verified:post",
      key: ctx.adminUid,
      limit: MARK_EMAIL_VERIFIED_RATE_LIMIT,
      windowMs: MARK_EMAIL_VERIFIED_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const body = ((await req.json().catch(() => null)) ?? {}) as MarkEmailVerifiedBody;
    const targetUidRaw = normalizeText(body.targetUid);
    const targetEmail = normalizeEmail(body.targetEmail);

    let targetUid = targetUidRaw;
    if (!targetUid && targetEmail) {
      const targetUser = await adminAuth.getUserByEmail(targetEmail).catch(() => null);
      targetUid = targetUser?.uid ?? "";
    }

    if (!targetUid) {
      return NextResponse.json(
        { ok: false, error: "Chybí targetUid nebo targetEmail." },
        { status: 400 }
      );
    }

    const targetUser = await adminAuth.getUser(targetUid).catch(() => null);
    if (!targetUser) {
      return NextResponse.json(
        { ok: false, error: "Cílový uživatel nebyl nalezen." },
        { status: 404 }
      );
    }

    if (!targetUser.emailVerified) {
      await adminAuth.updateUser(targetUid, { emailVerified: true });
    }

    const response = NextResponse.json({
      ok: true,
      emailVerified: true,
      targetUid,
      targetEmail: targetUser.email ?? targetEmail,
    });
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (error) {
    console.error("mark-email-verified error", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se označit e-mail jako ověřený." },
      { status: 500 }
    );
  }
}
