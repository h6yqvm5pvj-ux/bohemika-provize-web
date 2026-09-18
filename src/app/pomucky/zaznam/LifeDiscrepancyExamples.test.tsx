// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchBlob: vi.fn(), user: { uid: "synthetic-advisor" } }));
vi.mock("@/app/firebase-auth", () => ({ auth: { currentUser: mocks.user } }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedBlobOrThrow: mocks.fetchBlob }));
import { LifeDiscrepancyExamples } from "./LifeDiscrepancyExamples";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.fetchBlob.mockResolvedValue(new Blob(["synthetic image"], { type: "image/png" }));
  vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:example-one").mockReturnValueOnce("blob:example-two");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function openExamples() {
  const button = container.querySelector("button")!;
  button.focus();
  await act(async () => button.click());
  return button;
}

describe("life record discrepancy examples", () => {
  it("loads both protected images only on opening and releases them when Escape closes the dialog", async () => {
    await act(async () => root.render(<LifeDiscrepancyExamples />));
    expect(mocks.fetchBlob).not.toHaveBeenCalled();
    const trigger = await openExamples();
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(mocks.fetchBlob).toHaveBeenCalledWith(mocks.user, "/api/documents/file?id=life-record-health-assessment-example");
    expect(mocks.fetchBlob).toHaveBeenCalledWith(mocks.user, "/api/documents/file?id=life-record-discrepancies-example");
    const images = [...dialog.querySelectorAll("img")];
    expect(images.map(image => image.getAttribute("src"))).toEqual(["blob:example-one", "blob:example-two"]);
    expect(images.map(image => image.getAttribute("width"))).toEqual(["1200", "2566"]);
    expect([...dialog.querySelectorAll("a")].map(link => link.href)).toEqual(["blob:example-one", "blob:example-two"]);
    await act(async () => { dialog.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:example-one");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:example-two");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a loading error and lets the user close and reopen the examples to retry", async () => {
    mocks.fetchBlob.mockRejectedValueOnce(new Error("Synthetic unavailable image"));
    await act(async () => root.render(<LifeDiscrepancyExamples />));
    await openExamples();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Obrázek se nepodařilo načíst");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Zavřít příklady"]')!.click());
    expect(container.querySelector("dialog")).toBeNull();
    await openExamples();
    expect(mocks.fetchBlob).toHaveBeenCalledTimes(4);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
