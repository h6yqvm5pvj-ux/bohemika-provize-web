// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CashflowSettingsPanel } from "./CashflowSettingsPanel";

describe("office contribution settings switch", () => {
  it("saves explicit opt-in, disables repeat clicks while saving, and retains the state after a failed save", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    let finish!: (value: { ok: true }) => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ ok: false, error: "Uložení selhalo." });
    try {
      await act(async () => { root.render(<CashflowSettingsPanel initialEnabled={false} onSave={save} />); });
      const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      await act(async () => { toggle.click(); });
      expect(toggle.disabled).toBe(true);
      expect(save).toHaveBeenCalledExactlyOnceWith(true);
      await act(async () => { finish({ ok: true }); });
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(toggle.disabled).toBe(false);
      await act(async () => { toggle.click(); });
      expect(save).toHaveBeenLastCalledWith(false);
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(host.querySelector('[role="alert"]')?.textContent).toBe("Uložení selhalo.");
    } finally { await act(async () => root.unmount()); }
  });
});
