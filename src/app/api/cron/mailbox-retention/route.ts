import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanupExpiredSystemMailbox } from "@/lib/server/mailboxRetention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const expected = Buffer.from((process.env.CRON_SECRET ?? "").trim());
  const header = req.headers.get("authorization") ?? "";
  const supplied = Buffer.from(/^Bearer /i.test(header) ? header.slice(7).trim() : "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await cleanupExpiredSystemMailbox({ dryRun: new URL(req.url).searchParams.get("dryRun") === "1" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never put document content, paths or provider diagnostics in cron logs.
    console.error("Mailbox retention cleanup failed.");
    return NextResponse.json({ ok: false, error: "Čištění systémových oznámení se nepodařilo dokončit." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
