// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ContractFrequencyChangeDialog } from "./ContractFrequencyChangeDialog";

describe("payment frequency dialog", () => {
  it("shows the original frequency and saves only the new frequency and its effective date", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const save = vi.fn().mockResolvedValue(undefined);
    const contract = { id: "synthetic-contract", contractNumber: "TEST-001", productKey: "kooperativaAuto" as const,
      policyStartDate: "2023-09-01", frequencyRaw: "quarterly" as const, inputAmount: 2000 };
    try {
      await act(async () => root.render(<ContractFrequencyChangeDialog contract={contract} onSave={save} onClose={() => {}} />));
      expect(host.textContent).toContain("Při sjednáníčtvrtletní");
      expect(host.textContent).toContain("Základna ani zapsané výplaty se nemění");
      const select = host.querySelector("select")!;
      await act(async () => { select.value = "annual"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      const date = host.querySelector<HTMLInputElement>('input[type="date"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(date, "2024-09-01");
        date.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      expect(save).toHaveBeenCalledExactlyOnceWith("annual", "2024-09-01");
      expect(contract.frequencyRaw).toBe("quarterly");
      expect(contract.inputAmount).toBe(2000);
    } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
  });
});
