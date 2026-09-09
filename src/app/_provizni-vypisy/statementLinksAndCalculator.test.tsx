// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BohemkaContractDetailLink, BohemkaContractDetailModal } from "./statementLinksAndCalculator";
import { BohemkaContractDetailModalContext } from "./statementPresentation";
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
});
