import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createLiabilityPdf } from "./comparisonPdf";
import { buildLiabilityReport, initialExportSettings, type LiabilityReport } from "./exportData";
import { LIABILITY_SECTIONS } from "./sections";
import { LIABILITY_PRODUCTS } from "./products";
import { SCREENSHOT_PRODUCT_IDS } from "./screenshotData";
import { ADDITIONAL_PRODUCT_IDS } from "./additionalProductData";
import { REMAINING_PRODUCT_IDS } from "./remainingProductData";

const products = LIABILITY_PRODUCTS.filter((product) => SCREENSHOT_PRODUCT_IDS.some((id) => id === product.id));
const advisor = { fullName: "Štěpán Dvořák", title: "Finanční poradce", email: "stepan@example.test", phone: "+420 777 123 456", ico: "12345678", cardUrl: "https://example.test/vizitka/stepan" };
const compact = (value: string) => value.replace(/\s/g, "");
afterEach(() => vi.unstubAllGlobals());
async function generate(report: LiabilityReport) {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(await readFile(resolve(process.cwd(), `public${path}`)))));
  const pdf = await createLiabilityPdf({ report, advisor, generatedAt: new Date("2026-09-20T12:00:00Z") });
  const document = await getDocument({ data: new Uint8Array(pdf.output("arraybuffer")), useSystemFonts: true }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index++) {
    const page = await document.getPage(index), content = await page.getTextContent();
    const items = content.items.filter((item) => "str" in item);
    pages.push({ text: items.map((item) => item.str).join(" "), items, annotations: await page.getAnnotations(), width: page.view[2], height: page.view[3] });
  }
  await document.destroy(); return pages;
}

