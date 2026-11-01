// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KooperativaContractStatusDialog } from "./KooperativaContractStatusDialog";

const url = "https://insure.koop.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml";
const identity = { kind: "birthDate" as const, label: "Datum narození" as const, value: "14.07.1995" };
let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onCopy = vi.fn();
const defaultProps = { contractNumber: " TEST-0001 ", identity, loading: false, error: null, onClose, onCopy };

async function render(props = {}) {
  await act(async () => root.render(<KooperativaContractStatusDialog {...defaultProps} {...props} />));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Kooperativa contract status dialog", () => {
  it("opens a labelled dialog and copies the contract number and formatted date only", async () => {
    await render();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(container.querySelector(`#${CSS.escape(dialog.getAttribute("aria-labelledby")!)}`)?.textContent).toBe("Stav smlouvy");
    expect(container.querySelector(`#${CSS.escape(dialog.getAttribute("aria-describedby")!)}`)?.textContent).toContain("Zkopíruj údaje pojistníka");
    expect(container.textContent).toContain("TEST-0001");
    expect(container.textContent).toContain("14.07.1995");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Kopírovat číslo smlouvy"]')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Kopírovat datum narození"]')!.click());
    expect(onCopy.mock.calls).toEqual([["TEST-0001", "Číslo smlouvy"], ["14.07.1995", "Datum narození"]]);
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).not.toContain("rodné číslo");
  });

  it("preserves leading zeros in the company's IČO and copies the company value", async () => {
    await render({ identity: { kind: "companyId", label: "IČO", value: "00123456" } });
    expect(container.textContent).toContain("00123456");
    expect(container.textContent).not.toContain("Datum narození");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Kopírovat ičo"]')!.click());
    expect(onCopy).toHaveBeenCalledWith("00123456", "IČO");
  });

  it("waits for the user's portal click and never places identifiers in its URL", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    vi.useFakeTimers();
    try {
      await render();
      await act(async () => vi.advanceTimersByTime(10_000));
      expect(open).not.toHaveBeenCalled();
      const link = container.querySelector("a")!;
      expect(link.getAttribute("href")).toBe(url);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
      expect(link.search).toBe("");
    } finally { vi.useRealTimers(); }
  });

  it("hides any stale identity while loading and keeps contract copying and the portal available", async () => {
    await render({ loading: true });
    expect(container.textContent).toContain("Načítám z PDF");
    expect(container.textContent).not.toContain(identity.value);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Kopírovat datum narození"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Kopírovat číslo smlouvy"]')).not.toBeNull();
    expect(container.querySelector("a")?.href).toBe(url);
    await render({ loading: false });
    expect(container.textContent).toContain(identity.value);
  });

  it("explains missing PDF identity without offering to copy an invalid value", async () => {
    await render({ identity: null, error: "Údaj pojistníka se v PDF nepodařilo najít." });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Údaj pojistníka");
    expect(container.textContent).toContain("Chybějící údaj můžeš zadat přímo na portálu.");
    expect(container.querySelector('button[aria-label="Kopírovat datum narození"]')).toBeNull();
    expect(container.querySelector("a")?.href).toBe(url);
  });

  it("escapes error and contract text as ordinary content", async () => {
    await render({ contractNumber: "<img src=x onerror=alert(1)>", error: "<script>secret()</script>" });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.textContent).toContain("<script>secret()</script>");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("traps focus, closes on Escape and restores focus after unmount", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const before = document.body.style.overflow;
    try {
      await render();
      const close = container.querySelector<HTMLButtonElement>('button[aria-label="Zavřít stav smlouvy"]')!;
      const portal = container.querySelector("a")!;
      expect(document.activeElement).toBe(close);
      expect(document.body.style.overflow).toBe("hidden");
      await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
      expect(document.activeElement).toBe(portal);
      await act(async () => portal.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
      expect(document.activeElement).toBe(close);
      await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
      expect(onClose).toHaveBeenCalledOnce();
      await act(async () => root.render(null));
      expect(document.body.style.overflow).toBe(before);
      expect(document.activeElement).toBe(opener);
    } finally { opener.remove(); }
  });

  it("does not offer contract copying when the contract number is absent", async () => {
    await render({ contractNumber: " " });
    expect(container.textContent).toContain("Není uvedeno");
    expect(container.querySelector('button[aria-label="Kopírovat číslo smlouvy"]')).toBeNull();
  });
});
