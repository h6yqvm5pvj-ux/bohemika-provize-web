import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { contactQr } from "../tvorba/contactQr";
import { addOffer, appendCoverage, appendLifeCoverage, appendTemplate, createDocument, createRow, emptyContact, type ComparisonDocument } from "./model";
import { createCatalogDetails } from "./coverageCatalog";
import { createComparisonPdf, type PdfOrientation } from "./pdf";

const advisor = { ...emptyContact, fullName: "Štěpán Dvořák", phone: "+420 777 123 456", email: "stepan@example.test", companyId: "12345678" };
const cardUrl = "https://example.test/vizitka/stepan";
const compact = (value: string) => value.replace(/\s/g, "");
afterEach(() => vi.unstubAllGlobals());
function example() {
  const doc = appendTemplate(createDocument(), "auto");
  doc.firstName = "Žaneta"; doc.lastName = "Černá"; doc.date = "2026-09-28";
  doc.offers[0] = { ...doc.offers[0], insurerId: "allianz", product: "Současný produkt", year: "2020", premium: "1000 Kč / měsíc" };
  doc.offers[1] = { ...doc.offers[1], insurerId: "cpp", product: "Navržený produkt", year: "2026", premium: "850 Kč / měsíc", note: "Doplňující informace k nové nabídce." };
  doc.rows[1].cells[doc.offers[0].id] = { text: "50 000 000 Kč", tone: "neutral" };
  doc.rows[1].cells[doc.offers[1].id] = { text: "100 000 000 Kč", tone: "positive" };
  doc.notes = "Osobní doporučení pro klientku. Přehled výhod a podmínek.";
  return doc;
}
async function generate(doc: ComparisonDocument, online = true, orientation?: PdfOrientation) {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(await readFile(resolve(process.cwd(), `public${path}`)))));
  const blob = await createComparisonPdf({ doc, advisor, contact: contactQr(advisor, online ? cardUrl : "")!, orientation });
  const pdf = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), content = await page.getTextContent(), ops = await page.getOperatorList();
    const items = content.items.filter(item => "str" in item);
    const imageRefs = ops.fnArray.flatMap((op, index) => op === OPS.paintImageXObject ? [ops.argsArray[index][0] as string] : []);
    pages.push({ items, text: items.map(item => item.str).join(" "), width: page.view[2], height: page.view[3], annotations: await page.getAnnotations(), images: imageRefs.length, imageRefs });
  }
  await pdf.destroy(); return pages;
}
function expectFirstPageHeader(pages: Awaited<ReturnType<typeof generate>>, doc: ComparisonDocument) {
  const companyLogo = pages[0].imageRefs[0];
  expect(companyLogo).toBeTruthy();
  for (const [index, page] of pages.entries()) {
    for (const value of ["OSOBNÍ SROVNÁNÍ", "PŘIPRAVENO PRO", doc.title, `${doc.firstName} ${doc.lastName}`]) {
      expect(page.items.filter(item => item.str === value), `Page ${index + 1}: ${value}`).toHaveLength(index === 0 ? 1 : 0);
    }
    expect(page.imageRefs.includes(companyLogo), `Company logo on page ${index + 1}`).toBe(index === 0);
  }
}
function expectLastPageContact(pages: Awaited<ReturnType<typeof generate>>, online = true) {
  for (const [index, page] of pages.entries()) {
    const last = index === pages.length - 1;
    for (const value of ["VÁŠ PORADCE", advisor.fullName, advisor.email, advisor.phone, online ? "Moje online vizitka" : "Uložit kontakt"]) {
      expect(page.text.includes(value), `Page ${index + 1}: ${value}`).toBe(last);
    }
    expect(page.annotations.filter(annotation => annotation.url === cardUrl)).toHaveLength(last && online ? 1 : 0);
    expect(page.text).toContain(`${index + 1} / ${pages.length}`);
  }
}

