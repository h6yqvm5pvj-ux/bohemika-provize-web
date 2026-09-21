// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminAccountAccess } from "@/lib/adminAccountAccess";
import { AdminAccountAccessPanel } from "./AdminAccountAccessPanel";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of mounted.splice(0)) await dispose(); });
async function render(access: AdminAccountAccess, options: { isSelf?: boolean; busy?: boolean; confirming?: boolean } = {}) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container), onChange = vi.fn();
  await act(async () => root.render(<AdminAccountAccessPanel access={access} isSelf={false} busy={false} confirming={false} {...options} onChange={onChange} />));
  mounted.push(async () => { await act(async () => root.unmount()); container.remove(); });
  return { container, onChange, button: container.querySelector("button")! };
}
describe("administrator account status control", () => {
  it("shows the blocked state and sends an activation request only when clicked", async () => {
    const { container, onChange, button } = await render({ state: "blocked", reason: "disabled" });
    expect(container.textContent).toContain("Blokovaný");
    expect(button.textContent).toBe("Aktivovat účet");
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => button.click());
    expect(onChange).toHaveBeenCalledWith("activateAccount");
  });
  it("offers blocking for an active account", async () => {
    const { button, onChange } = await render({ state: "active", reason: null }, { confirming: true });
    expect(button.textContent).toBe("Potvrdit zablokování");
    await act(async () => button.click());
    expect(onChange).toHaveBeenCalledWith("blockAccount");
  });
  it("distinguishes setup-only access and explains that data remains inaccessible", async () => {
    const { container, button } = await render({ state: "setup", reason: "mfa-enrollment" });
    expect(container.textContent).toContain("Aktivní · nastavení 2FA");
    expect(container.textContent).toContain("Přístup k datům je zatím uzavřený");
    expect(button.textContent).toBe("Zablokovat účet");
  });
  it.each([{ isSelf: true }, { busy: true }])("disables changes for %j", async options => {
    const { button, onChange } = await render({ state: "active", reason: null }, options);
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(onChange).not.toHaveBeenCalled();
  });
});
