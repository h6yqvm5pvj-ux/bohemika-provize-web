// src/app/api/send-email/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

type RequestBody = {
  to?: string;
  subject?: string;
  text?: string;
  pdfBase64?: string;
  filename?: string;
};

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB
const SEND_EMAIL_RATE_LIMIT = 5;
const SEND_EMAIL_RATE_LIMIT_WINDOW_MS = 60_000;

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function sanitizePdfBase64(value: string): string {
  return value.replace(/^data:application\/pdf;base64,/i, "").trim();
}

export async function POST(req: Request) {
  try {
    if (!adminAuth) {
      return NextResponse.json(
        { error: "Server není nakonfigurovaný (chybí Firebase Admin)." },
        { status: 500 }
      );
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const senderEmail = decoded.email?.trim().toLowerCase();
    if (!senderEmail) {
      return NextResponse.json({ error: "User e-mail missing in token" }, { status: 401 });
    }

    const rateLimitResult = consumeRateLimit({
      namespace: "api:send-email:post",
      key: senderEmail,
      limit: SEND_EMAIL_RATE_LIMIT,
      windowMs: SEND_EMAIL_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const to = body.to?.trim();
    const subject = body.subject?.trim() || "Pozvánka";
    const text = body.text?.trim() || "";
    const pdfBase64Raw = body.pdfBase64?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim() || smtpUser || undefined;
    const filename = body.filename?.trim() || "priloha.pdf";

    if (!to) {
      return NextResponse.json({ error: "Missing recipient" }, { status: 400 });
    }
    if (!pdfBase64Raw) {
      return NextResponse.json({ error: "Missing PDF data" }, { status: 400 });
    }
    if (!smtpUser || !smtpPass) {
      return NextResponse.json(
        { error: "SMTP credentials are not provided." },
        { status: 400 }
      );
    }

    const { SMTP_HOST, SMTP_PORT } = process.env;
    const host = SMTP_HOST || "smtp.forpsi.com";
    const port = Number(SMTP_PORT || 587);

    if (!host || !Number.isFinite(port) || port <= 0) {
      return NextResponse.json(
        { error: "SMTP server is not configured." },
        { status: 500 }
      );
    }

    const pdfBase64 = sanitizePdfBase64(pdfBase64Raw);
    const estimatedBytes = Math.floor((pdfBase64.length * 3) / 4);
    if (estimatedBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "PDF attachment is too large." },
        { status: 413 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const buffer = Buffer.from(pdfBase64, "base64");
    if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "PDF attachment is invalid or too large." },
        { status: 400 }
      );
    }

    await transporter.sendMail({
      from,
      replyTo: senderEmail,
      to,
      subject,
      text: text || "Posílám ti pozvánku v příloze.",
      attachments: [
          {
            filename,
            content: buffer,
            contentType: "application/pdf",
          },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("send-email error", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
