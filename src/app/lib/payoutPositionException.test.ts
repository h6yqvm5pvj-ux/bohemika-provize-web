import { describe, expect, it } from "vitest";
import { calculateNeon } from "./productFormulas/neon";
import { payoutExceptionStatementMonth, payoutPositionException } from "./payoutPositionException";
import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";

const userEmail = "adviser@example.test";
const before = calculateNeon(1000, "poradce8", 25, "standard", "2024-12-01");
const after = calculateNeon(1000, "poradce10", 25, "standard", "2024-12-01");
const entry: EntryDoc = {
  id: "neon", userEmail, source: "own", productKey: "neon", position: "poradce8",
  payoutPositionOverride: "poradce10", inputAmount: 1000, frequencyRaw: "monthly",
  commissionMode: "standard", durationYears: 25, contractSignedDate: "2024-12-01",
  policyStartDate: "2024-12-01", items: before.items,
};

describe("payout position exception", () => {
  it("uses the second December statement as the first January payout", () => {
    expect(payoutPositionException(entry, payoutExceptionStatementMonth("16.12.2025 - 31.12.2025", "2025-12"))).toBe("poradce10");
    expect(payoutPositionException(entry, payoutExceptionStatementMonth("01.12.2025 - 15.12.2025", "2026-1"))).toBeNull();
    expect(payoutPositionException({ ...entry, payoutPositionOverride: null }, "2026-1")).toBeNull();
    expect(payoutPositionException(entry, "2026-13")).toBeNull();
  });

  it("reprices December anniversaries paid in January and future NEON deferred amounts", () => {
    const schedule = generateCashflow([entry], 10, userEmail, new Date(2026, 0, 1));
    const amountFor = (items: typeof before.items, code: string) => items.find(item => item.code === code)?.amount;
    for (const code of ["B101-B104", "B3601", "B4801"]) {
      const payout = schedule.find(item => item.commissionCode === code);
      expect(payout).toMatchObject({
        amount: amountFor(after.items, code),
        originalPositionAmount: amountFor(before.items, code),
        predictionPosition: "poradce10",
      });
    }
    expect(schedule.find(item => item.commissionCode === "B101-B104")?.date.getFullYear()).toBe(2026);
    expect(schedule.find(item => item.commissionCode === "A101")?.originalPositionAmount).toBeUndefined();
  });

  it("preserves actual receipts and the team schedule", () => {
    const withReceipt: EntryDoc = { ...entry, commissionPayouts: [{
      code: "B3601", key: "received", status: "paid", amount: 987.65, writtenBy: userEmail, payoutMonthKey: "2028-01",
    }] };
    const schedule = generateCashflow([withReceipt], 10, userEmail, new Date(2028, 0, 1));
    expect(schedule.find(item => item.commissionCode === "B3601")).toMatchObject({ amount: 987.65, payoutStatus: "paid" });
    expect(schedule.find(item => item.commissionCode === "B3601")?.originalPositionAmount).toBeUndefined();
    expect(generateCashflow([{ ...entry, source: "manager" }], 10, userEmail, new Date(2026, 0, 1))
      .every(item => item.originalPositionAmount == null)).toBe(true);
  });
});

it("changes the estimate once statement reconciliation moves an unpaid December payout into January", async () => {
  const { applyStatementMissingPayoutShifts } = await import("@/app/cashflow/helpers");
  const december = new Date(2025, 11, 25);
  const schedule = generateCashflow([{
    ...entry, contractNumber: "123", policyStartDate: "2024-11-01",
  }], 10, userEmail, december);
  const pending = schedule.find(item => item.commissionCode === "B101-B104")!;
  expect(pending.date.getMonth()).toBe(11);
  expect(pending.amount).toBe(before.items.find(item => item.code === "B101-B104")?.amount);
  const [shifted] = applyStatementMissingPayoutShifts({
    cashflowItems: [pending], enabled: true,
    statementsByMonthKey: { "2025-12": [{
      id: "december", fileName: "fixture.html", statementNumber: null, statementDate: null, period: null,
      advisorNumber: null, periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: "2025-12",
      paidContractNumbers: ["456"], paidCommissionKeys: [], commissionTotal: 100, payoutTotal: 100,
      otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: null, updatedAtMs: null,
    }] },
  });
  expect(shifted).toMatchObject({
    amount: after.items.find(item => item.code === "B101-B104")?.amount,
    originalPositionAmount: pending.amount,
    payoutStatus: "shifted",
    predictionPosition: "poradce10",
  });
  expect(shifted.date.getFullYear()).toBe(2026);
});
