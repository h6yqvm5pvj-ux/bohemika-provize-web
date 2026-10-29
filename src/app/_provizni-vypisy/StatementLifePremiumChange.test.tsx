// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatementLifePremiumChange, StatementLifePremiumChangeContext } from "./StatementLifePremiumChange";
import { ContractLifePremiumChanges } from "../smlouvy/[id]/ContractLifePremiumChanges";
import type { LifeStatementPremiumChange } from "@/app/lib/lifePremiumIncrease";

const contract = { id: "entry", adviserEmail: "advisor@example.test", contractNumber: "TEST-1", inputAmount: 2350 };
const change: LifeStatementPremiumChange = { key: "change", statementId: "source", statementNumber: "10", statementPeriod: null,
  statementDate: null, productCode: "CPP_NEON", annualIncrease: 1548, previousMonthlyPremium: 2350,
  newMonthlyPremium: 2479, effectiveDate: "2026-01-01", writtenBy: contract.adviserEmail, confirmedAtMs: 1 };
afterEach(() => vi.unstubAllGlobals());

describe("manual confirmation of a premium change", () => {
  it("offers neutral history confirmation without assuming a cause or creating an endorsement", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const confirm = vi.fn();
    try {
      await act(async () => root.render(<StatementLifePremiumChangeContext.Provider value={confirm}>
        <StatementLifePremiumChange contract={contract} annualIncrease={1548} productCode="CPP_NEON" source={{ statementId: "source" }} />
      </StatementLifePremiumChangeContext.Provider>));
      expect(container.textContent).not.toMatch(/sleva|indexace|pojišťovnou/);
      await act(async () => container.querySelector("button")!.click());
      const inputs = container.querySelectorAll("input");
      expect(inputs[0].value).toBe("2350");
      expect(inputs[1].value).toBe("");
      expect(inputs[2].value).toBe("");
      expect(inputs[3].checked).toBe(false);
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
      await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(confirm).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      for (const [index, value] of [[1, "2479"], [2, "2026-01-01"]] as const) {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[index], value);
          inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
      await act(async () => inputs[3].click());
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
      await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(confirm).toHaveBeenCalledExactlyOnceWith({ contract, statementId: "source", previousMonthlyPremium: 2350,
        newMonthlyPremium: 2479, effectiveDate: "2026-01-01" });
    } finally { await act(async () => root.unmount()); }
  });
  it("shows the saved monthly premiums and effective date in the preview and contract history", () => {
    const html = renderToStaticMarkup(<StatementLifePremiumChange contract={{ ...contract, confirmedLifePremiumChanges: [change] }}
      annualIncrease={1548} productCode="CPP_NEON" source={{ statementId: "source" }} />);
    expect(html).toContain("Změna pojistného potvrzena");
    expect(html.replaceAll("\u00a0", " ")).toContain("2 479,00");
    const history = renderToStaticMarkup(<ContractLifePremiumChanges changes={[change]} onOpenStatement={() => {}} />);
    expect(history).toContain("Změny pojistného");
    expect(history).toContain("Výpis 10");
    expect(history).toContain("01. 01. 2026");
  });
});