describe("PDF občanské odpovědnosti", () => {
  it("obsahuje vybraná data, češtinu, firemní hlavičku a vizitku s odkazem", async () => {
    const report = buildLiabilityReport(LIABILITY_SECTIONS, products, { ...initialExportSettings(LIABILITY_SECTIONS), includeSubcriteria: true });
    const pages = await generate(report), text = compact(pages.map((page) => page.text).join(" "));
    for (const section of report.sections) {
      expect(text).toContain(compact(section.title));
      for (const row of section.rows) {
        expect(text).toContain(compact(row.title));
        for (const cell of row.cells) expect(text).toContain(compact(cell.summary));
      }
    }
    for (const product of products) expect(text).toContain(compact(product.date));
    for (const value of [advisor.fullName, advisor.phone, advisor.email, advisor.ico, "Faerských ostrovů", "Záporožského regionu", "50 ccm"]) expect(text).toContain(compact(value));
    expect(pages.flatMap((page) => page.annotations).some((annotation) => annotation.url === advisor.cardUrl)).toBe(true);
    for (const page of pages) {
      expect(page.text).toContain("Bohemika a.s."); expect(page.width).toBeGreaterThan(page.height);
      for (const item of page.items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(27);
        expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
        expect(item.transform[5], item.str).toBeGreaterThan(10);
        expect(item.transform[5], item.str).toBeLessThan(page.height - 10);
      }
    }
  }, 30_000);

  it("vynechá nevybrané sekce, produkty a detaily", async () => {
    const report = buildLiabilityReport(LIABILITY_SECTIONS, products.slice(0, 2), { ...initialExportSettings(LIABILITY_SECTIONS), includeDetails: false, selectedCriteria: { breeder: ["dog"] } });
    const pages = await generate(report), text = pages.map((page) => page.text).join(" ");
    expect(text).toContain("Chov psa"); expect(text).not.toContain("Chov koček");
    expect(text).not.toContain("Spolupojištěné osoby"); expect(text).not.toContain("Naše Odpovědnost");
    expect(text).toContain("stručný přehled bez podrobností"); expect(pages).toHaveLength(1);
  });

  it("rozdělí deset produktů do čitelných skupin a zachová nové podmínky i dlouhé definice", async () => {
    const allProducts = LIABILITY_PRODUCTS.filter((product) => [...SCREENSHOT_PRODUCT_IDS, ...ADDITIONAL_PRODUCT_IDS].some((id) => id === product.id));
    const report = buildLiabilityReport(LIABILITY_SECTIONS, allProducts, { ...initialExportSettings(LIABILITY_SECTIONS), includeSubcriteria: true });
    const pages = await generate(report);
    for (const [offset, label] of [[0, "Produkty 1–5 z 10"], [5, "Produkty 6–10 z 10"]] as const) {
      const groupPages = pages.filter((page) => page.text.includes(label));
      expect(groupPages.length).toBeGreaterThan(0);
      const text = compact(groupPages.map((page) => page.text).join(" "));
      const groupProducts = allProducts.slice(offset, offset + 5);
      for (const product of groupProducts) {
        expect(text).toContain(compact(product.productName)); expect(text).toContain(compact(product.date));
      }
      // Spojíme tělo každého sloupce přes stránky bez opakovaných hlaviček a zápatí.
      const columns = groupProducts.map((_, columnIndex) => compact(groupPages.flatMap((page) => {
        const productWidth = (page.width - 56 - 158) / 5;
        const left = 28 + 158 + columnIndex * productWidth;
        const headerBottom = Math.min(...page.items.filter((item) => groupProducts.some((product) => product.date === item.str)).map((item) => item.transform[5]));
        return page.items.filter((item) => item.transform[4] >= left && item.transform[4] < left + productWidth
          && item.transform[5] < headerBottom - 6 && item.transform[5] > 39).map((item) => item.str);
      }).join(" ")));
      for (const section of report.sections) for (const row of section.rows) {
        expect(text).toContain(compact(row.title));
        row.cells.slice(offset, offset + 5).forEach((cell, index) => {
          expect(columns[index]).toContain(compact(cell.summary));
          if (cell.detail) expect(columns[index]).toContain(compact(cell.detail));
        });
      }
      for (const page of groupPages) for (const item of page.items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(27);
        expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
        expect(item.transform[5], item.str).toBeGreaterThan(10);
        expect(item.transform[5], item.str).toBeLessThan(page.height - 10);
      }
    }
    const newPages = compact(pages.filter((page) => page.text.includes("Produkty 6–10 z 10")).map((page) => page.text).join(" "));
    expect(newPages).not.toContain(compact("Údaj zatím není doplněn"));
  }, 30_000);

  it("zalomí dlouhou odpověď přes více stran bez ztráty textu", async () => {
    const report = buildLiabilityReport(LIABILITY_SECTIONS, products.slice(0, 1), { ...initialExportSettings(LIABILITY_SECTIONS), selectedCriteria: { breeder: ["dog"] } });
    report.sections[0].rows[0].cells[0].detail = Array.from({ length: 350 }, (_, index) => `Záznam ${index}: škoda způsobená zvířetem.`).join(" ") + " KONEC DETAILU";
    const pages = await generate(report), text = compact(pages.map((page) => page.text).join(" "));
    expect(pages.length).toBeGreaterThan(1); expect(text).toContain("KONECDETAILU");
    for (let index = 0; index < 350; index++) expect(text).toContain(compact(`Záznam ${index}:`));
    for (const page of pages.filter((page) => page.text.includes("Pokračování kritéria"))) expect(page.text).toContain("MůjDomov");
  });

  it("vytiskne posledních sedm produktů i neúplnou skupinu dvou sloupců ve správném pořadí", async () => {
    const selected = LIABILITY_PRODUCTS.filter((product) => REMAINING_PRODUCT_IDS.some((id) => id === product.id));
    const settings = { ...initialExportSettings(LIABILITY_SECTIONS), includeSubcriteria: true, selectedCriteria: {
      general: ["maximum-limit", "territory"], property: ["other-holiday-home"],
      tenancy: ["rental-vehicle-deductible"], coinsured: ["contracted-helper-chores"],
      "life-sport": ["recreational-cycling", "electric-vehicles-definition"], breeder: ["livestock"],
    } };
    const report = buildLiabilityReport(LIABILITY_SECTIONS, selected, settings);
    const pages = await generate(report);
    const lastGroup = pages.filter((page) => page.text.includes("Produkty 6–7 z 7"));
    expect(lastGroup).toHaveLength(6);
    const text = compact(lastGroup.map((page) => page.text).join(" "));
    expect(text).toContain(compact("Šťastný domov Jubileum"));
    expect(text).toContain(compact("Pojišťovna VZP"));
    expect(text).toContain(compact("Ano, limit 20 000 Kč"));
    expect(text).toContain(compact("Elektrokolem se rozumí kolo (resp. koloběžka) vybavené přídavným elektrickým motorem s výkonem do 250 W, jehož činnost se deaktivuje při dosažení max. rychlosti 25 km/h."));
    expect(text).toContain(compact("Chov hospodářských zvířat"));
    expect(text).toContain(compact("Podmínky hlavního krytí: Možno připojistit"));
    expect(text).not.toContain(compact("Základní varianta"));
    const firstText = compact(pages.filter((page) => page.text.includes("Produkty 1–5 z 7")).map((page) => page.text).join(" "));
    expect(firstText).toContain(compact("do 2. 3. 2026 max. 25 000 000 Kč"));
    expect(firstText).toContain(compact("příležitostná činnost s příjmem osvobozeným od daně z příjmu"));
    expect(firstText).toContain(compact("dvojnásobek sjednaného základního limitu"));
    for (const page of pages) for (const item of page.items) {
      expect(item.transform[4], item.str).toBeGreaterThanOrEqual(27);
      expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
    }
  });

  it("odmítne prázdný výběr a oznámí chybějící podklady", async () => {
    const report = buildLiabilityReport(LIABILITY_SECTIONS, products, { ...initialExportSettings(LIABILITY_SECTIONS), selectedCriteria: {} });
    await expect(createLiabilityPdf({ report, advisor })).rejects.toThrow("Vyber");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    report.sections = [{ id: "test", title: "Test", rows: [{ id: "test", title: "Test", cells: products.map(() => ({ summary: "Ano", tone: "positive" })) }] }];
    await expect(createLiabilityPdf({ report, advisor })).rejects.toThrow("podklady PDF");
  });
});
