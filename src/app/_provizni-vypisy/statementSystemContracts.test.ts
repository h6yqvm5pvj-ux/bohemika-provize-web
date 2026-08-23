import { describe, expect, it } from "vitest";

import {
  contractMatchForNumber,
  dedupeEquivalentSystemContracts,
  isUnpairedContractMatch,
  matchedSystemContract,
  matchedSystemContractForPremiumIncrease,
  normalizePositionValue,
  statementProductMatchesSystemProduct,
  systemCommissionMonthlyBase,
  systemContractAnnualPremiumBase,
  systemContractStatusLabel,
  systemContractTimelinePositionMismatch,
  systemMatchHasSingleFamilyHistory,
  systemMatchHistoryLabel,
} from "./statementSystemContracts";
import type { MatchedSystemContract } from "./statementTypes";

const contract = (
  id: string,
  overrides: Partial<MatchedSystemContract> = {}
): MatchedSystemContract => ({
  id,
  adviserEmail: "advisor@example.com",
  contractNumber: "12 34 / AB",
  clientName: "Jana Nováková",
  productKey: "neon",
  position: "poradce3",
  inputAmount: 1_000,
  ...overrides,
});

describe("system contract matching helpers", () => {
  it("looks up scoped contract matches and recognizes unresolved candidates", () => {
    const matched = { status: "matched" as const, contracts: [contract("resolved")] };
    const ambiguous = {
      status: "matched" as const,
      contracts: [
        contract("one", { rootContractEntryId: "one" }),
        contract("two", { rootContractEntryId: "two", contractNumber: "999" }),
      ],
    };

    expect(contractMatchForNumber({ "my:123456": matched }, "123456")).toBe(matched);
    expect(contractMatchForNumber({ "team:123456": matched }, "123456", "team")).toBe(matched);
    expect(isUnpairedContractMatch({ status: "not_found", contracts: [] })).toBe(true);
    expect(isUnpairedContractMatch(ambiguous)).toBe(true);
    expect(isUnpairedContractMatch(matched)).toBe(false);
  });

  it("normalizes supported positions and detects timeline mismatches", () => {
    expect(normalizePositionValue("poradce3")).toBe("poradce3");
    expect(normalizePositionValue("manažer 3")).toBeNull();
    expect(
      systemContractTimelinePositionMismatch(
        contract("timeline", {
          position: "poradce3",
          timelinePosition: "poradce4",
          contractSignedDate: "2026-05-13",
        })
      )
    ).toEqual({
      storedPosition: "poradce3",
      timelinePosition: "poradce4",
      signedDateLabel: "13. 05. 2026",
    });
  });

  it("uses the commission base precedence and computes annual premium", () => {
    expect(
      systemCommissionMonthlyBase(
        contract("refresh", {
          inputAmount: 1_000,
          calculationInputAmount: 1_500,
          refreshCommissionBase: { calculationMonthlyPremium: 2_000 },
        })
      )
    ).toBe(2_000);
    expect(
      systemContractAnnualPremiumBase(
        contract("calculation", { inputAmount: 1_000, calculationInputAmount: 1_500 })
      )
    ).toBe(18_000);
  });

  it("keeps the most complete equivalent contract when deduplicating", () => {
    const sparse = contract("sparse");
    const complete = contract("complete", {
      calculationInputAmount: 1_000,
      maxxContractDetailUrl: "https://maxx.example/contract",
    });

    expect(dedupeEquivalentSystemContracts([sparse, complete])).toEqual([complete]);
  });

  it("resolves a contract family to its original contract and labels its history", () => {
    const original = contract("original", {
      rootContractEntryId: "root-1",
      policyStartDate: "2025-01-01",
    });
    const endorsement = contract("endorsement", {
      entryType: "endorsement",
      rootContractEntryId: "root-1",
      parentContractEntryId: "original",
      policyStartDate: "2025-07-01",
    });
    const match = { status: "matched" as const, contracts: [endorsement, original] };

    expect(matchedSystemContract(match)).toBe(original);
    expect(systemMatchHasSingleFamilyHistory(match)).toBe(true);
    expect(systemMatchHistoryLabel(match)).toBe("1 dodatek");
  });

  it("resolves an increase commission to the endorsement premium delta", () => {
    const original = contract("original", {
      rootContractEntryId: "root-1",
      inputAmount: 1_496,
    });
    const olderEndorsement = contract("older-endorsement", {
      entryType: "endorsement",
      rootContractEntryId: "root-1",
      parentContractEntryId: "original",
      premiumDelta: 300,
      calculationInputAmount: 300,
      policyStartDate: "2026-05-01",
    });
    const matchingEndorsement = contract("matching-endorsement", {
      entryType: "endorsement",
      rootContractEntryId: "root-1",
      parentContractEntryId: "original",
      premiumDelta: 517,
      calculationInputAmount: 517,
      policyStartDate: "2026-06-30",
    });
    const match = {
      status: "matched" as const,
      contracts: [matchingEndorsement, original, olderEndorsement],
    };

    expect(
      matchedSystemContractForPremiumIncrease({
        match,
        statementPremiumBase: 6_204,
        statementBasePeriod: "annual",
      })
    ).toBe(matchingEndorsement);
  });

  it("does not resolve unrelated matching candidates as one contract", () => {
    const match = {
      status: "matched" as const,
      contracts: [
        contract("first", { rootContractEntryId: "root-1" }),
        contract("second", { rootContractEntryId: "root-2", contractNumber: "999" }),
      ],
    };

    expect(matchedSystemContract(match)).toBeNull();
    expect(systemMatchHasSingleFamilyHistory(match)).toBe(false);
  });

  it("recognizes lifecycle labels and compatible Kooperativa product aliases", () => {
    expect(
      systemContractStatusLabel(contract("storno", { status: "storno", stornoDate: "2026-03-15" }))
    ).toBe("storno od 15. 03. 2026");
    expect(statementProductMatchesSystemProduct("koopmajetekobcan", "koopfit")).toBe(true);
    expect(statementProductMatchesSystemProduct("neon", "koopfit")).toBe(false);
  });
});
