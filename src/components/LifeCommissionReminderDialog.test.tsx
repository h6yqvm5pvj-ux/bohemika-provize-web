// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.request }));
import { LifeCommissionReminderDialog } from "./LifeCommissionReminderDialog";
import { clearPrivateMemory } from "@/app/lib/privateMemory";

const user = { uid: "fixture-uid", email: "advisor@example.test" } as User;
const reminder = { id: "fixture-message", title: "Očekávané provize", body: "Zkontroluj následný servis klienta.",
  contracts: [{ entryId: "private-entry", contractNumber: "TEST-123", productLabel: "ČPP NEON", code: "B036", payoutDay: "2026-12-25" }] };

describe("life commission reminder dialog", () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = (path = "/") => act(async () => root.render(<LifeCommissionReminderDialog user={user} pathname={path} />));
  const confirm = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Rozumím, pokračovat")!;

  beforeEach(() => {
    vi.resetAllMocks();
    clearPrivateMemory();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.history.replaceState(null, "", "/");
    mocks.request.mockResolvedValue({ reminder });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the contract link and PDF action, and closes after the server saves acknowledgement", async () => {
    await render();
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.textContent).toContain("Stáhnout seznam v PDF");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/smlouvy/advisor%40example.test___private-entry?source=life-commission-reminder");
    await act(async () => confirm().click());
    expect(mocks.request).toHaveBeenLastCalledWith(user, "/api/mailbox/life-commission-reminder", { method: "PATCH", body: JSON.stringify({ id: reminder.id }) });
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("keeps the reminder visible if saving fails", async () => {
    await render();
    mocks.request.mockRejectedValueOnce(new Error("temporary error"));
    await act(async () => confirm().click());
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Potvrzení se nepodařilo uložit");
  });

  it("lets the adviser read the linked contract without automatically acknowledging the reminder", async () => {
    window.history.replaceState(null, "", "/smlouvy/private-entry?source=life-commission-reminder");
    await render("/smlouvy/private-entry");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("shares a pending check across page mounts and refreshes it after five minutes", async () => {
    vi.useFakeTimers();
    let complete!: (payload: { reminder: typeof reminder | null }) => void;
    mocks.request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    await render();
    await act(async () => root.render(null));
    await render("/posta");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    await act(async () => complete({ reminder }));
    expect(container.querySelector("dialog")?.open).toBe(true);
    mocks.request.mockResolvedValueOnce({ reminder: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("does not reuse a reminder after the authentication context resets", async () => {
    await render();
    expect(container.querySelector("dialog")?.open).toBe(true);
    await act(async () => root.render(null));
    clearPrivateMemory();
    mocks.request.mockResolvedValueOnce({ reminder: null });
    await render("/posta");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(container.querySelector("dialog")).toBeNull();
  });
});
