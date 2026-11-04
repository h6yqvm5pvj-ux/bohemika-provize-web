import { describe, expect, it } from "vitest";
import { PRODUCT_ORDER } from "@/app/lib/productCatalog";
import { buildCashflowMonthSections, type CashflowSectionGroup } from "./monthSections";
import type { CashflowItem } from "./types";

function group(productKey: CashflowItem["productKey"], amount = 100, overrides: Partial<CashflowItem> = {}): CashflowSectionGroup {
  const item: CashflowItem = {
    id: productKey, productKey, amount, date: new Date(2026, 8, 25),
    ownerEmail: "test@example.invalid", entryId: productKey, ...overrides,
  };
  return { id: productKey, leadItem: item, items: [item], amount };
}

describe("cashflow month sections", () => {
  it("places every catalog product exactly once in the requested section order and preserves totals", () => {
    const groups = PRODUCT_ORDER.map((product, index) => group(product, index + 1));
    const sections = buildCashflowMonthSections(groups);
    expect(sections.map((section) => section.id)).toEqual([
      "life", "property", "entrepreneurs", "travel", "pension", "foreigners", "auto",
    ]);
    const assigned = sections.flatMap((section) => section.groups);
    expect(assigned).toHaveLength(groups.length);
    expect(new Set(assigned.map((value) => value.id)).size).toBe(groups.length);
    expect(sections.reduce((sum, section) => sum + section.total, 0)).toBe(groups.reduce((sum, value) => sum + value.amount, 0));
    expect(sections.find((section) => section.id === "entrepreneurs")?.groups.map((value) => value.id)).toContain("kooppmop");
    expect(sections.find((section) => section.id === "property")?.groups.map((value) => value.id)).not.toContain("kooppmop");
  });

  it("keeps grouped positive commission parts together and separates cancellation payouts", () => {
    const grouped = group("neon", 450);
    grouped.items = [
      { ...grouped.leadItem, id: "first", amount: 300 },
      { ...grouped.leadItem, id: "second", amount: 150 },
    ];
    const sections = buildCashflowMonthSections([grouped, group("flexi", -50)]);
    expect(sections.map(section => section.id)).toEqual(["life", "cancelled"]);
    expect(sections[0].groups[0]).toBe(grouped);
    expect(sections[0].itemCount).toBe(2);
    expect(sections[0].groups).toHaveLength(1);
    expect(sections[0].total).toBe(450);
    expect(sections[1].label).toBe("Stornované");
    expect(sections[1].itemCount).toBe(1);
    expect(sections[1].total).toBe(-50);
    expect(sections.reduce((sum, section) => sum + section.total, 0)).toBe(400);
  });

  it("uses the statement cancellation marker without mistaking a cancelled contract's positive receipt", () => {
    const explicitCancellation = group("neon", 100, { note: "Vlastní · storno z výpisu" });
    const historicalPaid = group("flexi", 500, { contractStatus: "storno", payoutStatus: "paid" });
    const sections = buildCashflowMonthSections([explicitCancellation, historicalPaid]);
    expect(sections.find(section => section.id === "cancelled")?.groups).toEqual([explicitCancellation]);
    expect(sections.find(section => section.id === "life")?.groups).toEqual([historicalPaid]);
    expect(sections.reduce((sum, section) => sum + section.total, 0)).toBe(600);
  });

  it("keeps negative subscription payments in their payment category", () => {
    const refund = group("subscription", -100, { isSubscriptionPayment: true });
    const sections = buildCashflowMonthSections([refund]);
    expect(sections.map(section => section.id)).toEqual(["subscription"]);
    expect(sections[0].total).toBe(-100);
  });

  it("preserves tips, subscriptions and unknown products without adding empty insurance sections", () => {
    const sections = buildCashflowMonthSections([
      group("neon", 50, { isTipPayout: true }),
      group("subscription", 90, { isSubscriptionPayment: true }),
      group("unknown", 20),
    ]);
    expect(sections.map((section) => section.id)).toEqual(["tip", "subscription", "other"]);
    expect(sections.reduce((sum, section) => sum + section.total, 0)).toBe(160);
    expect(buildCashflowMonthSections([])).toEqual([]);
  });
});
