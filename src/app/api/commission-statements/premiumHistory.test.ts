import { describe, expect, it } from "vitest";

import {
  annualPremiumFromStoredHistoryEntry,
  autoContractWasCreatedFromCommissionStatement,
  canApplyPremiumStatementToCurrentContract,
  mergePremiumHistoryRecords,
  premiumHistoryEntryFromStatementRow,
  type PremiumHistoryContract,
  type PremiumStatementHistoryEntry,
  type PremiumStatementRow,
} from "./premiumHistory";

const statementContext = {
  statementNumber: "100",
  statementDate: "31.05.2021",
  statementPeriod: "01.05.2021 - 31.05.2021",
  payoutMonthKey: "2021-05",
  periodEndMs: Date.UTC(2021, 4, 31),
  statementChronologyMs: Date.UTC(2021, 4, 31),
  nowMs: Date.UTC(2026, 7, 1),
  writtenBy: "vojtech.mahr@bohemika.eu",
};

const autoContract = (
  premiumStatementHistory: PremiumStatementHistoryEntry[] = []
): PremiumHistoryContract & { premiumUpdatedFromStatementChronologyMs?: number | null } => ({
  productKey: "cppAuto",
  inputAmount: 10000,
  frequencyRaw: "annual",
  policyStartDate: "2020-05-06",
  premiumStatementHistory,
  premiumUpdatedFromStatementChronologyMs: Date.UTC(2022, 4, 31),
});

const autoInitialRow: PremiumStatementRow = {
  premiumKind: "auto_initial",
  rowId: "a-row",
  contractNumber: "3250129511",
  productCode: "CPP_ACPIV",
  productKey: "cppAuto",
  commissionCode: "A102",
  basePremium: 9000,
  signedAt: "06.05.2020",
  validFrom: "06.05.2020",
  source: "own",
};

const autoSubsequentRow: PremiumStatementRow = {
  premiumKind: "auto_change",
  rowId: "b-row",
  contractNumber: "3250129511",
  productCode: "CPP_ACPIV",
  productKey: "cppAuto",
  commissionCode: "B101",
  basePremium: 10000,
  signedAt: "06.05.2020",
  validFrom: "06.05.2020",
  source: "own",
};

