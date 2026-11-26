// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CommissionStatementPreviewModal, type ContractStatementPreview } from "./CommissionStatementPreviewModal";

it("places the contract's original rows above the sandboxed full statement and highlights the clicked code", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onClose = vi.fn();
  const statement: ContractStatementPreview = {
    id: "synthetic", fileName: "synthetic.html", statementNumber: "42", statementDate: "01.10.2026",
    period: "září 2026", periodStartMs: null, periodEndMs: null, payoutMonthKey: null, autoPremiumRows: [],
    contractNumber: "12345678", commissionCodes: ["B103"],
    html: `<div id="provize"><table><tr><th>Smlouva</th><th>Provize</th><th>Základna</th><th>Částka</th></tr>
      <tr><td>12345678</td><td>B103</td><td>1 869,00</td><td>201,85</td></tr>
      <tr><td>12345678</td><td>B104</td><td>3 538,00</td><td>382,10</td></tr>
      <tr><td>87654321</td><td>B103</td><td>9 000,00</td><td>972,00</td></tr></table></div>`,
  };
  try {
    await act(async () => root.render(<CommissionStatementPreviewModal statement={statement} onClose={onClose} />));
    const excerpt = container.querySelector('section[aria-label="Řádky otevřené smlouvy"]')!;
    expect(excerpt.textContent).toContain("1 869,00");
    expect(excerpt.textContent).toContain("201,85");
    expect(excerpt.textContent).not.toContain("87654321");
    expect(excerpt.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(excerpt.querySelectorAll("[data-selected-commission]")).toHaveLength(1);
    expect(excerpt.querySelector("[data-selected-commission]")?.textContent).toContain("B103");
    expect(container.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(container.querySelector("iframe")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Zavřít náhled provizního výpisu"]')!.click());
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
