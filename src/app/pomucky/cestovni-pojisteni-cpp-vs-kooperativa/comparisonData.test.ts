import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AXA_TERMS_DOCUMENTS,
  AXA_VARIANTS,
  CPP_TERMS_DOCUMENTS,
  CPP_VARIANTS,
  KOOP_TERMS_DOCUMENTS,
  KOOP_VARIANTS,
  buildRows,
} from "./comparisonData";
import { sourceReferences, normalizeSearch } from "./comparisonSources";

const EXPECTED_ROW_IDS = [
  "marine-sailing",
  "marine-cruise",
  "marine-rescue",
  "marine-liability",
  "territorial-scope",
  "insurance-duration",
  "payment-and-cover-start",
  "general-exclusions-and-duties",
  "own-sports-equipment",
  "replacement-sports-equipment",
  "rented-sports-equipment",
  "unused-summer-holiday",
  "sports-scope",
  "winter-equipment",
  "golf",
  "treatment",
  "covid-treatment",
  "rescue",
  "teeth",
  "companion",
  "pregnancy",
  "doctor-on-phone",
  "alcohol",
  "accident",
  "accident-death",
  "accident-hospitalization",
  "liability",
  "rental-car-liability",
  "baggage",
  "baggage-delay",
  "flight-delay",
  "missed-departure",
  "quarantine",
  "after-departure",
  "unused",
  "cancellation",
  "vehicle-assistance",
  "manual-work",
  "security",
  "animal",
] as const;

const getRows = (axaKey: keyof typeof AXA_VARIANTS) =>
  buildRows(CPP_VARIANTS.maxi, KOOP_VARIANTS.plus, AXA_VARIANTS[axaKey]);

const getAxaValue = (axaKey: keyof typeof AXA_VARIANTS, rowId: string) => {
  const row = getRows(axaKey).find((candidate) => candidate.id === rowId);
  expect(row, `missing comparison row ${rowId}`).toBeDefined();
  return row!.axa;
};

const extractPdfText = async (filePath: string, pages?: number[]) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = Uint8Array.from(readFileSync(filePath));
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pageNumbers = pages ?? Array.from({ length: document.numPages }, (_, index) => index + 1);
  const chunks: string[] = [];

  for (const pageNumber of pageNumbers) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    chunks.push(
      content.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .join(" ")
    );
  }

  await document.destroy();
  return chunks.join(" ").replace(/\s+/g, " ").trim();
};

