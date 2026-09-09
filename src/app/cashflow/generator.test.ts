import { describe, expect, it } from "vitest";

import { generateCashflow } from "./generator";
import type { EntryDoc } from "./types";

describe("generateCashflow", () => {
  it.each([600, 19_884])("matches a B101 payout to risk cashflow only for a comparable base (%s CZK)", (statementBaseAmount) => {
    const smallBase = statementBaseAmount === 600;
    const entry: EntryDoc = {
      id: "life-base",
      productKey: "neon",
      inputAmount: 1657,
      frequencyRaw: "monthly",
      policyStartDate: new Date("2021-09-14T12:00:00Z"),
      contractSignedDate: new Date("2021-09-13T12:00:00Z"),
      items: [{ title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 78.74 }],
      commissionPayouts: [{
        key: "b101", code: "B101", status: "paid", amount: smallBase ? 2.38 : 78.74,
        statementBaseAmount, systemBaseAmount: 19_884, payoutMonthKey: "2022-10",
      }],
    };
    const items = generateCashflow([entry]);
    const payouts = items.filter((item) => item.commissionPayoutKey === "b101");
    expect(payouts).toHaveLength(1);
    expect(payouts[0].isStatementOnly === true).toBe(smallBase);
    expect(payouts[0].amount).toBe(smallBase ? 2.38 : 78.74);
    if (smallBase) expect(payouts[0].commissionLabel).toBe("Investiční složka");
  });

  it("keeps the paid auto commission, shows the storno payout, and stops future projections", () => {
    const entry: EntryDoc = {
      id: "auto-1",
      status: "storno",
      stornoDate: new Date("2026-04-21T00:00:00.000Z"),
      productKey: "kooperativaAuto",
      frequencyRaw: "quarterly",
      contractNumber: "6469764582",
      clientName: "Samek Jiri",
      inputAmount: 7224,
      contractSignedDate: new Date("2026-02-23T00:00:00.000Z"),
      policyStartDate: new Date("2026-02-25T00:00:00.000Z"),
      userEmail: "vojtech.mahr@bohemika.eu",
      items: [
        {
          title: "Okamžitá provize",
          amount: 609.56,
          code: "A101",
        },
      ],
      commissionPayouts: [
        {
          key: "paid-apz101",
          code: "APZ101",
          amount: 609.56,
          status: "paid",
          payoutMonthKey: "2026-3",
          statementNumber: "204",
          writtenBy: "vojtech.mahr@bohemika.eu",
        },
        {
          key: "storno-apz101",
          code: "APZ101",
          amount: -609.56,
          status: "storno",
          payoutMonthKey: "2026-4",
          statementNumber: "205",
          writtenBy: "vojtech.mahr@bohemika.eu",
        },
      ],
    };

    const items = generateCashflow([entry], 2, "vojtech.mahr@bohemika.eu");

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.amount)).toEqual([609.56, -609.56]);
    expect(items[0]).toMatchObject({
      payoutStatus: "paid",
      commissionPayoutKey: "paid-apz101",
      commissionStatementNumber: "204",
    });
    expect(items[1]).toMatchObject({
      isStatementOnly: true,
      payoutStatus: "paid",
      commissionPayoutKey: "storno-apz101",
      commissionStatementNumber: "205",
    });
    expect(items[1]?.note).toContain("storno z výpisu");
  });
});
