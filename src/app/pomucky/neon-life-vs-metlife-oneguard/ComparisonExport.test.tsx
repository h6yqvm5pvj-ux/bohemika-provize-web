// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), download: vi.fn(), email: "advisor@example.test" }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => { callback({ uid: "advisor-uid", email: mocks.email }); return () => undefined; } }));
vi.mock("@/app/firebase-auth", () => ({ auth: { currentUser: { email: "advisor@example.test" } } }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: mocks.profile }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ useEffectiveUserEmail: () => mocks.email }));
vi.mock("./comparisonPdf", () => ({ downloadComparisonPdf: mocks.download }));

import { ComparisonExport } from "./ComparisonExport";
import { COMPARISON_ROWS } from "./comparisonData";

let container: HTMLDivElement;
let root: Root;
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label && !item.closest("[hidden]"))!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const enter = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const topicCheckbox = (index: number) => container.querySelector<HTMLInputElement>(`input[aria-label="Zařadit do PDF: ${COMPARISON_ROWS[index].title}"]`)!;
const render = async () => { await act(async () => root.render(<ComparisonExport rows={COMPARISON_ROWS} visibleRows={[COMPARISON_ROWS[4]]} filterLabel="Rodina a děti" />)); };
const loadedProfile = () => ({ ok: true, profile: { fullName: "Štěpán Dvořák", email: mocks.email, phoneNumber: "777 123 456" } });

