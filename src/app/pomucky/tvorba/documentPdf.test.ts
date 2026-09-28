// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentPdf, preparePage } from "./documentPdf";
import { fittedImageSize, pdfFilename, type DocumentPage } from "./documentModel";

const mocks = vi.hoisted(() => ({ capture: vi.fn(), options: vi.fn(), addPage: vi.fn(), addImage: vi.fn(), output: vi.fn(), metadata: vi.fn(), fill: vi.fn(), rect: vi.fn(), link: vi.fn() }));
vi.mock("html2canvas-pro", () => ({ default: mocks.capture }));
vi.mock("jspdf", () => ({ jsPDF: class {
  constructor(options: unknown) { mocks.options(options); }
  addPage = mocks.addPage;
  addImage = mocks.addImage;
  output = mocks.output;
  setProperties = mocks.metadata;
  setFillColor = mocks.fill;
  rect = mocks.rect;
  link = mocks.link;
} }));

const first: DocumentPage = { id: "first", html: "<p>První stránka s diakritikou.</p>", images: [], fontSize: 15, fontKey: "arial", fontFamily: "Arial", color: "#123456" };
const second: DocumentPage = { ...first, id: "second", html: "<h2>Druhá stránka</h2>", images: [{ id: "photo", src: "data:image/png;base64,AAA", alt: "Fotografie", x: 20, y: 30, width: 100, height: 80 }] };
function sourcePage() {
  const source = document.createElement("div");
  source.innerHTML = '<header>Bohemika</header><div contenteditable="true" data-editor-frame="1">Aktivní obsah</div><div data-image-layer="1"><button data-export-ignore="1">Smazat</button></div><footer>Vizitka <span data-page-number="1">1 / 1</span></footer>';
  return source;
}

beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(794);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(1123);
  mocks.capture.mockImplementation(async () => ({ width: 1588, height: 2246, toDataURL: (type: string, quality: number) => `${type};quality=${quality}` }));
  mocks.output.mockReturnValue(new Blob(["pdf"], { type: "application/pdf" }));
});

