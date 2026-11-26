import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { LIFE_COMMISSION_REMINDER_TYPE, parseLifeCommissionReminderContracts } from "@/app/lib/lifeCommissionReminder";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { lifeCommissionReminderId } from "@/lib/server/lifeCommissionReminderId";
import { openPrivateRecord } from "@/lib/server/privateRecords";
import { getTodayIsoInPrague } from "@/lib/subscriptionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function ownReminder(data: Record<string, unknown> | undefined, email: string) {
  return data?.type === LIFE_COMMISSION_REMINDER_TYPE && data.recipientEmail === email;
}

async function handle(req: NextRequest, acknowledge: boolean) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: `api:mailbox:life-commission-reminder:${acknowledge ? "acknowledge" : "read"}`,
    limit: acknowledge ? 20 : 90,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const respond = (body: Record<string, unknown>, status?: number) => withRateLimitHeaders(json(body, status), ctx);
  if (ctx.isImpersonating) return respond({ ok: false, error: "Přístup k připomínce je zakázán." }, 403);
  const db = adminDb;
  if (!db) return respond({ ok: false, error: "Připomínka je dočasně nedostupná." }, 503);

  const id = lifeCommissionReminderId(ctx.uid, getTodayIsoInPrague().slice(0, 7));
  const ref = db.collection("usersPrivate").doc(ctx.email).collection("mailbox").doc(id);
  try {
    if (!acknowledge) {
      const data = (await ref.get()).data();
      if (!ownReminder(data, ctx.email) || !data || data.lifeCommissionAcknowledgedAtMs) return respond({ ok: true, reminder: null });
      const message = openPrivateRecord(ref.path, data);
      const metadata = message.metadata as Record<string, unknown> | null | undefined;
      const contracts = parseLifeCommissionReminderContracts(metadata?.lifeCommissionContracts);
      if (!contracts.length || typeof message.title !== "string" || typeof message.body !== "string") return respond({ ok: true, reminder: null });
      return respond({ ok: true, reminder: { id, title: message.title, body: message.body, contracts } });
    }

    const payload: unknown = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object" || !("id" in payload) || payload.id !== id) {
      return respond({ ok: false, error: "Neplatná připomínka." }, 400);
    }
    const found = await db.runTransaction(async transaction => {
      const data = (await transaction.get(ref)).data();
      if (!ownReminder(data, ctx.email) || !data) return false;
      if (!data.lifeCommissionAcknowledgedAtMs) {
        const nowMs = Date.now();
        transaction.update(ref, { lifeCommissionAcknowledgedAtMs: nowMs,
          ...(data.read === true ? {} : { read: true, readAtMs: nowMs, readAt: FieldValue.serverTimestamp() }),
        });
      }
      return true;
    });
    return found ? respond({ ok: true }) : respond({ ok: false, error: "Připomínka nebyla nalezena." }, 404);
  } catch {
    return respond({ ok: false, error: "Připomínku se nepodařilo zpracovat." }, 500);
  }
}

export function GET(req: NextRequest) {
  return handle(req, false);
}

export function PATCH(req: NextRequest) {
  return handle(req, true);
}
