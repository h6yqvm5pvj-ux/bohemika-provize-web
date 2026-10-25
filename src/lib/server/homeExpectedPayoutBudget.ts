import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";

const MAX_STATEMENT_MATCH_KEYS = 100_000;
const MAX_STATEMENT_MATCH_KEY_LENGTH = 512;

/** The generator's budget does not bound statement matching. Oversized sources
 * keep their browser calculation; no row is dropped from a financial result. */
export function expectedPayoutStatementsWithinBudget(statements: CashflowCommissionStatementSummary[]): boolean {
  let keys = 0;
  for (const statement of statements) {
    for (const values of [statement.paidContractNumbers, statement.paidCommissionKeys]) {
      if (values == null) continue;
      if (!Array.isArray(values) || values.length > MAX_STATEMENT_MATCH_KEYS - keys) return false;
      keys += values.length;
      if (values.some(value => typeof value !== "string" || value.length > MAX_STATEMENT_MATCH_KEY_LENGTH)) return false;
    }
  }
  return true;
}