describe("PDF document export", () => {
  it("exports every page in order at A4 dimensions regardless of a scaled preview", async () => {
    const source = sourcePage();
    source.style.transform = "scale(0.4)";
    const captured: string[] = [];
    mocks.capture.mockImplementation(async (node: HTMLElement) => {
      captured.push(node.textContent ?? "");
      expect(node.style.transform).toBe("none");
      expect(node.querySelector("[contenteditable]")).toBeNull();
      return { width: 1588, height: 2246, toDataURL: (type: string, quality: number) => `${type};quality=${quality}` };
    });
    const progress = vi.fn();
    const blob = await createDocumentPdf({ source, pages: [first, second], title: "Návrh", author: "Poradce", quality: "medium", onProgress: progress });
    expect(blob.type).toBe("application/pdf");
    expect(captured[0]).toContain("První stránka s diakritikou.");
    expect(captured[0]).toContain("Vizitka 1 / 2");
    expect(captured[1]).toContain("Druhá stránka");
    expect(captured[1]).toContain("Vizitka 2 / 2");
    expect(mocks.addPage).toHaveBeenCalledTimes(1);
    expect(mocks.capture.mock.calls[0][1]).toMatchObject({ width: 794, height: 1123, scale: 2 });
    expect(mocks.addImage.mock.calls[0]).toEqual(["image/jpeg;quality=0.78", "JPEG", 0, 0, 210, 297, undefined, "FAST"]);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(source.textContent).toContain("Aktivní obsah");
  });

  it("keeps per-page images and formatting without carrying controls or images from another page", () => {
    const source = sourcePage();
    const clone = preparePage(source, second, 1, 2);
    const img = clone.querySelector("img")!;
    expect(img.src).toBe(second.images[0].src);
    expect(img.style.left).toBe("20px");
    expect(clone.querySelector("button")).toBeNull();
    expect(clone.querySelector<HTMLElement>("[data-editor-frame]")!.style.color).toBe("#123456");
    expect(preparePage(source, first, 0, 2).querySelector("img")).toBeNull();
  });

  it("applies the small-file preset and passes the requested password to every document", async () => {
    await createDocumentPdf({ source: sourcePage(), pages: [first], title: "Test", author: "", quality: "low", password: "heslo123", onProgress: vi.fn() });
    expect(mocks.capture.mock.calls[0][1].scale).toBe(1.5);
    expect(mocks.addImage.mock.calls[0][0]).toBe("image/jpeg;quality=0.62");
    expect(mocks.options.mock.calls[0][0]).toMatchObject({ compress: true, encryption: { userPassword: "heslo123" } });
  });

  it("refuses to silently cut overflowing text on an inactive page and cleans up", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) { return this.textContent?.includes("Druhá stránka") ? 1200 : 0; });
    await expect(createDocumentPdf({ source: sourcePage(), pages: [first, second], title: "Test", author: "", quality: "medium", onProgress: vi.fn() })).rejects.toThrow("straně 2 přesahuje");
    expect(mocks.output).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("reports unreadable images without exporting a partial document", async () => {
    vi.spyOn(HTMLImageElement.prototype, "decode").mockRejectedValue(new Error("Invalid image"));
    await expect(createDocumentPdf({ source: sourcePage(), pages: [second], title: "Test", author: "", quality: "medium", onProgress: vi.fn() })).rejects.toThrow("Obrázek na straně 1");
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.output).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("draws a clickable QR as vectors on every page even in the smallest JPEG preset", async () => {
    const source = sourcePage();
    source.insertAdjacentHTML("beforeend", '<div data-contact-qr="1"><svg aria-label="QR kód vizitky"></svg></div>');
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-contact-qr") ? new DOMRect(630, 940, 98, 98) : new DOMRect(0, 0, 794, 1123);
    });
    // Footer overlap is covered separately; this synthetic page only tests QR placement.
    source.querySelector("footer")?.remove();
    mocks.capture.mockImplementation(async (node: HTMLElement) => {
      expect(node.querySelector<HTMLElement>("[data-contact-qr]")!.style.visibility).toBe("hidden");
      return { width: 794, height: 1123, toDataURL: () => "compressed-jpeg" };
    });
    await createDocumentPdf({ source, pages: [first, second], title: "Test", author: "", quality: "low", contact: { payload: "https://bohemika.app/vizitka/petra", href: "https://bohemika.app/vizitka/petra", label: "Moje online vizitka" }, onProgress: vi.fn() });
    expect(mocks.rect.mock.calls.length).toBeGreaterThan(100);
    expect(mocks.rect.mock.calls.every(call => call.slice(0, 4).every(Number.isFinite))).toBe(true);
    expect(mocks.link).toHaveBeenCalledTimes(2);
    expect(mocks.link.mock.calls[0][4]).toEqual({ url: "https://bohemika.app/vizitka/petra" });
    expect(mocks.rect.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.addImage.mock.invocationCallOrder[0]);
  });
});

describe("image and file dimensions", () => {
  it("bounds both wide and tall photographs without changing their proportions or upscaling small icons", () => {
    expect(fittedImageSize(6000, 4000, 2000, 2000)).toEqual({ width: 2000, height: 1333 });
    expect(fittedImageSize(1000, 6000, 300, 700)).toEqual({ width: 117, height: 700 });
    expect(fittedImageSize(20, 10, 300, 700)).toEqual({ width: 20, height: 10 });
  });
  it("produces usable file names, including empty names and Czech characters", () => {
    expect(pdfFilename("  Návrh pro Jiřího.pdf ")).toBe("Návrh pro Jiřího.pdf");
    expect(pdfFilename("../../Návrh: klient")).toBe("..-..-Návrh- klient.pdf");
    expect(pdfFilename(" ")).toBe("Dokument.pdf");
  });
});
