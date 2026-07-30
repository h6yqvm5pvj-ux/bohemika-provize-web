import { describe, expect, it } from "vitest";

import { detectFullAutoCommissionStorno } from "./stornoInference";

describe("detectFullAutoCommissionStorno", () => {
  const policyStartMs = Date.UTC(2026, 1, 25);
  const existingPayouts = [
    {
      key: "paid-apz101",
      code: "APZ101",
      amount: 609.56,
      status: "paid",
      statementId: "statement-204",
      statementNumber: "204",
      statementPeriod: "02/2026",
      writtenBy: "vojtech.mahr@bohemika.eu",
    },
  ];

  it("detects a full auto commission storno within two months of policy start", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs,
      currentRows: [
        {
          rowId: "row-storno",
          productCode: "KOO_NAMIRU",
          commissionCode: "APZ101",
          commission: -609.56,
          signedAt: "21.04.2026",
          source: "own",
          status: "storno",
        },
      ],
      existingPayouts,
      currentStatementId: "statement-205",
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection).toMatchObject({
      commissionCode: "APZ101",
      stornoAmount: 609.56,
      matchedPaidAmount: 609.56,
      matchedPayoutKey: "paid-apz101",
      matchedStatementId: "statement-204",
    });
    expect(new Date(detection?.stornoDateMs ?? 0).toISOString().slice(0, 10)).toBe(
      "2026-04-21"
    );
  });

  it("does not detect a full auto storno after the two month boundary", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs,
      currentRows: [
        {
          commissionCode: "APZ101",
          commission: -609.56,
          signedAt: "26.04.2026",
          source: "own",
          status: "storno",
        },
      ],
      existingPayouts,
      currentStatementId: "statement-205",
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection).toBeNull();
  });

  it("matches closing commission code aliases from statement rows and stored payouts", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs,
      currentRows: [
        {
          commissionCode: "APZ101",
          commission: -609.56,
          signedAt: "21.04.2026",
          source: "own",
          status: "storno",
        },
      ],
      existingPayouts: [
        {
          ...existingPayouts[0],
          code: "A101",
        },
      ],
      currentStatementId: "statement-205",
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection?.matchedPaidAmount).toBe(609.56);
  });

  it("detects a full auto storno from contract detail commission and statement period", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs,
      currentRows: [
        {
          commissionCode: "A101",
          commission: -609.56,
          signedAt: "30.04.2026",
          source: "own",
          status: "storno",
        },
      ],
      existingPayouts: [],
      contractItems: [
        {
          title: "Okamžitá provize",
          code: "A101",
          amount: 609.56,
        },
      ],
      currentStatementId: "statement-205",
      statementPeriodEndMs: Date.UTC(2026, 2, 31),
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection).toMatchObject({
      matchedSource: "contract_item",
      matchedTitle: "Okamžitá provize",
      referenceDateSource: "statement_period",
      stornoAmount: 609.56,
      matchedPaidAmount: 609.56,
    });
    expect(new Date(detection?.stornoDateMs ?? 0).toISOString().slice(0, 10)).toBe(
      "2026-03-31"
    );
  });

  it("detects a full auto storno when the statement period overlaps the two month window", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs: Date.UTC(2026, 0, 15),
      currentRows: [
        {
          commissionCode: "A101",
          commission: -242.88,
          signedAt: "31.03.2026",
          source: "own",
          status: "storno",
        },
      ],
      existingPayouts: [],
      contractItems: [
        {
          title: "Okamžitá provize",
          code: "A101",
          amount: 242.88,
        },
      ],
      currentStatementId: "statement-205",
      statementPeriodStartMs: Date.UTC(2026, 2, 1),
      statementPeriodEndMs: Date.UTC(2026, 2, 31),
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection).toMatchObject({
      matchedSource: "contract_item",
      referenceDateSource: "statement_period_overlap",
      stornoAmount: 242.88,
      matchedPaidAmount: 242.88,
    });
    expect(new Date(detection?.stornoDateMs ?? 0).toISOString().slice(0, 10)).toBe(
      "2026-03-15"
    );
  });

  it("does not detect correction statements with a replacement payout", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs,
      currentRows: [
        {
          commissionCode: "APZ101",
          commission: -609.56,
          signedAt: "21.04.2026",
          source: "own",
          status: "storno",
        },
        {
          commissionCode: "APZ101",
          commission: 609.56,
          signedAt: "21.04.2026",
          source: "own",
          status: "paid",
        },
      ],
      existingPayouts,
      currentStatementId: "statement-205",
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection).toBeNull();
  });

  it("does not detect partial stornos", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs,
      currentRows: [
        {
          commissionCode: "APZ101",
          commission: -300,
          signedAt: "21.04.2026",
          source: "own",
          status: "storno",
        },
      ],
      existingPayouts,
      currentStatementId: "statement-205",
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection).toBeNull();
  });

  it("does not match a previous payout written by another statement owner", () => {
    const detection = detectFullAutoCommissionStorno({
      isAutoProduct: true,
      contractStatus: "active",
      policyStartMs,
      currentRows: [
        {
          commissionCode: "APZ101",
          commission: -609.56,
          signedAt: "21.04.2026",
          source: "own",
          status: "storno",
        },
      ],
      existingPayouts: [
        {
          ...existingPayouts[0],
          key: "manager-paid-apz101",
          writtenBy: "manager@bohemika.eu",
        },
      ],
      currentStatementId: "statement-205",
      writtenBy: "vojtech.mahr@bohemika.eu",
    });

    expect(detection).toBeNull();
  });
});
