// src/app/api/send-email/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

type RequestBody = {
  to?: string;
  subject?: string;
  text?: string;
  pdfBase64?: string;
  smtpUser?: string;
  smtpPass?: string;
  from?: string;
  filename?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const to = body.to?.trim();
    const subject = body.subject?.trim() || "Pozvánka";
    const text = body.text?.trim() || "";
    const pdfBase64 = body.pdfBase64?.trim();
    const smtpUser = body.smtpUser?.trim() || process.env.SMTP_USER;
    const smtpPass = body.smtpPass?.trim() || process.env.SMTP_PASS;
    const from =
      body.from?.trim() || process.env.SMTP_FROM || smtpUser || undefined;
    const filename = body.filename?.trim() || "priloha.pdf";

    if (!to) {
      return NextResponse.json({ error: "Missing recipient" }, { status: 400 });
    }
    if (!pdfBase64) {
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

    if (!host || !port) {
      return NextResponse.json(
        { error: "SMTP server is not configured." },
        { status: 500 }
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

    await transporter.sendMail({
      from,
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
