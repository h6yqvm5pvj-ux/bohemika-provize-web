// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractPdfPreviewDialog } from "./ContractPdfPreviewDialog";

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {}, getDocument: mocks.getDocument,
}));

let root: Root;
let host: HTMLDivElement;
const getPage = vi.fn();
const destroy = vi.fn();
const visibility = new Map<Element, (visible: boolean) => void>();
const blob = new Blob(["%PDF-synthetic"], { type: "application/pdf" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private update: (entries: { isIntersecting: boolean }[]) => void) {}
    observe(node: Element) { visibility.set(node, visible => this.update([{ isIntersecting: visible }])); }
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  destroy.mockResolvedValue(undefined);
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 100, getPage }), destroy });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  visibility.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open(loadPdf: (signal: AbortSignal) => Promise<Blob>) {
  await act(async () => root.render(
    <ContractPdfPreviewDialog fileName="test.pdf" loadPdf={loadPdf} onClose={() => {}} />
  ));
}

it("reveals the first page independently of the other 99 and releases distant canvases", async () => {
  const first = Promise.withResolvers<void>();
  const renderTask = (promise: Promise<void>) => ({
    getViewport: () => ({ width: 595, height: 842 }),
    render: () => ({ promise, cancel: vi.fn() }),
  });
  getPage.mockImplementation(async (number: number) => renderTask(number === 1 ? first.promise : Promise.resolve()));
  const load = vi.fn().mockResolvedValue(blob);
  await open(load);
  expect(getPage.mock.calls).toEqual([[1]]);
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  expect(host.querySelector('a[download]')?.getAttribute("href")).toBe("blob:synthetic");
  expect(mocks.getDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array), isEvalSupported: false });

  await act(async () => first.resolve());
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(host.querySelectorAll("canvas")).toHaveLength(1);
  expect(visibility.size).toBe(99);
  const page50 = [...visibility.values()][48];
  await act(async () => page50(true));
  expect(getPage.mock.calls).toEqual([[1], [50]]);
  const canvas = host.querySelector<HTMLCanvasElement>('canvas[aria-label$=" 50"]')!;
  expect(canvas.width).toBe(595);
  await act(async () => page50(false));
  expect(canvas.isConnected).toBe(false);
  expect(canvas.width).toBe(0);
  expect(load).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  expect(destroy).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
});

it("aborts a pending download on close and discards a late private response", async () => {
  const download = Promise.withResolvers<Blob>();
  const load = vi.fn<(signal: AbortSignal) => Promise<Blob>>().mockReturnValue(download.promise);
  await open(load);
  await act(async () => root.render(null));
  expect(load.mock.calls[0][0].aborted).toBe(true);
  await act(async () => download.resolve(blob));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(mocks.getDocument).not.toHaveBeenCalled();
});

it("cancels an active render and destroys the worker on close", async () => {
  const cancel = vi.fn();
  getPage.mockResolvedValue({
    getViewport: () => ({ width: 100, height: 200 }),
    render: () => ({ promise: new Promise(() => {}), cancel }),
  });
  await open(async () => blob);
  await act(async () => root.render(null));
  expect(cancel).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});

it("keeps a rejected download private and displays a generic error", async () => {
  await open(async () => { throw new Error("private-provider-detail"); });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("nepodařilo načíst");
  expect(host.textContent).not.toContain("private-provider-detail");
  expect(host.querySelector("a")).toBeNull();
  expect(mocks.getDocument).not.toHaveBeenCalled();
});