describe("travel insurance comparison data", () => {
  it("matches the ČPP and Kooperativa core benefit matrices in the supplied terms", () => {
    expect(CPP_VARIANTS).toEqual({
      mini: {
        label: "MINI", helper: "Základní limity", treatment: 2_500_000, rescue: 2_500_000,
        teeth: 7_000, companionTotal: 10_000, companionDay: 2_000, liability: 2_500_000,
        legal: 50_000, baggage: 15_000, baggageValuables: 5_000, death: 100_000, permanentInjury: 200_000,
        hospitalDay: 0, hospitalTotal: 0,
      },
      opti: {
        label: "OPTI", helper: "Střední varianta", treatment: 10_000_000, rescue: 10_000_000,
        teeth: 20_000, companionTotal: 20_000, companionDay: 2_500, liability: 5_000_000,
        legal: 200_000, baggage: 25_000, baggageValuables: 8_000, death: 200_000, permanentInjury: 400_000,
        hospitalDay: 0, hospitalTotal: 0,
      },
      maxi: {
        label: "MAXI", helper: "Nejvyšší limity", treatment: 100_000_000, rescue: 100_000_000,
        teeth: 30_000, companionTotal: 30_000, companionDay: 3_000, liability: 10_000_000,
        legal: 500_000, baggage: 50_000, baggageValuables: 10_000, death: 500_000, permanentInjury: 1_000_000,
        hospitalDay: 0, hospitalTotal: 0,
      },
    });

    expect(KOOP_VARIANTS).toEqual({
      klasik: {
        label: "KLASIK", helper: "Základní varianta", treatment: 10_000_000, rescue: 500_000,
        teeth: 20_000, companionTotal: 10_000, companionDay: 2_000, liability: 5_000_000,
        legal: null, baggage: 30_000, baggageValuables: null, death: 200_000, permanentInjury: 400_000,
        hospitalDay: 500, hospitalTotal: 7_500,
      },
      plus: {
        label: "PLUS", helper: "Vyšší varianta", treatment: 100_000_000, rescue: 1_000_000,
        teeth: 30_000, companionTotal: 15_000, companionDay: 3_000, liability: 8_000_000,
        legal: 200_000, baggage: 50_000, baggageValuables: null, death: 400_000, permanentInjury: 600_000,
        hospitalDay: 1_000, hospitalTotal: 15_000,
      },
    });
  });

  it("matches the AXA benefit matrix from VPPCP dated 15 June 2026", () => {
    expect(AXA_VARIANTS.reference).toMatchObject({
      label: "REFERENCE",
      treatment: 2_500_000,
      rescue: 2_500_000,
      teeth: 6_000,
      liability: 0,
      legal: null,
      baggage: 0,
      death: 0,
      permanentInjury: 0,
      hospitalDay: 0,
      hospitalTotal: 0,
    });
    expect(AXA_VARIANTS.komfort).toMatchObject({
      label: "KOMFORT",
      treatment: 15_000_000,
      rescue: 15_000_000,
      teeth: 11_000,
      liability: 5_000_000,
      legal: 20_000,
      baggage: 30_000,
      death: 250_000,
      permanentInjury: 500_000,
      hospitalDay: 0,
      hospitalTotal: 0,
    });
    expect(AXA_VARIANTS.excelent).toMatchObject({
      label: "EXCELENT",
      treatment: 500_000_000,
      rescue: 500_000_000,
      teeth: 20_000,
      liability: 25_000_000,
      legal: 100_000,
      baggage: 60_000,
      death: 500_000,
      permanentInjury: 1_000_000,
      hospitalDay: 0,
      hospitalTotal: 0,
    });
  });

  it("builds complete and stable rows for all 18 variant combinations", () => {
    const expectedIds = [...EXPECTED_ROW_IDS].sort();

    for (const cpp of Object.values(CPP_VARIANTS)) {
      for (const koop of Object.values(KOOP_VARIANTS)) {
        for (const axa of Object.values(AXA_VARIANTS)) {
          const rows = buildRows(cpp, koop, axa);
          const ids = rows.map((row) => row.id);

          expect(ids).toHaveLength(EXPECTED_ROW_IDS.length);
          expect(new Set(ids).size).toBe(ids.length);
          expect([...ids].sort()).toEqual(expectedIds);

          for (const row of rows) {
            expect(row.title.trim()).not.toBe("");
            expect(row.description.trim()).not.toBe("");
            expect(row.verdict.label.trim()).not.toBe("");
            expect(row.verdict.detail.trim()).not.toBe("");
            expect(row.cpp.source, `${row.id}: missing ČPP source`).toEqual(expect.stringMatching(/\S/));
            expect(row.koop.source, `${row.id}: missing Kooperativa source`).toEqual(expect.stringMatching(/\S/));
            expect(row.axa.source, `${row.id}: missing AXA source`).toEqual(expect.stringMatching(/\S/));
            expect(JSON.stringify(row)).not.toMatch(/undefined|NaN/);
          }
        }
      }
    }
  });

  it("keeps the requested advisory section order", () => {
    const sectionOrder = [
      ...new Set(getRows("excelent").map((row) => row.section)),
    ];

    expect(sectionOrder.slice(0, 4)).toEqual([
      "Léčebné výlohy",
      "Plavby a jachting",
      "Odpovědnost",
      "Obecné informace",
    ]);
  });

  it("places unused summer holiday with travel complications, not sports equipment", () => {
    const row = getRows("excelent").find(
      (candidate) => candidate.id === "unused-summer-holiday"
    );

    expect(row?.section).toBe("Cesta a komplikace");
  });

  it("changes AXA core limits with the selected variant", () => {
    const expected = {
      reference: { treatment: 2_500_000, rescue: 2_500_000, teeth: 6_000, baggage: 0, accident: 0 },
      komfort: { treatment: 15_000_000, rescue: 15_000_000, teeth: 11_000, baggage: 30_000, accident: 500_000 },
      excelent: { treatment: 500_000_000, rescue: 500_000_000, teeth: 20_000, baggage: 60_000, accident: 1_000_000 },
    } as const;

    for (const [key, values] of Object.entries(expected) as Array<
      [keyof typeof AXA_VARIANTS, (typeof expected)[keyof typeof expected]]
    >) {
      expect(getAxaValue(key, "treatment").metric).toBe(values.treatment);
      expect(getAxaValue(key, "rescue").metric).toBe(values.rescue);
      expect(getAxaValue(key, "teeth").metric).toBe(values.teeth);
      expect(getAxaValue(key, "baggage").metric).toBe(values.baggage);
      expect(getAxaValue(key, "accident").metric).toBe(values.accident);
    }
  });

  it("keeps death, permanent injury and hospital cash benefits separate", () => {
    const plusRows = getRows("excelent");
    const findPlusRow = (id: string) => {
      const row = plusRows.find((candidate) => candidate.id === id);
      expect(row, `missing accident row ${id}`).toBeDefined();
      return row!;
    };

    expect(findPlusRow("accident").cpp.metric).toBe(1_000_000);
    expect(findPlusRow("accident").koop.metric).toBe(600_000);
    expect(findPlusRow("accident").axa.metric).toBe(1_000_000);
    expect(findPlusRow("accident").cpp.keyFact?.value).toBe("2 %");
    expect(findPlusRow("accident").koop.keyFact?.value).toBe("5 %");
    expect(findPlusRow("accident").axa.keyFact?.value).toBe("10 %");
    expect(findPlusRow("accident-death").cpp.metric).toBe(500_000);
    expect(findPlusRow("accident-death").koop.metric).toBe(400_000);
    expect(findPlusRow("accident-death").axa.metric).toBe(500_000);
    expect(findPlusRow("accident-hospitalization").cpp.metric).toBe(0);
    expect(findPlusRow("accident-hospitalization").koop.metric).toBe(15_000);
    expect(
      findPlusRow("accident-hospitalization").koop.headline.replaceAll("\u00a0", " ")
    ).toContain("1 000 Kč");
    expect(findPlusRow("accident-hospitalization").axa.metric).toBe(0);

    const klasikRows = buildRows(
      CPP_VARIANTS.mini,
      KOOP_VARIANTS.klasik,
      AXA_VARIANTS.reference
    );
    const klasikHospitalization = klasikRows.find(
      (row) => row.id === "accident-hospitalization"
    );
    expect(klasikHospitalization?.koop.metric).toBe(7_500);
    expect(klasikHospitalization?.koop.headline.replaceAll("\u00a0", " ")).toContain("500 Kč");
    expect(klasikRows.find((row) => row.id === "accident")?.axa.keyFact).toBeUndefined();
  });

  it("enforces AXA add-on and variant availability", () => {
    for (const rowId of [
      "sports-scope",
      "manual-work",
      "baggage-delay",
      "flight-delay",
      "animal",
    ]) {
      expect(getAxaValue("reference", rowId).headline).toMatch(/REFERENCE/);
      expect(getAxaValue("komfort", rowId).headline).not.toMatch(/REFERENCE/);
      expect(getAxaValue("excelent", rowId).headline).not.toMatch(/REFERENCE/);
    }

    expect(getAxaValue("reference", "doctor-on-phone").headline).toMatch(/není/);
    expect(getAxaValue("komfort", "doctor-on-phone").headline).toMatch(/není/);
    expect(getAxaValue("excelent", "doctor-on-phone").headline).toMatch(/ano/);

    expect(getAxaValue("reference", "missed-departure").metric).toBe(0);
    expect(getAxaValue("komfort", "missed-departure").metric).toBe(0);
    expect(getAxaValue("excelent", "missed-departure").metric).toBe(20_000);

    expect(getAxaValue("reference", "quarantine").metric).toBe(0);
    expect(getAxaValue("komfort", "quarantine").metric).toBe(30_000);
    expect(getAxaValue("excelent", "quarantine").metric).toBe(60_000);

    for (const key of Object.keys(AXA_VARIANTS) as Array<keyof typeof AXA_VARIANTS>) {
      expect(getAxaValue(key, "alcohol").headline).toContain("0,8 ‰");
      expect(getAxaValue(key, "rental-car-liability").headline).toContain("60 000 Kč");
      expect(getAxaValue(key, "cancellation").headline).toContain("500 000 Kč");
      expect(getAxaValue(key, "vehicle-assistance").headline).toBe("Autoasistence");
    }
  });

  it("keeps the AXA-specific legal distinctions visible", () => {
    expect(getAxaValue("excelent", "liability").detail).toContain("Věc 10 mil. Kč");
    expect(getAxaValue("komfort", "liability").detail).toContain("Věc 1,5 mil. Kč");
    expect(getAxaValue("reference", "liability").headline).toContain("není pojištěno");
    expect(getAxaValue("excelent", "own-sports-equipment").detail).toContain("vyjmenovaných nebezpečích");
    expect(getAxaValue("excelent", "rented-sports-equipment").points?.join(" ")).toContain("časové ceně");
    expect(getAxaValue("excelent", "sports-scope").points?.join(" ")).toContain("písemně potvrdit");
    expect(getAxaValue("excelent", "alcohol").points?.join(" ")).toContain("neobnovuje");
    expect(getAxaValue("excelent", "manual-work").points?.join(" ")).toContain("odpovědnost");
    expect(getAxaValue("excelent", "security").points?.join(" ")).toContain("automaticky prodlouží");
    expect(getAxaValue("excelent", "after-departure").headline).toContain("nutno ověřit");
  });

  it("registers every supplied PDF as a non-empty downloadable document", () => {
    const routeSource = readFileSync(join(process.cwd(), "src/app/api/documents/file/route.ts"), "utf8");
    const groups = [
      { directory: "cpp", documents: CPP_TERMS_DOCUMENTS },
      { directory: "kooperativa", documents: KOOP_TERMS_DOCUMENTS },
      { directory: "axa", documents: AXA_TERMS_DOCUMENTS },
    ] as const;
    const ids = groups.flatMap((group) => group.documents.map((document) => document.id));

    expect(ids).toHaveLength(29);
    expect(new Set(ids).size).toBe(ids.length);

    for (const group of groups) {
      for (const document of group.documents) {
        expect(routeSource).toContain(`"${document.id}"`);
        const filePath = join(
          process.cwd(),
          "private/dokumenty/cestovni-pojisteni",
          group.directory,
          document.fileName
        );
        expect(existsSync(filePath), `${document.id}: file not found`).toBe(true);
        expect(statSync(filePath).size, `${document.id}: empty file`).toBeGreaterThan(0);
      }
    }
  });

  it("opens all 29 supplied PDFs and finds the implemented limits in the source terms", async () => {
    const documentsRoot = join(process.cwd(), "private/dokumenty/cestovni-pojisteni");

    for (const group of [
      { directory: "cpp", documents: CPP_TERMS_DOCUMENTS },
      { directory: "kooperativa", documents: KOOP_TERMS_DOCUMENTS },
      { directory: "axa", documents: AXA_TERMS_DOCUMENTS },
    ] as const) {
      for (const document of group.documents) {
        const filePath = join(documentsRoot, group.directory, document.fileName);
        const text = await extractPdfText(filePath, [1]);
        expect(text.length, `${document.id}: first page has no extractable text`).toBeGreaterThan(40);
      }
    }

    const cppTreatmentText = await extractPdfText(
      join(documentsRoot, "cpp/DPPLV_1_23.pdf")
    );
    for (const evidence of [
      "2 500 000 Kč",
      "10 000 000 Kč",
      "100 mil. Kč",
      "2 000 Kč/den, max. 10 000 Kč",
      "3 000 Kč/den, max. 30 000 Kč",
      "Ošetření zubů",
      "Záchrana pojištěného v tísni",
    ]) {
      expect(cppTreatmentText, `missing ČPP treatment evidence: ${evidence}`).toContain(evidence);
    }

    const cppLiabilityText = await extractPdfText(
      join(documentsRoot, "cpp/DPPODC.pdf")
    );
    for (const evidence of [
      "2 500 000 Kč",
      "5 000 000 Kč",
      "10 000 000 Kč",
      "50 000 Kč",
      "200 000 Kč",
      "500 000 Kč",
    ]) {
      expect(cppLiabilityText, `missing ČPP liability evidence: ${evidence}`).toContain(evidence);
    }

    const cppAccidentText = await extractPdfText(
      join(documentsRoot, "cpp/DPPURC_1_23.pdf")
    );
    for (const evidence of [
      "Smrt následkem úrazu",
      "100 000 Kč",
      "500 000 Kč",
      "Trvalé následky úrazu",
      "1 000 000 Kč",
    ]) {
      expect(cppAccidentText, `missing ČPP accident evidence: ${evidence}`).toContain(evidence);
    }
    expect(cppAccidentText).not.toContain("kompenzace pobytu v nemocnici");

    const cppBaggageText = await extractPdfText(
      join(documentsRoot, "cpp/DPPZAV_2022_06.pdf")
    );
    for (const evidence of ["15 000 Kč", "25 000 Kč", "50 000 Kč", "Cennosti a ceniny"]) {
      expect(cppBaggageText, `missing ČPP baggage evidence: ${evidence}`).toContain(evidence);
    }

    const cppSummerText = await extractPdfText(
      join(documentsRoot, "cpp/DPPLP_1_23.pdf")
    );
    for (const evidence of ["35 000 Kč", "3 500 Kč", "500 Kč za 24 hodin", "8 000 Kč"]) {
      expect(cppSummerText, `missing ČPP Léto PLUS evidence: ${evidence}`).toContain(evidence);
    }

    const koopTermsText = await extractPdfText(
      join(documentsRoot, "kooperativa/koopkolumbus.pdf")
    );
    for (const evidence of [
      "Pojištění léčebných výloh 10 000 000 100 000 000",
      "náklady na zásah záchranných složek 500 000 1 000 000",
      "Pojištění zavazadel 30 000 50 000",
      "Odpovědnost za újmu 5 000 000 8 000 000",
      "spoluúčast na zapůjčeném vozidle nepojištěno 10 000",
      "kompenzace pobytu v nemocnici 500 /den, max. 7 500 1 000 /den, max. 15 000",
      "nájem náhradního sportovního vybavení 10 000 10 000",
      "náhrada za újmu na pronajatém sportovním vybavení 5 000 5 000",
      "nejméně o 6 hodin",
      "maximálně 45 kalendářních dnů",
    ]) {
      expect(koopTermsText, `missing Kooperativa evidence: ${evidence}`).toContain(evidence);
    }

    const documentsDirectory = join(documentsRoot, "axa");

    const termsText = await extractPdfText(
      join(documentsDirectory, "AXA_VPPCP_2026-06-15.pdf"),
      Array.from({ length: 21 }, (_, index) => index + 1)
    );

    for (const evidence of [
      "VPPCP ze dne 15. 6. 2026",
      "500 000 000 Kč",
      "20 000 000 Kč",
      "3 000 000 Kč",
      "PŘIPOJIŠTĚNÍ RIZIKOVÝCH SPORTŮ",
      "PŘIPOJIŠTĚNÍ MANUÁLNÍ PRÁCE",
      "Zpoždění zavazadel",
      "5 000 Kč",
      "Spoluúčast na půjčeném vozidle",
      "60 000 Kč",
      "do 0,8 ‰",
      "Připojištění domácích mazlíčků",
      "Výlohy na veterinární péči",
      "30 000 Kč",
      "Pojištění zmeškaného odjezdu",
      "Připojištění autoasistence",
      "55 000 Kč",
    ]) {
      expect(termsText, `missing source evidence: ${evidence}`).toContain(evidence);
    }
    expect(termsText).not.toContain("kompenzace pobytu v nemocnici");
  }, 20_000);
});