describe("branded comparison PDF", () => {
  it("prints motor limits, active deductibles and assistance and retains special life add-ons", async () => {
    let doc = example(); doc.rows = []; doc.notes = "";
    for (const kind of ["life-aid", "life-diabetes", "life-vaccination", "life-upper-limbs", "auto-liability", "auto-collision", "auto-assistance"] as const) {
      doc = appendCoverage(doc, kind);
      const details = createCatalogDetails(kind);
      if (kind.startsWith("life-")) { details.values.amount = "250 000"; if (kind === "life-aid") details.values.limit = "75 000"; }
      if (kind === "auto-liability") Object.assign(details.values, { healthLimit: "200", propertyLimit: "200" });
      if (kind === "auto-collision") Object.assign(details.values, { amount: "850000", risks: "collision|nature", deductibleType: "percent-min", deductiblePercent: "5", deductibleMin: "8000", deductibleFixed: "999 999" });
      if (kind === "auto-assistance") Object.assign(details.values, { events: "breakdown|accident", towingCz: "Bez limitu", towingAbroad: "500 km", replacement: "10 dní", accommodation: "3 noci / 100 EUR" });
      doc.rows.at(-1)!.cells[doc.offers[1].id].details = details;
    }
    const pages = await generate(doc), text = compact(pages.map(page => page.text).join(" "));
    for (const value of ["Příspěvek na pořízení zvláštní pomůcky", "Cukrovka a její komplikace", "Závažné následky očkování", "Pojištění horních končetin", "75 000 Kč", "Limity odpovědnosti: 200/200 mil. Kč", "850 000 Kč", "Havárie, Živel", "Spoluúčast: 5 %, min. 8 000 Kč", "Odtah v ČR: Bez limitu", "Odtah v zahraničí: 500 km", "10 dní", "3 noci / 100 EUR"]) expect(text).toContain(compact(value));
    expect(text).not.toContain("999999");
    expectLastPageContact(pages);
    for (const page of pages) {
      for (const item of page.items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(27);
        expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
      }
    }
  }, 30_000);

  it("exports two contracts on portrait A4 with Czech text, logos, notes and a linked contact footer only on the last page", async () => {
    const doc = example(), pages = await generate(doc);
    const full = compact(pages.map(page => page.text).join(" "));
    for (const value of ["Žaneta Černá", "Povinné ručení", "50 000 000 Kč", "100 000 000 Kč", "1 000 Kč / měsíc", "2020", doc.notes, doc.offers[1].note]) expect(full).toContain(compact(value));
    expectFirstPageHeader(pages, doc);
    expectLastPageContact(pages);
    for (const page of pages) {
      expect(page.text).toContain("Bohemika a.s.");
      expect(page.height).toBeGreaterThan(page.width);
      expect(page.width).toBeCloseTo(595.28, 1);
      expect(page.height).toBeCloseTo(841.89, 1);
      if (page.text.includes("CO POROVNÁVÁME")) expect(page.images).toBeGreaterThanOrEqual(2);
      for (const item of page.items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(27);
        expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
        expect(item.transform[5], item.str).toBeGreaterThan(9);
        expect(item.transform[5], item.str).toBeLessThan(page.height - 9);
      }
    }
    expect(pages.some(page => page.images >= 3)).toBe(true);
  }, 30_000);

  it("keeps the contact footer in a single-page comparison", async () => {
    const doc = example(); doc.rows = [doc.rows[1]]; doc.notes = ""; doc.offers[1].note = "";
    const pages = await generate(doc);
    expect(pages).toHaveLength(1);
    expectFirstPageHeader(pages, doc);
    expectLastPageContact(pages);
  }, 30_000);

  it.each([{ orientation: "landscape", count: 2 }, { orientation: "portrait", count: 4 }] as const)("respects a selected $orientation layout with $count contracts without losing offers", async ({ orientation, count }) => {
    let doc = example(); doc.rows = [doc.rows[1]]; doc.notes = ""; doc.offers[1].note = "";
    while (doc.offers.length < count) {
      doc = addOffer(doc);
      const offer = doc.offers.at(-1)!;
      offer.insurerId = "custom"; offer.customInsurer = `Pojišťovna ${doc.offers.length}`;
      doc.rows[0].cells[offer.id].text = `Hodnota nabídky ${doc.offers.length}`;
    }
    const pages = await generate(doc, true, orientation);
    expect(pages).toHaveLength(orientation === "portrait" ? count - 1 : 1);
    expectFirstPageHeader(pages, doc); expectLastPageContact(pages);
    const full = pages.map(page => page.text).join(" ");
    for (let index = 3; index <= count; index++) expect(full).toContain(`Hodnota nabídky ${index}`);
    for (const page of pages) {
      expect(page.height > page.width).toBe(orientation === "portrait");
      expect(page.text).toContain("Současný produkt");
      for (const item of page.items) expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
    }
  }, 30_000);

  it("places the contact footer after notes that continue onto additional pages", async () => {
    const doc = example(); doc.rows = [doc.rows[1]]; doc.offers[1].note = "";
    doc.notes = Array.from({ length: 100 }, (_, index) => `Poznámka ${index + 1}: doplnění pro klientku.`).join("\n");
    const pages = await generate(doc);
    expect(pages.length).toBeGreaterThan(2);
    expectFirstPageHeader(pages, doc);
    expectLastPageContact(pages);
    const notes = pages.flatMap(page => page.items.filter(item => item.str.startsWith("Poznámka ")).map(item => item.str));
    expect(compact(notes.join(" "))).toBe(compact(doc.notes));
    const last = pages.at(-1)!;
    expect(last.text).toContain("Poznámka 100:");
    expect(last.text).not.toContain("CO POROVNÁVÁME");
    expect(last.images).toBe(0);
    expect(last.height - last.items.find(item => item.str.startsWith("Poznámka "))!.transform[5]).toBeLessThan(50);
    const footerTop = last.items.find(item => item.str === "VÁŠ PORADCE")!.transform[5];
    for (const item of last.items.filter(item => item.str.startsWith("Poznámka "))) expect(item.transform[5]).toBeGreaterThan(footerTop + 20);
  }, 30_000);

  it("preserves long cell text across pages without entering the footer and repeats contract headers", async () => {
    const doc = example(); doc.rows = [createRow(doc.offers, "Dlouhé podmínky", "alert")]; doc.notes = ""; doc.offers[1].note = "";
    doc.recommendedOfferId = doc.offers[1].id;
    const body = Array.from({ length: 230 }, (_, i) => `Bod ${i}: zvláštní podmínka ke smlouvě.`).join(" ") + " KONEC PODMÍNEK";
    doc.rows[0].cells[doc.offers[1].id] = { text: body, tone: "warning" };
    const pages = await generate(doc);
    expect(pages.length).toBeGreaterThan(2);
    expectFirstPageHeader(pages, doc);
    const footerTop = pages.at(-1)!.items.find(item => item.str === "VÁŠ PORADCE")!.transform[5] + 25;
    const data = compact(pages.flatMap(page => {
      const headerEnd = page.items.find(item => item.str === "Pojistné: 850 Kč / měsíc")!.transform[5];
      const proposedX = page.items.find(item => item.str === "Navržený produkt")!.transform[4];
      return page.items.filter(item => item.transform[4] >= proposedX && item.transform[5] > footerTop && item.transform[5] < headerEnd - 8).map(item => item.str);
    }).join(" "));
    expect(data).toContain(compact(body));
    expectLastPageContact(pages);
    for (const page of pages) {
      expect(page.items.filter(item => item.str === "DOPORUČENO")).toHaveLength(1);
      expect(page.text).toContain("Současný produkt"); expect(page.text).toContain("Navržený produkt");
      expect(page.text).toContain("Dlouhé podmínky");
    }
    expect(pages[1].text).toContain("(pokračování)");
    expect(pages[1].height - pages[1].items.find(item => item.str === "CO POROVNÁVÁME")!.transform[5]).toBeLessThan(60);
  }, 30_000);

  it.each([1, 4])("keeps landscape A4 with %i additional offers, repeating the original contract across groups and supporting an offline contact QR", async (additionalOffers) => {
    let doc = example(); doc.rows = [doc.rows[1]]; doc.notes = "";
    for (let index = 0; index < additionalOffers; index++) {
      doc = addOffer(doc);
      doc.offers.at(-1)!.insurerId = "custom"; doc.offers.at(-1)!.customInsurer = `Vlastní pojišťovna ${index}`;
      doc.rows[0].cells[doc.offers.at(-1)!.id].text = `Vlastní hodnota ${index}`;
    }
    doc.recommendedOfferId = doc.offers.at(-1)!.id;
    const pages = await generate(doc, false);
    expect(pages.some(page => page.text.includes("Část 2 / 2"))).toBe(additionalOffers === 4);
    expectFirstPageHeader(pages, doc);
    expectLastPageContact(pages, false);
    for (const page of pages) {
      expect(page.width).toBeGreaterThan(page.height);
      expect(page.text).toContain("Současný produkt"); expect(page.annotations).toHaveLength(0);
    }
    const all = pages.map(page => page.text).join(" ");
    for (const page of pages) expect(page.text.includes("DOPORUČENO")).toBe(page.text.includes(`Vlastní pojišťovna ${additionalOffers - 1}`));
    for (let index = 0; index < additionalOffers; index++) expect(all).toContain(`Vlastní hodnota ${index}`);
    const paths = vi.mocked(fetch).mock.calls.map(([path]) => String(path));
    expect(paths.filter(path => path === "/icons/allianz.png")).toHaveLength(1);
  }, 30_000);

  it("reports missing assets instead of producing a PDF without logos or fonts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(createComparisonPdf({ doc: example(), advisor, contact: contactQr(advisor)! })).rejects.toThrow("logo nebo písmo");
  });

  it("prints life-cover parameters, individual disability amounts and injury progression without hidden values", async () => {
    let doc = example(); doc.rows = []; doc.notes = "";
    for (const kind of ["investment", "death", "terminal", "disability", "injury"] as const) doc = appendLifeCoverage(doc, kind);
    const [current, proposed] = doc.offers.map(offer => offer.id);
    doc.rows[0].cells[current].details = { kind: "investment", status: "excluded", monthlyAmount: "999 999" };
    doc.rows[0].cells[proposed].details = { kind: "investment", status: "included", monthlyAmount: "750" };
    doc.rows[1].cells[current].details = { kind: "death", status: "included", amount: "1 100 000", amountType: "linear", interestRate: "" };
    doc.rows[1].cells[proposed].details = { kind: "death", status: "included", amount: "2 200 000", amountType: "loan", interestRate: "4,5" };
    doc.rows[2].cells[proposed].details = { kind: "terminal", status: "included", amount: "200 000" };
    doc.rows[3].cells[proposed].details = { kind: "disability", status: "included", amountType: "constant", interestRate: "", degrees: "23", amounts: { "1": "666 666", "2": "444 444", "3": "555 555" } };
    doc.rows[4].cells[current].details = { kind: "injury", status: "included", amount: "400 000", progression: "top5x", customProgression: "", threshold: "10", customThreshold: "" };
    doc.rows[4].cells[proposed].details = { kind: "injury", status: "included", amount: "500 000", progression: "8.5x", customProgression: "", threshold: "0.001", customThreshold: "" };
    const pages = await generate(doc), all = compact(pages.map(page => page.text).join(" "));
    for (const value of ["Životní pojištění", "Investiční složka", "Měsíční investice: 750 Kč", "1 100 000 Kč", "Lineárně klesající", "2 200 000 Kč", "Klesající dle úroku z úvěru", "Úrok z úvěru: 4,5 %", "Terminální stadium", "200 000 Kč", "Konstantní", "II. a III. stupeň", "II. stupeň: 444 444 Kč", "III. stupeň: 555 555 Kč", "TOP progrese 5×", "8,5× progrese", "Plnění od 10 %", "Plnění od 0,001 %"]) expect(all).toContain(compact(value));
    expect(all).not.toContain("666666"); expect(all).not.toContain("999999");
    expectLastPageContact(pages);
    for (const page of pages) {
      for (const item of page.items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(27);
        expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 25);
      }
    }
  }, 30_000);
});
