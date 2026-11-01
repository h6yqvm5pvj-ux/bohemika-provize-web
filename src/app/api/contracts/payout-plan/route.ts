import { NextRequest, NextResponse } from "next/server";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { normalizedPayoutEmail } from "@/app/cashflow/payoutPlanMatching";

export const runtime = "nodejs";

/** Retained for older clients; C payouts are now matched automatically by code. */
export async function POST(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:payout-plan", limit: 60, windowMs: 60_000,
  }, { freshCashflowContext: true });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  const response = (data: unknown, status: number) => withRateLimit(NextResponse.json(data, {
    status, headers: { "Cache-Control": "no-store" },
  }));
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return response({ ok: false, error: "Neplatný požadavek." }, 400); }
  const owner = typeof body.ownerEmail === "string" ? normalizedPayoutEmail(body.ownerEmail) : "";
  const allowed = new Set([normalizedPayoutEmail(ctx.email), ...ctx.contractAccessEmails.map(normalizedPayoutEmail)]);
  if (!owner || !allowed.has(owner)) return response({ ok: false, error: "Ke smlouvě nemáš přístup." }, 403);
  if (typeof body.entryId !== "string" || !/^[\w-]{1,200}$/.test(body.entryId) ||
    !["preview", "assign", "remove"].includes(String(body.operation))) {
    return response({ ok: false, error: "Neplatná smlouva nebo operace." }, 400);
  }
  // No financial data is read or changed, including legacy saved associations.
  return response({ ok: false, error: "C výplaty se do cashflow promítají automaticky podle kódu. Ruční přiřazování již není dostupné." }, 410);
}
