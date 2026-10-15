// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyAction, CopyFeedback, useRecordClipboard } from "./ResultComponents";

let root: Root;
let container: HTMLDivElement;

function ClipboardExample() {
  const { copiedText, feedback, handleCopy } = useRecordClipboard();
  return <>
    <CopyAction text="První syntetický text" copiedText={copiedText} onCopy={handleCopy} />
    <CopyAction text="Druhý syntetický text" copiedText={copiedText} onCopy={handleCopy} />
    <CopyFeedback feedback={feedback} />
  </>;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ClipboardExample />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function copy(index = 0) {
  await act(async () => container.querySelectorAll("button")[index].click());
}

describe("meeting record clipboard feedback", () => {
  it("confirms successful writes and keeps the latest confirmation visible for its full duration", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await copy();
    expect(write).toHaveBeenLastCalledWith("První syntetický text");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Text je ve schránce");
    await act(async () => vi.advanceTimersByTime(2000));
    await copy(1);
    await act(async () => vi.advanceTimersByTime(500));
    expect(container.querySelectorAll("button")[1].textContent).toBe("Zkopírováno");
    await act(async () => vi.advanceTimersByTime(2000));
    expect(container.querySelectorAll("button")[1].textContent).toBe("Kopírovat");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("reports a rejected write and allows a successful retry without logging the copied text", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("Denied")).mockResolvedValue(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await copy();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nepodařilo zkopírovat");
    expect(container.textContent).not.toContain("Zkopírováno");
    expect(log).not.toHaveBeenCalled();
    await copy();
    expect(write).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("Zkopírováno");
  });

  it("offers manual copying when the clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", { clipboard: undefined });
    await copy();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("zkopíruj ručně");
    expect(container.textContent).not.toContain("Zkopírováno");
  });

  it("ignores an older pending write after a newer copy succeeds", async () => {
    const pending = Promise.withResolvers<void>();
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    await copy();
    await copy(1);
    await act(async () => pending.resolve());
    expect(container.querySelectorAll("button")[0].textContent).toBe("Kopírovat");
    expect(container.querySelectorAll("button")[1].textContent).toBe("Zkopírováno");
  });

  it("does not schedule a confirmation after the owning view unmounts", async () => {
    const pending = Promise.withResolvers<void>();
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(pending.promise);
    await copy();
    await act(async () => root.render(null));
    await act(async () => pending.resolve());
    expect(vi.getTimerCount()).toBe(0);
    expect(container.textContent).toBe("");
  });
});
