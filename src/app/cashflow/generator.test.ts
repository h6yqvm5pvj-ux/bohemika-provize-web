import { describe, expect, it } from "vitest";

import { FLEXI_RENOVATION_MISSING_BASE } from "@/app/lib/flexiRenovation";
import { calculateFlexi } from "@/app/lib/productFormulas/flexi";
import { generateCashflow } from "./generator";
import type { EntryDoc } from "./types";

describe("generateCashflow", () => {
  it("matches the A501 receipt without a duplicate forecast for an older MAXIMA foreign nationals policy", () => {
    const owner = "advisor@example.test";
    const entry: EntryDoc = {
      id: "synthetic-foreigners", productKey: "maxcizinkomplex", userEmail: owner,
      policyStartDate: "2026-06-01", contractSignedDate: "2026-05-30",
      items: [{ title: "💸 Okamžitá provize", amount: 175.475 }],
      commissionPayouts: [{ key: "receipt", code: "A501", amount: 175.48, status: "paid", writtenBy: owner, payoutMonthKey: "2026-07" }],
    };
    const rows = generateCashflow([entry], 2, owner, new Date(2026, 7, 1));
    expect(rows).toEqual([expect.objectContaining({
      commissionCode: "A501", commissionPayoutKey: "receipt", payoutStatus: "paid",
      amount: 175.48, predictedAmount: 175.475,
    })]);
    expect(rows[0].isStatementOnly).toBeFalsy();
  });

  it("keeps the ČPP KOMPLEX acquisition schedule and reprices renewals from the amendment", () => {
    const owner = "advisor@example.test";
    const entry: EntryDoc = { id: "komplex-amendment", productKey: "cppPPRs", userEmail: owner,
      policyStartDate: "2024-01-15", contractSignedDate: "2024-01-14", frequencyRaw: "annual", inputAmount: 10000,
      items: [{ title: "Okamžitá provize (z platby)", code: "A101", amount: 800 },
        { title: "Následná provize (z platby)", code: "B101", amount: 800 }],
      commissionPayouts: [{ key: "acquisition", code: "A101", amount: 800, status: "paid", writtenBy: owner, payoutMonthKey: "2024-2" }],
      paymentFrequencyChanges: [
        { effectiveDate: "2024-06-01", frequency: "semiannual", annualPremium: 12000, baseAnnualPremium: 10000 },
        { effectiveDate: "2026-01-15", frequency: "semiannual", annualPremium: 9000, baseAnnualPremium: 10000 },
      ] };
    const rows = generateCashflow([entry], 2, owner, new Date(2025, 0, 1));
    expect(rows.filter(row => row.commissionCode?.startsWith("A"))).toEqual([expect.objectContaining({
      commissionCode: "A101", amount: 800, payoutStatus: "paid", frequency: "annual", commissionPayoutKey: "acquisition",
    })]);
    expect(rows.slice(1, 5).map(row => [row.commissionCode, row.commissionPeriodStart, row.amount, row.frequency])).toEqual([
      ["B101", "2025-01-15", 480, "semiannual"], ["B102", "2025-07-15", 480, "semiannual"],
      ["B103", "2026-01-15", 360, "semiannual"], ["B104", "2026-07-15", 360, "semiannual"],
    ]);
  });

  it.each(["standard", "accelerated"] as const)("keeps the normal FLEXI %s dates and codes with an unknown amount", commissionMode => {
    const entry: EntryDoc = {
      id: "flexi-renovation", productKey: "flexi", position: "poradce4", commissionMode,
      contractSignedDate: "2026-10-29", policyStartDate: "2026-11-01", durationYears: 7, frequencyRaw: "monthly",
      items: calculateFlexi(750, "poradce4", commissionMode, 7).items,
    };
    const calendar = new Date(2026, 10, 24);
    const calculated = generateCashflow([entry], 10, undefined, calendar);
    const pending = generateCashflow([{
      ...entry, commissionCalculationStatus: FLEXI_RENOVATION_MISSING_BASE,
    }], 10, undefined, calendar);
    const schedule = (items: ReturnType<typeof generateCashflow>) => items.map(item =>
      [item.commissionCode, item.date, item.commissionPeriodStart]);
    expect(schedule(pending)).toEqual(schedule(calculated));
    expect(pending.map(item => item.commissionCode)).toEqual([
      "A101", "B0301", ...(commissionMode === "accelerated" ? ["B36_HALF"] : []), "B36", "B48", "B101", "B102",
    ]);
    expect(pending.every(item => item.amountUnknown && item.amount === 0 && item.predictedAmount === null)).toBe(true);
    const short = { ...entry, durationYears: 2, commissionCalculationStatus: FLEXI_RENOVATION_MISSING_BASE };
    expect(generateCashflow([short], 10, undefined, calendar).map(item => item.commissionCode))
      .toEqual(["A101", "B0301", ...(commissionMode === "accelerated" ? ["B36_HALF"] : [])]);
  });

  it("preserves portal links on forecasts and statement-only receipts", () => {
    const links = { maxxContractDetailUrl: "https://sjednatel.bohemiaservis.cz/detail.aspx?sml=123456",
      extranetContractDetailUrl: "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx?type=detail&p_EntityTypeID=43&p_EntityID=123456" };
    const entry: EntryDoc = { id: "portal-contract", productKey: "cppAuto", userEmail: "advisor@example.test",
      policyStartDate: "2026-11-01", frequencyRaw: "annual", ...links,
      items: [{ title: "Okamžitá provize", code: "A101", amount: 332 }],
      commissionPayouts: [{ key: "cancelled", code: "A101", amount: -20, status: "storno", payoutMonthKey: "2026-11", writtenBy: "advisor@example.test" }],
    };
    const rows = generateCashflow([entry], 2, "advisor@example.test", new Date(2026, 10, 1));
    expect(rows.some(row => row.isStatementOnly)).toBe(true);
    expect(rows.some(row => !row.isStatementOnly)).toBe(true);
    for (const row of rows) expect(row).toMatchObject(links);
  });
  it.each(["investikaRealitniFond", "investikaEfektika", "investikaMonetika", "conseqInvest"] as const)("excludes %s even if financial data is injected", productKey => {
    const entry: EntryDoc = { id: "investment", productKey, userEmail: "advisor@example.test",
      frequencyRaw: "annual", policyStartDate: "2026-11-01", inputAmount: 10_000,
      items: [{ title: "Okamžitá provize", code: "A101", amount: 1000 }],
      commissionPayouts: [{ key: "unexpected", code: "A101", amount: 1000, status: "paid", payoutMonthKey: "2026-11", writtenBy: "advisor@example.test" }],
    };
    expect(generateCashflow([entry], 10, "advisor@example.test", new Date(2026, 10, 17))).toEqual([]);
  });
  it("excludes free trailer contracts even if financial data is present", () => {
    const entry: EntryDoc = { id: "free-trailer", productKey: "cppAutoVozikZdarma", userEmail: "advisor@example.test",
      frequencyRaw: "annual", policyStartDate: "2026-11-01", inputAmount: 10_000,
      items: [{ title: "Okamžitá provize", code: "A101", amount: 1000 }],
      commissionPayouts: [{ key: "unexpected", code: "A101", amount: 1000, status: "paid", payoutMonthKey: "2026-11", writtenBy: "advisor@example.test" }],
    };
    expect(generateCashflow([entry], 10, "advisor@example.test", new Date(2026, 10, 17))).toEqual([]);
  });
  describe("DOMEX commission installments", () => {
    const fixture = (frequencyRaw: "annual" | "semiannual"): EntryDoc => ({
      id: "domex-installments",
      productKey: "domex",
      frequencyRaw,
      policyStartDate: new Date(2025, 6, 31),
      contractSignedDate: new Date(2025, 6, 20),
      items: [
        { title: "💸 Okamžitá provize A101 (z platby)", code: "A101", amount: 100 },
        { title: "🔁 Následná provize (z platby)", code: "B101-B102", amount: 50 },
      ],
    });

    it("changes payment periods from the effective date, keeping settled receipts and the historical renewal limit", () => {
      const entry: EntryDoc = {
        ...fixture("annual"), inputAmount: 3600, policyStartDate: "2024-07-26", contractSignedDate: "2024-07-25",
        items: [{ title: "Okamžitá provize (z platby)", amount: 810.72 }, { title: "Následná provize (z platby)", amount: 202.68 }],
        commissionPayouts: [{ key: "original", code: "A101", amount: 810, status: "paid", payoutMonthKey: "2024-8" }],
        paymentFrequencyChanges: [
          { effectiveDate: "2025-07-26", frequency: "semiannual", annualPremium: 4000, baseAnnualPremium: 3600 },
          { effectiveDate: "2026-04-10", frequency: "semiannual", annualPremium: 5000, baseAnnualPremium: 3600 },
        ],
      };
      const rows = generateCashflow([entry], 10, undefined, new Date(2025, 6, 1));
      expect(rows[0]).toMatchObject({ commissionCode: "A101", amount: 810, commissionPayoutKey: "original" });
      expect(rows.slice(1, 4).map(row => [row.commissionCode, row.commissionPeriodStart, row.amount])).toEqual([
        ["B101", "2025-07-26", 112.60], ["B102", "2026-01-26", 112.60], ["B103", "2026-07-26", 140.75],
      ]);
      expect(rows.at(-1)).toMatchObject({ commissionCode: "B108", commissionPeriodStart: "2029-01-26" });
    });

    it.each([
      ["annual", ["A101", "B101", "B102", "B103"], ["2025-07-31", "2026-07-31", "2027-07-31", "2028-07-31"]],
      ["semiannual", ["A101", "A102", "B101", "B102"], ["2025-07-31", "2026-01-31", "2026-07-31", "2027-01-31"]],
    ] as const)("switches %s installments at the first insured anniversary", (frequency, expectedCodes, expectedPeriods) => {
      const rows = generateCashflow([fixture(frequency)], 4, undefined, new Date(2025, 6, 1));

      expect(rows.slice(0, expectedCodes.length).map(row => row.commissionCode)).toEqual(expectedCodes);
      expect(rows.slice(0, expectedPeriods.length).map(row => row.commissionPeriodStart)).toEqual(expectedPeriods);
    });
  });

  it("keeps a monthly auto installment before the insured anniversary in the A sequence", () => {
    const entry: EntryDoc = {
      id: "auto-installments",
      productKey: "cppAuto",
      frequencyRaw: "monthly",
      policyStartDate: new Date(2025, 6, 31),
      contractSignedDate: new Date(2025, 6, 20),
      items: [
        { title: "🚗 Okamžitá provize", code: "A101", amount: 100 },
        { title: "🔁 Následná provize", code: "B101", amount: 50 },
      ],
    };
    const rows = generateCashflow([entry], 2, undefined, new Date(2025, 6, 1));

    expect(rows.slice(0, 14).map(row => row.commissionCode)).toEqual([
      ...Array.from({ length: 12 }, (_, index) => `A${String(101 + index)}`),
      "B101", "B102",
    ]);
    expect(rows[11]?.commissionPeriodStart).toBe("2026-06-30");
    expect(rows[12]?.commissionPeriodStart).toBe("2026-07-31");
  });

  it("switches annual property payments to the subsequent amount at the insured anniversary", () => {
    const entry: EntryDoc = {
      id: "maxdomov-installments",
      productKey: "maxdomov",
      frequencyRaw: "annual",
      policyStartDate: new Date(2025, 6, 31),
      contractSignedDate: new Date(2025, 6, 20),
      items: [
        { title: "💸 Okamžitá provize (z platby)", code: "A101", amount: 100 },
        { title: "🔁 Následná provize (z platby)", code: "B101", amount: 50 },
      ],
    };
    const rows = generateCashflow([entry], 3, undefined, new Date(2025, 6, 1));

    expect(rows.slice(0, 3).map(row => [row.amount, row.commissionPeriodStart])).toEqual([
      [100, "2025-07-31"],
      [50, "2026-07-31"],
      [50, "2027-07-31"],
    ]);
  });

  it.each(["comfortcc", " COMFORTCC "])("ignores retired cached product %s before generic and statement payout handling", productKey => {
    const entry: EntryDoc = {
      id: "retired-contract",
      productKey: productKey as EntryDoc["productKey"],
      policyStartDate: "2026-09-01",
      contractSignedDate: "2026-09-01",
      items: [{ title: "Okamžitá provize", code: "A101", amount: 1000 }],
      commissionPayouts: [{ key: "paid", code: "A101", status: "paid", amount: 1000, payoutMonthKey: "2026-9" }],
    };
    expect(generateCashflow([entry], 2, undefined, new Date(2026, 8, 1))).toEqual([]);
  });

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

  it("settles only one payment period when a product reuses a code across installments", () => {
    const entry: EntryDoc = {
      id: "reused-code", productKey: "maxdomov", frequencyRaw: "quarterly",
      policyStartDate: "2025-01-01", contractSignedDate: "2025-01-01",
      items: [{ title: "Okamžitá provize", amount: 100, code: "A101" }],
      commissionPayouts: [{ code: "A101", amount: 17, payoutMonthKey: "2025-02" }],
    };
    const acquisition = generateCashflow([entry], 1, undefined, new Date(2025, 0, 1))
      .filter(item => item.commissionCode === "A101");
    expect(acquisition.filter(item => item.payoutStatus === "paid")).toEqual([
      expect.objectContaining({ amount: 17, date: new Date(2025, 1, 25), commissionPeriodStart: "2025-01-01" }),
    ]);
    expect(acquisition.filter(item => item.payoutStatus !== "paid").map(item => item.commissionPeriodStart)).toEqual(
      ["2025-04-01", "2025-07-01", "2025-10-01"],
    );
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
