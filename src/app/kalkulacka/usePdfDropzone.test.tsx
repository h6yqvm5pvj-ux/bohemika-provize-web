// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfDropzone } from "./usePdfDropzone";

describe("PDF drop routing", () => {
  let root: Root;
  let container: HTMLDivElement;
  const single = vi.fn();
  const multiple = vi.fn();
  const invalid = vi.fn();
  const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" });

  function Harness({ busy = false, batches = true }) {
    const drop = usePdfDropzone({
      isBusy: busy,
      onPdfFile: single,
      onPdfFiles: batches ? multiple : undefined,
      onInvalidFile: invalid,
    });
    return <div onDrop={drop.handleDrop} />;
  }

  async function drop(files: File[]) {
    await act(async () => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: { files } });
      container.firstElementChild!.dispatchEvent(event);
    });
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("forwards every PDF once so the shared input can choose single or batch processing", async () => {
    await act(async () => root.render(<Harness />));
    const first = pdf("first.pdf");
    await drop([first]);
    expect(multiple).toHaveBeenLastCalledWith([first]);
    const second = pdf("second.pdf");
    await drop([first, second]);
    expect(multiple).toHaveBeenLastCalledWith([first, second]);
    expect(multiple).toHaveBeenCalledTimes(2);
    expect(single).not.toHaveBeenCalled();
  });

  it("keeps the single-file callback working where batch handling is absent", async () => {
    await act(async () => root.render(<Harness batches={false} />));
    const file = pdf("single.pdf");
    await drop([file]);
    expect(single).toHaveBeenCalledExactlyOnceWith(file);
    expect(multiple).not.toHaveBeenCalled();
  });

  it("accepts a PDF extension when the browser does not provide a MIME type", async () => {
    await act(async () => root.render(<Harness />));
    const file = new File(["%PDF"], "contract.PDF");
    await drop([file]);
    expect(multiple).toHaveBeenCalledExactlyOnceWith([file]);
  });

  it("passes only PDF files to the import and reports a drop containing no PDF", async () => {
    await act(async () => root.render(<Harness />));
    const image = new File(["image"], "photo.png", { type: "image/png" });
    const file = pdf("contract.pdf");
    await drop([image, file]);
    expect(multiple).toHaveBeenCalledExactlyOnceWith([file]);
    await drop([image]);
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(multiple).toHaveBeenCalledTimes(1);
  });

  it("does not start another import while a save or batch is running", async () => {
    await act(async () => root.render(<Harness busy />));
    await drop([pdf("first.pdf"), pdf("second.pdf")]);
    expect(single).not.toHaveBeenCalled();
    expect(multiple).not.toHaveBeenCalled();
    expect(invalid).not.toHaveBeenCalled();
  });
});
