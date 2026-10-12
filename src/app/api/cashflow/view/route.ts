import { NextResponse, type NextRequest } from "next/server";
import { createCashflowModel } from "@/app/cashflow/cashflowModel";
import { parseCashflowServerRequest, CASHFLOW_SERVER_PILOT_VERSION, type CashflowServerFallbackReason, type CashflowServerResourceLimit } from "@/app/cashflow/cashflowServerProtocol";
import { serializeCashflowSnapshot } from "@/app/cashflow/cashflowSnapshotWire";
import { hashCashflowValue } from "@/app/cashflow/shadowProtocol";
import { cashflowCalendarDate, isCashflowCalendarCurrent } from "@/lib/server/cashflowCalendar";
import { requireAuthedRateLimited } from "@/lib/server/apiEntryGuard";
import { createCashflowDiagnosticTiming, readCashflowDiagnosticJson } from "@/lib/server/cashflowDiagnosticHttp";
import { CashflowShadowInputsError, loadCashflowShadowInputs } from "@/lib/server/cashflowShadowInputs";
import { cashflowShadowBudgetFailure } from "@/lib/server/cashflowShadowBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only pilot. No result cache and no changes to business records. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const timing = createCashflowDiagnosticTiming();
  const json = timing.json;
  const unavailable = (status = 503, reason?: CashflowServerFallbackReason, resourceLimit?: CashflowServerResourceLimit) =>
    json({ ok: false, error: "Cashflow není dostupné.", ...(reason ? { reason } : {}),
      ...(reason === "resource_limit" && resourceLimit ? { resourceLimit } : {}) }, status);
  const allowed = new Set((process.env.CASHFLOW_SERVER_PILOT_EMAILS ?? "")
    .split(/[,\s]+/).map(email => email.trim().toLowerCase()).filter(Boolean));
  if (process.env.CASHFLOW_SERVER_PILOT_ENABLED !== "1" || !allowed.size) return unavailable(404);

  try {
    const auth = await timing.measure("auth", () => requireAuthedRateLimited(req, {
      namespace: "api:cashflow:view", limit: 12, windowMs: 60_000,
      allowImpersonation: false, enforceAdvisorSetup: false,
    }));
    if (!auth.ok) {
      const response = unavailable(auth.response.status);
      const retry = auth.response.headers.get("Retry-After");
      if (retry) response.headers.set("Retry-After", retry);
      return response;
    }
    if (!allowed.has(auth.ctx.email)) return unavailable(403);
    const body = parseCashflowServerRequest(await readCashflowDiagnosticJson(req));
    if (!body) return unavailable(400);
    const asOf = cashflowCalendarDate(body.asOfMs, body.timeZone);
    if (!asOf) return unavailable(409, "time_zone");
    if (!isCashflowCalendarCurrent(asOf)) return unavailable(409, "stale_context");

    const inputs = await timing.measure("inputs", () => loadCashflowShadowInputs(req, {
      freshCashflowContext: true,
      onSourceTiming: timing.recordInput,
      authorizeEmail: email => email === auth.ctx.email && allowed.has(email),
    }));
    if (inputs.effectiveEmail !== auth.ctx.email || inputs.snapshot.email !== auth.ctx.email) return unavailable(403);
    if (inputs.tipsterMode !== body.options.tipsterMode) return unavailable(409);
    if (req.signal.aborted) return unavailable(409, "cancelled");
    if (!isCashflowCalendarCurrent(asOf)) return unavailable(409, "stale_context");
    const resourceLimit = cashflowShadowBudgetFailure(inputs.snapshot, asOf,
      body.options.intelligentPredictionEnabled && !body.options.tipsterMode, body.options);
    if (resourceLimit) return unavailable(503, "resource_limit", resourceLimit);
    const inputHash = await timing.measure("hash", () => hashCashflowValue({ snapshot: inputs.snapshot, statements: inputs.statements }));
    // Never replace a view from another data version or accept a partially read portfolio.
    if (inputHash !== body.inputHash) return unavailable(409, "different_inputs");
    const model = createCashflowModel({ snapshot: inputs.snapshot, statements: inputs.statements, asOf });
    try {
      const overview = await timing.measure("compute", () => model.view(body.options));
      const verification = await timing.measure("hash", () => model.verification!());
      if (req.signal.aborted) return unavailable(409, "cancelled");
      if (!isCashflowCalendarCurrent(asOf)) return unavailable(409, "stale_context");
      const context = { ok: true, version: CASHFLOW_SERVER_PILOT_VERSION, kind: body.kind, ...verification };
      if (body.kind === "view") return json({ ...context, overview });
      const month = model.month(body.monthKey!);
      return json({ ...context, monthKey: body.monthKey,
        payload: serializeCashflowSnapshot({ items: [], months: month ? [month] : [] }),
      });
    } finally { model.dispose(); }
  } catch (error) {
    if (error instanceof CashflowShadowInputsError && [401, 403, 429].includes(error.status)) return unavailable(error.status);
    if (error instanceof CashflowShadowInputsError) {
      const reason = error.code === "incomplete" ? "incomplete_inputs" : error.code === "limit" ? "resource_limit"
        : error.code === "timeout" ? "timeout" : error.code === "aborted" ? "cancelled" : "unavailable";
      return unavailable(503, reason, error.code === "limit" ? "input_requests" : undefined);
    }
    // No upstream messages, portfolio, account identifiers or financial amounts in logs/errors.
    return unavailable();
  }
}
