import { describe, expect, it } from "vitest";
import { buildCommissionStornoComparison, type CommissionStornoEntry } from "./commissionStornoComparison";

const owner = "advisor@example.test";
const receipt = (code: string, amount: number, statementDate = "2025-09-01", extras = {}) => ({
  code, amount, statementDate, writtenBy: owner, ...extras,
});
const life: CommissionStornoEntry = {
  id: "root",
  productKey: "flexi",
  policyStartDate: "2024-01-01",
  items: [
    { code: "A101", title: "Riziková", amount: 10_000 },
    { code: "A201", title: "Investiční", amount: 2_000 },
  ],
};
const compare = (entry: CommissionStornoEntry, stornoDate: unknown = "2026-01-01", viewerEmail: string | null = owner) =>
  buildCommissionStornoComparison({ entries: [entry], ownerEmail: owner, viewerEmail, stornoDate });
const row = (code: string, paid: number | null, estimated: number | null, deducted: number | null, difference: number | null) =>
  ({ code, paid, estimated, deducted, difference });

describe("commission storno comparison", () => {
  it("uses the recorded FLEXI payout and reconciles each code and recipient across statements", () => {
    const first = receipt("A101", -800, "2026-02-01", { statementId: "one", key: "1" });
    expect(compare({ ...life, commissionPayouts: [
      receipt("A101", 5_000), receipt("A201", 2_000),
      first, first, receipt("AP101", -450, "2026-03-01", { statementId: "two", key: "1" }),
      receipt("A201", -1_200, "2026-02-01"),
      receipt("A999", -500, "2026-02-01"),
      receipt("A101", -9_000, "2026-04-01", { writtenBy: "other@example.test" }),
    ] })).toEqual([
      row("A101", 500_000, 300_000, 125_000, -175_000),
      row("A201", 200_000, 120_000, 120_000, 0),
      row("A999", null, null, 50_000, null),
    ]);
  });

  it("uses commenced months and the shorter agreed duration", () => {
    const contract = { ...life, policyStartDate: "2025-01-31", policyEndDate: "2026-01-31",
      commissionPayouts: [receipt("A101", 10_000, "2025-02-02")] };
    expect(compare(contract, "2025-04-30")).toEqual([row("A101", 1_000_000, 750_000, null, null)]);
    expect(compare(contract, "2025-05-01")).toEqual([row("A101", 1_000_000, 666_667, null, null)]);
  });

  it("estimates historical FLEXI without a commission plan or the original end date", () => {
    const contract: CommissionStornoEntry = { ...life, items: [], durationYears: 20, policyEndDate: "2026-07-01",
      commissionPayouts: [receipt("A101", 1_000)] };
    for (const durationYears of [20, undefined]) {
      expect(compare({ ...contract, durationYears }, "2026-07-01"))
        .toEqual([row("A101", 100_000, 50_000, null, null)]);
    }
  });

  it("uses the full FLEXI payout through two calendar months", () => {
    const contract = { ...life, policyStartDate: "2025-01-31", items: [],
      commissionPayouts: [receipt("A101", 1_000, "2025-02-02")] };
    expect(compare(contract, "2025-03-31")).toEqual([row("A101", 100_000, 100_000, null, null)]);
    expect(compare(contract, "2025-04-01")).toEqual([row("A101", 100_000, 95_000, null, null)]);
  });

  it.each(["flexi", "neon"] as const)("returns the full recorded premature B36 and B48 payout on %s", productKey => {
    const contract: CommissionStornoEntry = {
      ...life, productKey, policyStartDate: "2024-07-01", commissionPayouts: [
        receipt("B36", 2_700, "10.01.2026", { statementPeriod: "01.01.2026 - 31.01.2026" }),
        receipt("B048", 500, "2025-12-31"),
        receipt("B3601", -2_665.35, "2026-02-10"),
        receipt("B4801", -486.09, "2026-02-10"),
      ],
    };
    expect(compare(contract, "2026-01-15")).toEqual([
      row("B3601", 270_000, 270_000, 266_535, -3_465),
      row("B4801", 50_000, 50_000, 48_609, -1_391),
    ]);
  });

  it("keeps the normal estimate at entitlement and for the separately paid accelerated half", () => {
    const contract: CommissionStornoEntry = {
      ...life, items: [
        { code: "B36", title: "Provize po 3 letech", amount: 1_000 },
        { code: "B36_HALF", title: "Provize 50 % z B36", amount: 500 },
      ],
      commissionPayouts: [receipt("B36", 1_000, "2026-12-15"), receipt("B36_HALF", 500, "2024-02-01")],
    };
    expect(compare(contract, "2027-01-01")).toEqual([
      row("B3601", 100_000, 40_000, null, null),
      row("B3601_HALF", 50_000, 20_000, null, null),
    ]);
    expect(compare(contract, "2026-01-01").find(item => item.code === "B3601_HALF"))
      .toEqual(row("B3601_HALF", 50_000, 30_000, null, null));
  });

  it("uses the signed-in recipient's booked deferred payout even when the statement is dated after storno", () => {
    const contract: CommissionStornoEntry = { ...life, commissionPayouts: [
      receipt("B36", -900, "2026-02-01"),
      receipt("B48", -500, "2026-02-01"),
      receipt("B4801", 500, "2026-01-20"),
      receipt("B3601", 900, "2025-12-31", { writtenBy: "other@example.test" }),
    ] };
    expect(compare(contract)).toEqual([
      row("B3601", null, null, 90_000, null),
      { ...row("B4801", 50_000, 50_000, 50_000, 0), includesPayoutWithoutPriorDate: true },
    ]);
  });

  it("keeps the replaced deferred payout out of the basis when a later correction lacks a date", () => {
    const contract: CommissionStornoEntry = { ...life, commissionPayouts: [
      receipt("B36", 1_000, "2025-12-01"),
      receipt("B36", -1_000, "", { detail: "Součást opravného výpisu: odúčtování původní B36." }),
      receipt("B3601", 1_100, ""),
      receipt("B3601", -1_100, "2026-02-01"),
    ] };
    expect(compare(contract)).toEqual([
      { ...row("B3601", 110_000, 110_000, 110_000, 0), includesPayoutWithoutPriorDate: true },
    ]);
  });

  it("uses paid LIFE commission and the effective storno date for the documented 60/60 and 12/12 rules", () => {
    const neon: CommissionStornoEntry = { ...life, productKey: "neon", contractSignedDate: "2024-07-01",
      policyStartDate: "2024-07-01", commissionPayouts: [
        receipt("A101", 5_000, "2024-08-01"), receipt("A201", 200, "2024-08-01"),
        receipt("B101", 120, "2025-08-01"), receipt("B104", 120, "2028-08-01"),
        receipt("B201", 240, "2028-08-01"), receipt("B202", 240, "2028-08-01", { title: "CPP_N_INVS · B202" }),
        receipt("AP101", -745, "2028-11-15"),
      ] };
    expect(compare(neon, "2028-10-01")).toEqual([
      row("A101", 500_000, 75_000, 74_500, -500),
      row("A201", 20_000, null, null, null),
      row("B101", 12_000, 0, null, null),
      row("B104", 12_000, 9_000, null, null),
      row("B201", 24_000, 18_000, null, null),
      row("B202", 24_000, null, null, null),
    ]);
    expect(compare(neon, "2029-07-01")[0]).toEqual(row("A101", 425_500, 0, null, null));
    expect(compare({ ...neon, isRefresh: true }, "2028-10-01").find(item => item.code === "B104"))
      .toEqual(row("B104", 12_000, null, null, null));
  });

  it("uses the first policy start for NEON increase receipts and keeps their code separate", () => {
    const root: CommissionStornoEntry = { ...life, productKey: "neon", policyStartDate: "2024-07-01",
      commissionPayouts: [receipt("A101", 2_000, "2024-08-01")] };
    const amendment: CommissionStornoEntry = { ...root, id: "increase", rootContractEntryId: root.id, entryType: "endorsement",
      policyStartDate: "2025-09-01", commissionPayouts: [
        receipt("NV101", 1_000, "2025-10-01"), receipt("NV999", 500, "2025-10-01"),
      ] };
    expect(buildCommissionStornoComparison({
      entries: [root, amendment], ownerEmail: owner, viewerEmail: owner, stornoDate: "2026-07-01",
    })).toEqual([
      row("A101", 200_000, 120_000, null, null),
      row("NV101", 100_000, 60_000, null, null),
      row("NV999", 50_000, null, null, null),
    ]);
  });

  it("includes paid NEON LIFE commissions when the storno is effective retroactively from inception", () => {
    const neon: CommissionStornoEntry = { ...life, productKey: "neon", policyStartDate: "2024-07-01",
      commissionPayouts: [receipt("A101", 1_000, "2024-08-01"), receipt("B0301", 120, "2024-10-01"),
        receipt("A101", -990, "2024-11-01")] };
    expect(compare(neon, "2024-07-01")).toEqual([
      row("A101", 100_000, 100_000, 99_000, -1_000),
      row("B0301", 12_000, 12_000, null, null),
    ]);
  });

  it("uses a full NEON acquisition refund through two calendar months on a historical contract", () => {
    const neon: CommissionStornoEntry = {
      ...life, productKey: "neon", contractSignedDate: "2024-02-01", policyStartDate: "2024-02-02",
      items: [{ code: "A101", title: "Okamžitá provize", amount: 7_121.14 }, { code: "B0301", title: "Provize po 3 měsících", amount: 1_834.72 }],
      commissionPayouts: [
        receipt("A101", 7_121.14, "2024-02-29"), receipt("B0301", 1_834.72, "2024-02-29"),
        receipt("A101", -7_121.14, "2024-04-30"), receipt("B0301", -1_834.72, "2024-04-30"),
      ],
    };
    for (const day of ["2024-03-08", "2024-04-02"]) {
      expect(compare(neon, day)).toEqual([
        row("A101", 712_114, 712_114, 712_114, 0),
        row("B0301", 183_472, 183_472, 183_472, 0),
      ]);
    }
    expect(compare(neon, "2024-04-03")).toEqual([
      row("A101", 712_114, 676_508, 712_114, 35_606),
      row("B0301", 183_472, 174_298, 183_472, 9_174),
    ]);
  });

  it("uses the two-month auto scenario for acquisition payouts", () => {
    const contract: CommissionStornoEntry = { id: "auto", productKey: "cppAuto", policyStartDate: "2025-01-31",
      commissionPayouts: [receipt("A101", 1_000, "2025-02-01"), receipt("B101", 500, "2025-02-01")] };
    expect(compare(contract, "2025-03-31")).toEqual([row("A101", 100_000, 100_000, null, null), row("B101", 50_000, null, null, null)]);
    expect(compare(contract, "2025-04-01")[0]).toEqual(row("A101", 100_000, null, null, null));
  });

  it("recalculates older stored stornos under the applicable unused-premium terms", () => {
    const contract: CommissionStornoEntry = {
      id: "auto", productKey: "cppAuto", contractSignedDate: "2026-04-01", policyStartDate: "2026-04-15", frequencyRaw: "annual",
      commissionPayouts: [receipt("A101", 1_200, "2026-04-30"), receipt("AP101", -900, "2026-09-30")],
    };
    expect(compare(contract, "2026-07-15")).toEqual([row("A101", 120_000, 90_082, 90_000, -82)]);
    expect(compare({ ...contract, contractSignedDate: "2026-03-31" }, "2026-07-15"))
      .toEqual([row("A101", 120_000, null, 90_000, null)]);
  });

  it("uses only the unearned second installment for historical semiannual payouts", () => {
    const contract: CommissionStornoEntry = {
      id: "auto", productKey: "cppAuto", policyStartDate: "2025-01-01", frequencyRaw: "semiannual",
      commissionPayouts: [receipt("A101", 600, "2025-01-31"), receipt("A102", 600, "2025-07-31")],
    };
    expect(compare(contract, "2025-09-01")).toEqual([
      row("A101", 60_000, 0, null, null),
      row("A102", 60_000, 39_783, null, null),
    ]);
    expect(compare({ ...contract, commissionPayouts: [contract.commissionPayouts![0]] }, "2025-07-01"))
      .toEqual([row("A101", 60_000, 0, null, null)]);
  });

  it("does not use an installment estimate for a historical payout recorded as annual", () => {
    const contract: CommissionStornoEntry = {
      id: "auto", productKey: "cppAuto", policyStartDate: "2025-01-01", frequencyRaw: "semiannual",
      commissionPayouts: [receipt("B102", 1_200, "2026-08-01", { basePremiumPeriod: "annual" })],
    };
    expect(compare(contract, "2026-09-01")).toEqual([row("B102", 120_000, null, null, null)]);
  });

  it("flags the daily Allianz estimate when newer terms are used for a historical contract", () => {
    const contract: CommissionStornoEntry = {
      id: "auto", productKey: "allianzAuto", contractSignedDate: "2026-01-01", policyStartDate: "2026-01-01",
      frequencyRaw: "monthly", commissionPayouts: [receipt("A101", 365, "2026-01-31"), receipt("A101", -180, "2026-07-31")],
    };
    expect(compare(contract, "2026-07-01")).toEqual([
      { ...row("A101", 36_500, 18_400, 18_000, -400), usingNewerTerms: true },
    ]);
    expect(compare(contract, "2026-03-31")).toEqual([row("A101", 36_500, null, 18_000, null)]);
  });

  it("uses the unused part of each installment and of renewals separately", () => {
    const contract: CommissionStornoEntry = {
      id: "auto", productKey: "kooperativaAuto", policyStartDate: "2026-04-30", frequencyRaw: "quarterly",
      commissionPayouts: [receipt("A101", 100, "2026-05-01"), receipt("A102", 120, "2026-08-01")],
    };
    expect(compare(contract, "2026-08-30")).toEqual([
      row("A101", 10_000, 0, null, null),
      row("A102", 12_000, 7_957, null, null),
    ]);
    expect(compare({ ...contract, commissionPayouts: [
      ...contract.commissionPayouts!, receipt("C101", 100, "2027-05-01"),
    ] }, "2027-06-15")).toEqual([
      row("A101", 10_000, 0, null, null),
      row("A102", 12_000, 0, null, null),
      row("B101", 10_000, 4_945, null, null),
    ]);
  });

  it("estimates the known annual renewal bundle over both half-years", () => {
    const contract: CommissionStornoEntry = {
      id: "auto", productKey: "cppAuto", policyStartDate: "2026-04-01", frequencyRaw: "semiannual",
      commissionPayouts: [receipt("B102", 600, "2027-10-14", { basePremiumPeriod: "annual" })],
    };
    expect(compare(contract, "2027-11-01")).toEqual([row("B102", 60_000, 24_918, null, null)]);
  });

  it("honors dated frequency changes and the separately documented home insurance terms", () => {
    const auto: CommissionStornoEntry = {
      id: "auto", productKey: "cppAuto", policyStartDate: "2026-04-01", frequencyRaw: "annual",
      paymentFrequencyChanges: [{ effectiveDate: "2026-10-01", frequency: "quarterly" }],
      commissionPayouts: [receipt("A101", 1_830, "2026-04-08")],
    };
    expect(compare(auto, "2026-07-01")).toEqual([row("A101", 183_000, 92_000, null, null)]);
    const home: CommissionStornoEntry = {
      id: "home", productKey: "allianzmujdomov", policyStartDate: "2024-01-01", frequencyRaw: "annual",
      commissionPayouts: [receipt("A101", 500, "2024-02-15"), receipt("B101", 730, "2025-02-15")],
    };
    expect(compare(home, "2025-07-01")).toEqual([
      row("A101", 50_000, 20_000, null, null),
      row("B101", 73_000, 36_800, null, null),
    ]);
    const termHome = { ...home, policyEndDate: "2024-07-01",
      commissionPayouts: [receipt("B101", 182, "2024-02-15")] };
    expect(compare(termHome, "2024-04-01")).toEqual([row("B101", 18_200, 9_100, null, null)]);
  });

  it("leaves uncertain receipts and products without a usable rule for review", () => {
    expect(compare({ ...life, commissionPayouts: [receipt("A201", 200, ""), receipt("A201", -100, "2026-02-01")] }))
      .toEqual([row("A201", null, null, 10_000, null)]);
    expect(compare({ ...life, productKey: "pillowInjury", commissionPayouts: [receipt("A101", 500)] }))
      .toEqual([row("A101", 50_000, null, null, null)]);
    expect(compare({ ...life, commissionPayouts: [receipt("A101", 500)] }, "2026-02-30")).toEqual([]);
  });

  it("isolates the signed-in recipient's FLEXI payments from other and unattributed payments", () => {
    const manager = "manager@example.test";
    const contract = { ...life, managerOverrides: [{ email: manager, items: [{ title: "Meziprovize", code: "A101", amount: 2_000 }] }],
      commissionPayouts: [receipt("A101", 10_000), receipt("A101", 8_000, "2025-08-01", { writtenBy: null }),
        receipt("A101", 1_000, "2025-08-01", { writtenBy: manager })] };
    expect(compare(contract, undefined, null)).toEqual([]);
    expect(compare(contract, undefined, "another@example.test")).toEqual([]);
    expect(compare(contract, undefined, manager)).toEqual([row("A101", 100_000, 60_000, null, null)]);
    expect(compare(contract)).toEqual([row("A101", 1_000_000, 600_000, null, null)]);
  });
});
