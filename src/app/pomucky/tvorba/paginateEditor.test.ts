// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paginateEditor } from "./paginateEditor";

let editor: HTMLDivElement;
beforeEach(() => {
  // Deterministic layout for content-integrity tests; real A4 fitting is checked in Chrome.
  for (const property of ["offsetHeight", "offsetWidth", "clientHeight", "clientWidth", "scrollWidth"] as const) {
    vi.spyOn(HTMLElement.prototype, property, "get").mockReturnValue(100);
  }
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return (this.textContent || "").length + this.querySelectorAll("br").length * 12;
  });
  editor = document.createElement("div");
  editor.setAttribute("data-editor-frame", "1");
  document.body.append(editor);
});
afterEach(() => { editor.remove(); vi.restoreAllMocks(); });
const parse = (html: string) => { const node = document.createElement("div"); node.innerHTML = html; return node; };

describe("rich-text pagination", () => {
  it("retains every word, inline formatting and caret exactly once across a long paragraph", () => {
    const html = `<h1>Nadpis</h1><p><strong>${"Český text s diakritikou. ".repeat(20)}</strong><span data-pagination-caret="true"></span></p>`;
    const parts = paginateEditor(editor, html);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map(part => parse(part).textContent).join("")).toBe(parse(html).textContent);
    expect(parts.every(part => parse(part).querySelector("strong"))).toBe(true);
    expect(parts.join("").match(/data-pagination-caret/g)).toHaveLength(1);
  });

  it("continues ordered-list numbering without empty or duplicate markers", () => {
    const html = `<ol start="7">${Array.from({ length: 20 }, (_, i) => `<li data-item="${i + 7}">Položka ${i + 7} s dalším textem.</li>`).join("")}</ol>`;
    const parts = paginateEditor(editor, html);
    expect(parts.map(part => parse(part).textContent).join("")).toBe(parse(html).textContent);
    for (const part of parts) {
      const list = parse(part).querySelector("ol")!;
      Array.from(list.children).forEach((item, index) => {
        expect(item.textContent?.trim()).not.toBe("");
        if ((item as HTMLElement).style.listStyleType !== "none") {
          expect(Number(list.start) + index).toBe(Number(item.getAttribute("data-item")));
        }
      });
    }
  });

  it("leaves the original editor intact and cleans up when content cannot fit", () => {
    editor.innerHTML = "<p>Původní obsah</p>";
    expect(() => paginateEditor(editor, `<p>${"X".repeat(200)}</p>`)).toThrow("větší než stránka");
    expect(editor.innerHTML).toBe("<p>Původní obsah</p>");
    expect(document.body.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });
});
