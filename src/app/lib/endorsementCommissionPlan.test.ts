import { describe, expect, it } from "vitest";
import {
  createEndorsementCommissionPlan,
  endorsementCommissionDay,
  type EndorsementCommissionPlanEntry,
} from "./endorsementCommissionPlan";

const owner = "adviser@example.test";
const root: EndorsementCommissionPlanEntry = {
  id: "root", userEmail: owner, productKey: "neon", entryType: "contract",
  policyStartDate: "2022-02-01", inputAmount: 2000,
};
const decrease: EndorsementCommissionPlanEntry = {
  id: "decrease", userEmail: owner, productKey: "neon", entryType: "endorsement",
  rootContractEntryId: "root", parentContractEntryId: "root", policyStartDate: "2024-02-01",
  previousInputAmount: 2000, newInputAmount: 1500, premiumDelta: -500, changeType: "decrease",
};
const increase: EndorsementCommissionPlanEntry = {
  ...decrease, id: "increase", parentContractEntryId: "decrease", policyStartDate: "2025-02-01",
  previousInputAmount: 1500, newInputAmount: 1800, premiumDelta: 300, changeType: "increase",
};

describe("endorsement commission plan", () => {
  it("changes only periods from the reduction's effective day and preserves the original amount", () => {
    const plan = createEndorsementCommissionPlan([decrease, root]);
    expect(plan.adjust(root, 1200, "2024-01-31")).toBeNull();
    expect(plan.adjust(root, 1200, "2024-02-01")).toEqual({
      amount: 900, originalAmount: 1200, effectiveDate: "2024-02-01", endorsementEntryId: "decrease",
    });
    expect(plan.adjust(root, 100, "2026-02-01")?.amount).toBe(75);
    expect(plan.currentPremium(root, "2024-01-31")).toBe(2000);
    expect(plan.currentPremium(root, "2024-02-01")).toBe(1500);
  });

  it("uses the original calculation without altering rates or a manager's smaller amount", () => {
    const plan = createEndorsementCommissionPlan([root, decrease]);
    const manager = { ...root, id: "root-override", originalEntryId: "root" };
    expect(plan.adjust(manager, 91.37, "2026-02-01")?.amount).toBe(68.53);
    expect(root.inputAmount).toBe(2000);
    expect(decrease.newInputAmount).toBe(1500);
  });

  it("composes later decreases but keeps a subsequent increase as a separate tranche", () => {
    const later = { ...decrease, id: "later", parentContractEntryId: "increase", policyStartDate: "2026-02-01",
      previousInputAmount: 1800, newInputAmount: 900, premiumDelta: -900 };
    const plan = createEndorsementCommissionPlan([later, increase, root, decrease]);
    expect(plan.adjust(root, 1200, "2025-02-01")?.amount).toBe(900);
    expect(plan.adjust(increase, 180, "2025-02-01")).toBeNull();
    expect(plan.adjust(root, 1200, "2026-02-01")).toEqual({
      amount: 450, originalAmount: 1200, effectiveDate: "2026-02-01", endorsementEntryId: "later",
    });
    expect(plan.adjust(increase, 180, "2026-02-01")?.amount).toBe(90);
    expect(plan.adjust(decrease, 120, "2026-02-01")).toBeNull();
    expect(plan.currentPremium(root, "2025-02-01")).toBe(1800);
    expect(plan.currentPremium(increase, "2026-02-01")).toBe(900);
  });

  it("does not multiply an earlier decrease into a newly created increase tranche", () => {
    const plan = createEndorsementCommissionPlan([root, decrease, increase]);
    expect(plan.adjust(increase, 180, "2026-02-01")).toBeNull();
  });

  it("orders same-day changes by their explicit parent ancestry", () => {
    const first = { ...increase, id: "first", parentContractEntryId: "root", policyStartDate: "2024-02-01",
      previousInputAmount: 2000, newInputAmount: 2400, premiumDelta: 400 };
    const second = { ...decrease, parentContractEntryId: "first", previousInputAmount: 2400,
      newInputAmount: 1200, premiumDelta: -1200 };
    const plan = createEndorsementCommissionPlan([second, first, root]);
    expect(plan.adjust(root, 1200, "2024-02-01")?.amount).toBe(600);
    expect(plan.adjust(first, 240, "2024-02-01")?.amount).toBe(120);
  });

  it("supports a complete premium reduction to zero", () => {
    const zero = { ...decrease, newInputAmount: 0, premiumDelta: -2000 };
    const plan = createEndorsementCommissionPlan([root, zero]);
    expect(plan.adjust(root, 1200, "2024-02-01")?.amount).toBe(0);
    expect(plan.currentPremium(root, "2024-02-01")).toBe(0);
  });

  it.each([0, -10, NaN, Infinity])("leaves nonpositive or invalid commission amounts alone: %s", amount => {
    expect(createEndorsementCommissionPlan([root, decrease]).adjust(root, amount, "2026-02-01")).toBeNull();
  });

  it.each([null, undefined, "", "invalid", "2026-02-30", "2026-13-01", "2026-02-01T00:00:00"])(
    "does not guess an entitlement period from invalid or missing input: %s", period => {
      expect(createEndorsementCommissionPlan([root, decrease]).adjust(root, 1200, period)).toBeNull();
    },
  );

  it.each([
    { userEmail: "other@example.test" }, { productKey: "flexi" }, { rootContractEntryId: "other-root" },
    { entryType: "unknown" },
    { parentContractEntryId: "missing" }, { parentContractEntryId: "decrease" },
    { rootContractEntryId: "decrease" }, { previousInputAmount: 3000 },
    { policyStartDate: "2021-02-01" }, { policyStartDate: "2024-02-30" },
    { previousInputAmount: -2000 }, { previousInputAmount: NaN }, { newInputAmount: Infinity },
    { changeType: "increase" }, { premiumDelta: 500 },
  ])("ignores mismatched, manipulated or invalid changes: %j", patch => {
    expect(createEndorsementCommissionPlan([root, { ...decrease, ...patch }])
      .adjust(root, 1200, "2026-02-01")).toBeNull();
  });

  it("never joins contracts merely by an identical ID across owners", () => {
    const otherRoot = { ...root, userEmail: "other@example.test" };
    const otherDecrease = { ...decrease, userEmail: "other@example.test" };
    const plan = createEndorsementCommissionPlan([root, otherRoot, otherDecrease]);
    expect(plan.adjust(root, 1200, "2026-02-01")).toBeNull();
    expect(plan.adjust(otherRoot, 1200, "2026-02-01")?.amount).toBe(900);
  });

  it("requires known ownership and an existing original root", () => {
    expect(createEndorsementCommissionPlan([decrease]).adjust(decrease, 1200, "2026-02-01")).toBeNull();
    expect(createEndorsementCommissionPlan([{ ...root, userEmail: null }, { ...decrease, userEmail: null }])
      .adjust(root, 1200, "2026-02-01")).toBeNull();
  });

  it("normalizes owner casing and supports the adviser owner field", () => {
    const plan = createEndorsementCommissionPlan([
      { ...root, userEmail: null, adviserEmail: owner.toUpperCase() }, decrease,
    ]);
    expect(plan.adjust(root, 1200, "2026-02-01")?.amount).toBe(900);
  });

  it("ignores conflicting duplicates but accepts identical business data in manager copies", () => {
    const manager = { ...root, originalEntryId: "root", id: "root-override" };
    expect(createEndorsementCommissionPlan([root, manager, decrease])
      .adjust(manager, 1200, "2026-02-01")?.amount).toBe(900);
    expect(createEndorsementCommissionPlan([root, decrease, { ...decrease, newInputAmount: 1000, premiumDelta: -1000 }])
      .adjust(root, 1200, "2026-02-01")).toBeNull();
  });

  it("stops at an ambiguous branch rather than applying two incompatible reductions", () => {
    const sibling = { ...decrease, id: "sibling", policyStartDate: "2025-02-01", newInputAmount: 1000, premiumDelta: -1000 };
    expect(createEndorsementCommissionPlan([root, decrease, sibling])
      .adjust(root, 1200, "2026-02-01")).toBeNull();
  });

  it("retains an established reduction before a later invalid change", () => {
    const invalidLater = { ...increase, previousInputAmount: 500 };
    const plan = createEndorsementCommissionPlan([root, decrease, invalidLater]);
    expect(plan.adjust(root, 1200, "2026-02-01")?.amount).toBe(900);
    expect(plan.currentPremium(root, "2026-02-01")).toBe(1500);
  });

  it.each(["cppAuto", "cppPPRbez", "domex", "maxcizinkomplex", "cppcestovko"])(
    "supports proportional premium-based insurance formulas for %s", productKey => {
      const entry = { ...root, productKey };
      const plan = createEndorsementCommissionPlan([entry, { ...decrease, productKey }]);
      expect(plan.adjust(entry, 1200, "2026-02-01")?.amount).toBe(900);
    },
  );

  it.each(["comfortcc", "conseqzenit", "unknown"])("excludes non-premium or unknown formulas: %s", productKey => {
    const entry = { ...root, productKey };
    expect(createEndorsementCommissionPlan([entry, { ...decrease, productKey }])
      .adjust(entry, 1200, "2026-02-01")).toBeNull();
  });
});

describe("endorsement commission calendar", () => {
  it("retains date-only values and interprets timestamp instants in Europe/Prague", () => {
    expect(endorsementCommissionDay("2024-02-01")).toBe("2024-02-01");
    expect(endorsementCommissionDay(new Date("2024-01-31T23:00:00Z"))).toBe("2024-02-01");
    expect(endorsementCommissionDay("2024-01-31T23:00:00Z")).toBe("2024-02-01");
    expect(endorsementCommissionDay({ seconds: Date.parse("2024-01-31T23:00:00Z") / 1000 })).toBe("2024-02-01");
    expect(endorsementCommissionDay("2024-03-31T22:00:00Z")).toBe("2024-04-01");
    expect(endorsementCommissionDay("2024-02-29")).toBe("2024-02-29");
  });

  it.each(["2023-02-29", "2024-02-30T00:00:00Z", "2024-04-31", "2024-00-01", new Date(NaN), {}, null])(
    "rejects invalid calendar dates without rolling into another day: %s", value => {
      expect(endorsementCommissionDay(value)).toBeNull();
    },
  );
});
