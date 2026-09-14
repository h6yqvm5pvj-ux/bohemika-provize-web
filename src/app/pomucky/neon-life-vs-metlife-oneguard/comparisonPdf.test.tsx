import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { COMPARISON_ROWS } from "./comparisonData";
import { createComparisonPdf, type ComparisonPdfOptions } from "./comparisonPdf";
import { EMPTY_PERSONALIZATION, formatComparisonMeetingDate, normalizeComparisonPersonalization } from "./comparisonPersonalization";
import { reportAdvisorFromProfile, reportBlocks, type ComparisonReportRow } from "./comparisonReportContent";

const advisor = { fullName: "Štěpán Dvořák", title: "Finanční poradce", phone: "+420 777 123 456", email: "stepan@example.test", ico: "12345678", cardUrl: "https://example.test/vizitka/stepan" };
const compact = (text: string) => text.replace(/\s/g, "");
afterEach(() => vi.unstubAllGlobals());

async function generate(rows: ComparisonReportRow[], reportAdvisor = advisor, options: Pick<ComparisonPdfOptions, "personalization" | "pinnedTopicIds"> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const bytes = await readFile(resolve(process.cwd(), `public${path}`));
    return new Response(bytes);
  }));
  const pdf = await createComparisonPdf({ rows, advisor: reportAdvisor, origin: "https://example.test", scopeLabel: "Úplné srovnání", generatedAt: new Date("2026-09-14T10:00:00Z"), ...options });
  const document = await getDocument({ data: new Uint8Array(pdf.output("arraybuffer")), useSystemFonts: true }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index++) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    const items = content.items.filter(item => "str" in item);
    const annotations = await page.getAnnotations();
    const links = await Promise.all(annotations.filter(annotation => Array.isArray(annotation.dest)).map(async annotation => ({
      page: await document.getPageIndex(annotation.dest[0]) + 1,
      top: annotation.dest[3] as number,
    })));
    pages.push({ items, annotations, links, text: items.map(item => item.str).join(" "), width: page.view[2], height: page.view[3] });
  }
  await document.destroy();
  return pages;
}

