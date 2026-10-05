// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentAttachmentPreview } from "./DocumentAttachmentPreview";

vi.mock("@/components/PdfDocumentPreview", () => ({
  PdfDocumentPreview: ({ pdfData }: { pdfData: Uint8Array }) => createElement("div", { "data-testid": "pdf-content" }, String(pdfData[0])),
}));

function deferredBlob() {
  let resolve!: (value: ArrayBuffer) => void;
  const promise = new Promise<ArrayBuffer>(done => { resolve = done; });
  return { blob: { arrayBuffer: () => promise } as Blob, resolve };
}

const baseProps = { url: null, loading: false, error: null, isImage: false, contentType: "application/pdf", title: "Synthetic PDF" };

describe("document attachment identity", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function renderPreview(blob: Blob | null, error: string | null = null) {
    await act(async () => { root.render(createElement(DocumentAttachmentPreview, { ...baseProps, blob, error })); });
  }
  const pdfContent = () => container.querySelector('[data-testid="pdf-content"]');

  it("ignores a delayed read of a document that has been replaced", async () => {
    const first = deferredBlob(); const second = deferredBlob();
    await renderPreview(first.blob);
    await renderPreview(second.blob);
    await act(async () => { first.resolve(new Uint8Array([11]).buffer); });
    expect(pdfContent()).toBeNull();
    await act(async () => { second.resolve(new Uint8Array([22]).buffer); });
    expect(pdfContent()?.textContent).toBe("22");
  });

  it("immediately hides loaded bytes when the attachment changes or is cleared", async () => {
    const first = deferredBlob(); const second = deferredBlob();
    await renderPreview(first.blob);
    await act(async () => { first.resolve(new Uint8Array([11]).buffer); });
    expect(pdfContent()?.textContent).toBe("11");
    await renderPreview(second.blob);
    expect(pdfContent()).toBeNull();
    await renderPreview(null);
    await act(async () => { second.resolve(new Uint8Array([22]).buffer); });
    expect(pdfContent()).toBeNull();
  });

  it("renders attachment errors as text", async () => {
    await renderPreview(null, '<img src=x onerror="alert(1)">');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("<img");
    expect(container.querySelector("img")).toBeNull();
  });
});
