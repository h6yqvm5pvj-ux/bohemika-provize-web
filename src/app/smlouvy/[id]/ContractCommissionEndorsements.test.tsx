// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractCommissionSection } from "./ContractCommissionSection";
import type { ContractDoc } from "./contractDetailTypes";

const owner = "adviser@example.test";
const manager = "manager@example.test";
const original: ContractDoc = {
  id: "original", userEmail: owner, productKey: "neon", entryType: "contract",
  inputAmount: 1_000, effectiveInputAmount: 1_000,
  policyStartDate: "2025-01-01", contractSignedDate: "2024-12-01", durationYears: 10,
};
const decrease: ContractDoc = {
  id: "decrease", userEmail: owner, productKey: "neon", entryType: "endorsement",
  rootContractEntryId: "original", parentContractEntryId: "original",
  policyStartDate: "2027-01-01", previousInputAmount: 1_000,
  newInputAmount: 600, effectiveInputAmount: 600, premiumDelta: -400, changeType: "decrease",
};
const deferred = { title: "📅 Provize po 3 letech", amount: 1_000, code: "B3601" };
const base: ComponentProps<typeof ContractCommissionSection> = {
  product: "neon", isOwnContract: true, isPaymentBasedProduct: false, hideAnnualAutoTotals: false,
  showAnyMeziprovision: false, meziprovisionCards: [], expandedMeziprovisionKeys: [], onToggleMeziprovisionCard: () => {},
  adviserItems: [deferred], adviserTotalDisplay: 1_000, paymentBasedAdviserTotals: null,
  viewerEmail: owner, contractOwnerEmail: owner, contractDurationYears: 10,
  policyStartDate: original.policyStartDate, commissionEntry: original, commissionTimeline: [original, decrease],
  adviserBreakdownPosition: "poradce5", adviserBreakdownMode: "standard", contractAuthorName: "Poradce",
  showAdvisorDetails: true, onToggleAdvisorDetails: () => {}, onOpenNeonImmediateBreakdown: () => {},
};

