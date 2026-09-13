import type { NextRequest, NextResponse } from "next/server";
import {
  hashCashflowValue, isCashflowShadowContextCurrent, parseCashflowShadowRequest,
} from "@/app/cashflow/shadowProtocol";
import { parseCashflowSnapshot } from "@/app/cashflow/cashflowSnapshotWire";
import type { CashflowCandidateCheckResult } from "@/app/cashflow/candidateCheckProtocol";
import { requireAuthedRateLimited } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { authorizeCashflowCandidateRead } from "@/lib/server/cashflowCandidateAccess";
import { beginCashflowCandidateBuild, cashflowCandidatesEnabled } from "@/lib/server/cashflowCandidateVerification";
import { readCashflowCandidate } from "@/lib/server/cashflowCandidateStore";
import {
  cashflowShadowAllowedEmails, readCashflowDiagnosticJson, createCashflowDiagnosticTiming,
} from "@/lib/server/cashflowDiagnosticHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One immediate pilot replay. Never returns amounts or starts a fallback rebuild. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const timing = createCashflowDiagnosticTiming();
  const json = timing.json;
  const skipped = (reason: CashflowCandidateCheckResult["reason"]) => json({ ok: true, status: "skipped", reason } satisfies CashflowCandidateCheckResult);
  const miss = () => json({ ok: true, status: "miss" } satisfies CashflowCandidateCheckResult);
  const allowed = cashflowShadowAllowedEmails();
  if (process.env.CASHFLOW_SHADOW_ENABLED !== "1" || !cashflowCandidatesEnabled() || !allowed.size) return skipped("disabled");
  const body = parseCashflowShadowRequest(await readCashflowDiagnosticJson(req));
  if (!body) return json({ ok: false, error: "Invalid candidate check request." }, 400);
  if (body.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) return skipped("time_zone");
  if (!isCashflowShadowContextCurrent(body.asOfMs)) return skipped("stale_context");
  if (req.signal.aborted) return skipped("unavailable");

  try {
    const auth = await timing.measure("auth", () => requireAuthedRateLimited(req, {
      namespace: "api:cashflow:candidate-check", limit: 1, windowMs: 5 * 60_000,
      enforceAdvisorSetup: false, allowImpersonation: false,
    }));
    if (!auth.ok) {
      const response = json({ ok: false, error: "Candidate check unavailable." }, auth.response.status);
      const retry = auth.response.headers.get("Retry-After");
      if (retry) response.headers.set("Retry-After", retry);
      return response;
    }
    if (!allowed.has(auth.ctx.email)) return json({ ok: false, error: "Candidate check unavailable." }, 403);
    const build = await timing.measure("storage", () => beginCashflowCandidateBuild(adminDb, {
      email: auth.ctx.email, uid: auth.ctx.uid, version: body.version,
      timeZone: body.timeZone, asOfMs: body.asOfMs, options: body.options,
    }));
    if (!build) return miss();
    // Fresh access checks belong inside the same revision fence as candidate reading.
    const authorized = await timing.measure("auth", () => authorizeCashflowCandidateRead(req, auth.ctx, body.options.tipsterMode));
    if (req.signal.aborted) return skipped("unavailable");
    if (!authorized) {
      return json({ ok: false, error: "Candidate check unavailable." }, 403);
    }
    const candidate = await timing.measure("storage", () => readCashflowCandidate(build.db, { context: build.context }));
    if (req.signal.aborted) return skipped("unavailable");
    if (!candidate || candidate.revision.epoch !== build.revision.epoch || candidate.revision.revision !== build.revision.revision) return miss();
    if (candidate.inputHash !== body.inputHash) return skipped("different_inputs");
    const result = await timing.measure("hash", async () => {
      const restored = parseCashflowSnapshot(candidate.payload);
      if (!restored) return null;
      const [itemsHash, monthsHash] = await Promise.all([hashCashflowValue(restored.items), hashCashflowValue(restored.months)]);
      return { itemsMatch: itemsHash === body.itemsHash, monthsMatch: monthsHash === body.monthsHash };
    });
    if (!result) return miss();
    if (req.signal.aborted) return skipped("unavailable");
    if (!isCashflowShadowContextCurrent(body.asOfMs)) return skipped("stale_context");
    return json({ ok: true, status: result.itemsMatch && result.monthsMatch ? "match" : "mismatch", ...result } satisfies CashflowCandidateCheckResult);
  } catch { return skipped("unavailable"); }
}
