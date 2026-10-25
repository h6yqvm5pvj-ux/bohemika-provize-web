import { describe, expect, it } from "vitest";
import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";
import { expectedPayoutStatementsWithinBudget } from "./homeExpectedPayoutBudget";

const statement = (values: Record<string, unknown>) => values as CashflowCommissionStatementSummary;

describe("server payout statement work limit", () => {
  it("allows empty and normal statement sources without modifying them", () => {
    const statements = [statement({ paidContractNumbers: ["123456"], paidCommissionKeys: ["123456:C"] }), statement({})];
    const before = structuredClone(statements);
    expect(expectedPayoutStatementsWithinBudget([])).toBe(true);
    expect(expectedPayoutStatementsWithinBudget(statements)).toBe(true);
    expect(statements).toEqual(before);
  });

  it("counts arrays across every month and statement before approving synchronous work", () => {
    const statements = [statement({ paidContractNumbers: Array(50_000).fill("123456") }),
      statement({ paidCommissionKeys: Array(50_000).fill("123456:C") })];
    expect(expectedPayoutStatementsWithinBudget(statements)).toBe(true);
    statements.push(statement({ paidContractNumbers: ["654321"] }));
    expect(expectedPayoutStatementsWithinBudget(statements)).toBe(false);
  });

  it.each(["unexpected-string", [null], [123], ["x".repeat(513)]])("rejects malformed or unbounded matching keys: %j", values => {
    expect(expectedPayoutStatementsWithinBudget([statement({ paidCommissionKeys: values })])).toBe(false);
    expect(expectedPayoutStatementsWithinBudget([statement({ paidContractNumbers: values })])).toBe(false);
  });
});
