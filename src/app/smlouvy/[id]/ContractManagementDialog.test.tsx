// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractManagementDialog } from "./ContractManagementDialog";

let root: Root, container: HTMLDivElement;
const confirm = vi.fn(), close = vi.fn(), clearError = vi.fn();
const defaults = {
  contractNumber: "3275890387", clientName: "Jaroslav Lubina", productLabel: "ČPP Auto",
  canSetStorno: true, canDelete: true, canRequestTransfer: true, isStorno: false,
  initialStornoDate: "2026-09-16", minimumStornoDate: "2024-01-18", today: "2026-09-16",
  transferTargets: [{ email: "eva@example.test", name: "Eva Černá" }], busy: false, error: null,
  onClearError: clearError, onConfirm: confirm, onClose: close,
};
async function mount(extra: Partial<ComponentProps<typeof ContractManagementDialog>> = {}) { await act(async () => root.render(<ContractManagementDialog {...defaults} {...extra} />)); }
function button(text: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === text || item.getAttribute("aria-label") === text)!; }
async function click(element: HTMLElement) { expect(element).toBeTruthy(); await act(async () => element.click()); }
async function choose(value: string) { await click(container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!); }
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
async function input(value: string, type = "date") {
  const field = container.querySelector<HTMLInputElement>(`input[type="${type}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  vi.clearAllMocks(); confirm.mockResolvedValue(true);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("contract management confirmation flow", () => {
  it("only deletes after choosing the action and confirming its contract summary", async () => {
    await mount(); await submit(); expect(confirm).not.toHaveBeenCalled();
    await choose("delete"); expect(confirm).not.toHaveBeenCalled();
    await submit(); expect(confirm).not.toHaveBeenCalled();
    expect(container.querySelector("dl")?.textContent).toContain("3275890387");
    expect(container.querySelector("dl")?.textContent).toContain("Jaroslav Lubina");
    expect(button("Smazat smlouvu")).toBeTruthy();
    await submit(); expect(confirm).toHaveBeenCalledExactlyOnceWith({ kind: "delete" }); expect(close).toHaveBeenCalledTimes(1);
  });

  it("preserves the chosen date when going back and saves only from the final step", async () => {
    await mount(); await choose("storno"); await submit(); await input("2026-10-01"); await submit();
    expect(confirm).not.toHaveBeenCalled(); expect(container.querySelector("dl")?.textContent).toContain("1. 10. 2026");
    await click(button("Zpět")); expect(container.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-10-01");
    await submit(); await submit(); expect(confirm).toHaveBeenCalledExactlyOnceWith({ kind: "storno", date: "2026-10-01" });
  });

  it("requires a permitted recipient before a transfer can be reviewed or submitted", async () => {
    await mount(); await choose("transfer"); await submit(); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Vyber nového správce"); expect(confirm).not.toHaveBeenCalled();
    await choose("eva@example.test"); await input("2026-10-01"); await submit();
    expect(confirm).not.toHaveBeenCalled(); expect(container.querySelector("dl")?.textContent).toContain("eva@example.test");
    await submit(); expect(confirm).toHaveBeenCalledExactlyOnceWith({ kind: "transfer", targetEmail: "eva@example.test", effectiveDate: "2026-10-01" });
  });

  it("also requires confirmation before restoring an already cancelled contract", async () => {
    await mount({ isStorno: true }); await choose("storno"); await submit();
    const restore = [...container.querySelectorAll("label")].find(item => item.textContent === "Zrušit storno")!;
    await click(restore.querySelector("input")!); await submit();
    expect(confirm).not.toHaveBeenCalled(); expect(container.querySelector("dl")?.textContent).toContain("Aktivní");
    await submit(); expect(confirm).toHaveBeenCalledExactlyOnceWith({ kind: "restore" });
  });

  it("does not submit on Cancel or Escape", async () => {
    await mount(); await choose("delete"); await submit();
    await act(async () => { container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(close).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled();
  });

  it("prevents repeated submission and closing while a mutation is running", async () => {
    let finish!: (value: boolean) => void;
    confirm.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    await mount(); await choose("delete"); await submit(); await submit(); await submit();
    await act(async () => { container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(confirm).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
    expect(button("Zavřít správu smlouvy").disabled).toBe(true);
    await act(async () => finish(true)); expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirmation step available for retry after a failed mutation", async () => {
    confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await mount(); await choose("delete"); await submit(); await submit();
    expect(close).not.toHaveBeenCalled(); expect(button("Smazat smlouvu").disabled).toBe(false);
    await submit(); expect(confirm).toHaveBeenCalledTimes(2); expect(close).toHaveBeenCalledTimes(1);
  });

  it("never offers unavailable actions", async () => {
    await mount({ canDelete: false, canRequestTransfer: false });
    expect([...container.querySelectorAll('input[type="radio"]')].map(input => (input as HTMLInputElement).value)).toEqual(["storno"]);
    await submit(); expect(confirm).not.toHaveBeenCalled();
  });
});
