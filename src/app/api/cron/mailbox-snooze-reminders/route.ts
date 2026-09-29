import { isAuthorizedWebCronRequest } from "@/lib/server/webCronAuth";

import { NextResponse, type NextRequest } from "next/server";

import { runDueMailboxSnoozeReminders } from "@/lib/server/mailboxSnoozeReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthorizedWebCronRequest(req))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request." },
      { status: 401 }
    );
  }

  try {
    const result = await runDueMailboxSnoozeReminders(req);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Mailbox snooze reminders cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se zpracovat připomínky odložených zpráv." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
