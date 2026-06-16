import { NextResponse, type NextRequest } from "next/server";

import {
  adminAuthErrorResponse,
  getAdminAuthContext,
} from "@/lib/server/adminAuth";
import {
  parseAdminBroadcastPayload,
  scheduleAdminBroadcast,
  sendAdminBroadcastNow,
} from "@/lib/server/adminBroadcastNotifications";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiError = { ok: false; error: string };

export async function POST(req: NextRequest) {
  const ctx = await getAdminAuthContext(req, {
    minimumRole: "admin",
    actionLabel: "odeslání hromadné notifikace",
  });
  if ("error" in ctx) {
    return adminAuthErrorResponse(ctx);
  }

  if (!adminDb || !adminMessaging) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Messaging)." } satisfies ApiError,
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const payload = parseAdminBroadcastPayload(body, req);
  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Vyplň nadpis, text notifikace, platné příjemce, cílovou stránku a případně budoucí čas naplánování.",
      } satisfies ApiError,
      { status: 400 }
    );
  }

  try {
    const actor = {
      adminEmail: ctx.adminEmail,
      adminUid: ctx.adminUid,
    };

    if (payload.scheduledAtIso) {
      const scheduled = await scheduleAdminBroadcast(payload, actor, req);
      return NextResponse.json({
        ok: true,
        scheduled: true,
        broadcastId: scheduled.broadcastId,
        scheduledBroadcastId: scheduled.scheduledBroadcastId,
        scheduledAtIso: scheduled.scheduledAtIso,
      });
    }

    const result = await sendAdminBroadcastNow(payload, actor, req);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Hromadnou notifikaci se nepodařilo odeslat.",
          broadcastId: result.broadcastId,
          scannedUsers: result.scannedUsers,
          matchedUsers: result.matchedUsers,
          recipients: result.recipients,
          uniqueTokens: result.uniqueTokens,
          sent: result.sent,
          failed: result.failed,
          skippedPushDisabled: result.skippedPushDisabled,
          skippedNoToken: result.skippedNoToken,
          cleanedTokens: result.cleanedTokens,
        },
        { status: result.statusCode ?? 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      scheduled: false,
      broadcastId: result.broadcastId,
      scannedUsers: result.scannedUsers,
      matchedUsers: result.matchedUsers,
      recipients: result.recipients,
      uniqueTokens: result.uniqueTokens,
      sent: result.sent,
      failed: result.failed,
      skippedPushDisabled: result.skippedPushDisabled,
      skippedNoToken: result.skippedNoToken,
      cleanedTokens: result.cleanedTokens,
    });
  } catch (error) {
    console.error("POST /api/admin/broadcast-notification selhalo:", error);
    return NextResponse.json(
      { ok: false, error: "Hromadnou notifikaci se nepodařilo odeslat." } satisfies ApiError,
      { status: 502 }
    );
  }
}
