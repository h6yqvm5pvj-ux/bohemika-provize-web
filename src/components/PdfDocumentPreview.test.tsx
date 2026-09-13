// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfDocumentPreview } from "./PdfDocumentPreview";
import { MailboxChatThread } from "@/app/posta/MailboxChatThread";
import type { MailboxItem } from "@/app/posta/postaTypes";

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: { workerSrc: "/pdf.worker.mjs" },
}));

describe("private PDF attachment previews", () => {
  let root: Root;
  let container: HTMLDivElement;
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const destroy = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("IntersectionObserver", undefined);
    // Previewing already authenticated bytes must not make another request.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected fetch")));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cGFnZQ==");
    destroy.mockClear();
    mocks.getDocument.mockReset().mockReturnValue({
      destroy,
      promise: Promise.resolve({
        numPages: 2,
        destroy,
        getPage: async () => ({
          getViewport: () => ({ width: 595, height: 842 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function click(label: string) {
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button).not.toBeNull();
    await act(async () => button!.click());
  }

  it("renders all pages from a copy of the provided bytes without embedding or fetching a blob URL", async () => {
    await act(async () => root.render(<PdfDocumentPreview pdfData={bytes} name="test.pdf" />));
    expect(container.querySelectorAll('img[alt^="Strana "]')).toHaveLength(2);
    expect(container.textContent).toContain("test.pdf • 2 stran");
    expect(mocks.getDocument.mock.calls[0][0].data).toEqual(bytes);
    expect(mocks.getDocument.mock.calls[0][0].data).not.toBe(bytes);
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("iframe, object, embed")).toBeNull();
  });

  it("opens and reopens a mailbox PDF using its authenticated response while keeping the download", async () => {
    const file = { id: "pdf", name: "test.pdf", url: "/api/mailbox/attachment?messageId=message&attachmentId=pdf", contentType: "application/pdf", sizeBytes: 4 };
    const message: MailboxItem = {
      id: "message", type: "direct_message", title: "PDF", body: "Příloha", deepLink: "/posta",
      read: true, createdAtMs: 1_000, readAtMs: 1_000,
      metadata: { attachments: [file], messageText: "Příloha" },
    };
    const load = vi.fn().mockResolvedValue({ url: "blob:private-pdf", blob: new Blob([bytes], { type: "application/pdf" }) });
    await act(async () => root.render(<MailboxChatThread messages={[message]} onLoadAttachment={load} />));
    await click("Načíst přílohu test.pdf");
    expect(load).toHaveBeenCalledExactlyOnceWith("message", file);
    expect(container.querySelectorAll('img[alt^="Strana "]')).toHaveLength(2);
    expect(container.querySelector('a[download="test.pdf"]')?.getAttribute("href")).toBe("blob:private-pdf");
    expect(container.querySelector("iframe, object, embed")).toBeNull();
    await click("Zavřít náhled");
    expect(destroy).toHaveBeenCalled();
    await click("Zobrazit náhled souboru test.pdf");
    expect(load).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('img[alt^="Strana "]')).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a readable error for a damaged PDF", async () => {
    mocks.getDocument.mockImplementation(() => ({ destroy, promise: Promise.reject(new Error("Neplatný PDF dokument.")) }));
    await act(async () => root.render(<PdfDocumentPreview pdfData={bytes} name="damaged.pdf" />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Neplatný PDF dokument.");
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("destroys a pending PDF task when the preview closes", async () => {
    mocks.getDocument.mockReturnValue({ destroy, promise: new Promise(() => {}) });
    await act(async () => root.render(<PdfDocumentPreview pdfData={bytes} name="slow.pdf" />));
    expect(container.textContent).toContain("Připravuji PDF náhled");
    await act(async () => root.render(null));
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