describe("marine insurance distinctions verified in the policy wording", () => {
  it("grounds the 3 / 12 / 200 mile bands and cruise exception in the source PDFs", async () => {
    const root = join(process.cwd(), "private/dokumenty/cestovni-pojisteni");
    const cpp = await extractPdfText(join(root, "cpp/VPPCP.pdf"), [4]);
    expect(cpp).toContain("max. 3 námořní míle");
    expect(cpp).toContain("200 námoř");
    expect(cpp).toContain("pevniny nebo pobřežních ostrovů");
    expect(cpp).toContain("cruise ship");
    expect(cpp).toContain("oceánské plavby");
    const axa = await extractPdfText(join(root, "axa/AXA_VPPCP_2026-06-15.pdf"), [22, 23, 24]);
    expect(axa).toContain("do 12 námořních mil");
    expect(axa).toContain("od 12 do 200 námořních mil");
    expect(axa).toContain("jachting – oceánská plavba");
    const row = getRows("excelent").find(row => row.id === "marine-sailing")!;
    expect(row.differences).toHaveLength(4);
    expect(row.cpp.headline).toContain("3 míle");
    expect(row.axa.headline).toContain("12 mil");
    expect(row.koop.caution).toContain("území států");
    expect(row.koop.caution).toContain("písemně potvrdit");
    expect(getRows("excelent").find(row => row.id === "marine-cruise")!.cpp.detail).toContain("cruise ship");
  });

  it("does not promise worldwide sailing from Kooperativa's absence of a mileage limit", async () => {
    const pdf = await extractPdfText(join(process.cwd(), "private/dokumenty/cestovni-pojisteni/kooperativa/koopkolumbus.pdf"), [24, 25, 51]);
    expect(pdf).toContain("aktivní sport");
    expect(pdf).toContain("jachting (plachetnice, jachta)");
    expect(pdf).toContain("námořní záchranná služba");
    expect(pdf).toContain("na území států");
    const row = getRows("excelent").find(row => row.id === "marine-sailing")!;
    expect(row.verdict.tone).toBe("attention");
    expect(row.differences![3].koop).toContain("Písemně ověřit");
  });

  it("keeps Reference's sports restriction and the marine rescue scope visible across variants", () => {
    for (const koop of Object.values(KOOP_VARIANTS)) {
      for (const axa of Object.values(AXA_VARIANTS)) {
        const rows = buildRows(CPP_VARIANTS.maxi, koop, axa);
        const sailing = rows.find(row => row.id === "marine-sailing")!;
        const rescue = rows.find(row => row.id === "marine-rescue")!;
        expect(sailing.differences![2].axa).toContain(axa.label);
        if (axa.label === "REFERENCE") expect(sailing.differences![2].axa).toContain("nelze připojistit");
        else expect(sailing.differences![2].axa).toContain("nutné připojištění");
        expect(rescue.koop.headline.replaceAll("\u00a0", " ")).toContain(koop.label === "PLUS" ? "1 mil. Kč" : "500 000 Kč");
        expect(rescue.axa.caution).toContain("vyloučené bez ohrožení");
        expect(rescue.cpp.caution).toContain("není pojmenována výslovně");
        expect(rescue.verdict.tone).toBe("balanced");
        for (const insurer of ["cpp", "koop", "axa"] as const) expect(rescue[insurer].metric).toBeUndefined();
      }
    }
  });

  it("separates skipper and vessel exclusions from the covered sport", () => {
    const row = getRows("excelent").find(row => row.id === "marine-liability")!;
    expect(row.cpp.detail).toContain("vnitrozemské");
    expect(row.koop.detail).toContain("průkaz způsobilosti");
    expect(row.koop.points!.join(" ")).toContain("při ubytování");
    expect(row.axa.detail).toContain("používáním plavidel");
    expect(row.axa.caution).toContain("výluky neruší");
    expect(getRows("reference").find(row => row.id === "marine-liability")!.axa.headline).toContain("odpovědnost neobsahuje");
  });
});


