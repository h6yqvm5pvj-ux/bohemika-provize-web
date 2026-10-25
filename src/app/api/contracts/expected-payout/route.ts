import { NextResponse, type NextRequest } from "next/server";

import { computeExpectedPayout, expectedPayoutFromStatements, type ExpectedPayout } from "@/app/home/expectedPayout";
import { cashflowCalendarDate, isCashflowCalendarCurrent } from "@/lib/server/cashflowCalendar";
import { createCashflowDiagnosticTiming } from "@/lib/server/cashflowDiagnosticHttp";
import { CashflowShadowInputsError } from "@/lib/server/cashflowShadowInputs";
import { cashflowShadowBudgetFailure } from "@/lib/server/cashflowShadowBudget";
import { loadExpectedPayoutInputs, loadExpectedPayoutStatements } from "@/lib/server/homeExpectedPayoutInputs";
import { expectedPayoutStatementsWithinBudget } from "@/lib/server/homeExpectedPayoutBudget";
import { requireContractsEntryGuard } from "../_lib/contractsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR = "Výplatu se nepodařilo načíst úplně. Obnovte prosím stránku.";

/** Read-only summary. Never accepts an account, portfolio or amount from the client. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const timing = createCashflowDiagnosticTiming();
  let decorate = (response: NextResponse) => response;
  const json = (body: unknown, status = 200) => {
    const response = decorate(timing.json(body, status));
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    response.headers.set("Vary", "Authorization, Cookie");
    return response;
  };
  const unavailable = (status = 503) => json({ ok: false, error: ERROR }, status);
  const clientCalculation = () => json({ ok: false, code: "client_calculation_required", error: ERROR }, 503);

  try {
    if (req.signal.aborted) return unavailable(499);
    const guard = await timing.measure("auth", () => requireContractsEntryGuard(req, {
      namespace: "api:contracts:expected-payout", limit: 12, windowMs: 60_000,
    }, { freshCashflowContext: true }));
    if (!guard.ok) {
      const response = unavailable(guard.response.status);
      // Retain throttling metadata without copying upstream diagnostic messages.
      guard.response.headers.forEach((value, name) => {
        if (name === "retry-after" || name.startsWith("x-ratelimit-")) response.headers.set(name, value);
      });
      return response;
    }
    decorate = guard.withRateLimit;
    const { email, uid, accountType } = guard.ctx;
    if (accountType !== "advisor") return unavailable(403);
    const params = req.nextUrl.searchParams;
    const zones = params.getAll("timeZone");
    if ([...params.keys()].some(key => key !== "timeZone") || zones.length !== 1 || !zones[0] || zones[0].length > 100) {
      return unavailable(400);
    }
    const updatedAt = Date.now();
    const asOf = cashflowCalendarDate(updatedAt, zones[0]);
    if (!asOf) return unavailable(400);
    const monthKey = `${asOf.getFullYear()}-${asOf.getMonth() + 1}`;
    const success = (payout: ExpectedPayout) => {
      if (req.signal.aborted) return unavailable(499);
      if (!isCashflowCalendarCurrent(asOf)) return unavailable(409);
      if (![payout.grossAmount, payout.stornoFundAmount, payout.netAmount].every(Number.isFinite)) return unavailable();
      return json({ ok: true, payout: {
        grossAmount: payout.grossAmount, stornoFundAmount: payout.stornoFundAmount, netAmount: payout.netAmount,
      }, monthKey, updatedAt });
    };

    const statements = await timing.measure("inputs", () => loadExpectedPayoutStatements(req, { onSourceTiming: timing.recordInput }));
    const paid = expectedPayoutFromStatements(statements, asOf);
    // A paid statement already supplies the complete displayed total, including
    // a zero or negative payout. No contract/TIP/subscription reads are needed.
    if (paid) return success(paid);
    if (req.signal.aborted) return unavailable(499);
    if (!expectedPayoutStatementsWithinBudget(statements)) return clientCalculation();

    const inputs = await timing.measure("inputs", () => loadExpectedPayoutInputs(req,
      { email, uid, accountType }, statements, { authorizedContext: guard, onSourceTiming: timing.recordInput }));
    if (inputs.effectiveEmail !== email || inputs.snapshot.email !== email || inputs.tipsterMode) return unavailable(403);
    if (req.signal.aborted) return unavailable(499);
    // Preserve the previous browser path for portfolios whose synchronous server
    // work cannot be safely bounded. Never truncate business inputs or totals.
    try {
      if (cashflowShadowBudgetFailure(inputs.snapshot, asOf, false,
        { scopeFilter: "combined", productFilter: "all", tipsterMode: false })) return clientCalculation();
      return success(await timing.measure("compute", () => computeExpectedPayout({
        snapshot: inputs.snapshot, statements: inputs.statements, asOf,
      })));
    } catch {
      // Legacy host-dependent date formats can still use their browser calendar.
      return clientCalculation();
    }
  } catch (error) {
    if (error instanceof CashflowShadowInputsError) {
      if ([401, 403, 429].includes(error.status)) return unavailable(error.status);
      if (error.code === "limit" || error.code === "timeout") return clientCalculation();
      if (error.code === "aborted") return unavailable(499);
    }
    // Financial inputs, amounts and upstream errors never enter logs/responses.
    return unavailable();
  }
}