beforeEach(() => {
  vi.clearAllMocks(); mocks.email = "advisor@example.test";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  mocks.profile.mockResolvedValue(loadedProfile()); mocks.download.mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("comparison PDF export dialog", () => {
  it("exports all details by default even when the page is filtered, and can export just the visible selection", async () => {
    await render(); await click(button("Stáhnout PDF"));
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.textContent).toContain("Štěpán Dvořák");
    await click(button("Stáhnout PDF s detaily"));
    expect(mocks.download.mock.calls[0][0].rows).toHaveLength(20);
    expect(mocks.download.mock.calls[0][0].rows[0].neon.blocks.length).toBeGreaterThan(0);
    expect(container.querySelector("dialog")).toBeNull();
    await click(button("Stáhnout PDF"));
    await click(button("Použít filtr ze srovnání (1)"));
    await click(button("Stáhnout PDF s detaily"));
    expect(mocks.download.mock.calls[1][0].rows.map((row: { id: string }) => row.id)).toEqual([COMPARISON_ROWS[4].id]);
    expect(mocks.download.mock.calls[1][0].advisor.email).toBe(mocks.email);
  });

  it("blocks export until the advisor loads and supports retry after a profile error", async () => {
    mocks.profile.mockRejectedValueOnce(new Error("Offline"));
    await render(); await click(button("Stáhnout PDF"));
    expect(button("Stáhnout PDF s detaily").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Vizitku poradce se nepodařilo načíst");
    await click(button("Zkusit znovu"));
    expect(button("Stáhnout PDF s detaily").disabled).toBe(false);
    expect(mocks.profile.mock.calls.at(-1)?.[1]).toEqual({ force: true });
  });

  it("keeps the selection and allows retry when generating the PDF fails", async () => {
    mocks.download.mockRejectedValueOnce(new Error("Font unavailable"));
    await render(); await click(button("Stáhnout PDF"));
    await click(button("Použít filtr ze srovnání (1)"));
    await click(button("Stáhnout PDF s detaily"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("PDF se nepodařilo vytvořit");
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(1);
    await click(button("Stáhnout PDF s detaily"));
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("ignores an old advisor response after the effective account changes", async () => {
    let finishOld!: (value: unknown) => void;
    mocks.profile.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    await render(); await click(button("Stáhnout PDF"));
    expect(button("Stáhnout PDF s detaily").disabled).toBe(true);
    mocks.email = "second@example.test";
    mocks.profile.mockResolvedValue({ ok: true, profile: { fullName: "Druhý poradce", email: mocks.email } });
    await render();
    expect(container.querySelector("dialog")).toBeNull();
    await click(button("Stáhnout PDF"));
    await act(async () => finishOld(loadedProfile()));
    expect(container.textContent).toContain("Druhý poradce");
    expect(container.textContent).not.toContain("Štěpán Dvořák");
    await click(button("Stáhnout PDF s detaily"));
    expect(mocks.download.mock.calls[0][0].advisor).toMatchObject({ fullName: "Druhý poradce", email: mocks.email });
  });
  it("selects individual topics, pins them first and keeps the selection while searching", async () => {
    await render(); await click(button("Stáhnout PDF"));
    await click(button("Zrušit výběr"));
    expect(button("Stáhnout PDF s detaily").disabled).toBe(true);
    await click(topicCheckbox(0)); await click(topicCheckbox(13));
    await click(container.querySelector(`button[aria-label="Připnout téma: ${COMPARISON_ROWS[13].title}"]`)!);
    await click(container.querySelector(`button[aria-label="Připnout téma: ${COMPARISON_ROWS[2].title}"]`)!);
    expect(topicCheckbox(2).checked).toBe(true);
    await enter(container.querySelector<HTMLInputElement>('input[type="search"]')!, "tehotenstvi");
    expect(container.querySelectorAll('ul[aria-label="Témata v PDF"] li').length).toBeLessThan(COMPARISON_ROWS.length);
    await click(button("Stáhnout PDF s detaily"));
    const payload = mocks.download.mock.calls[0][0];
    expect(payload.rows.map((row: { id: string }) => row.id)).toEqual([COMPARISON_ROWS[2].id, COMPARISON_ROWS[13].id, COMPARISON_ROWS[0].id]);
    expect(payload.pinnedTopicIds).toEqual([COMPARISON_ROWS[2].id, COMPARISON_ROWS[13].id]);
  });

  it("removes the pin when a topic is unchecked and restores natural order after unpinning", async () => {
    await render(); await click(button("Stáhnout PDF"));
    await click(container.querySelector(`button[aria-label="Připnout téma: ${COMPARISON_ROWS[2].title}"]`)!);
    await click(topicCheckbox(2));
    expect(container.querySelector(`button[aria-label="Připnout téma: ${COMPARISON_ROWS[2].title}"]`)?.getAttribute("aria-pressed")).toBe("false");
    await click(container.querySelector(`button[aria-label="Připnout téma: ${COMPARISON_ROWS[13].title}"]`)!);
    await click(container.querySelector(`button[aria-label="Odepnout téma: ${COMPARISON_ROWS[13].title}"]`)!);
    await click(button("Stáhnout PDF s detaily"));
    expect(mocks.download.mock.calls[0][0].pinnedTopicIds).toEqual([]);
    expect(mocks.download.mock.calls[0][0].rows[0].id).toBe(COMPARISON_ROWS[0].id);
    expect(mocks.download.mock.calls[0][0].rows).toHaveLength(19);
  });

  it("preserves client notes when closing the dialog and exports all four personal fields", async () => {
    await render(); await click(button("Stáhnout PDF")); await click(button("Pro klienta"));
    const panel = () => container.querySelector('#export-panel-client')!;
    await enter(panel().querySelector<HTMLInputElement>('input[type="text"]')!, "  Jana Nováková  ");
    await enter(panel().querySelector<HTMLInputElement>('input[type="date"]')!, "2026-09-28");
    await enter(panel().querySelectorAll<HTMLTextAreaElement>('textarea')[0], "Rodina a příjem během nemoci.\n\nDvě malé děti.");
    await enter(panel().querySelectorAll<HTMLTextAreaElement>('textarea')[1], "Věnovat pozornost čekací době.");
    await click(container.querySelector('button[aria-label="Zavřít export PDF"]')!);
    await click(button("Stáhnout PDF")); await click(button("Pro klienta"));
    expect(panel().querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe("2026-09-28");
    expect(panel().querySelectorAll<HTMLTextAreaElement>('textarea')[1].value).toBe("Věnovat pozornost čekací době.");
    await click(button("Stáhnout PDF s detaily"));
    expect(mocks.download.mock.calls[0][0].personalization).toEqual({ clientName: "Jana Nováková", meetingDate: "2026-09-28", clientNeeds: "Rodina a příjem během nemoci.\n\nDvě malé děti.", advisorComment: "Věnovat pozornost čekací době." });
  });

  it("clears personal fields when switching the effective advisor account", async () => {
    await render(); await click(button("Stáhnout PDF")); await click(button("Pro klienta"));
    await enter(container.querySelector<HTMLInputElement>('input[type="text"]')!, "Soukromý klient prvního poradce");
    mocks.email = "another@example.test"; mocks.profile.mockResolvedValue(loadedProfile());
    await render(); await click(button("Stáhnout PDF")); await click(button("Pro klienta"));
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("");
  });

});