describe("source audit corrections, 11 September 2026", () => {
  it("uses the selected Kooperativa limit for a missed return, and distinguishes the outbound AXA benefit", async () => {
    for (const key of ["klasik", "plus"] as const) {
      const row = buildRows(CPP_VARIANTS.maxi, KOOP_VARIANTS[key], AXA_VARIANTS.reference).find(row => row.id === "missed-departure")!;
      expect(row.koop.metric).toBe(key === "plus" ? 10_000 : 5_000);
      expect(row.koop.detail).toContain("zpět do ČR");
      expect(row.axa.metric).toBe(0);
      expect(row.verdict.tone).toBe("balanced");
      expect(row.verdict.detail).toContain("REFERENCE zmeškaný odjezd neobsahuje");
    }
    const pdf = await extractPdfText(join(process.cwd(), "private/dokumenty/cestovni-pojisteni/kooperativa/koopkolumbus.pdf"), [10]);
    expect(pdf).toContain("náklady na přepravu při zmeškání odjezdu do ČR 5 000 10 000");
  });

  it("distinguishes Kooperativa accident reduction from medical and liability exclusions", async () => {
    const row = getRows("excelent").find(row => row.id === "alcohol")!;
    expect(row.koop.headline).toContain("úraz lze krátit");
    expect(row.koop.detail).toContain("až na polovinu");
    expect(row.koop.points?.join(" ")).toContain("dopravního úrazu");
    const pdf = await extractPdfText(join(process.cwd(), "private/dokumenty/cestovni-pojisteni/kooperativa/koopkolumbus.pdf"), [30]);
    expect(pdf).toContain("můžeme snížit až na polovinu");
    expect(pdf).toContain("Pokud však v důsledku svého jednání podle tohoto odstavce pojištěný zemřel");
  });

  it("includes Kooperativa telemedicine in both selected variants", async () => {
    for (const variant of Object.values(KOOP_VARIANTS)) {
      const row = buildRows(CPP_VARIANTS.maxi, variant, AXA_VARIANTS.reference).find(row => row.id === "doctor-on-phone")!;
      expect(row.koop.headline).toBe("Telefonická i video konzultace");
      expect(row.koop.detail).toContain(variant.label);
      expect(row.verdict.tone).toBe("balanced");
    }
    const pdf = await extractPdfText(join(process.cwd(), "private/dokumenty/cestovni-pojisteni/kooperativa/koopkolumbus.pdf"), [26, 27]);
    expect(pdf).toContain("telefonická, příp. video konzultace");
    expect(pdf).toContain("česky komunikujícím lékařem");
  });

  it("keeps the late-purchase cancellation reduction and its same-day exception visible", async () => {
    const row = getRows("excelent").find(row => row.id === "cancellation")!;
    const text = row.koop.points!.join(" ");
    expect(text).toContain("méně než 14 dní");
    expect(text).toContain("o 50 %");
    expect(text).toContain("v den objednání a zaplacení");
    expect(text).toContain("jen částku doplatku");
    expect(row.cpp.points!.join(" ")).toContain("celkového uhrazení");
    expect(row.verdict.tone).toBe("balanced");
    const pdf = await extractPdfText(join(process.cwd(), "private/dokumenty/cestovni-pojisteni/kooperativa/koopkolumbus.pdf"), [43]);
    expect(pdf).toContain("snížit pojistné plnění o 50 %");
    expect(pdf).toContain("To neplatí, je-li pojištění STORNO sjednáno v den");
  });

  it("separates ordinary sports exclusions from specifically agreed organized and extreme sports", async () => {
    const row = getRows("excelent").find(row => row.id === "sports-scope")!;
    expect(row.cpp.points!.join(" ")).toContain("ferraty do B");
    expect(row.koop.points!.join(" ")).toContain("ferraty do C");
    expect(row.koop.points!.join(" ")).toContain("organizovaný sport");
    expect(row.koop.points!.join(" ")).toContain("jmenovitě uvedené ve smlouvě");
    const pdf = await extractPdfText(join(process.cwd(), "private/dokumenty/cestovni-pojisteni/kooperativa/koopkolumbus.pdf"), [24]);
    expect(pdf).toContain("organizovaný sport");
    expect(pdf).toContain("extrémní sport");
    expect(pdf).toContain("jmenovitě uvedených v pojistné smlouvě");
  });

  it("keeps version conflicts visible and attributes the reported rental-car confirmation without extending it to sea charters", () => {
    for (const cpp of Object.values(CPP_VARIANTS)) {
      const rows = buildRows(cpp, KOOP_VARIANTS.plus, AXA_VARIANTS.excelent);
      const quarantine = rows.find(row => row.id === "quarantine")!;
      expect(quarantine.cpp.caution).toContain("DPPCOV 1/21");
      expect(quarantine.cpp.caution).toContain("25 000 + 25 000");
      const source = sourceReferences("cpp", quarantine.cpp.source)[0];
      expect(source.label).toContain("1/21");
      expect(source.note).toContain("1/23");
      const rental = rows.find(row => row.id === "rental-car-liability")!;
      expect(rental.cpp.headline.replace(/\s/g, " ")).toContain(cpp.label === "MINI" ? "250 000 Kč" : "500 000 Kč");
      expect(rental.cpp.badge).toBe("Auto z půjčovny potvrzeno ČPP");
      expect(rental.cpp.points!.join(" ")).toContain("podle informace správce srovnání");
      expect(rental.cpp.points!.join(" ")).toContain("sportovní vybavení");
      expect(rental.cpp.caution).toContain("zákonnou odpovědnost");
      expect(rental.cpp.caution).toContain("smluvní spoluúčasti");
      expect(rental.cpp.metric).toBeNull();
      const marine = rows.find(row => row.id === "marine-liability")!;
      expect(marine.cpp.detail).toContain("vnitrozemské");
      expect(marine.cpp.points!.join(" ")).toContain("plošnou výluku každé pronajaté lodi");
      expect(marine.cpp.caution).toContain("nepřenáší na námořní charter");
    }
  });

  it("links every cell to documents from the correct insurer", () => {
    const domains = { cpp: "www.cpp.cz", koop: "www.koop.cz", axa: "www.axa-assistance.cz" };
    for (const row of getRows("excelent")) {
      for (const tone of ["cpp", "koop", "axa"] as const) {
        const references = sourceReferences(tone, row[tone].source);
        expect(references.length, `${row.id}: ${tone} needs an official source`).toBeGreaterThan(0);
        for (const reference of references) {
          expect(reference.insurer).toBe(tone);
          expect(new URL(reference.url).hostname).toBe(domains[tone]);
          expect(new URL(reference.url).protocol).toBe("https:");
        }
      }
    }
  });

  it("supports Czech search without diacritics and preserves comparable liability ties", () => {
    expect(normalizeSearch("PŮJČENÉ vozidlo, léčebné výlohy")).toBe("pujcene vozidlo, lecebne vylohy");
    const row = buildRows(CPP_VARIANTS.opti, KOOP_VARIANTS.klasik, AXA_VARIANTS.reference).find(row => row.id === "liability")!;
    expect(row.verdict.tone).toBe("balanced");
    expect(row.cpp.headline).toBe(row.koop.headline);
  });
});
