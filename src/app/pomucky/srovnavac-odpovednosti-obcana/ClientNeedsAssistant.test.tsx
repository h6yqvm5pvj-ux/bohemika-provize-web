// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/app/firebase-auth", () => ({ auth: { currentUser: { uid: "advisor" } } }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
import { ClientNeedsAssistant } from "./ClientNeedsAssistant";

let container: HTMLDivElement, root: Root;
const onApply = vi.fn();
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === name || element.getAttribute("aria-label") === name)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const prepare = async () => {
  await click(button("Popsat klienta vlastními slovyVyzkoušet"));
  await click(button("Použít příklad"));
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
};
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  mocks.fetch.mockImplementation(() => new Promise(() => {}));
  await act(async () => root.render(<ClientNeedsAssistant applied={[]} onApply={onApply} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("rychlý dotaz klienta", () => {
  it("začíná sbalený a základní profil lze použít i při čekání na AI", async () => {
    expect(container.querySelector<HTMLDivElement>("#client-needs-panel")!.hidden).toBe(true);
    expect(container.querySelector<HTMLDivElement>("#client-needs-options")!.hidden).toBe(true);
    await prepare();
    expect(button("Upřesňuji potřeby…").disabled).toBe(true);
    expect(button("Použít profil a porovnat").disabled).toBe(false);
    await click(button("Použít profil a porovnat"));
    expect(onApply).toHaveBeenCalledWith(["tenant", "children", "electric"]);
    expect(container.querySelector<HTMLDivElement>("#client-needs-panel")!.hidden).toBe(true);
    expect(mocks.fetch.mock.calls[0][2].signal.aborted).toBe(true);
  });

  it("zruší čekání po čtyřech sekundách včetně případného čekání na token", async () => {
    await prepare();
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("AI je nyní neupřesnila");
    expect(button("Použít profil a porovnat").disabled).toBe(false);
    expect(button("Připravit profil").disabled).toBe(false);
    expect(mocks.fetch.mock.calls[0][2].signal.aborted).toBe(true);
  });

  it("pozdní výsledek AI nepřepíše ruční úpravu", async () => {
    let finish!: (value: unknown) => void;
    mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await prepare();
    await click(button("Odebrat potřebu: Elektrokolo / elektrokoloběžka"));
    await act(async () => finish({ ok: true, source: "ai", needs: [{ id: "electric", evidence: "elektrokole" }] }));
    await click(button("Použít profil a porovnat"));
    expect(onApply).toHaveBeenCalledWith(["tenant", "children"]);
  });

  it("stejný ověřený dotaz znovu neposílá a podruhé nečeká", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, source: "ai", needs: [{ id: "electric", evidence: "elektrokole" }] });
    await prepare();
    await click(button("Připravit profil"));
    expect(mocks.fetch).toHaveBeenCalledOnce();
    await click(button("Použít profil a porovnat"));
    expect(onApply).toHaveBeenCalledWith(["tenant", "children", "electric"]);
  });

  it("umožní sestavit profil i bez AI nebo textu", async () => {
    await click(button("Popsat klienta vlastními slovyVyzkoušet"));
    await click(button("Upravit potřeby ručně"));
    const checkbox = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(input => input.closest("label")?.textContent?.startsWith("Pes"))!;
    await click(checkbox); await click(button("Použít profil a porovnat"));
    expect(onApply).toHaveBeenCalledWith(["dog"]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("nespustí prázdné porovnání bez vybraného produktu", async () => {
    await act(async () => root.render(<ClientNeedsAssistant applied={[]} onApply={onApply} canCompare={false} />));
    await prepare();
    expect(button("Použít profil a porovnat").disabled).toBe(true);
    expect(container.textContent).toContain("Nejdřív vyber alespoň jeden produkt");
  });
});
