import { describe, expect, it } from "vitest";
import { buildSickLeaveReport } from "./sickLeaveReport";
import { compareSickLeave, MODEL_NOTE, PRODUCT_GROUPS, readCoverage, type Coverage, type CoverageInput } from "./sickLeaveComparison";

const current: Coverage = { product: "Kooperativa FLEXI", startDay: 29, retroactive: false, dailyCents: 50_000 };
const proposed: Coverage = { product: "ČPP NEON", startDay: 15, retroactive: true, dailyCents: 50_000 };

describe("modelové plnění při pracovní neschopnosti", () => {
  it("počítá od sjednaného dne včetně a zpětně od prvního dne", () => {
    const { rows } = compareSickLeave(current, proposed);
    expect(rows.map(row => row.duration)).not.toContain(14);
    expect(rows.filter(row => [15, 28, 29, 30].includes(row.duration)).map(row => [
      row.duration, row.current.paidDays, row.current.amountCents, row.proposed.paidDays, row.proposed.amountCents,
    ])).toEqual([
      [15, 0, 0, 15, 750_000],
      [28, 0, 0, 28, 1_400_000],
      [29, 1, 50_000, 29, 1_450_000],
      [30, 2, 100_000, 30, 1_500_000],
    ]);
  });

  it("zobrazí hraniční dny pro libovolnou zadanou hranici bez duplicit", () => {
    const { rows } = compareSickLeave({ ...current, startDay: 60 }, { ...proposed, startDay: 1 });
    expect(rows.map(row => row.duration)).toEqual([1, 2, 15, 28, 29, 30, 59, 60, 61, 90]);
    expect(rows[0].proposed.paidDays).toBe(1);
    expect(rows.find(row => row.duration === 60)?.current.paidDays).toBe(1);
    expect(rows.filter(row => row.isStartDay).map(row => row.duration)).toEqual([1, 60]);
  });

  it("přijímá český zápis denní sazby a odmítá neplatné vstupy", () => {
    const neon = PRODUCT_GROUPS.find(group => group.insurerName === "ČPP")?.options.find(option => option.label.includes("NEON"));
    expect(neon?.fullLabel).toContain("ČPP");
    const input: CoverageInput = { product: neon!.value, startDay: "15", mode: "retroactive", dailyAmount: "1 250,35" };
    expect(readCoverage(input)).toEqual({ product: neon!.fullLabel, startDay: 15, retroactive: true, dailyCents: 125_035 });
    for (const invalid of [
      { product: "" }, { product: "<p>Neznámý produkt</p>" }, { startDay: "0" }, { startDay: "1.5" },
      { startDay: "1e2" }, { startDay: "3651" }, { dailyAmount: "0" }, { dailyAmount: "-500" },
      { dailyAmount: "500,001" }, { dailyAmount: "1000000,01" }, { dailyAmount: "1e3" },
    ]) {
      expect(readCoverage({ ...input, ...invalid })).toBeNull();
    }
  });
});

describe("tiskový dokument pracovní neschopnosti", () => {
  it("obsahuje stejné výsledky a escapuje údaje do PDF s vizitkou", () => {
    const html = buildSickLeaveReport({
      comparison: compareSickLeave(current, proposed),
      generatedAt: "24. 11. 2026",
      clientName: "<img src=x onerror=alert(1)>",
      advisorName: "",
      advisor: {
        fullName: "Dana & Jan",
        title: "Poradkyně",
        phone: "",
        email: "poradce@example.test",
        url: "https://bohemka.app/vizitka/dana",
        qr: { size: 32, runs: [{ x: 4, y: 4, width: 7 }] },
      },
    });
    expect(html).toContain("<title>Pracovní neschopnost · Bohemika</title>");
    expect(html).toContain('class="pdf-hero"');
    expect(html).toContain('class="pdf-summary pn-table"');
    expect(html).not.toContain('<th scope="row">7 dní</th>');
    expect(html).not.toContain('<th scope="row">14 dní</th>');
    expect(html).toContain("<strong>7\u00a0500\u00a0Kč</strong></td>");
    expect(html).toContain("<strong>15\u00a0000\u00a0Kč</strong></td>");
    expect(html).not.toContain("×");
    expect(html.indexOf("Věděli jste, že…?")).toBeGreaterThan(html.indexOf("</table>"));
    expect(html).toContain("31,2 dne");
    expect(html).toContain("42,4 dne");
    expect(html).toContain("80,3 %");
    expect(html).not.toContain("16,5 %");
    expect(html).not.toContain("trvalo 15 až 30 dní");
    expect(html).not.toContain(MODEL_NOTE);
    expect(html).toContain("Průměrná doba pracovní neschopnosti v Česku klesla mezi roky 2019 a 2025.");
    expect(html).toContain("plnění od 15. dne zpětně.");
    expect(html).toContain('href="https://data.cssz.cz/web/otevrena-data/-/ukazatel-pracovni-neschopnosti-podle-delky-trvani-dpn-v-cr"');
    expect(html).toContain('href="https://statistikaamy.csu.gov.cz/pocet-dnu-na-neschopenkach-zustava-stabilni"');
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("Dana &amp; Jan");
    expect(html).toContain('href="https://bohemka.app/vizitka/dana"');
    expect(html).toContain('aria-label="QR kód vizitky"');
  });

  it("přenese statistiku a její zdroje na pokračování, když se pod tabulku nevejdou", () => {
    const html = buildSickLeaveReport({
      comparison: compareSickLeave(current, proposed),
      generatedAt: "24. 11. 2026",
      clientName: "",
      advisorName: "",
      advisor: null,
      layout: "insight-page",
    });
    expect(html.indexOf("</table>")).toBeLessThan(html.indexOf("01 / 02"));
    expect(html.indexOf("01 / 02")).toBeLessThan(html.indexOf("Věděli jste, že…?"));
    expect(html.indexOf("Věděli jste, že…?")).toBeLessThan(html.indexOf("02 / 02"));
  });
});
