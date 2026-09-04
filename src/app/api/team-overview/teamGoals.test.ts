import { describe, expect, it } from "vitest";

import {
  normalizeStoredTeamProductionGoals,
  normalizeTeamProductionGoalsInput,
  productionGoalsFirestorePayload,
} from "./teamGoals";

describe("team production goals", () => {
  it("accepts only members from the manager team and normalizes amounts", () => {
    const goals = normalizeTeamProductionGoalsInput({
      yearMonth: "2026-09",
      allowedMemberEmails: ["advisor@example.com"],
      value: {
        team: {
          totalAnnualPremium: "120000",
          categories: {
            life: 6_000.55,
            auto: -10,
            comfort: 4.6,
            travel: 12_000,
          },
        },
        members: {
          "ADVISOR@example.com": {
            totalAnnualPremium: 50_000.129,
            categories: { property: 20_000 },
          },
        },
      },
    });

    expect(goals).toMatchObject({
      yearMonth: "2026-09",
      team: {
        totalAnnualPremium: 120_000,
        categories: {
          life: 6_000.55,
          auto: 0,
          comfort: 5,
          travel: 0,
        },
      },
      members: {
        "advisor@example.com": {
          totalAnnualPremium: 50_000.13,
          categories: { property: 20_000 },
        },
      },
    });
    expect(
      normalizeTeamProductionGoalsInput({
        yearMonth: "2026-09",
        allowedMemberEmails: ["advisor@example.com"],
        value: { team: {}, members: { "outside@example.com": {} } },
      })
    ).toBeNull();
  });

  it("round-trips the Firestore array representation", () => {
    const input = normalizeTeamProductionGoalsInput({
      yearMonth: "2026-09",
      allowedMemberEmails: ["advisor@example.com"],
      value: {
        team: { totalAnnualPremium: 100_000, categories: { auto: 40_000 } },
        members: {
          "advisor@example.com": {
            totalAnnualPremium: 60_000,
            categories: { life: 60_000 },
          },
        },
      },
    });
    expect(input).not.toBeNull();

    const stored = productionGoalsFirestorePayload({
      ownerEmail: "manager@example.com",
      goals: input!,
      updatedAtMs: 123_456,
      updatedBy: "manager@example.com",
    });
    expect(
      normalizeStoredTeamProductionGoals({ value: stored, yearMonth: "2026-09" })
    ).toMatchObject({
      team: { totalAnnualPremium: 100_000, categories: { auto: 40_000 } },
      members: {
        "advisor@example.com": {
          totalAnnualPremium: 60_000,
          categories: { life: 60_000 },
        },
      },
      updatedAtMs: 123_456,
    });
  });
});
