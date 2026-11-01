// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractPdfUploadButton } from "./ContractPdfUploadButton";

const attachment = { hasFile: true, contentType: "application/pdf", originalName: "synthetic-contract.pdf",
  sha256: "a".repeat(64), sizeBytes: 22, uploadedAtMs: 100 };
const requestUpload = vi.fn();
const onUploaded = vi.fn();
const defaults = { ownerEmail: "owner@example.test", entryId: "entry-A", requestUpload, onUploaded };
let container: HTMLDivElement;
let root: Root | null;
const pdf = () => new File(["%PDF-1.7 synthetic"], "synthetic-contract.PDF", { type: "application/pdf" });

async function render(props: Partial<typeof defaults> & { disabled?: boolean } = {}) {
  await act(async () => root!.render(<ContractPdfUploadButton {...defaults} {...props} />));
}
async function choose(file: File) {
  const input = container.querySelector<HTMLInputElement>("input")!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  Object.defineProperty(input, "value", { configurable: true, writable: true, value: "synthetic-selected-file" });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(input.value).toBe("");
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  requestUpload.mockResolvedValue({ ok: true, attachment });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container.remove();
});

describe("late contract PDF attachment", () => {
  it("opens the file picker only after clicking the upload button", async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>("input")!;
    const picker = vi.spyOn(input, "click").mockImplementation(() => {});
    expect(input.accept).toBe("application/pdf,.pdf");
    expect(requestUpload).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(picker).toHaveBeenCalledOnce();
  });

  it("submits the exact source and missing-only intent, then returns the stored attachment", async () => {
    await render(); await choose(pdf());
    expect(requestUpload).toHaveBeenCalledOnce();
    const [form, signal] = requestUpload.mock.calls[0] as [FormData, AbortSignal];
    expect(form.get("ownerEmail")).toBe("owner@example.test");
    expect(form.get("entryId")).toBe("entry-A");
    expect(form.get("onlyIfMissing")).toBe("1");
    expect(form.get("file")).toMatchObject({ name: "synthetic-contract.PDF", type: "application/pdf" });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(onUploaded).toHaveBeenCalledWith(attachment);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    [() => new File(["x"], "image.png", { type: "image/png" }), "formátu PDF"],
    [() => new File(["x"], "contract.pdf", { type: "text/html" }), "formátu PDF"],
    [() => new File([], "empty.pdf", { type: "application/pdf" }), "prázdné"],
    [() => new File([new Uint8Array(12 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }), "12 MB"],
  ] as const)("rejects invalid selected files before any request", async (file, message) => {
    await render(); await choose(file());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(requestUpload).not.toHaveBeenCalled(); expect(onUploaded).not.toHaveBeenCalled();
  });

  it.each(["", "application/x-pdf"])("accepts a PDF with browser MIME %s", async type => {
    await render(); await choose(new File(["%PDF-1.7"], "contract.pdf", { type }));
    expect(requestUpload).toHaveBeenCalledOnce(); expect(onUploaded).toHaveBeenCalledOnce();
  });

  it.each([401, 403])( "reports permission rejection without exposing server error contents", async status => {
    requestUpload.mockRejectedValue(Object.assign(new Error("private-token internal-path"), { status }));
    await render(); await choose(pdf());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nemáš oprávnění");
    expect(container.textContent).not.toContain("private-token"); expect(onUploaded).not.toHaveBeenCalled();
  });

  it("does not overwrite a concurrently attached PDF and tells the user to refresh", async () => {
    requestUpload.mockRejectedValue(Object.assign(new Error("private detail"), { status: 409 }));
    await render(); await choose(pdf());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Obnov detail");
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("allows selecting the same file again after a failed upload", async () => {
    requestUpload.mockRejectedValueOnce(new Error("network private detail"));
    await render(); const file = pdf(); await choose(file);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Zkus to znovu");
    await choose(file);
    expect(requestUpload).toHaveBeenCalledTimes(2); expect(onUploaded).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("prevents duplicate requests while an upload is pending", async () => {
    const pending = deferred<{ ok: boolean; attachment: typeof attachment }>();
    requestUpload.mockReturnValue(pending.promise);
    await render(); await choose(pdf());
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.querySelector("button")?.getAttribute("aria-busy")).toBe("true");
    await choose(pdf()); expect(requestUpload).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ ok: true, attachment }));
    expect(onUploaded).toHaveBeenCalledOnce();
  });

  it("ignores a late result after unmount and aborts the request", async () => {
    const pending = deferred<{ ok: boolean; attachment: typeof attachment }>(); requestUpload.mockReturnValue(pending.promise);
    await render(); await choose(pdf());
    const signal = requestUpload.mock.calls[0][1] as AbortSignal;
    await act(async () => root!.unmount()); root = null;
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ok: true, attachment }));
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("ignores a previous contract's result after switching sources", async () => {
    const pending = deferred<{ ok: boolean; attachment: typeof attachment }>(); requestUpload.mockReturnValue(pending.promise);
    await render(); await choose(pdf());
    const signal = requestUpload.mock.calls[0][1] as AbortSignal;
    await render({ entryId: "entry-B" });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ok: true, attachment }));
    expect(onUploaded).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    { ok: false, attachment },
    { ok: true, attachment: null },
    { ok: true, attachment: { hasFile: false, contentType: "application/pdf" } },
    { ok: true, attachment: { hasFile: true, contentType: "text/html" } },
  ])("rejects an unverified upload response", async response => {
    requestUpload.mockResolvedValue(response);
    await render(); await choose(pdf());
    expect(onUploaded).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nepodařilo nahrát");
  });

  it("cannot open or submit while the parent disables uploads", async () => {
    await render({ disabled: true });
    expect(container.querySelector("button")?.disabled).toBe(true);
    await choose(pdf());
    expect(requestUpload).not.toHaveBeenCalled();
  });
});
