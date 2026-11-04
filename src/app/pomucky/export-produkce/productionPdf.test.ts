// @vitest-environment happy-dom
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { collectPdfBreakRanges, choosePdfSliceEndCssY } from "./productionPdf";

describe("production report pagination", () => {
  it("moves a table row to the next page instead of cutting its text", () => {
    expect(choosePdfSliceEndCssY({ startY: 0, desiredEndY: 900, contentEndY: 1500, pageCssHeight: 900, ranges: [{top: 880, bottom: 925, kind: "row"}] })).toBe(880);
  });

  it("keeps an adviser card together when it fits on a page", () => {
    expect(choosePdfSliceEndCssY({ startY: 900, desiredEndY: 1800, contentEndY: 2400, pageCssHeight: 900, ranges: [{top: 1550, bottom: 1900, kind: "block"}, {top: 1775, bottom: 1820, kind: "row"}] })).toBe(1550);
  });

  it("can paginate oversized sections and finish a short last page", () => {
    expect(choosePdfSliceEndCssY({ startY: 0, desiredEndY: 900, contentEndY: 1900, pageCssHeight: 900, ranges: [{top: 0, bottom: 1900, kind: "block"}, {top: 875, bottom: 915, kind: "row"}] })).toBe(875);
    expect(choosePdfSliceEndCssY({ startY: 1800, desiredEndY: 2700, contentEndY: 1900, pageCssHeight: 900, ranges: [] })).toBe(1900);
  });

  it("reads row bounds from the isolated document used for PDF rendering", async () => {
    const renderWindow = new Window();
    try {
      const doc = renderWindow.document;
      doc.body.innerHTML = '<div class="page"><table class="product-table"><tbody><tr><td>Český název</td></tr></tbody></table></div>';
      const page = doc.querySelector(".page")!;
      const row = page.querySelector("tr")!;
      page.getBoundingClientRect = () => new renderWindow.DOMRect(0, 100, 760, 1000);
      row.getBoundingClientRect = () => new renderWindow.DOMRect(0, 900, 690, 45);
      expect(page.ownerDocument).not.toBe(document);
      expect(collectPdfBreakRanges(page as unknown as HTMLElement)).toContainEqual({top:800,bottom:845,kind:"row"});
    } finally { await renderWindow.happyDOM.close(); }
  });

  it("rechecks overlapping ranges so moving a section does not orphan its heading", () => {
    expect(choosePdfSliceEndCssY({ startY: 0, desiredEndY: 900, contentEndY: 1500, pageCssHeight: 900,
      ranges: [{top: 780, bottom: 1100, kind: "block"}, {top: 700, bottom: 830, kind: "block"}] })).toBe(700);
  });
});
