import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COUNTERWEIGHTS, TOPICS, evidenceHref } from "./comparisonData";
import { createComparisonPdf } from "./comparisonPdf";

const advisor = { fullName: "Štěpán Dvořák", title: "Finanční poradce", email: "stepan@example.test", phone: "+420 777 123 456", ico: "12345678", cardUrl: "https://example.test/vizitka/stepan" };
const compact = (text: string) => text.replace(/\s/g, "");
afterEach(() => vi.unstubAllGlobals());
describe("PDF NEON vs. Bel Mondo 20", () => {
  it("zachová všechny podmínky, tabulkový model, zdroje, češtinu a vizitku bez přetékání", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(await readFile(resolve(process.cwd(), `public${path}`)))));
    const pdf = await createComparisonPdf({ selectedIds: TOPICS.map((row) => row.id), insuredSum: 1_000_000, percent: 50, advisor, generatedAt: new Date("2026-10-06T12:00:00Z") });
    const doc = await getDocument({ data: new Uint8Array(pdf.output("arraybuffer")), useSystemFonts: true }).promise;
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number); const content = await page.getTextContent();
      const items = content.items.filter((item) => "str" in item);
      pages.push({ text: items.map((item) => item.str).join(" "), items, annotations: await page.getAnnotations(), width: page.view[2], height: page.view[3] });
    }
    const text = compact(pages.map((page) => page.text).join(" "));
    for (const row of [...TOPICS, ...COUNTERWEIGHTS]) {
      for (const value of [row.title, row.cpp, row.generali, row.conditions]) expect(text).toContain(compact(value));
    }
    for (const value of ["2 500 000 Kč", "1 450 000 Kč", "1 050 000 Kč", "Výklad k potvrzení", "200 000 Kč", "100 000 Kč", "DPP 0426", "02/2024 v03", advisor.fullName, advisor.email, advisor.phone, advisor.ico]) expect(text).toContain(compact(value));
    const urls = pages.flatMap((page) => page.annotations.map((annotation) => annotation.url));
    expect(urls).toContain(advisor.cardUrl);
    for (const row of TOPICS) for (const source of row.evidence) expect(urls).toContain(evidenceHref(source));
    for (const page of pages) {
      expect(page.text).toContain("NEON Life vs. Bel Mondo 20");
      expect(page.text).toContain(advisor.fullName); expect(page.text).toContain(advisor.email);
      for (const item of page.items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(27);
        expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
        expect(item.transform[5], item.str).toBeGreaterThan(10);
        expect(item.transform[5], item.str).toBeLessThan(page.height - 10);
      }
      for (const annotation of page.annotations) {
        expect(annotation.rect[0]).toBeGreaterThanOrEqual(27);
        expect(annotation.rect[2]).toBeLessThan(page.width - 25);
        expect(annotation.rect[1]).toBeGreaterThan(10);
        expect(annotation.rect[3]).toBeLessThan(page.height - 10);
        if (annotation.url) expect(new URL(annotation.url).protocol).toBe("https:");
      }
    }
    await doc.destroy();
  }, 30_000);
});
