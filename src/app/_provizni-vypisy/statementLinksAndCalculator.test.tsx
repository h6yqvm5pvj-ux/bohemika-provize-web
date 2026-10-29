// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BohemkaContractDetailLink, firstContractDetailUrl, StatementCalculatorPrefillButton } from "./statementLinksAndCalculator";
import { BohemkaContractDetailModal } from "./StatementEmbeddedModals";
import { BohemkaContractDetailModalContext, StatementCalculatorPrefillContext, statementCalculatorPrefill } from "./statementPresentation";
import { resolveStatementProduct } from "./statementParsing";
import type { BohemkaContractDetailModalPayload } from "./statementTypes";

function StatementDetail({ compact }: { compact: boolean }) {
  const [detail, setDetail] = useState<BohemkaContractDetailModalPayload | null>(null);
  return (
    <BohemkaContractDetailModalContext.Provider value={setDetail}>
      <BohemkaContractDetailLink
        compact={compact}
        contract={{
          id: "test-contract",
          adviserEmail: "adviser+team@example.test",
          contractNumber: "123456789",
          clientName: "Testovací klient",
        }}
      />
      {detail && <BohemkaContractDetailModal detail={detail} onClose={() => setDetail(null)} />}
    </BohemkaContractDetailModalContext.Provider>
  );
}

describe("contract detail opened from a commission statement", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Keep the DOM detached so this interaction test does not fetch the iframe's page.
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([false, true])("opens the selected contract in embedded mode (compact: %s)", async (compact) => {
    await act(async () => root.render(<StatementDetail compact={compact} />));
    await act(async () => container.querySelector("button")!.click());

    const dialog = container.querySelector('[role="dialog"]')!;
    const frame = dialog.querySelector("iframe")!;
    const url = new URL(frame.getAttribute("src")!, "https://bohemka.app");
    expect(decodeURIComponent(url.pathname)).toBe("/smlouvy/adviser+team@example.test___test-contract");
    expect(url.searchParams.get("from")).toBe("commission-statements");
    // The proxy and detail page require this flag to allow the iframe and use its embedded layout.
    expect(url.searchParams.get("embedded")).toBe("1");
    expect(frame.title).toBe("Smlouva 123456789");
    expect(dialog.textContent).toContain("Testovací klient");

    await act(async () => dialog.querySelector("button")!.click());
    expect(container.querySelector("iframe")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it.each([
    ["CPP_CS_Z", "cppcestovko"], ["CPP_CS6", "cppcestovko"], ["CPP_ACPIV", "cppAuto"], ["PIL_AUTOZ", "pillowAuto"], ["CPP_ZAMEX", "zamex"],
  ] as const)("opens MAXX and the prefilled queue form when adding %s", async (productCode, productKey) => {
    const openMaxx = vi.spyOn(window, "open").mockReturnValue(null);
    const openCalculator = vi.fn();
    const prefill = {
      ...statementCalculatorPrefill({
        product: resolveStatementProduct(productCode), contractNumber: "1800000001", clientName: "Novák Jan",
        signedAt: "01.09.2026", validFrom: "02.09.2026", statementBase: 1899.5,
        source: { statementId: "statement-travel" },
      })!,
      cppA101QueueEligible: true,
    };
    const maxxHref = firstContractDetailUrl([{ detailUrl: null }, { detailUrl: "https://sjednatel.bohemiaservis.cz/detail.aspx?sml=123456" }]);
    await act(async () => root.render(
      <StatementCalculatorPrefillContext.Provider value={openCalculator}>
        <StatementCalculatorPrefillButton prefill={prefill} maxxHref={maxxHref} />
      </StatementCalculatorPrefillContext.Provider>
    ));
    const button = container.querySelector("button")!;
    expect(button.textContent).toContain("Přidat smlouvu");
    await act(async () => button.click());
    expect(openMaxx).toHaveBeenCalledExactlyOnceWith(maxxHref, "_blank", "noopener,noreferrer");
    expect(openCalculator).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      product: productKey,
      contractNumber: "1800000001", amountText: "1899.5", cppA101QueueEligible: true,
    }));
    expect(openMaxx.mock.invocationCallOrder[0]).toBeLessThan(openCalculator.mock.invocationCallOrder[0]);
  });
});
