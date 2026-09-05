import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runContractNoteReminders } from "@/lib/server/contractNoteReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timingSafeStringEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const isAuthorizedCronRequest = (req: NextRequest): boolean => {
  const expectedSecret = (process.env.CRON_SECRET ?? "").trim();
  if (!expectedSecret) return process.env.NODE_ENV !== "production";
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;
  const received = authorization.slice(7).trim();
  return Boolean(received && timingSafeStringEquals(received, expectedSecret));
};

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }
  try {
    return NextResponse.json(await runContractNoteReminders(req));
  } catch (error) {
    console.error("Contract note reminders cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se zpracovat připomínky ke smlouvám." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