describe("comparison PDF", () => {
  it("exports every topic and its detailed text, Czech glyphs, branding and linked advisor card", async () => {
    const rows = COMPARISON_ROWS.map(row => row.report);
    const pages = await generate(rows);
    const text = compact(pages.map(page => page.text).join(" "));
    expect(text).toContain(compact(advisor.fullName));
    expect(text).toContain(compact(advisor.phone));
    expect(text).toContain(advisor.email);
    for (const row of rows) {
      expect(text, row.title).toContain(compact(row.title));
      for (const block of [...row.topic, ...row.neon.blocks, ...row.metlife.blocks, ...row.appendix]) {
        expect(text, `${row.title}: ${block.text}`).toContain(compact(block.text));
      }
    }
    expect(text).toContain(compact("Co znamená premaligní a in situ?"));
    for (const page of pages) {
      expect(page.text).toContain("Bohemika a.s.");
      for (const item of page.items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(35);
        expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 30);
        expect(item.transform[5], item.str).toBeGreaterThan(20);
      }
    }
    const urls = pages.flatMap(page => page.annotations.map(annotation => annotation.url));
    expect(urls).toContain(advisor.cardUrl);
    expect(urls).toContain(`mailto:${advisor.email}`);
    expect(urls).toContain("https://example.test/pomucky/srovnavac-trvalych-nasledku?preset=neon-oneguard-10x");
    expect(urls).toContain("https://ppropo.mpsv.cz/zakon_155_1995");
    expect(urls.some(url => url?.startsWith("https://www.cssz.cz/documents/"))).toBe(true);
    expect(pages[0].annotations.filter(annotation => annotation.dest)).toHaveLength(1);
    expect(pages[1].text).toContain("Obsah srovnání");
    expect(pages[1].annotations.filter(annotation => annotation.dest)).toHaveLength(rows.length);
    for (const [index, link] of pages[1].links.entries()) {
      const target = pages[link.page - 1];
      expect(compact(target.text)).toContain(compact(rows[index].title));
      expect(link.top).toBeLessThan(target.height - 85);
      expect(link.top).toBeGreaterThan(60);
    }
  }, 30_000);

  it("exports only selected themes and continues unusually long details without losing text", async () => {
    const row = structuredClone(COMPARISON_ROWS[0].report);
    row.neon.blocks.push({ kind: "body", text: `${"Dlouhý podrobný příklad. ".repeat(180)}KONEC DLOUHÉHO DETAILU` });
    const pages = await generate([row]);
    const text = pages.map(page => page.text).join(" ");
    expect(text).toContain("KONEC DLOUHÉHO DETAILU");
    expect(text).toContain("POKRAČOVÁNÍ");
    expect(text).not.toContain(COMPARISON_ROWS[1].title);
    expect(pages.length).toBeGreaterThan(2);
    expect(text.match(/Dlouhý podrobný příklad\./g)).toHaveLength(180);
  }, 30_000);

  it("reports missing assets and allows another attempt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(createComparisonPdf({ rows: [COMPARISON_ROWS[0].report], advisor, origin: "https://example.test", scopeLabel: "Výběr" })).rejects.toThrow("podklady PDF");
    expect(await generate([COMPARISON_ROWS[0].report])).toHaveLength(2);
  });

  it("keeps a long advisor profile inside the page without colliding with the cover navigation", async () => {
    const longAdvisor = { ...advisor, fullName: "W".repeat(120), title: "Poradenství pro domácnosti a podnikatele. ".repeat(3), email: `${"advisor".repeat(18)}@example.test` };
    const pages = await generate([COMPARISON_ROWS[0].report], longAdvisor);
    const text = compact(pages.map(page => page.text).join(" "));
    expect(text).toContain(compact(longAdvisor.fullName));
    expect(text).toContain(compact(longAdvisor.email));
    expect(pages[0].text).toContain("Kompletní vizitka a kontakty");
    for (const page of pages) for (const item of page.items) {
      expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 30);
      expect(item.transform[5], item.str).toBeGreaterThan(20);
    }
  });

  it("places pinned topics first and links to the correct details after the personal introduction", async () => {
    const rows = [COMPARISON_ROWS[0].report, COMPARISON_ROWS[2].report, COMPARISON_ROWS[13].report];
    const personalization = { clientName: "Jana Nováková", meetingDate: "2026-09-28", clientNeeds: "Zajištění rodiny a příjmu.\n\nDvě malé děti.", advisorComment: "Prověřit čekací dobu a podmínky pracovní neschopnosti." };
    const pages = await generate(rows, advisor, { personalization, pinnedTopicIds: [rows[2].id, "unknown", rows[2].id] });
    const text = compact(pages.map(page => page.text).join(" "));
    for (const value of [personalization.clientName, personalization.clientNeeds, personalization.advisorComment, "28. 9. 2026"]) expect(text).toContain(compact(value));
    expect(pages[0].links[0].page).toBe(2);
    expect(pages[1].text).toContain("Komentář poradce");
    expect(pages[1].text).toContain("Co klient potřebuje řešit");
    const contents = pages.find(page => page.text.includes("Obsah srovnání"))!;
    expect(contents.text.indexOf(rows[2].title)).toBeLessThan(contents.text.indexOf(rows[0].title));
    expect(contents.text.match(/PŘIPNUTO/g)).toHaveLength(1);
    for (const [index, id] of [2, 0, 1].entries()) {
      expect(compact(pages[contents.links[index].page - 1].text)).toContain(compact(rows[id].title));
    }
    expect(pages[contents.links[0].page - 1].text).toContain("DŮLEŽITÉ PRO KLIENTA");
    expect(text).not.toContain(compact(COMPARISON_ROWS[3].title));
  });

  it("paginates long client notes in full and keeps text and links inside the page", async () => {
    const clientNeeds = "Dlouhé zadání klienta. ".repeat(43).trim();
    const advisorComment = `${"Podrobný komentář poradce.\n".repeat(72)}KONEC KOMENTÁŘE`;
    const pages = await generate([COMPARISON_ROWS[0].report, COMPARISON_ROWS[1].report], advisor, {
      personalization: { clientName: "Klient s delším zadáním", clientNeeds, advisorComment, meetingDate: "2026-03-29" },
    });
    const text = compact(pages.map(page => page.text).join(" "));
    expect(text.match(/Dlouhézadáníklienta\./g)).toHaveLength(43);
    expect(text.match(/Podrobnýkomentářporadce\./g)).toHaveLength(72);
    expect(text).toContain("KONECKOMENTÁŘE");
    const contentsIndex = pages.findIndex(page => page.text.includes("Obsah srovnání"));
    expect(contentsIndex).toBeGreaterThan(2);
    for (const page of pages) for (const item of page.items) {
      expect(item.transform[4], item.str).toBeGreaterThanOrEqual(35);
      expect(item.transform[4] + item.width, item.str).toBeLessThan(page.width - 30);
      expect(item.transform[5], item.str).toBeGreaterThan(20);
    }
    expect(pages.at(-1)!.links.some(link => link.page === contentsIndex + 1)).toBe(true);
  });

  it("shows a client name and meeting date on the cover without adding an empty notes page", async () => {
    const pages = await generate([COMPARISON_ROWS[0].report], advisor, { personalization: { clientName: "Jan Novák", meetingDate: "2026-10-25" } });
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain("Pro klienta: Jan Novák");
    expect(pages[0].text).toContain("25. 10. 2026");
    expect(pages.map(page => page.text).join(" ")).not.toContain("Komentář poradce");
  });
});

