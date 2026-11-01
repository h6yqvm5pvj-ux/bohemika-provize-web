// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ContractDetailNavigation } from "./ContractDetailNavigation";

it("links to the existing sections and opens notes without reloading the contract", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const openNotes = vi.fn();
  try {
    await act(async () => root.render(<ContractDetailNavigation hasChanges onOpenNotes={openNotes} />));
    expect(Array.from(container.querySelectorAll("a")).map(link => link.getAttribute("href"))).toEqual([
      "#contract-overview", "#contract-commissions", "#contract-changes", "#contract-notes",
    ]);
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="#contract-notes"]')!.click());
    expect(openNotes).toHaveBeenCalledOnce();
    await act(async () => root.render(<ContractDetailNavigation hasChanges={false} onOpenNotes={openNotes} />));
    expect(container.querySelector('a[href="#contract-changes"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
