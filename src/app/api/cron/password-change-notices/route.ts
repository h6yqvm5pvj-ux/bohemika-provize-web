import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { retryPasswordChangedNotices } from "@/lib/server/passwordChangeEmail";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  const expected = Buffer.from((process.env.CRON_SECRET ?? "").trim());
  const supplied = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /i, ""));
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try { return NextResponse.json({ ok: true, ...await retryPasswordChangedNotices() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