describe("report source and advisor", () => {
  it("normalizes optional personal fields and validates calendar dates without timezone shifts", () => {
    expect(normalizeComparisonPersonalization({ clientName: "  Jana  Nováková ", clientNeeds: " První odstavec.\r\n\r\nDruhý odstavec. " })).toEqual({ ...EMPTY_PERSONALIZATION, clientName: "Jana Nováková", clientNeeds: "První odstavec.\n\nDruhý odstavec." });
    expect(formatComparisonMeetingDate("2024-02-29")).toBe("29. 2. 2024");
    expect(formatComparisonMeetingDate("2026-03-29")).toBe("29. 3. 2026");
    for (const value of ["2026-02-29", "2026-04-31", "28.9.2026", "1899-01-01"]) {
      expect(() => normalizeComparisonPersonalization({ meetingDate: value })).toThrow("platné datum");
    }
    expect(() => normalizeComparisonPersonalization({ advisorComment: "x".repeat(2001) })).toThrow("Zkraťte");
  });
  it("preserves nested values, quotations and source links without interactive button text", () => {
    expect(reportBlocks(<div><h3>Podmínky</h3><p>Plní <strong>25 %</strong> částky.</p><blockquote>„Citace podmínek.“</blockquote><a href="https://example.test">Zdroj</a><button>Otevřít</button></div>)).toEqual([
      { kind: "heading", text: "Podmínky" }, { kind: "body", text: "Plní 25 % částky." }, { kind: "quote", text: "„Citace podmínek.“" }, { kind: "body", text: "Zdroj", href: "https://example.test" },
    ]);
  });
  it("uses the advisor's saved business card and suppresses unpublished card links", () => {
    const profile = { fullName: "Původní jméno", phoneNumber: "123", onlineCard: { fullName: advisor.fullName, phone: advisor.phone, email: advisor.email, title: "Poradce pro rodiny", slug: "stepan", enabled: true } };
    expect(reportAdvisorFromProfile(profile, "actor@example.test", "https://example.test")).toMatchObject({ fullName: advisor.fullName, phone: advisor.phone, email: advisor.email, title: "Poradce pro rodiny", cardUrl: advisor.cardUrl });
    expect(reportAdvisorFromProfile({ ...profile, onlineCard: { ...profile.onlineCard, enabled: false } }, "actor@example.test", "https://example.test").cardUrl).toBe("");
    expect(reportAdvisorFromProfile({}, "advisor@example.test", "https://example.test")).toMatchObject({ fullName: "", phone: "", email: "advisor@example.test", cardUrl: "" });
  });
});
