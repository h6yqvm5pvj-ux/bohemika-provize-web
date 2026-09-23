// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatementContractCard } from "./StatementContractCard";
import { statementContractIsVerified } from "./statementContractReview";

describe("compact statement contracts", () => {
  let root: Root;
  let container: HTMLDivElement;
  const cleanReview = {
    matched: true,
    comparisons: [{ status: "ok" as const }],
    baseComparisons: [{ annualDifference: 0 }],
    hasWarnings: false,
  };

  const render = async (review: Parameters<typeof statementContractIsVerified>[0] = cleanReview) => {
    await act(async () => root.render(
      <StatementContractCard
        client="Testovací klient"
        contractNumber="0034512071"
        products={<span>ČPP DOMEX</span>}
        commission={62}
        reserve={9}
        verified={statementContractIsVerified(review)}
        badges={<span>Výsledek podrobné kontroly</span>}
        marking={<label><input type="checkbox" />Označit nesrovnalost</label>}
      >
        <a href="#contract-detail">Detail smlouvy</a>
        <table><tbody><tr><td>Základna pojistného</td><td>3 096 Kč ročně</td></tr></tbody></table>
      </StatementContractCard>
    ));
  };
  const toggle = () => container.querySelector("button")!;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("shows a short verified summary and opens all details on demand", async () => {
    await render();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    for (const text of ["Testovací klient", "0034512071", "ČPP DOMEX", "62,00", "Vše sedí"]) {
      expect(toggle().textContent).toContain(text);
    }
    expect(container.querySelector("table")).toBeNull();
    expect(toggle().querySelector("input")).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();

    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("table")?.textContent).toContain("3 096 Kč ročně");
    expect(container.querySelector('a[href="#contract-detail"]')).not.toBeNull();
    expect(toggle().textContent).toContain("Rezervní fond");
    expect(container.querySelector(`[id="${toggle().getAttribute("aria-controls")}"]`)?.hasAttribute("hidden")).toBe(false);

    await render();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    await act(async () => toggle().click());
    expect(container.querySelector("table")).toBeNull();
  });

  it.each([
    { baseComparisons: [{ annualDifference: 2_322 }] },
    { baseComparisons: [{ annualDifference: Number.NaN }] },
    { comparisons: [{ status: "diff" as const }] },
    { comparisons: [{ status: "missing_expected" as const }] },
    { comparisons: [] },
    { matched: false },
    { hasWarnings: true },
  ])("leaves unverified contracts open: %j", async (review) => {
    await render({ ...cleanReview, ...review });
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("table")).not.toBeNull();
    expect(toggle().textContent).not.toContain("Vše sedí");
  });

  it("reveals new review issues and compacts the contract once resolved", async () => {
    await render();
    await act(async () => toggle().click());
    await act(async () => toggle().click());
    await render({ ...cleanReview, baseComparisons: [{ annualDifference: -100 }] });
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    await render();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
});
