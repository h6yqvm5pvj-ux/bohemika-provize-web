import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
const EMAIL_VERIFICATION_RATE_LIMIT = 3;
const EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_EMAIL_VERIFICATION_SUBJECT = "Ověření e-mailu";

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: Request) {
  try {
    if (!adminAuth) {
      return NextResponse.json(
        { ok: false, error: "Server není nakonfigurovaný (Firebase Admin)." },
        { status: 500 }
      );
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing bearer token" },
        { status: 401 }
      );
    }

    let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const email = decoded.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "User email missing in token" },
        { status: 400 }
      );
    }
    const lockout = await getLoginAttemptLockoutError(req, email);
    if (lockout) {
      const response = NextResponse.json(
        { ok: false, error: lockout.error },
        { status: lockout.status }
      );
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }
    if (decoded.email_verified === true) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:email-verification-link:post",
      key: email,
      limit: EMAIL_VERIFICATION_RATE_LIMIT,
      windowMs: EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser || undefined;
    const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.forpsi.com";
    const smtpPortRaw = process.env.SMTP_PORT?.trim() || "587";
    const smtpPort = Number(smtpPortRaw);

    if (!smtpUser || !smtpPass || !smtpFrom) {
      return NextResponse.json(
        { ok: false, error: "SMTP není správně nakonfigurované." },
        { status: 500 }
      );
    }
    if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
      return NextResponse.json(
        { ok: false, error: "Neplatná konfigurace SMTP portu." },
        { status: 500 }
      );
    }

    const actionContinueUrl = process.env.EMAIL_VERIFICATION_CONTINUE_URL?.trim();
    const actionCodeSettings = actionContinueUrl
      ? { url: actionContinueUrl, handleCodeInApp: false }
      : undefined;

    const link = await adminAuth.generateEmailVerificationLink(
      email,
      actionCodeSettings
    );

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const escapedLink = htmlEscape(link);
    const textBody = [
      "Ahoj,",
      "",
      "pro ověření e-mailu klikni na tento odkaz:",
      link,
      "",
      "Pokud jsi o ověření nežádal(a), tento e-mail ignoruj.",
    ].join("\n");
    const htmlBody = [
      "<p>Ahoj,</p>",
      "<p>pro ověření e-mailu klikni na tento odkaz:</p>",
      `<p><a href="${escapedLink}">${escapedLink}</a></p>`,
      "<p>Pokud jsi o ověření nežádal(a), tento e-mail ignoruj.</p>",
    ].join("");

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: process.env.EMAIL_VERIFICATION_SUBJECT?.trim() || DEFAULT_EMAIL_VERIFICATION_SUBJECT,
      text: textBody,
      html: htmlBody,
    });

    const response = NextResponse.json({ ok: true, sent: true });
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (error) {
    console.error("email-verification-link error", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se odeslat ověřovací e-mail." },
      { status: 500 }
    );
  }
}
