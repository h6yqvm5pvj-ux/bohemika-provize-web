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
  function Harness({ newPremium = "", originalPremium = "1000", premiumIncrease = "500", initiallyOpen = false } = {}) {
    const [open, setOpen] = useState(initiallyOpen);
    const [original, setOriginal] = useState(originalPremium);
    const [increase, setIncrease] = useState(premiumIncrease);
    const [regularAmount, setRegularAmount] = useState(newPremium);
    const [guarantee, setGuarantee] = useState<FlexiRenovationGuaranteeStatus>("unknown");
    const base = original.trim() && increase.trim()
      ? calculateFlexiRenovationBase({ originalMonthlyPremium: Number(original), premiumIncreaseMonthly: Number(increase), guaranteeStatus: guarantee })
      : null;
    const amountText = base ? String(base.newMonthlyPremium) : regularAmount;
    return <>
      <CalculatorAmountAndActionsSection {...defaults} showAmountInput={false}
        amountText={amountText} onAmountTextChange={setRegularAmount}
        refreshOriginalOpen={open} onToggleRefreshOriginal={() => setOpen(!open)}
        renovationOriginalPremiumText={original} onRenovationOriginalPremiumChange={setOriginal}
        renovationIncreaseText={increase} onRenovationIncreaseChange={setIncrease}
        renovationGuaranteeStatus={guarantee} onRenovationGuaranteeStatusChange={setGuarantee} />
      <output>{base?.newMonthlyPremium}/{base?.calculationMonthlyPremium}</output>
      <output data-testid="new-premium">{amountText}</output>
    </>;
  }
  const premiumInput = (label: string) => Array.from(container.querySelectorAll("label"))
    .find((element) => element.textContent?.includes(label))!.querySelector("input")!;
  const typePremium = async (label: string, value: string) => act(async () => {
    const input = premiumInput(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("recalculates the increase from the new premium when the original is edited or cleared", async () => {
    await act(async () => root.render(<Harness newPremium="704" originalPremium="" premiumIncrease="" initiallyOpen />));
    expect(container.querySelector('[data-testid="new-premium"]')?.textContent).toBe("704");
    expect(premiumInput("Navýšení").value).toBe("");
    for (const [original, increase] of [["500", "204"], ["600", "104"], ["704", "0"], ["800", "-96"], ["", ""], ["500.35", "203.65"]]) {
      await typePremium("Pojistné z původní", original);
      expect(premiumInput("Navýšení").value).toBe(increase);
      expect(container.querySelector('[data-testid="new-premium"]')?.textContent).toBe("704");
      if (original === "800" || original === "") expect(container.querySelector("output")?.textContent).toBe("/");
    }
  });

  it("preserves manual premium entry and uses the current total after an increase is edited", async () => {
    await act(async () => root.render(<Harness originalPremium="" premiumIncrease="" initiallyOpen />));
    await typePremium("Pojistné z původní", "1000");
    expect(premiumInput("Navýšení").value).toBe("");
    await typePremium("Navýšení", "500");
    expect(container.querySelector('[data-testid="new-premium"]')?.textContent).toBe("1500");
    await typePremium("Pojistné z původní", "1200");
    expect(premiumInput("Navýšení").value).toBe("300");
    expect(container.querySelector('[data-testid="new-premium"]')?.textContent).toBe("1500");
  });
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
