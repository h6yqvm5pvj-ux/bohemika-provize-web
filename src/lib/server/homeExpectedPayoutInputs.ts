import type { NextRequest } from "next/server";
import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";
import type { AuthorizedContractsContext } from "@/app/api/contracts/_lib/contractsApi";
import {
  CashflowShadowInputsError,
  loadCashflowInputs,
  loadCashflowStatements,
  type CashflowInputLoadOptions,
  type CashflowInputLimits,
  type CashflowShadowInputs,
} from "./cashflowInputs";

type SourceTimingOptions = Pick<CashflowInputLoadOptions, "onSourceTiming">;
type PortfolioOptions = SourceTimingOptions & { authorizedContext?: AuthorizedContractsContext };
export type ExpectedPayoutInputContext = {
  email: string;
  uid: string;
  accountType: "advisor";
};

// Keep production work bounded. Oversized portfolios use the existing browser
// calculation; never return a partially read portfolio as a successful result.
const EXPECTED_PAYOUT_INPUT_LIMITS: CashflowInputLimits = {
  maxRequests: 120, maxDurationMs: 45_000, maxContractRows: 20_000,
};

/** Each source handler retains its own authentication and authorization. */
export function loadExpectedPayoutStatements(
  request: NextRequest,
  options: SourceTimingOptions = {}
): Promise<CashflowCommissionStatementSummary[]> {
  return loadCashflowStatements(request, options);
}

/**
 * The caller must obtain context from a fresh contracts entry guard on this
 * request and statements from loadExpectedPayoutStatements on the same request.
 * Neither context nor source data may come from a client body or stored cache.
 */
export function loadExpectedPayoutInputs(
  request: NextRequest,
  context: ExpectedPayoutInputContext,
  statements: CashflowCommissionStatementSummary[],
  options: PortfolioOptions = {}
): Promise<CashflowShadowInputs> {
  const email = context.email.trim().toLowerCase();
  if (!email || !context.uid.trim() || context.accountType !== "advisor") {
    return Promise.reject(new CashflowShadowInputsError("forbidden", 403));
  }
  const authorized = options.authorizedContext;
  if (authorized && (authorized.ctx.email !== email || authorized.ctx.uid !== context.uid ||
    authorized.ctx.accountType !== context.accountType)) {
    return Promise.reject(new CashflowShadowInputsError("forbidden", 403));
  }
  return loadCashflowInputs(request, {
    limits: EXPECTED_PAYOUT_INPUT_LIMITS,
    trustedProfile: { email, accountType: context.accountType },
    statements,
    authorizeEmail: effectiveEmail => effectiveEmail === email,
    freshCashflowContext: true,
    authorizedContext: authorized,
    onSourceTiming: options.onSourceTiming,
  });
}
