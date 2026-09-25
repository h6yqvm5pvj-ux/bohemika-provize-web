// @vitest-environment happy-dom
import { act, type ComponentProps, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalculatorAmountAndActionsSection } from "./CalculatorAmountAndActionsSection";
import { calculateFlexiRenovationBase, type FlexiRenovationGuaranteeStatus } from "../lib/flexiRenovation";

const defaults: ComponentProps<typeof CalculatorAmountAndActionsSection> = {
  product: "flexi", frequency: "monthly", isLifeProduct: true, tipsterModeEnabled: false,
  comfortGradual: false, amountText: "", comfortPaymentText: "", comfortTargetAmountText: "",
  comfortPayoutCount: null, missingFields: [], hasTipContractConfig: false,
  refreshOriginalOpen: false, refreshOriginalContractNumber: "OLD123", refreshOriginalMissingInSystem: false,
  refreshOriginalLookupStatus: "notFound", refreshOriginalLookupProgress: 100, refreshOriginalLookupAdviserName: null,
  onComfortGradualChange: vi.fn(), onAmountTextChange: vi.fn(), onComfortPaymentTextChange: vi.fn(),
  onComfortTargetAmountTextChange: vi.fn(), onRefreshOriginalContractNumberChange: vi.fn(),
  onRefreshOriginalMissingInSystemChange: vi.fn(), onOpenTipContractModal: vi.fn(), onToggleRefreshOriginal: vi.fn(),
  onPrepareEndorsement: vi.fn(),
};

describe("FLEXI renovation form", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  function Harness() {
    const [open, setOpen] = useState(false);
    const [original, setOriginal] = useState("1000");
    const [increase, setIncrease] = useState("500");
    const [guarantee, setGuarantee] = useState<FlexiRenovationGuaranteeStatus>("unknown");
    const base = calculateFlexiRenovationBase({ originalMonthlyPremium: Number(original), premiumIncreaseMonthly: Number(increase), guaranteeStatus: guarantee });
    return <>
      <CalculatorAmountAndActionsSection {...defaults} showAmountInput={false}
        refreshOriginalOpen={open} onToggleRefreshOriginal={() => setOpen(!open)}
        renovationOriginalPremiumText={original} onRenovationOriginalPremiumChange={setOriginal}
        renovationIncreaseText={increase} onRenovationIncreaseChange={setIncrease}
        renovationGuaranteeStatus={guarantee} onRenovationGuaranteeStatusChange={setGuarantee} />
      <output>{base?.newMonthlyPremium}/{base?.calculationMonthlyPremium}</output>
    </>;
  }
  it("toggles renovation, exposes monthly amounts and changes the base with guarantee eligibility", async () => {
    await act(async () => root.render(<Harness />));
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle.textContent).toContain("Jedná se o renovaci?");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("Pojistné z původní smlouvy (Kč / měsíc)");
    expect(container.textContent).toContain("Navýšení pojistného (Kč / měsíc)");
    expect(container.textContent).toContain("Orientační výpočet");
    expect(container.querySelector("output")?.textContent).toBe("1500/1000");
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "inside"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector("output")?.textContent).toBe("1500/500");
    expect(container.textContent).toContain("kompenzační provize za původní smlouvu není zahrnuta");
    await act(async () => { select.value = "outside"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).not.toContain("Orientační výpočet");
    await act(async () => toggle.click());
    expect(container.querySelector("select")).toBeNull();
  });
  it("allows a missing original contract and describes the cancellation date", async () => {
    await act(async () => root.render(<CalculatorAmountAndActionsSection {...defaults} refreshOriginalOpen />));
    expect(container.textContent).toContain("ke dni počátku nové smlouvy");
    expect(container.textContent).toContain("lze uložit bez automatického storna");
    expect(container.textContent).not.toContain("Refresh základna");
  });
  it("also supports a commission-only preview without requiring a contract number", async () => {
    await act(async () => root.render(<CalculatorAmountAndActionsSection {...defaults}
      refreshOriginalOpen showContractActions={false} showManualEntryOption />));
    expect(container.querySelector('[role="switch"]')).not.toBeNull();
    expect(container.textContent).toContain("Navýšení pojistného");
    expect(container.textContent).not.toContain("Číslo původní smlouvy");
    expect(container.textContent).not.toContain("Smlouva z TIPU");
  });
});
