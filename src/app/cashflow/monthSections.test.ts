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
      "life", "property", "entrepreneurs", "travel", "gold", "foreigners", "auto",
    ]);
    const assigned = sections.flatMap((section) => section.groups);
    expect(assigned).toHaveLength(groups.length);
    expect(new Set(assigned.map((value) => value.id)).size).toBe(groups.length);
    expect(sections.reduce((sum, section) => sum + section.total, 0)).toBe(groups.reduce((sum, value) => sum + value.amount, 0));
    expect(sections.find((section) => section.id === "entrepreneurs")?.groups.map((value) => value.id)).toContain("kooppmop");
    expect(sections.find((section) => section.id === "property")?.groups.map((value) => value.id)).not.toContain("kooppmop");
  });

  it("keeps grouped commission parts together and counts their items, including negative payouts", () => {
    const grouped = group("neon", 450);
    grouped.items = [
      { ...grouped.leadItem, id: "first", amount: 600 },
      { ...grouped.leadItem, id: "second", amount: -150 },
    ];
    const sections = buildCashflowMonthSections([grouped, group("flexi", -50)]);
    expect(sections).toHaveLength(1);
    expect(sections[0].groups[0]).toBe(grouped);
    expect(sections[0].itemCount).toBe(3);
    expect(sections[0].groups).toHaveLength(2);
    expect(sections[0].total).toBe(400);
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
