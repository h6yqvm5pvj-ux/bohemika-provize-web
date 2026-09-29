import { isAuthorizedWebCronRequest } from "@/lib/server/webCronAuth";

import { NextResponse, type NextRequest } from "next/server";

import { runDueScheduledAdminBroadcasts } from "@/lib/server/adminBroadcastNotifications";

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
    const result = await runDueScheduledAdminBroadcasts(req);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Admin scheduled broadcasts cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se zpracovat naplánované notifikace." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
