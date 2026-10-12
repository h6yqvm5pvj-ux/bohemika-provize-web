import { describe, expect, it } from "vitest";

import { generateCashflow } from "./generator";
import type { EntryDoc } from "./types";

describe("generateCashflow", () => {
  describe("ČPP NEON first commission", () => {
    const asOf = new Date(2026, 7, 18);
    const fixture = (signed: unknown, start = new Date(2026, 8, 15)): EntryDoc => ({
      id: "cpp-life-forecast", productKey: "neon",
      contractSignedDate: signed, policyStartDate: start,
      items: [{ title: "Okamžitá provize", code: "A101", amount: 1000 }],
    });

    it.each([
      [new Date(2026, 7, 18), new Date(2026, 8, 15), new Date(2026, 9, 25)],
      [new Date(2026, 7, 28), new Date(2026, 8, 15), new Date(2026, 9, 25)],
      [new Date(2026, 8, 25), new Date(2026, 8, 15), new Date(2026, 9, 25)],
      [new Date(2026, 8, 26), new Date(2026, 8, 15), new Date(2026, 10, 25)],
      [new Date(2026, 7, 18), new Date(2026, 8, 28), new Date(2026, 9, 25)],
      [new Date(2026, 9, 8), new Date(2026, 11, 1), new Date(2026, 11, 25)],
      [new Date(2026, 9, 12), new Date(2026, 11, 1), new Date(2026, 11, 25)],
      [new Date(2026, 10, 25), new Date(2026, 11, 1), new Date(2026, 11, 25)],
      [new Date(2026, 10, 26), new Date(2026, 11, 1), new Date(2027, 0, 25)],
      [new Date(2026, 11, 1), new Date(2026, 11, 1), new Date(2027, 0, 25)],
      [new Date(2026, 11, 8), new Date(2027, 0, 1), new Date(2027, 0, 25)],
      [new Date(2026, 11, 28), new Date(2026, 11, 1), new Date(2027, 1, 25)],
    ])("respects signing acceptance and advance first-day starts (%s, %s)", (signed, start, expected) => {
      const rows = generateCashflow([fixture(signed, start)], 2, undefined, asOf);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ date: expected, amount: 1000 });
    });

    it.each([null, "invalid-date"])("keeps a conservative forecast without a signing date (%s)", signed => {
      const rows = generateCashflow([fixture(signed)], 2, undefined, asOf);
      expect(rows[0].date).toEqual(new Date(2026, 9, 25));
    });

    it.each([null, "invalid-date"])("does not infer advance signing from creation time (%s)", signed => {
      const entry = { ...fixture(signed, new Date(2026, 11, 1)), createdAt: new Date(2026, 9, 12) };
      expect(generateCashflow([entry], 2, undefined, asOf)[0].date).toEqual(new Date(2027, 0, 25));
    });

    it("includes every initial commission part in the advance policy start month", () => {
      const entry = fixture("2026-10-12", new Date(2026, 11, 1));
      entry.items = [
        { title: "Provize A101", code: "A101", amount: 700 },
        { title: "Provize B0301", code: "B0301", amount: 300 },
        { title: "Provize 50% z B3601", code: "B3601_HALF", amount: 100 },
      ];
      const rows = generateCashflow([entry], 2, undefined, asOf);
      expect(rows.map(row => [row.commissionCode, row.amount, row.date])).toEqual([
        ["A101", 700, new Date(2026, 11, 25)],
        ["B0301", 300, new Date(2026, 11, 25)],
        ["B3601_HALF", 100, new Date(2026, 11, 25)],
      ]);
    });

    it("keeps a January statement payout instead of the advance December forecast", () => {
      const entry = fixture(new Date(2026, 9, 12), new Date(2026, 11, 1));
      entry.commissionPayouts = [{ key: "paid-advance-life", code: "A101", status: "paid", amount: 1000, payoutMonthKey: "2027-1" }];
      const rows = generateCashflow([entry], 2, undefined, asOf);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        date: new Date(2027, 0, 25), originalDate: new Date(2026, 11, 25),
        payoutStatus: "paid", commissionPayoutKey: "paid-advance-life",
      });
    });

    it("applies the timing to every part of the first commission", () => {
      const entry = fixture(new Date(2026, 7, 18));
      entry.items = [
        { title: "Provize A101", code: "A101", amount: 700 },
        { title: "Provize B0301", code: "B0301", amount: 300 },
      ];
      const rows = generateCashflow([entry], 2, undefined, asOf);
      expect(rows).toHaveLength(2);
      expect(rows.map(row => [row.commissionCode, row.amount, row.date])).toEqual([
        ["A101", 700, new Date(2026, 9, 25)],
        ["B0301", 300, new Date(2026, 9, 25)],
      ]);
    });

    it("keeps the actual payout even when it precedes the new forecast", () => {
      const entry = fixture(new Date(2026, 7, 18));
      entry.commissionPayouts = [{ key: "paid-cpp-life", code: "A101", status: "paid", amount: 1000, payoutMonthKey: "2026-9" }];
      const rows = generateCashflow([entry], 2, undefined, asOf);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        date: new Date(2026, 8, 25), originalDate: new Date(2026, 9, 25),
        payoutStatus: "paid", commissionPayoutKey: "paid-cpp-life",
      });
    });
  });

  describe.each(["flexi", "maximaMaxEfekt", "pillowInjury"] as const)("%s first life commission", (productKey) => {
    const asOf = new Date(2026, 9, 8);
    const fixture = (contractSignedDate: unknown): EntryDoc => ({
      id: "life-forecast",
      productKey,
      policyStartDate: new Date(2026, 11, 1),
      contractSignedDate,
      items: [{ title: "Okamžitá provize", code: "A101", amount: 1000 }],
    });

    it.each([
      [new Date(2026, 9, 8), new Date(2026, 11, 25)],
      [new Date(2026, 10, 25), new Date(2026, 11, 25)],
      [new Date(2026, 10, 26), new Date(2027, 0, 25)],
      [new Date(2026, 10, 28), new Date(2027, 0, 25)],
      [new Date(2026, 11, 8), new Date(2027, 0, 25)],
      [new Date(2026, 11, 28), new Date(2027, 1, 25)],
    ])("forecasts a contract signed on %s for %s", (signed, expected) => {
      const rows = generateCashflow([fixture(signed)], 2, undefined, asOf);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ date: expected, amount: 1000 });
    });

    it.each([null, "invalid-date"])("keeps a conservative forecast without a valid signing date (%s)", (signed) => {
      const entry = { ...fixture(signed), createdAt: new Date(2026, 9, 8) };
      expect(generateCashflow([entry], 2, undefined, asOf)[0].date).toEqual(new Date(2027, 0, 25));
    });

    it("does not forecast a payout before a late-month policy start", () => {
      const entry = { ...fixture(new Date(2026, 9, 8)), policyStartDate: new Date(2026, 11, 28) };
      expect(generateCashflow([entry], 2, undefined, asOf)[0].date).toEqual(new Date(2027, 0, 25));
    });

    it("keeps the real payout month when it differs from the forecast", () => {
      const entry = fixture(new Date(2026, 9, 8));
      entry.commissionPayouts = [{ key: "paid-life", code: "A101", status: "paid", amount: 1000, payoutMonthKey: "2027-1" }];
      const rows = generateCashflow([entry], 2, undefined, asOf);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        date: new Date(2027, 0, 25),
        originalDate: new Date(2026, 11, 25),
        payoutStatus: "paid",
        commissionPayoutKey: "paid-life",
      });
    });
  });

  it("keeps life anniversary commissions tied to the policy start", () => {
    const rows = generateCashflow([{
      id: "life-anniversary", productKey: "neon",
      policyStartDate: new Date(2026, 11, 1), contractSignedDate: new Date(2026, 9, 8),
      items: [
        { title: "Okamžitá provize", code: "A101", amount: 1000 },
        { title: "Následná provize (2.–5. rok)", code: "B101-B104", amount: 100 },
        { title: "Provize po 3 letech", code: "B3601", amount: 300 },
      ],
    }], 5, undefined, new Date(2026, 9, 8));
    expect(rows.find(row => row.commissionCode === "A101")?.date).toEqual(new Date(2026, 11, 25));
    expect(rows.filter(row => row.commissionCode === "B101-B104").map(row => row.date)).toEqual([
      new Date(2028, 0, 25), new Date(2029, 0, 25), new Date(2030, 0, 25), new Date(2031, 0, 25),
    ]);
    expect(rows.find(row => row.commissionCode === "B3601")?.date).toEqual(new Date(2030, 0, 25));
  });

  it("keeps the existing forecast for property insurance with an early signing date", () => {
    const rows = generateCashflow([{
      id: "property-forecast", productKey: "allianzmujdomov",
      policyStartDate: new Date(2026, 11, 1), contractSignedDate: new Date(2026, 9, 8),
      items: [{ title: "Okamžitá provize", code: "A101", amount: 1000 }],
    }], 2, undefined, new Date(2026, 9, 8));
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toEqual(new Date(2027, 0, 25));
  });

  it.each([600, 19_884])("matches a B101 payout to cashflow regardless of base size (%s CZK)", (statementBaseAmount) => {
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
    expect(payouts[0].isStatementOnly === true).toBe(false);
    expect(payouts[0].amount).toBe(smallBase ? 2.38 : 78.74);
    expect(payouts[0].commissionLabel).not.toBe("Investiční složka");
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
