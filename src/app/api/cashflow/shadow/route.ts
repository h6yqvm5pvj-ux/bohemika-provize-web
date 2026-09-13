import { NextResponse, type NextRequest } from "next/server";
import { computeCashflow } from "@/app/cashflow/computeCashflow";
import { buildCashflowView } from "@/app/cashflow/buildCashflowView";
import {
  CASHFLOW_SHADOW_VERSION,
  hashCashflowValue,
  isCashflowShadowContextCurrent,
  parseCashflowShadowRequest,
  type CashflowShadowResult,
} from "@/app/cashflow/shadowProtocol";
import { CashflowShadowInputsError, loadCashflowShadowInputs } from "@/lib/server/cashflowShadowInputs";
import { isCashflowShadowWithinBudget } from "@/lib/server/cashflowShadowBudget";
import { consumeRateLimit } from "@/lib/server/rateLimit";
import { requireAuthedRateLimited } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  beginCashflowCandidateBuild, cashflowCandidatesEnabled, verifyCashflowCandidateStorage,
} from "@/lib/server/cashflowCandidateVerification";
import {
  cashflowShadowAllowedEmails, readCashflowDiagnosticJson, createCashflowDiagnosticTiming,
} from "@/lib/server/cashflowDiagnosticHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ShadowRateLimitError extends Error {
  constructor(readonly retryAfter: number) { super("Shadow rate limit"); }
}

// Diagnostics only. Stored candidates are never returned as display data.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const timing = createCashflowDiagnosticTiming();
  const json = timing.json;
  const skipped = (reason: CashflowShadowResult["reason"]) => json({ ok: true, status: "skipped", reason } satisfies CashflowShadowResult);
  const allowedEmails = cashflowShadowAllowedEmails();
  if (process.env.CASHFLOW_SHADOW_ENABLED !== "1" || allowedEmails.size === 0) return skipped("disabled");

  const body = parseCashflowShadowRequest(await readCashflowDiagnosticJson(req));
  if (!body) return json({ ok: false, error: "Invalid shadow comparison request." }, 400);
  if (body.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) return skipped("time_zone");
  if (!isCashflowShadowContextCurrent(body.asOfMs)) return skipped("stale_context");

  try {
    const auth = await timing.measure("auth", () => requireAuthedRateLimited(req, {
      namespace: "api:cashflow:shadow:auth", limit: 30, windowMs: 60_000,
      allowImpersonation: false, enforceAdvisorSetup: false,
    }));
    if (!auth.ok) {
      const response = json({ ok: false, error: "Shadow comparison unavailable." }, auth.response.status);
      const retry = auth.response.headers.get("Retry-After");
      if (retry) response.headers.set("Retry-After", retry);
      return response;
    }
    if (!allowedEmails.has(auth.ctx.email)) return json({ ok: false, error: "Shadow comparison unavailable." }, 403);
    const candidatesEnabled = cashflowCandidatesEnabled();
    // Capture before even the profile read; fresh role/team reads are part of this fence.
    const candidateBuild = candidatesEnabled ? await timing.measure("storage", () => beginCashflowCandidateBuild(adminDb, {
      email: auth.ctx.email, uid: auth.ctx.uid, version: body.version,
      timeZone: body.timeZone, asOfMs: body.asOfMs, options: body.options,
    })) : null;
    const inputs = await timing.measure("inputs", () => loadCashflowShadowInputs(req, {
      freshCashflowContext: true,
      authorizeEmail: async (email) => {
        if (email !== auth.ctx.email || !allowedEmails.has(email)) return false;
        const limit = await consumeRateLimit({
          namespace: "api:cashflow:shadow", key: email, limit: 1, windowMs: 5 * 60_000,
        });
        if (!limit.allowed) throw new ShadowRateLimitError(limit.retryAfterSeconds);
        return true;
      },
    }));
    if (inputs.effectiveEmail !== auth.ctx.email || inputs.snapshot.email !== auth.ctx.email) return skipped("different_inputs");
    if (req.signal.aborted) return skipped("unavailable");
    if (!isCashflowShadowContextCurrent(body.asOfMs)) return skipped("stale_context");
    if (inputs.tipsterMode !== body.options.tipsterMode) return skipped("different_inputs");
    const asOf = new Date(body.asOfMs);
    if (!isCashflowShadowWithinBudget(inputs.snapshot, asOf)) return skipped("resource_limit");
    const inputHash = await timing.measure("hash", () => hashCashflowValue({ snapshot: inputs.snapshot, statements: inputs.statements }));
    if (inputHash !== body.inputHash) return skipped("different_inputs");

    const { items, months } = await timing.measure("compute", () => {
      const items = computeCashflow(inputs.snapshot, { ...body.options, asOf });
      return { items, months: buildCashflowView(items, inputs.statements, body.options, asOf) };
    });
    const [itemsHash, monthsHash] = await timing.measure("hash", () => Promise.all([hashCashflowValue(items), hashCashflowValue(months)]));
    if (req.signal.aborted) return skipped("unavailable");
    const result: CashflowShadowResult = {
      ok: true,
      status: itemsHash === body.itemsHash && monthsHash === body.monthsHash ? "match" : "mismatch",
      itemsMatch: itemsHash === body.itemsHash,
      monthsMatch: monthsHash === body.monthsHash,
    };
    if (candidatesEnabled) {
      result.candidate = result.status === "match"
        ? await timing.measure("storage", () => verifyCashflowCandidateStorage(candidateBuild, inputHash, { items, months }, { itemsHash, monthsHash }, req.signal))
        : "not_stored";
    }
    if (req.signal.aborted) return skipped("unavailable");
    // Aggregate diagnostics only: no identifiers, fingerprints or amounts.
    console.info("[cashflow-shadow]", { version: CASHFLOW_SHADOW_VERSION, ...result });
    return json(result);
  } catch (error) {
    if (error instanceof ShadowRateLimitError) {
      const response = json({ ok: false, error: "Shadow comparison is rate limited." }, 429);
      response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
    if (error instanceof CashflowShadowInputsError) {
      if ([401, 403, 429].includes(error.status)) return json({ ok: false, error: "Shadow comparison unavailable." }, error.status);
      return skipped(error.code === "incomplete" || error.code === "limit" ? "incomplete_inputs" : "unavailable");
    }
    // Verification must not expose upstream errors or be mistaken for a match.
    return skipped("unavailable");
  }
}
