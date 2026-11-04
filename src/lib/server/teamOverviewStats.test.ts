import { describe, expect, it } from "vitest";
import { accumulateContractEntry, annualPremiumFromEntry, consumeOwnerEntry, emptyContractStats } from "./teamOverviewStats";
import type { ContractStats } from "@/app/api/team-overview/teamOverview.types";

const owner = "advisor@example.test";
const period = {
  previousMonthStart: +new Date(2026, 7, 1),
  previousMonthToDateEndMs: +new Date(2026, 7, 18),
  monthStart: +new Date(2026, 8, 1),
  currentMonthToDateEnd: +new Date(2026, 8, 18),
};

describe("team statistics retirement filtering", () => {
  it.each(["comfortcc", " COMFORTCC "])("excludes %s before every count and premium accumulation", productKey => {
    const stats: Record<string, ContractStats> = { [owner]: emptyContractStats() };
    const before = structuredClone(stats);
    const data = { productKey, inputAmount: 100_000, frequencyRaw: "monthly", contractSignedDate: new Date(2026, 8, 10), userEmail: owner };
    accumulateContractEntry({ stats, ownerEmail: owner, data, ...period });
    expect(stats).toEqual(before);
    expect(annualPremiumFromEntry(data)).toBe(0);
    const activeStats: Record<string, ContractStats> = {};
    consumeOwnerEntry({ stats, activeStats, ownerSet: new Set([owner]), data, ownerEmailRaw: owner, entryId: "legacy", seen: new Set(), now: new Date(2026, 8, 18), ...period });
    expect(stats).toEqual(before);
    expect(activeStats).toEqual({});
  });
  it("continues to include active insurance contracts in category and institution metrics", () => {
    const stats: Record<string, ContractStats> = {};
    accumulateContractEntry({ stats, ownerEmail: owner, data: { productKey: "cppAuto", inputAmount: 1000, frequencyRaw: "quarterly", contractSignedDate: new Date(2026, 8, 10) }, ...period });
    expect(stats[owner]).toMatchObject({ total: 1, month: 1, monthMetrics: { contracts: 1, annualPremium: 4000 }, categories: { auto: 1 } });
  });
});
