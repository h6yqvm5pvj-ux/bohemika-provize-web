// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractCommissionSection } from "./ContractCommissionSection";

const owner = "adviser@example.test";
const manager = "manager@example.test";
const item = { title: "💸 Okamžitá (získatelská) provize (z platby)", amount: 440.307, code: "A101-A102" };
const props: ComponentProps<typeof ContractCommissionSection> = {
  product: "cppPPRbez", isOwnContract: true, isPaymentBasedProduct: true, hideAnnualAutoTotals: false,
  showAnyMeziprovision: false, meziprovisionCards: [], expandedMeziprovisionKeys: [], onToggleMeziprovisionCard: () => {},
  adviserItems: [item], paymentFrequency: "semiannual", policyStartDate: "2026-09-17",
  viewerEmail: owner, contractOwnerEmail: owner, adviserBreakdownPosition: "poradce5", adviserBreakdownMode: "standard",
  paymentBasedAdviserTotals: { immediate: 880.614, subsequent: 293.538 }, adviserTotalDisplay: 880.614,
  contractAuthorName: "Poradce", showAdvisorDetails: true, onToggleAdvisorDetails: () => {}, onOpenNeonImmediateBreakdown: () => {},
};

describe("contract commission installment interaction", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("starts collapsed, opens the source statement and updates automatically when another payout arrives", async () => {
    const onOpenStatement = vi.fn();
    const records = [{ code: "A101", amount: 440.31, statementId: "first", statementNumber: "76", writtenBy: owner }];
    await act(async () => root.render(<ContractCommissionSection {...props} commissionPayouts={records} onOpenStatement={onOpenStatement} />));
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toContain("Vyplaceno 1/2");
    expect(details.querySelector("summary")?.textContent).toContain("Částečně vyplaceno");
    await act(async () => details.querySelector("summary")!.click());
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("Období splátky · březen 2027");
    await act(async () => details.querySelector("button")!.click());
    expect(onOpenStatement).toHaveBeenCalledWith("first");

    await act(async () => root.render(<ContractCommissionSection {...props} onOpenStatement={onOpenStatement}
      commissionPayouts={[...records, { code: "A102", amount: 440.31, statementId: "second", writtenBy: owner }]} />));
    expect(details.querySelector("summary")?.textContent).toContain("Vyplaceno 2/2");
    expect(details.querySelector("summary")?.textContent).not.toContain("Částečně");
    expect(details.open).toBe(true);
  });

  it("separates the adviser, each manager and legacy records when calculating paid counts", async () => {
    await act(async () => root.render(<ContractCommissionSection {...props}
      isOwnContract={false} showAnyMeziprovision viewerEmail={manager}
      expandedMeziprovisionKeys={["manager"]}
      meziprovisionCards={[{ key: "manager", email: manager, userName: "Manažer", position: "manazer8", mode: "standard", items: [item], totals: null, totalDisplay: 880.614 }]}
      commissionPayouts={[
        { code: "A101", amount: 440.31, statementId: "adviser", writtenBy: owner },
        { code: "A102", amount: 440.31, statementId: "manager", writtenBy: manager },
        { code: "A101", amount: 440.31, statementId: "unrelated", writtenBy: "other@example.test" },
        { code: "A101", amount: 440.31, statementId: "legacy-without-owner" },
      ]} onOpenStatement={vi.fn()} />));
    const details = Array.from(container.querySelectorAll("details"));
    expect(details).toHaveLength(2);
    expect(details.map((detail) => detail.querySelector("summary")?.textContent)).toEqual([
      expect.stringContaining("Vyplaceno 1/2"), expect.stringContaining("Vyplaceno 1/2"),
    ]);
    expect(details[0].textContent).toContain("březen 2027");
    expect(details[0].querySelectorAll("button")).toHaveLength(1);
    expect(details[1].querySelectorAll("button")).toHaveLength(0);
  });

  it("keeps annual commission rows simple and the NEON recurring breakdown intact", async () => {
    await act(async () => root.render(<ContractCommissionSection {...props} paymentFrequency="annual" />));
    expect(container.querySelector("details")).toBeNull();
    await act(async () => root.render(<ContractCommissionSection {...props} product="neon" paymentFrequency="monthly"
      adviserItems={[{ title: "🔁 Následná provize (2.–5. rok)", amount: 169.38, code: "B101-B104" }]}
      commissionPayouts={[{ code: "B101", amount: 169.38, writtenBy: owner }]} />));
    expect(container.querySelector("details summary")?.textContent).toContain("Vyplaceno 1/4");
    expect(container.textContent).toContain("5. rok");
    expect(container.textContent).not.toContain("Získatelská provize");
  });
});
