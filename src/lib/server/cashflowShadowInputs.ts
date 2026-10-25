import type { NextRequest } from "next/server";
import {
  CASHFLOW_SHADOW_INPUT_LIMITS,
  loadCashflowInputs,
  type CashflowInputLoadOptions,
  type CashflowShadowInputs,
} from "./cashflowInputs";

export { CashflowShadowInputsError } from "./cashflowInputs";
export type { CashflowShadowInputsErrorCode, CashflowShadowInputs } from "./cashflowInputs";

/**
 * Independent, bounded reread for shadow comparison only. These reads are not a
 * transaction and must never be treated as proof of snapshot freshness.
 */
export function loadCashflowShadowInputs(
  request: NextRequest,
  options: CashflowInputLoadOptions = {}
): Promise<CashflowShadowInputs> {
  return loadCashflowInputs(request, {
    authorizeEmail: options.authorizeEmail,
    freshCashflowContext: options.freshCashflowContext,
    onSourceTiming: options.onSourceTiming,
    limits: CASHFLOW_SHADOW_INPUT_LIMITS,
  });
}
