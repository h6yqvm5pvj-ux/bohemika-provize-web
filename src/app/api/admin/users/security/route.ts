import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";

import { adminAuth } from "@/lib/server/firebaseAdmin";
import {
  adminAuthErrorResponse,
  getAdminAuthContext,
} from "@/lib/server/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const PASSWORD_RESET_SUBJECT = "Obnovení hesla";

type AdminUserSecurityAction =
  | "sendPasswordReset"
  | "resetMfa"
  | "verifyEmail"
  | "revokeSessions";

type ApiError = { ok: false; error: string };

const SECURITY_ACTIONS = new Set<AdminUserSecurityAction>([
  "sendPasswordReset",
  "resetMfa",
  "verifyEmail",
  "revokeSessions",
]);

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeAction(value: unknown): AdminUserSecurityAction | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return SECURITY_ACTIONS.has(raw as AdminUserSecurityAction)
    ? (raw as AdminUserSecurityAction)
    : null;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendPasswordResetEmail(email: string) {
  if (!adminAuth) {
    throw new Error("Firebase Admin Auth není nakonfigurovaný.");
  }

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser || undefined;
  const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.forpsi.com";
  const smtpPortRaw = process.env.SMTP_PORT?.trim() || "587";
  const smtpPort = Number(smtpPortRaw);

  if (!smtpUser || !smtpPass || !smtpFrom) {
    throw new Error("SMTP není správně nakonfigurované.");
  }
  if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
    throw new Error("Neplatná konfigurace SMTP portu.");
  }

  const actionContinueUrl = process.env.PASSWORD_RESET_CONTINUE_URL?.trim();
  const actionCodeSettings = actionContinueUrl
    ? { url: actionContinueUrl, handleCodeInApp: false }
    : undefined;
  const link = await adminAuth.generatePasswordResetLink(email, actionCodeSettings);
  const escapedLink = htmlEscape(link);

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const textBody = [
    "Ahoj,",
    "",
    "pro obnovení hesla klikni na tento odkaz:",
    link,
    "",
    "Pokud jsi o obnovení hesla nežádal(a), tento e-mail ignoruj.",
  ].join("\n");
  const htmlBody = [
    "<p>Ahoj,</p>",
    "<p>pro obnovení hesla klikni na tento odkaz:</p>",
    `<p><a href="${escapedLink}">${escapedLink}</a></p>`,
    "<p>Pokud jsi o obnovení hesla nežádal(a), tento e-mail ignoruj.</p>",
  ].join("");

  await transporter.sendMail({
    from: smtpFrom,
    to: email,
    subject: process.env.PASSWORD_RESET_SUBJECT?.trim() || PASSWORD_RESET_SUBJECT,
    text: textBody,
    html: htmlBody,
  });
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAdminAuthContext(req, {
      minimumRole: "admin",
      actionLabel: "správu zabezpečení uživatele",
    });
    if ("error" in ctx) return adminAuthErrorResponse(ctx);

    if (!adminAuth) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies ApiError,
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => null)) as
      | { targetEmail?: unknown; action?: unknown }
      | null;
    const targetEmail = normalizeEmail(body?.targetEmail);
    const action = normalizeAction(body?.action);

    if (!targetEmail || !EMAIL_RE.test(targetEmail)) {
      return NextResponse.json(
        { ok: false, error: "Zadej platný e-mail uživatele." } satisfies ApiError,
        { status: 400 }
      );
    }
    if (!action) {
      return NextResponse.json(
        { ok: false, error: "Chybí platná bezpečnostní akce." } satisfies ApiError,
        { status: 400 }
      );
    }

    const targetUser = await adminAuth
      .getUserByEmail(targetEmail)
      .catch((error: { code?: string }) => {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      });
    if (!targetUser) {
      return NextResponse.json(
        { ok: false, error: "Cílový uživatel nebyl nalezen." } satisfies ApiError,
        { status: 404 }
      );
    }

    if (
      targetUser.uid === ctx.adminUid &&
      (action === "resetMfa" || action === "revokeSessions")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tuhle bezpečnostní akci nelze provést na vlastním admin účtu.",
        } satisfies ApiError,
        { status: 400 }
      );
    }

    if (action === "sendPasswordReset") {
      await sendPasswordResetEmail(targetEmail);
      return NextResponse.json({
        ok: true,
        action,
        targetEmail,
        message: "E-mail pro obnovení hesla byl odeslán.",
      });
    }

    if (action === "verifyEmail") {
      if (!targetUser.emailVerified) {
        await adminAuth.updateUser(targetUser.uid, { emailVerified: true });
      }
      return NextResponse.json({
        ok: true,
        action,
        targetEmail,
        emailVerified: true,
        message: "E-mail uživatele byl označen jako ověřený.",
      });
    }

    if (action === "resetMfa") {
      const beforeFactorCount =
        targetUser.multiFactor?.enrolledFactors?.length ?? 0;
      await adminAuth.updateUser(targetUser.uid, {
        multiFactor: {
          enrolledFactors: null,
        },
      });
      await adminAuth.revokeRefreshTokens(targetUser.uid);
      return NextResponse.json({
        ok: true,
        action,
        targetEmail,
        beforeFactorCount,
        afterFactorCount: 0,
        refreshTokensRevoked: true,
        message: "2FA faktory byly odstraněny a relace zneplatněny.",
      });
    }

    await adminAuth.revokeRefreshTokens(targetUser.uid);
    return NextResponse.json({
      ok: true,
      action,
      targetEmail,
      refreshTokensRevoked: true,
      message: "Aktivní relace uživatele byly zneplatněny.",
    });
  } catch (error) {
    console.error("POST /api/admin/users/security selhalo:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "Bezpečnostní akci se nepodařilo provést.";
    return NextResponse.json(
      { ok: false, error: message } satisfies ApiError,
      { status: 500 }
    );
  }
}
