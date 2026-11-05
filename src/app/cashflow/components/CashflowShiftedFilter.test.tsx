// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMoney } from "../helpers";
import { CashflowFilters } from "./CashflowFilters";
import { CashflowHeader } from "./CashflowHeader";

const text = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();
const headerProps: ComponentProps<typeof CashflowHeader> = {
  totalCashflow: 1250, forecastYears: 10, intelligentPredictionEnabled: true,
  showPastYears: false, onTogglePastYears: () => {}, onOpenPredictionInfo: () => {}, onOpenHelp: () => {},
};
const header = (overrides: Partial<ComponentProps<typeof CashflowHeader>> = {}) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<CashflowHeader {...headerProps} {...overrides} />);
  return container;
};

describe("cashflow shifted payout filter", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("toggles only shifted payouts without changing scope, product or the search", async () => {
    const changeShifted = vi.fn();
    const changeScope = vi.fn();
    const changeProduct = vi.fn();
    const changeQuery = vi.fn();
    const render = (shiftedOnly: boolean) => act(async () => root.render(<CashflowFilters
      hasTeam scopeFilter="own" productFilter="auto" shiftedOnly={shiftedOnly}
      contractNumberQuery="SYNTHETIC-001" contractNumberSearchActive
      contractNumberMatchCount={1} contractNumberContractCount={1} contractNumberSummary={null}
      onScopeChange={changeScope} onProductChange={changeProduct} onContractNumberChange={changeQuery}
      onShiftedOnlyChange={changeShifted} />));
    const toggle = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Jen přesunuté")!;

    await render(false);
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(toggle().closest('[data-expanded]')).toBeNull();
    await act(async () => toggle().click());
    expect(changeShifted).toHaveBeenLastCalledWith(true);
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    await render(true);
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    await act(async () => toggle().click());
    expect(changeShifted).toHaveBeenLastCalledWith(false);
    expect(changeScope).not.toHaveBeenCalled();
    expect(changeProduct).not.toHaveBeenCalled();
    expect(changeQuery).not.toHaveBeenCalled();
  });

  it("labels the selected pending sum and explains its basis while retaining period and prediction", () => {
    const container = header({ shiftedOnly: true });
    expect(text(container.textContent)).toContain("Čeká na výplatu");
    expect(text(container.querySelector("strong")!.textContent)).toBe(text(formatMoney(1250)));
    expect(container.textContent).toContain("Před odpočtem stornofondu");
    expect(container.textContent).toContain("Letošní rok + výhled na 10 let");
    expect(container.textContent).toContain("S inteligentní predikcí");
  });

  it.each([
    { calculating: true, label: "Aktualizuji částku", display: "…" },
    { calculationFailed: true, label: "Částka není k dispozici", display: "—" },
  ])("hides a stale pending amount when $label", ({ label, display, ...state }) => {
    const container = header({ shiftedOnly: true, ...state });
    const amount = container.querySelector("strong")!;
    expect(amount.getAttribute("aria-label")).toBe(label);
    expect(amount.textContent).toBe(display);
    expect(text(container.textContent)).not.toContain(text(formatMoney(1250)));
  });

  it("keeps the normal cashflow sum label when the shifted filter is off", () => {
    const container = header({ hasPaidMonthTotals: true });
    expect(container.textContent).toContain("Celkem cashflow");
    expect(container.textContent).not.toContain("Čeká na výplatu");
    expect(container.textContent).not.toContain("Před odpočtem stornofondu");
  });
});
