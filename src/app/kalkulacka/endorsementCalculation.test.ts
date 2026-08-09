import { describe, expect, it } from "vitest";

import type { EndorsementSourceEntry } from "./calculatorHelpers";
import {
  buildEndorsementSourceEntries,
  prepareEndorsementDraft,
  type PrepareEndorsementDraftInput,
} from "./endorsementCalculation";
import type { ContractsFindApiResponse } from "./calculatorApi";

const sourceEntry = (
  overrides: Partial<EndorsementSourceEntry> = {}
): EndorsementSourceEntry => ({
  id: "source-entry",
  path: "users/adviser@example.com/contracts/source-entry",
  productKey: "flexi",
  position: "poradce3",
  commissionMode: "standard",
  rootContractEntryId: null,
  effectiveInputAmount: 1_000,
  durationYears: 30,
  durationMonths: null,
  policyStartDate: new Date(2025, 0, 1),
  policyEndDate: new Date(2055, 0, 1),
  contractSignedDate: new Date(2025, 0, 1),
  createdAt: new Date(2025, 0, 1),
  items: [],
  ...overrides,
});

const endorsementInput = (): PrepareEndorsementDraftInput => ({
  source: sourceEntry(),
  targetProduct: "flexi",
  contractNumber: "123456",
  contractSignedDateIso: "2026-06-01",
  policyStartDateIso: "2026-06-01",
  newPremiumAmount: 1_200,
  position: "poradce3",
  commissionMode: "standard",
  durationYears: 30,
  durationMonths: null,
  durationManualOverride: false,
  frequency: "monthly",
  maxCizinKomplexVariant: null,
  comfortPayment: 0,
  comfortGradual: false,
  comfortTargetAmount: 0,
});

const prepare = (overrides: Partial<PrepareEndorsementDraftInput> = {}) =>
  prepareEndorsementDraft({ ...endorsementInput(), ...overrides });

describe("prepareEndorsementDraft", () => {
  it("uses the remaining duration of the original life contract for an increase", () => {
    const result = prepare();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceDurationYears).toBe(29);
    expect(result.draft).toMatchObject({
      changeType: "increase",
      previousPremiumAmount: 1_000,
      newPremiumAmount: 1_200,
      calculationAmount: 200,
      durationYears: 29,
      sourceEntryId: "source-entry",
    });
    expect(result.draft.total).toBeGreaterThan(0);
  });

  it("does not create a commission for a non-NEON premium decrease", () => {
    const result = prepare({
      newPremiumAmount: 800,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toMatchObject({
      changeType: "decrease",
      calculationAmount: 0,
      total: 0,
      items: [],
    });
  });

  it("prorates the original immediate commission for a NEON decrease", () => {
    const result = prepare({
      source: sourceEntry({
        productKey: "neon",
        effectiveInputAmount: 1_000,
        durationYears: 15,
        policyStartDate: new Date(2026, 0, 1),
        policyEndDate: null,
        contractSignedDate: new Date(2026, 0, 1),
        items: [
          { title: "Okamžitá provize", amount: 1_200 },
          { title: "Následná provize", amount: 300 },
        ],
      }),
      targetProduct: "neon",
      contractSignedDateIso: "2026-02-01",
      policyStartDateIso: "2026-02-01",
      newPremiumAmount: 900,
      durationYears: 15,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.changeType).toBe("decrease");
    expect(result.draft.calculationAmount).toBeCloseTo(98.3333, 4);
    expect(result.draft.items).toEqual([
      { title: "Okamžitá provize", amount: -118 },
    ]);
    expect(result.draft.total).toBe(-118);
  });

  it("asks for a manually entered duration when MaxEfekt has none to inherit", () => {
    const result = prepare({
      source: sourceEntry({
        productKey: "maximaMaxEfekt",
        durationYears: null,
        policyStartDate: null,
        policyEndDate: null,
        contractSignedDate: new Date(2025, 0, 1),
      }),
      targetProduct: "maximaMaxEfekt",
      durationYears: null,
      durationManualOverride: false,
    });

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("dobu trvání"),
    });
  });

  it("rejects an endorsement with unchanged premium without replacing the current message", () => {
    const result = prepare({ newPremiumAmount: 1_000 });

    expect(result).toMatchObject({
      ok: false,
      showSaveMessage: false,
      message: expect.stringContaining("stejné"),
    });
  });

  it("rejects a NEON decrease when its effective date cannot form a storno base", () => {
    const result = prepare({
      source: sourceEntry({
        productKey: "neon",
        policyStartDate: new Date(2026, 0, 1),
        policyEndDate: null,
      }),
      targetProduct: "neon",
      policyStartDateIso: "neplatné datum",
      newPremiumAmount: 900,
    });

    expect(result).toMatchObject({
      ok: false,
      showSaveMessage: true,
      message: expect.stringContaining("storno základnu"),
    });
  });
});

describe("buildEndorsementSourceEntries", () => {
  it("uses the effective premium, keeps result items and selects the newest matching source", () => {
    type ContractsFindEntry = NonNullable<ContractsFindApiResponse["contracts"]>[number];
    const entries: ContractsFindEntry[] = [
      {
        id: "older",
        userEmail: "adviser@example.com",
        productKey: "flexi",
        effectiveInputAmount: 1_100,
        durationYears: 30,
        policyStartDate: "2025-01-01",
        contractSignedDate: "2025-01-01",
        createdAt: "2025-01-02",
      },
      {
        id: "newer",
        userEmail: "adviser@example.com",
        productKey: "flexi",
        inputAmount: 1_000,
        newInputAmount: 1_250,
        durationYears: 30,
        policyStartDate: "2025-01-01",
        contractSignedDate: "2025-01-01",
        createdAt: "2025-02-02",
        result: {
          items: [{ title: "Okamžitá provize", amount: 500 }],
        },
      },
      {
        id: "other-product",
        userEmail: "adviser@example.com",
        productKey: "neon",
        inputAmount: 900,
      },
      {
        id: " ",
        userEmail: "adviser@example.com",
        productKey: "flexi",
        inputAmount: 900,
      },
    ];

    const sources = buildEndorsementSourceEntries(entries, "flexi");

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      id: "newer",
      effectiveInputAmount: 1_250,
      path: "users/adviser@example.com/entries/newer",
      items: [{ title: "Okamžitá provize", amount: 500 }],
    });
    expect(sources[1]?.id).toBe("older");
  });
});