describe("contract commission premium decreases", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the revised deferred entitlement and total with an inline source link without mutating history", async () => {
    const before = JSON.stringify([original, decrease, deferred]);
    await act(async () => root.render(<ContractCommissionSection {...base} />));
    expect(container.textContent).toContain("600,00 Kč");
    expect(container.querySelector("[data-premium-adjustment]")?.textContent).toContain("Původně 1.000,00 Kč");
    expect(container.querySelector("[data-premium-adjustment] a")?.getAttribute("href")).toBe("#contract-entry-decrease");
    expect(container.textContent).toContain("1. 1. 2027");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(1);
    expect(JSON.stringify([original, decrease, deferred])).toBe(before);
  });

  it("preserves paid rows and computes a partial payment's remainder against the revised entitlement", async () => {
    const records = [{ code: "B3601", amount: 200, expectedAmount: 1_000, difference: -800, writtenBy: owner }];
    await act(async () => root.render(<ContractCommissionSection {...base} commissionPayouts={records} />));
    expect(container.textContent).toContain("Z výpisů 200,00 Kč · zbývá 400,00 Kč");
    expect(container.textContent).toContain("Částečně 200,00 Kč");
    expect(container.textContent).not.toContain("Rozdíl -800,00 Kč");
    expect(records[0].expectedAmount).toBe(1_000);

    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionPayouts={[{ code: "B3601", amount: 700, writtenBy: owner }]} />));
    expect(container.textContent).toContain("Z výpisů 700,00 Kč");
    expect(container.textContent).toContain("Rozdíl +100,00 Kč");
    expect(container.textContent).not.toContain("zbývá");

    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionPayouts={[{ code: "B3601", amount: 1_000, writtenBy: owner }]} />));
    expect(container.querySelector("[data-premium-adjustment]")).toBeNull();
    expect(container.textContent).toContain("Vyplaceno");
    expect(container.textContent).not.toContain("600,00 Kč");
  });

  it("applies the effective date to each NEON anniversary and recomputes recurring aggregates", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base}
      adviserItems={[{ title: "🔁 Následná provize (2.–5. rok)", amount: 100, code: "B101-B104" }]}
      adviserTotalDisplay={400} commissionPayouts={[{ code: "B101", amount: 100, writtenBy: owner }]} />));
    expect(container.querySelector("summary")?.textContent).toContain("Vyplaceno 1/4 · celkem 280,00 Kč");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(3);
    expect(container.textContent).toContain("60,00 Kč – 100,00 Kč");
    expect(container.textContent).toMatch(/Celkem280,00 Kč/);
  });

  it("scopes paid status and revised amounts separately for advisers and managers", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base} isOwnContract={false}
      viewerEmail={manager} showAnyMeziprovision expandedMeziprovisionKeys={["manager"]}
      meziprovisionCards={[{ key: "manager", email: manager, userName: "Manažer", position: "manazer8", mode: "standard",
        items: [{ ...deferred, amount: 200 }], totalDisplay: 200, totals: null }]}
      commissionPayouts={[
        { code: "B3601", amount: 1_000, writtenBy: owner },
        { code: "B3601", amount: 20, writtenBy: manager },
        { code: "B3601", amount: 200, writtenBy: "other@example.test" },
      ]} />));
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(1);
    expect(container.textContent).toContain("Z výpisů 20,00 Kč · zbývá 100,00 Kč");
    expect(container.textContent).toContain("120,00 Kč");
    expect(container.textContent).toContain("1.000,00 Kč");
  });

  it("does not apply a later amendment to an earlier deferred entitlement", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionTimeline={[original, { ...decrease, policyStartDate: "2029-01-01" }]} />));
    expect(container.querySelector("[data-premium-adjustment]")).toBeNull();
    expect(container.textContent).not.toContain("600,00 Kč");
  });

  it("shows no entitlement when the applicable premium becomes zero", async () => {
    await act(async () => root.render(<ContractCommissionSection {...base}
      commissionTimeline={[original, { ...decrease, newInputAmount: 0, effectiveInputAmount: 0, premiumDelta: -1_000 }]} />));
    expect(container.textContent).toContain("Bez nároku");
    expect(container.textContent).toContain("Celkem0,00 Kč");
  });

  it("revises only eligible first-year acquisition installments and their annual total", async () => {
    const contract: ContractDoc = { ...original, productKey: "cppPPRbez", policyStartDate: "2026-09-17", frequencyRaw: "semiannual" };
    const amendment: ContractDoc = { ...decrease, productKey: "cppPPRbez", newInputAmount: 500, effectiveInputAmount: 500,
      premiumDelta: -500, policyStartDate: "2027-01-01" };
    await act(async () => root.render(<ContractCommissionSection {...base} product="cppPPRbez" isPaymentBasedProduct
      policyStartDate={contract.policyStartDate} paymentFrequency="semiannual" commissionEntry={contract}
      commissionTimeline={[contract, amendment]} adviserTotalDisplay={800} paymentBasedAdviserTotals={{ immediate: 800, subsequent: 0 }}
      adviserItems={[{ title: "💸 Okamžitá (získatelská) provize (z platby)", amount: 400, code: "A101-A102" }]}
      commissionPayouts={[{ code: "A101", amount: 400, writtenBy: owner }]} />));
    expect(container.querySelector("summary")?.textContent).toContain("Vyplaceno 1/2 · první rok 600,00 Kč");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(1);
    expect(container.textContent).toContain("200,00 Kč – 400,00 Kč");
    expect(container.textContent).toContain("Celkem v 1. roce600,00 Kč");
  });

  it("builds period-specific expectations for generic recurring insurance commissions", async () => {
    const contract: ContractDoc = { ...original, productKey: "cppAuto", policyStartDate: "2026-01-01", frequencyRaw: "quarterly" };
    const amendment: ContractDoc = { ...decrease, productKey: "cppAuto", policyStartDate: "2027-07-01",
      newInputAmount: 500, effectiveInputAmount: 500, premiumDelta: -500 };
    await act(async () => root.render(<ContractCommissionSection {...base} product="cppAuto" isPaymentBasedProduct
      policyStartDate={contract.policyStartDate} paymentFrequency="quarterly" commissionEntry={contract}
      commissionTimeline={[contract, amendment]} adviserTotalDisplay={400} paymentBasedAdviserTotals={{ immediate: 0, subsequent: 400 }}
      adviserItems={[{ title: "🔁 Následná provize", amount: 100, code: "B101", excludeFromTotal: true }]} />));
    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelectorAll("[data-premium-adjustment]").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("50,00 Kč – 100,00 Kč");
    expect(container.textContent).toContain("1. 7. 2027");
    expect(container.textContent).toContain("Celkem následně ročně200,00 Kč – 300,00 Kč");
  });

  it("uses an ambiguous recurring code's exact period instead of marking later years paid too", async () => {
    const contract: ContractDoc = { ...original, productKey: "maxdomov", policyStartDate: "2026-01-01",
      policyEndDate: "2029-01-01", frequencyRaw: "annual" };
    const amendment: ContractDoc = { ...decrease, productKey: "maxdomov", policyStartDate: "2027-07-01",
      newInputAmount: 500, effectiveInputAmount: 500, premiumDelta: -500 };
    await act(async () => root.render(<ContractCommissionSection {...base} product="maxdomov" isPaymentBasedProduct
      policyStartDate={contract.policyStartDate} paymentFrequency="annual" commissionEntry={contract}
      commissionTimeline={[contract, amendment]} adviserTotalDisplay={0} paymentBasedAdviserTotals={{ immediate: 0, subsequent: 100 }}
      adviserItems={[{ title: "🔁 Následná provize (z platby)", amount: 100, code: "B101", excludeFromTotal: true }]}
      commissionPayouts={[{ code: "B101", amount: 100, writtenBy: owner }]} />));
    expect(container.querySelector("summary")?.textContent).toContain("Vyplaceno 1/3");
    expect(container.querySelectorAll("[data-premium-adjustment]")).toHaveLength(2);
    expect(container.textContent).toContain("Celkem následně ročně50,00 Kč – 100,00 Kč");
  });
});