describe("premium statement history", () => {
  it("never turns a life commission base into a premium change", () => {
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "life_increase",
        rowId: "450914",
        contractNumber: "7503217987",
        productCode: "CPP_N_LIFE",
        productKey: "neon",
        commissionCode: "NB0301",
        basePremium: 6204,
        signedAt: "09.06.2026",
        validFrom: null,
        source: "manager",
      },
      contract: {
        productKey: "neon",
        inputAmount: 517,
        policyStartDate: "2026-06-30",
        premiumStatementHistory: [],
      },
      statementId: "statement-76",
      ...statementContext,
      statementDate: "24.08.2026",
      statementPeriod: "01.07.2026 - 31.07.2026",
    });

    expect(change).toBeNull();
  });

  it("does not duplicate history when the same statement is uploaded under another file hash", () => {
    const first = premiumHistoryEntryFromStatementRow({
      row: autoInitialRow,
      contract: autoContract(),
      statementId: "first-content-hash",
      ...statementContext,
      allowCurrentPremiumFallback: false,
    });
    const reuploaded = premiumHistoryEntryFromStatementRow({
      row: autoInitialRow,
      contract: autoContract(),
      statementId: "second-content-hash",
      ...statementContext,
      nowMs: statementContext.nowMs + 10_000,
      allowCurrentPremiumFallback: false,
    });

    const merged = mergePremiumHistoryRecords([first!], [reuploaded!], 120);

    expect(merged.merged).toHaveLength(1);
    expect(merged.added).toBe(0);
    expect(merged.existingCount).toBe(1);
  });

  it("detects only auto contracts that were created from commission statement metadata", () => {
    const createdAt = Date.UTC(2022, 4, 20, 9, 0, 0);

    expect(
      autoContractWasCreatedFromCommissionStatement({
        productKey: "cppAuto",
        createdFromCommissionStatement: true,
      })
    ).toBe(true);

    expect(
      autoContractWasCreatedFromCommissionStatement({
        productKey: "cppAuto",
        createdAt,
        premiumUpdatedFromStatementAtMs: createdAt + 2 * 60 * 1000,
        premiumUpdatedFromStatementId: "legacy-statement-id",
      })
    ).toBe(true);

    expect(
      autoContractWasCreatedFromCommissionStatement({
        productKey: "cppAuto",
        createdAt,
        premiumUpdatedFromStatementAtMs: createdAt + 60 * 60 * 1000,
        premiumUpdatedFromStatementId: "later-statement-id",
      })
    ).toBe(false);

    expect(
      autoContractWasCreatedFromCommissionStatement({
        productKey: "domex",
        createdFromCommissionStatement: true,
      })
    ).toBe(false);
  });

  it("backfills an auto initial base from an older A row without using the newer current premium", () => {
    const initial = premiumHistoryEntryFromStatementRow({
      row: autoInitialRow,
      contract: autoContract(),
      statementId: "statement-2020",
      ...statementContext,
      statementDate: "31.05.2020",
      statementPeriod: "01.05.2020 - 31.05.2020",
      periodEndMs: Date.UTC(2020, 4, 31),
      statementChronologyMs: Date.UTC(2020, 4, 31),
      allowCurrentPremiumFallback: false,
    });

    expect(initial).toMatchObject({
      premiumKind: "auto_initial",
      anniversaryDate: "2020-05-06",
      newPremium: 9000,
      newAnnualPremium: 9000,
      previousAnnualPremium: null,
    });

    const canApplyCurrent = canApplyPremiumStatementToCurrentContract(
      autoContract([initial!]),
      Date.UTC(2021, 4, 31)
    );
    expect(canApplyCurrent).toBe(false);

    const firstAnniversary = premiumHistoryEntryFromStatementRow({
      row: autoSubsequentRow,
      contract: autoContract([initial!]),
      statementId: "statement-2021",
      ...statementContext,
      allowCurrentPremiumFallback: false,
    });

    expect(firstAnniversary).toMatchObject({
      premiumKind: "auto_change",
      anniversaryNumber: 1,
      anniversaryDate: "2021-05-06",
      previousAnnualPremium: 9000,
      newAnnualPremium: 10000,
      differenceAnnual: 1000,
    });
  });

  it("keeps CPP Auto initial statement base as the payment base for semiannual contracts", () => {
    const initial = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_initial",
        rowId: "kuzelova-a-row",
        contractNumber: "3238482327",
        productCode: "CPP_ACPIII",
        productKey: "cppAuto",
        commissionCode: "A101",
        basePremium: 3700,
        signedAt: "11.02.2020",
        validFrom: "11.02.2020",
        source: "own",
      },
      contract: {
        productKey: "cppAuto",
        inputAmount: 4733,
        frequencyRaw: "semiannual",
        policyStartDate: "2020-02-11",
        premiumStatementHistory: [],
      },
      statementId: "statement-126",
      ...statementContext,
      statementDate: "20.03.2020",
      statementPeriod: "01.02.2020 - 29.02.2020",
      periodEndMs: Date.UTC(2020, 1, 29),
      statementChronologyMs: Date.UTC(2020, 2, 20),
      allowCurrentPremiumFallback: false,
    });

    expect(initial).toMatchObject({
      premiumKind: "auto_initial",
      basePremiumPeriod: "payment",
      anniversaryDate: "2020-02-11",
      newPremium: 3700,
      newAnnualPremium: 7400,
    });
  });

  it("keeps CPP Auto statement base unchanged when contract frequency is missing", () => {
    const initial = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_initial",
        rowId: "340083",
        contractNumber: "3239091313",
        productCode: "CPP_ACPIII",
        productKey: "cppAuto",
        commissionCode: "A101",
        basePremium: 10709,
        signedAt: "29.07.2020",
        validFrom: "29.07.2020",
        source: "own",
      },
      contract: {
        productKey: "cppAuto",
        inputAmount: 12184,
        frequencyRaw: null,
        policyStartDate: "2020-07-29",
        premiumStatementHistory: [],
      },
      statementId: "statement-133",
      ...statementContext,
      statementDate: "22.10.2020",
      statementPeriod: "01.09.2020 - 30.09.2020",
      periodEndMs: Date.UTC(2020, 8, 30),
      statementChronologyMs: Date.UTC(2020, 9, 22),
      allowCurrentPremiumFallback: false,
    });

    expect(initial).toMatchObject({
      premiumKind: "auto_initial",
      basePremiumPeriod: "payment",
      anniversaryDate: "2020-07-29",
      newPremium: 10709,
      newAnnualPremium: 10709,
    });
  });

  it("detects a delayed CPP Auto anniversary payout from the commission code", () => {
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "339307",
        contractNumber: "3250455130",
        productCode: "CPP_ACPIV",
        productKey: "cppAuto",
        commissionCode: "B101",
        basePremium: 2855,
        signedAt: "06.07.2020",
        validFrom: "06.07.2020",
        source: "own",
      },
      contract: {
        productKey: "cppAuto",
        inputAmount: 2689,
        frequencyRaw: "quarterly",
        policyStartDate: "2020-07-06",
        premiumStatementHistory: [],
      },
      statementId: "statement-146",
      ...statementContext,
      statementDate: "20.01.2022",
      statementPeriod: "01.12.2021 - 31.12.2021",
      periodEndMs: Date.UTC(2021, 11, 31),
      statementChronologyMs: Date.UTC(2022, 0, 20),
    });

    expect(change).toMatchObject({
      premiumKind: "auto_change",
      anniversaryNumber: 1,
      anniversaryDate: "2021-07-06",
      previousAnnualPremium: 10756,
      newAnnualPremium: 11420,
      differenceAnnual: 664,
      basePremiumPeriod: "payment",
    });
  });

  it("converts a quarterly CPP anniversary base to one annual change", () => {
    const legacyInitial: PremiumStatementHistoryEntry = {
      key: "legacy-initial",
      premiumKind: "auto_initial",
      statementId: "statement-65",
      statementNumber: "65",
      statementPeriod: "01.09.2025 - 30.09.2025",
      statementDate: "23.10.2025",
      statementChronologyMs: Date.UTC(2025, 9, 23),
      payoutMonthKey: "2025-10",
      anniversaryNumber: 0,
      anniversaryDate: "2024-08-20",
      previousPremium: null,
      newPremium: 1622,
      difference: 0,
      previousAnnualPremium: null,
      newAnnualPremium: 1622,
      differenceAnnual: null,
      basePremiumPeriod: null,
      productCode: "CPP_ACPIV",
      commissionCode: null,
      rowId: "initial:416477",
      validFrom: "20.08.2024",
      source: "own",
      writtenAtMs: 1,
      writtenBy: "jakub.rauscher@bohemika.eu",
    };
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "416477",
        contractNumber: "3267327121",
        productCode: "CPP_ACPIV",
        productKey: "cppAuto",
        commissionCode: "B101",
        basePremium: 1716,
        signedAt: "18.08.2024",
        validFrom: "20.08.2024",
        source: "own",
      },
      contract: {
        productKey: "cppAuto",
        inputAmount: 1716,
        frequencyRaw: "quarterly",
        policyStartDate: "2024-08-20",
        premiumStatementHistory: [legacyInitial],
      },
      statementId: "statement-65",
      ...statementContext,
      statementNumber: "65",
      statementDate: "23.10.2025",
      statementPeriod: "01.09.2025 - 30.09.2025",
      periodEndMs: Date.UTC(2025, 8, 30),
      statementChronologyMs: Date.UTC(2025, 9, 23),
      allowCurrentPremiumFallback: false,
    });

    expect(change).toMatchObject({
      premiumKind: "auto_change",
      basePremiumPeriod: "payment",
      previousPremium: 1622,
      newPremium: 1716,
      difference: 94,
      previousAnnualPremium: 6488,
      newAnnualPremium: 6864,
      differenceAnnual: 376,
    });
  });

  it("repairs a legacy quarterly initial amount that was stored as annual", () => {
    expect(
      annualPremiumFromStoredHistoryEntry(
        {
          key: "legacy-initial",
          premiumKind: "auto_initial",
          statementId: "statement-65",
          statementNumber: "65",
          statementPeriod: "01.09.2025 - 30.09.2025",
          statementDate: "23.10.2025",
          statementChronologyMs: Date.UTC(2025, 9, 23),
          payoutMonthKey: "2025-10",
          anniversaryNumber: 0,
          anniversaryDate: "2024-08-20",
          previousPremium: null,
          newPremium: 1622,
          difference: null,
          previousAnnualPremium: null,
          newAnnualPremium: 1622,
          differenceAnnual: null,
          basePremiumPeriod: null,
          productCode: "CPP_ACPIV",
          commissionCode: null,
          rowId: "initial:416477",
          validFrom: "20.08.2024",
          source: "own",
          writtenAtMs: 1,
          writtenBy: "jakub.rauscher@bohemika.eu",
        },
        {
          productKey: "cppAuto",
          frequencyRaw: "quarterly",
        }
      )
    ).toBe(6488);
  });

  it("ignores a CPP Auto semiannual B row that is only the second installment", () => {
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "semiannual-b102-row",
        contractNumber: "3238482327",
        productCode: "CPP_ACPIII",
        productKey: "cppAuto",
        commissionCode: "B102",
        basePremium: 5500,
        signedAt: "11.02.2020",
        validFrom: "11.02.2020",
        source: "own",
      },
      contract: {
        productKey: "cppAuto",
        inputAmount: 5000,
        frequencyRaw: "semiannual",
        policyStartDate: "2020-02-11",
        premiumStatementHistory: [],
      },
      statementId: "statement-2021-installment",
      ...statementContext,
      statementDate: "22.10.2021",
      statementPeriod: "01.09.2021 - 30.09.2021",
      periodEndMs: Date.UTC(2021, 8, 30),
      statementChronologyMs: Date.UTC(2021, 9, 22),
    });

    expect(change).toBeNull();
  });

  it("maps a CPP Auto semiannual B103 row to the second anniversary", () => {
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "semiannual-b103-row",
        contractNumber: "3238482327",
        productCode: "CPP_ACPIII",
        productKey: "cppAuto",
        commissionCode: "B103",
        basePremium: 5500,
        signedAt: "11.02.2020",
        validFrom: "11.02.2020",
        source: "own",
      },
      contract: {
        productKey: "cppAuto",
        inputAmount: 5000,
        frequencyRaw: "semiannual",
        policyStartDate: "2020-02-11",
        premiumStatementHistory: [],
      },
      statementId: "statement-2022-anniversary",
      ...statementContext,
      statementDate: "22.10.2022",
      statementPeriod: "01.09.2022 - 30.09.2022",
      periodEndMs: Date.UTC(2022, 8, 30),
      statementChronologyMs: Date.UTC(2022, 9, 22),
    });

    expect(change).toMatchObject({
      premiumKind: "auto_change",
      anniversaryNumber: 2,
      anniversaryDate: "2022-02-11",
      previousAnnualPremium: 10000,
      newAnnualPremium: 11000,
      differenceAnnual: 1000,
      basePremiumPeriod: "payment",
    });
  });

  it("treats Allianz Auto B rows as yearly payouts even for monthly payment frequency", () => {
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "allianz-b102-row",
        contractNumber: "555000111",
        productCode: "ALLMOJEAUT",
        productKey: "allianzAuto",
        commissionCode: "B102",
        basePremium: 13000,
        signedAt: "06.07.2020",
        validFrom: "06.07.2020",
        source: "own",
      },
      contract: {
        productKey: "allianzAuto",
        inputAmount: 1000,
        frequencyRaw: "monthly",
        policyStartDate: "2020-07-06",
        premiumStatementHistory: [],
      },
      statementId: "allianz-statement-2022",
      ...statementContext,
      statementDate: "22.10.2022",
      statementPeriod: "01.09.2022 - 30.09.2022",
      periodEndMs: Date.UTC(2022, 8, 30),
      statementChronologyMs: Date.UTC(2022, 9, 22),
    });

    expect(change).toMatchObject({
      premiumKind: "auto_change",
      anniversaryNumber: 2,
      anniversaryDate: "2022-07-06",
      previousAnnualPremium: 12000,
      newAnnualPremium: 13000,
      differenceAnnual: 1000,
      basePremiumPeriod: "annual",
    });
  });

  it("treats Pillow Auto B rows as yearly payouts even for quarterly payment frequency", () => {
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "pillow-b103-row",
        contractNumber: "666000111",
        productCode: "PIL_AUTOZ",
        productKey: "pillowAuto",
        commissionCode: "B103",
        basePremium: 15500,
        signedAt: "06.07.2020",
        validFrom: "06.07.2020",
        source: "own",
      },
      contract: {
        productKey: "pillowAuto",
        inputAmount: 3500,
        frequencyRaw: "quarterly",
        policyStartDate: "2020-07-06",
        premiumStatementHistory: [],
      },
      statementId: "pillow-statement-2023",
      ...statementContext,
      statementDate: "22.10.2023",
      statementPeriod: "01.09.2023 - 30.09.2023",
      periodEndMs: Date.UTC(2023, 8, 30),
      statementChronologyMs: Date.UTC(2023, 9, 22),
    });

    expect(change).toMatchObject({
      premiumKind: "auto_change",
      anniversaryNumber: 3,
      anniversaryDate: "2023-07-06",
      previousAnnualPremium: 14000,
      newAnnualPremium: 15500,
      differenceAnnual: 1500,
      basePremiumPeriod: "annual",
    });
  });

  it("does not use an auto initial calculation base as current premium for later B rows", () => {
    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "b-row-current",
        contractNumber: "3239091313",
        productCode: "CPP_ACPIII",
        productKey: "cppAuto",
        commissionCode: "B101",
        basePremium: 12184,
        signedAt: "29.07.2020",
        validFrom: "29.07.2020",
        source: "own",
      },
      contract: {
        productKey: "cppAuto",
        inputAmount: 12184,
        calculationInputAmount: 10709,
        frequencyRaw: "annual",
        policyStartDate: "2020-07-29",
        premiumStatementHistory: [],
      },
      statementId: "statement-2021",
      ...statementContext,
      statementDate: "22.10.2021",
      statementPeriod: "01.09.2021 - 30.09.2021",
      periodEndMs: Date.UTC(2021, 8, 30),
      statementChronologyMs: Date.UTC(2021, 9, 22),
      allowCurrentPremiumFallback: true,
    });

    expect(change).toBeNull();
  });

  it("stores property statement bases as a chronological premium timeline", () => {
    const initial = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_initial",
        rowId: "property-a-row",
        contractNumber: "0033308098",
        productCode: "CPP_DOMEX+",
        productKey: "domex",
        commissionCode: "A101",
        basePremium: 12000,
        signedAt: "06.05.2020",
        validFrom: "06.05.2020",
        source: "own",
      },
      contract: {
        productKey: "domex",
        inputAmount: 1100,
        frequencyRaw: "monthly",
        policyStartDate: "2020-05-06",
        premiumStatementHistory: [],
      },
      statementId: "property-statement-2020",
      ...statementContext,
      statementDate: "31.05.2020",
      statementPeriod: "01.05.2020 - 31.05.2020",
      periodEndMs: Date.UTC(2020, 4, 31),
      statementChronologyMs: Date.UTC(2020, 4, 31),
      allowCurrentPremiumFallback: false,
    });

    expect(initial).toMatchObject({
      premiumKind: "auto_initial",
      basePremiumPeriod: "annual",
      newPremium: 1000,
      newAnnualPremium: 12000,
    });

    const change = premiumHistoryEntryFromStatementRow({
      row: {
        premiumKind: "auto_change",
        rowId: "property-b-row",
        contractNumber: "0033308098",
        productCode: "CPP_DOMEX+",
        productKey: "domex",
        commissionCode: "B101",
        basePremium: 13200,
        signedAt: "06.05.2020",
        validFrom: "06.05.2020",
        source: "own",
      },
      contract: {
        productKey: "domex",
        inputAmount: 1100,
        frequencyRaw: "monthly",
        policyStartDate: "2020-05-06",
        premiumStatementHistory: [initial!],
      },
      statementId: "property-statement-2021",
      ...statementContext,
      allowCurrentPremiumFallback: false,
    });

    expect(change).toMatchObject({
      premiumKind: "auto_change",
      basePremiumPeriod: "annual",
      previousAnnualPremium: 12000,
      newAnnualPremium: 13200,
      differenceAnnual: 1200,
    });
  });

  it("updates the same statement row instead of duplicating it after older history is backfilled", () => {
    const incomplete: PremiumStatementHistoryEntry = {
      key: "same-statement-row",
      premiumKind: "auto_change",
      statementId: "statement-2021",
      statementNumber: "101",
      statementPeriod: "01.05.2021 - 31.05.2021",
      statementDate: "31.05.2021",
      statementChronologyMs: Date.UTC(2021, 4, 31),
      payoutMonthKey: "2021-05",
      anniversaryNumber: 1,
      anniversaryDate: "2021-05-06",
      previousPremium: null,
      newPremium: 10000,
      difference: null,
      previousAnnualPremium: null,
      newAnnualPremium: 10000,
      differenceAnnual: null,
      basePremiumPeriod: "annual",
      productCode: "CPP_ACPIV",
      commissionCode: "B101",
      rowId: "b-row",
      validFrom: "06.05.2020",
      source: "own",
      writtenAtMs: 1,
      writtenBy: "vojtech.mahr@bohemika.eu",
    };
    const complete: PremiumStatementHistoryEntry = {
      ...incomplete,
      previousPremium: 9000,
      previousAnnualPremium: 9000,
      difference: 1000,
      differenceAnnual: 1000,
      writtenAtMs: 2,
    };

    const merged = mergePremiumHistoryRecords([incomplete], [complete], 120);

    expect(merged).toMatchObject({
      added: 0,
      existingCount: 1,
      updatedExisting: 1,
    });
    expect(merged.merged).toHaveLength(1);
    expect(merged.merged[0]).toMatchObject({
      key: "same-statement-row",
      previousAnnualPremium: 9000,
      differenceAnnual: 1000,
    });
  });

  it("replaces a previously misclassified statement base for the same physical row", () => {
    const misclassified: PremiumStatementHistoryEntry = {
      key: "old-payment-key",
      premiumKind: "auto_initial",
      statementId: "statement-133",
      statementNumber: "133",
      statementPeriod: "01.09.2020 - 30.09.2020",
      statementDate: "22.10.2020",
      statementChronologyMs: Date.UTC(2020, 9, 22),
      payoutMonthKey: "2020-10",
      anniversaryNumber: 0,
      anniversaryDate: "2020-07-29",
      previousPremium: null,
      newPremium: 10709,
      difference: null,
      previousAnnualPremium: null,
      newAnnualPremium: 21418,
      differenceAnnual: null,
      basePremiumPeriod: "payment",
      productCode: "CPP_ACPIII",
      commissionCode: "A101",
      rowId: "340083",
      validFrom: "29.07.2020",
      source: "own",
      writtenAtMs: 1,
      writtenBy: "vojtech.mahr@bohemika.eu",
    };
    const corrected: PremiumStatementHistoryEntry = {
      ...misclassified,
      key: "new-annual-key",
      newAnnualPremium: 10709,
      basePremiumPeriod: "annual",
      writtenAtMs: 2,
    };

    const merged = mergePremiumHistoryRecords([misclassified], [corrected], 120);

    expect(merged).toMatchObject({
      added: 0,
      existingCount: 1,
      updatedExisting: 1,
    });
    expect(merged.merged).toHaveLength(1);
    expect(merged.merged[0]).toMatchObject({
      key: "new-annual-key",
      basePremiumPeriod: "annual",
      newAnnualPremium: 10709,
    });
  });

  it("collapses duplicate legacy and recalculated records for one statement row", () => {
    const legacy: PremiumStatementHistoryEntry = {
      key: "legacy-quarterly-row",
      premiumKind: "auto_change",
      statementId: "statement-65",
      statementNumber: "65",
      statementPeriod: "01.09.2025 - 30.09.2025",
      statementDate: "23.10.2025",
      statementChronologyMs: Date.UTC(2025, 9, 23),
      payoutMonthKey: "2025-10",
      anniversaryNumber: 1,
      anniversaryDate: "2025-08-20",
      previousPremium: 1622,
      newPremium: 1716,
      difference: 94,
      previousAnnualPremium: null,
      newAnnualPremium: null,
      differenceAnnual: null,
      basePremiumPeriod: null,
      productCode: "CPP_ACPIV",
      commissionCode: "B101",
      rowId: "416477",
      validFrom: "20.08.2024",
      source: "own",
      writtenAtMs: 1,
      writtenBy: "jakub.rauscher@bohemika.eu",
    };
    const incorrectlyRecalculated: PremiumStatementHistoryEntry = {
      ...legacy,
      key: "incorrect-annual-row",
      previousAnnualPremium: 1622,
      newPremium: 6864,
      newAnnualPremium: 6864,
      difference: 5242,
      differenceAnnual: 5242,
      basePremiumPeriod: "payment",
      writtenAtMs: 2,
    };
    const corrected: PremiumStatementHistoryEntry = {
      ...legacy,
      key: "correct-quarterly-row",
      previousAnnualPremium: 6488,
      newAnnualPremium: 6864,
      differenceAnnual: 376,
      basePremiumPeriod: "payment",
      writtenAtMs: 3,
    };

    const merged = mergePremiumHistoryRecords(
      [legacy, incorrectlyRecalculated],
      [corrected],
      120
    );

    expect(merged.merged).toHaveLength(1);
    expect(merged.merged[0]).toMatchObject({
      key: "correct-quarterly-row",
      previousPremium: 1622,
      newPremium: 1716,
      difference: 94,
      previousAnnualPremium: 6488,
      newAnnualPremium: 6864,
      differenceAnnual: 376,
    });
  });

  it("keeps a complete physical-row record over a newer incomplete duplicate", () => {
    const complete: PremiumStatementHistoryEntry = {
      key: "complete",
      premiumKind: "auto_change",
      statementId: "statement-65",
      statementNumber: "65",
      statementPeriod: "01.09.2025 - 30.09.2025",
      statementDate: "23.10.2025",
      statementChronologyMs: Date.UTC(2025, 9, 23),
      payoutMonthKey: "2025-10",
      anniversaryNumber: 1,
      anniversaryDate: "2025-08-20",
      previousPremium: 1622,
      newPremium: 1716,
      difference: 94,
      previousAnnualPremium: 6488,
      newAnnualPremium: 6864,
      differenceAnnual: 376,
      basePremiumPeriod: "payment",
      productCode: "CPP_ACPIV",
      commissionCode: "B101",
      rowId: "416477",
      validFrom: "20.08.2024",
      source: "own",
      writtenAtMs: 1_700_000_000_000,
      writtenBy: "system",
    };
    const newerIncomplete: PremiumStatementHistoryEntry = {
      ...complete,
      key: "newer-incomplete",
      previousAnnualPremium: null,
      newAnnualPremium: null,
      differenceAnnual: null,
      basePremiumPeriod: null,
      writtenAtMs: 1_800_000_000_000,
    };

    const merged = mergePremiumHistoryRecords([complete, newerIncomplete], [], 120);

    expect(merged.merged).toEqual([complete]);
  });

  it("keeps the immutable signing base when a later backfill creates a conflicting initial row", () => {
    const correctInitial: PremiumStatementHistoryEntry = {
      key: "correct-initial",
      premiumKind: "auto_initial",
      statementId: "statement-74",
      statementNumber: "74",
      statementPeriod: "01.05.2026 - 31.05.2026",
      statementDate: "22.06.2026",
      statementChronologyMs: null,
      payoutMonthKey: "2026-06",
      anniversaryNumber: 0,
      anniversaryDate: "2024-05-16",
      previousPremium: null,
      newPremium: 12_724,
      difference: 0,
      previousAnnualPremium: null,
      newAnnualPremium: 12_724,
      differenceAnnual: null,
      basePremiumPeriod: null,
      productCode: "ALLMOJEAUT",
      commissionCode: null,
      rowId: "initial:410766",
      validFrom: "16.05.2024",
      source: "own",
      writtenAtMs: 1_782_733_953_339,
      writtenBy: "system",
    };
    const conflictingInitial: PremiumStatementHistoryEntry = {
      ...correctInitial,
      key: "conflicting-initial",
      newPremium: 14_229,
      newAnnualPremium: 14_229,
      basePremiumPeriod: "annual",
      statementChronologyMs: 1_782_172_800_000,
      writtenAtMs: 1_784_187_067_109,
    };
    const firstAnniversary: PremiumStatementHistoryEntry = {
      key: "first-anniversary",
      premiumKind: "auto_change",
      statementId: "statement-61",
      statementNumber: "61",
      statementPeriod: "01.05.2025 - 31.05.2025",
      statementDate: "20.06.2025",
      statementChronologyMs: 1_750_377_600_000,
      payoutMonthKey: "2025-06",
      anniversaryNumber: 1,
      anniversaryDate: "2025-05-16",
      previousPremium: 12_724,
      newPremium: 14_229,
      difference: 1_505,
      previousAnnualPremium: 12_724,
      newAnnualPremium: 14_229,
      differenceAnnual: 1_505,
      basePremiumPeriod: "annual",
      productCode: "ALLMOJEAUT",
      commissionCode: "B101",
      rowId: "410766",
      validFrom: "16.05.2024",
      source: "own",
      writtenAtMs: 1_750_377_600_000,
      writtenBy: "system",
    };

    const merged = mergePremiumHistoryRecords(
      [correctInitial, conflictingInitial, firstAnniversary],
      [],
      120
    );

    expect(merged.merged.filter((entry) => entry.premiumKind === "auto_initial"))
      .toHaveLength(1);
    expect(merged.merged.find((entry) => entry.premiumKind === "auto_initial"))
      .toMatchObject({
        key: "correct-initial",
        newAnnualPremium: 12_724,
      });
  });
});
