import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractCppAutoPolicyholderPersonalId,
  parseCppAutoPdf,
} from "./parseCppAutoPdf";

const pdfState = vi.hoisted(() => ({
  pages: [] as Array<Array<{ str: string; x: number; y: number; width?: number }>>,
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      get numPages() {
        return pdfState.pages.length;
      },
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: vi.fn(async () => ({
          items: (pdfState.pages[pageNumber - 1] ?? []).map((item) => ({
            str: item.str,
            transform: [1, 0, 0, 1, item.x, item.y],
            width: item.width ?? 80,
          })),
        })),
      })),
    }),
  })),
}));

const makePdfFile = () =>
  new File(["pdf fixture"], "cpp-auto.pdf", { type: "application/pdf" });

const textPage = (...lines: string[]) => lines.map((str, index) => ({ str, x: 40, y: 780 - index * 14, width: str.length * 4 }));

describe("parseCppAutoPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("uses company name when the CPP Auto policyholder has a Název field", async () => {
    pdfState.pages = [
      [
        { str: "Číslo návrhu pojistné smlouvy", x: 240, y: 750, width: 116 },
        { str: "3271032734", x: 276, y: 737, width: 45 },
        { str: "POJISTNÍK", x: 45, y: 586, width: 42 },
        { str: "Název:", x: 45, y: 571, width: 25 },
        { str: "Green Bridge Recycling s.r.o.", x: 84, y: 571, width: 95 },
        { str: "IČ:", x: 300, y: 571, width: 15 },
        { str: "12 34 56 78", x: 320, y: 571, width: 45 },
        { str: "Plátce DPH:", x: 435, y: 571, width: 44 },
        { str: "ANO", x: 481, y: 571, width: 16 },
        { str: "Titul před:", x: 45, y: 539, width: 35 },
        { str: "Jméno:", x: 147, y: 539, width: 26 },
        { str: "Andreas", x: 175, y: 539, width: 28 },
        { str: "Příjmení:", x: 274, y: 539, width: 32 },
        { str: "Hellinger", x: 308, y: 539, width: 30 },
      ],
    ];

    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "3271032734",
      clientName: "Green Bridge Recycling s.r.o.",
      personalId: "12345678",
    });
  });

  it("keeps parsing personal CPP Auto policyholder names", async () => {
    pdfState.pages = [
      [
        { str: "Číslo návrhu pojistné smlouvy", x: 240, y: 750, width: 116 },
        { str: "3271000001", x: 276, y: 737, width: 45 },
        { str: "POJISTNÍK", x: 45, y: 586, width: 42 },
        { str: "Titul před:", x: 45, y: 571, width: 35 },
        { str: "Jméno:", x: 147, y: 571, width: 26 },
        { str: "Martin", x: 175, y: 571, width: 28 },
        { str: "Příjmení:", x: 274, y: 571, width: 32 },
        { str: "Tamáš", x: 308, y: 571, width: 30 },
        { str: "Rodné číslo:", x: 45, y: 555, width: 45 },
        { str: "900101/1234", x: 95, y: 555, width: 48 },
      ],
    ];

    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "3271000001",
      clientName: "Martin Tamáš",
      personalId: "900101/1234",
    });
  });

  it("reads the identifier only from the policyholder section", () => {
    expect(
      extractCppAutoPolicyholderPersonalId([
        "POJISTNÍK",
        "Název: Testovací firma",
        "IČ: 87 65 43 21",
        "PROVOZOVATEL",
        "IČ: 12 34 56 78",
      ]),
    ).toBe("87654321");
  });

  it("returns the email from the CPP policyholder E-mail field, excluding the adviser and vehicle operator", async () => {
    pdfState.pages = [[
      { str: "ZPROSTŘEDKOVATEL", x: 45, y: 640 },
      { str: "E-mail: poradce@example.test", x: 45, y: 625, width: 160 },
      { str: "POJISTNÍK", x: 45, y: 600 },
      { str: "Jméno:", x: 45, y: 585, width: 30 },
      { str: "Petr", x: 80, y: 585, width: 20 },
      { str: "Přijmení:", x: 120, y: 585, width: 40 },
      { str: "Novák", x: 165, y: 585, width: 30 },
      { str: "E-mail:", x: 45, y: 565, width: 30 },
      { str: "PETR@EXAMPLE.TEST", x: 80, y: 565, width: 100 },
      { str: "Telefon: 777123456", x: 260, y: 565, width: 100 },
      { str: "PROVOZOVATEL", x: 45, y: 540, width: 80 },
      { str: "E-mail: provozovatel@example.test", x: 45, y: 525, width: 180 },
    ]];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({ clientName: "Petr Novák", clientEmail: "petr@example.test" });
  });

  it("does not fill the email if it belongs only to the adviser", async () => {
    pdfState.pages = [[
      { str: "POJISTNÍK", x: 45, y: 600 },
      { str: "Jméno:", x: 45, y: 585, width: 30 },
      { str: "Petr", x: 80, y: 585, width: 20 },
      { str: "Příjmení:", x: 120, y: 585, width: 40 },
      { str: "Novák", x: 165, y: 585, width: 30 },
      { str: "ZPROSTŘEDKOVATEL", x: 45, y: 565 },
      { str: "E-mail: poradce@example.test", x: 45, y: 545, width: 150 },
    ]];
    expect((await parseCppAutoPdf(makePdfFile())).clientEmail).toBeUndefined();
  });

  it("uses only the policyholder's full name when another person's name appears first", async () => {
    pdfState.pages = [textPage(
      "Číslo pojistné smlouvy: 0012345678", "PROVOZOVATEL", "Jméno: Karel", "Příjmení: Provozní",
      "POJISTNÍK", "Jméno: Jana", "Příjmení: Testovací", "E-mail: jana@example.test",
      "VLASTNÍK", "Jméno: Petr", "Příjmení: Vlastnický", "E-mail: vlastnik@example.test",
    )];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      clientName: "Jana Testovací", clientEmail: "jana@example.test",
    });
  });

  it("finds the policyholder on a later page without borrowing the adviser's first-page name", async () => {
    pdfState.pages = [textPage("Číslo pojistné smlouvy: 0012345678", "ZPROSTŘEDKOVATEL", "Jméno: Pavel", "Příjmení: Poradní"),
      textPage("POJISTNÍK", "Jméno: Jana Marie", "Příjmení: Testovací-Novotná", "PROVOZOVATEL", "Jméno: Karel", "Příjmení: Provozní")];
    expect((await parseCppAutoPdf(makePdfFile())).clientName).toBe("Jana Marie Testovací-Novotná");
  });

  it.each([[], ["Jméno: Jana"], ["Příjmení: Testovací"]].map(labels => ({ labels })))("leaves an incomplete policyholder unknown instead of borrowing another role: $labels", ({ labels }) => {
    pdfState.pages = [textPage("PROVOZOVATEL", "Jméno: Karel", "Příjmení: Provozní", "POJISTNÍK", ...labels,
      "VLASTNÍK", "Jméno: Petr", "Příjmení: Vlastnický")];
    return parseCppAutoPdf(makePdfFile()).then(result => {
      expect(result.clientName).toBeUndefined();
      expect(result.pdfImportWarnings?.length).toBeGreaterThan(0);
      expect(JSON.stringify(result.pdfImportWarnings)).not.toMatch(/Jana|Testovací|Karel|Provozní|Petr|Vlastnický/);
    });
  });

  it("does not invent a client from names outside a policyholder section", async () => {
    pdfState.pages = [textPage("ZPROSTŘEDKOVATEL", "Jméno: Pavel", "Příjmení: Poradní", "E-mail: poradce@example.test",
      "PROVOZOVATEL", "Jméno: Karel", "Příjmení: Provozní")];
    const result = await parseCppAutoPdf(makePdfFile());
    expect(result.clientName).toBeUndefined();
    expect(result.clientEmail).toBeUndefined();
  });

  it.each(["JEDNAJÍCÍ OSOBA", "KONTAKTNÍ OSOBA", "ZÁSTUPCE"])("does not use a company's %s email as the policyholder's contact", async heading => {
    pdfState.pages = [textPage("POJISTNÍK", "Název: Testovací společnost s.r.o.", "IČ: 12345678", heading,
      "Jméno: Eva", "Příjmení: Zkušební", "E-mail: zastupce@example.test")];
    const result = await parseCppAutoPdf(makePdfFile());
    expect(result.clientName).toBe("Testovací společnost s.r.o.");
    expect(result.clientEmail).toBeUndefined();
  });

  it("keeps the company's own policyholder email separate from its representative", async () => {
    pdfState.pages = [textPage("POJISTNÍK", "Název: Testovací společnost s.r.o.", "IČ: 12345678", "E-mail: firma@example.test",
      "JEDNAJÍCÍ OSOBA", "Jméno: Eva", "Příjmení: Zkušební", "E-mail: zastupce@example.test")];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({ clientName: "Testovací společnost s.r.o.", clientEmail: "firma@example.test" });
  });

  it("keeps policyholder name, identifier and email inside their own column", async () => {
    pdfState.pages = [[
      { str: "POJISTNÍK", x: 40, y: 740, width: 65 }, { str: "PROVOZOVATEL", x: 310, y: 740, width: 100 },
      { str: "Jméno: Jana", x: 40, y: 720, width: 80 }, { str: "Jméno: Eva", x: 310, y: 720, width: 80 },
      { str: "Příjmení: Testovací", x: 40, y: 700, width: 120 }, { str: "Příjmení: Provozní", x: 310, y: 700, width: 120 },
      { str: "Rodné číslo: 900101/1234", x: 40, y: 680, width: 160 }, { str: "Rodné číslo: 910101/1234", x: 310, y: 680, width: 160 },
      { str: "E-mail: jana@example.test", x: 40, y: 660, width: 180 }, { str: "E-mail: provoz@example.test", x: 310, y: 660, width: 190 },
    ]];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      clientName: "Jana Testovací", personalId: "900101/1234", clientEmail: "jana@example.test",
    });
  });

  it("keeps current and replaced contract numbers in their own side-by-side boxes", async () => {
    pdfState.pages = [[
      { str: "Náhrada smlouvy", x: 30, y: 750, width: 100 },
      { str: "Číslo pojistné smlouvy", x: 280, y: 750, width: 130 },
      { str: "0020000011", x: 40, y: 730, width: 80 },
      { str: "0090000022", x: 290, y: 730, width: 80 },
      ...textPage("POJISTNÍK", "Jméno: Jana", "Příjmení: Testovací").map(item => ({ ...item, y: item.y - 100 })),
    ]];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "0090000022", refreshOriginalContractNumber: "0020000011", isRefresh: true,
    });
  });

  it("does not use an unrelated repeated number when the policy number box is empty", async () => {
    pdfState.pages = [textPage("Číslo pojistné smlouvy", "POJISTNÍK", "Jméno: Jana", "Příjmení: Testovací",
      "Rodné číslo: 9001011234", "Telefon: 777123456", "Kontakt na poradce: 777123456")];
    const result = await parseCppAutoPdf(makePdfFile());
    expect(result.contractNumber).toBeUndefined();
    expect(result.pdfImportWarnings?.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.pdfImportWarnings)).not.toMatch(/9001011234|777123456/);
  });

  it("does not treat the current policy's next box as an unspecified replaced policy", async () => {
    pdfState.pages = [textPage("Náhrada smlouvy", "Číslo pojistné smlouvy", "0090000022", "POJISTNÍK", "Jméno: Jana", "Příjmení: Testovací")];
    const result = await parseCppAutoPdf(makePdfFile());
    expect(result.contractNumber).toBe("0090000022");
    expect(result.refreshOriginalContractNumber).toBeUndefined();
    expect(result.isRefresh).toBeUndefined();
  });

  it("accepts spaced Czech dates and preserves the existing compact date format", async () => {
    for (const date of ["3.11.2026", "3. 11. 2026", "3.\u00a011.\u00a02026"]) {
      pdfState.pages = [textPage(`Počátek pojištění: ${date}`, `Návrh pojistné smlouvy předložen dne: ${date}`)];
      await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({ policyStartDate: "2026-11-03", contractSignedDate: "2026-11-03" });
    }
  });

  it("does not turn an impossible explicit date into a plausible footer date", async () => {
    pdfState.pages = [textPage("Počátek pojištění: 31.2.2026", "Návrh pojistné smlouvy vyhotoven dne: 31.2.2026", "Tisk SUS Plus, 1.2.2026")];
    const result = await parseCppAutoPdf(makePdfFile());
    expect(result.policyStartDate).toBeUndefined();
    expect(result.contractSignedDate).toBeUndefined();
  });

  it("uses the proposal creation date ahead of its presentation and print dates", async () => {
    pdfState.pages = [textPage("Návrh pojistné smlouvy vyhotoven dne: 3. 11. 2026",
      "Návrh pojistné smlouvy předložen dne: 4. 11. 2026", "Tisk SUS Plus, 5.11.2026")];
    expect((await parseCppAutoPdf(makePdfFile())).contractSignedDate).toBe("2026-11-03");
  });

  it("reads a date label split across positioned PDF text items", async () => {
    pdfState.pages = [[
      { str: "Počátek", x: 45, y: 600, width: 35 },
      { str: "pojištění:", x: 85, y: 600, width: 40 },
      { str: "3. 11. 2026", x: 140, y: 600, width: 60 },
      { str: "Návrh pojistné", x: 45, y: 560, width: 65 },
      { str: "smlouvy předložen dne:", x: 115, y: 560, width: 100 },
      { str: "2. 11. 2026", x: 230, y: 560, width: 60 },
    ]];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({ policyStartDate: "2026-11-03", contractSignedDate: "2026-11-02" });
  });

  it("retains the existing vehicle, premium, limits, hull risks and assistance extraction", async () => {
    pdfState.pages = [textPage(
      "Číslo návrhu pojistné smlouvy: 0012345678", "POJISTNÍK", "Jméno: Jana", "Příjmení: Testovací", "ÚDAJE O VOZIDLE",
      "Tovární značka: ŠKODA", "Obchodní označení / typ: Octavia", "VIN: TMB12345678901234", "Registrační značka (SPZ): 1AA2345",
      "Série a číslo ORV: AA123456", "Limit pojistného plnění (škody na zdraví / majetku): 100 000 000 Kč",
      "Počátek pojištění: 3.11.2026", "Návrh pojistné smlouvy předložen dne: 2.11.2026", "Pojistné období: Roční",
      "Pojistné za pojistné období: 4 200 Kč", "Pojistná částka vozidla ve výši: 450 000 Kč",
      "POJIŠTĚNÍ ASISTENCE", "CAR Plus", "POJIŠTĚNÍ SKEL VOZIDLA", "Limit plnění: 25 000 Kč",
      "HAVARIJNÍ POJIŠTĚNÍ", "Rozsah pojištění: Havárie, Odcizení, Živel, Vandalismus, Střet se zvířetem", "Spoluúčast: 5 %, min. 5 000 Kč",
    )];
    await expect(parseCppAutoPdf(makePdfFile())).resolves.toMatchObject({
      clientName: "Jana Testovací", contractNumber: "0012345678", policyStartDate: "2026-11-03", contractSignedDate: "2026-11-02",
      amount: 4200, frequency: "annual", carMake: "ŠKODA Octavia", carVin: "TMB12345678901234", carPlate: "1AA2345", carOrv: "AA123456",
      carLiabilityLimit: 100_000_000, carHullSumInsured: 450_000, carHullDeductibleText: "5 %, min. 5 000 Kč",
      carHullRiskAccident: true, carHullRiskTheft: true, carHullRiskNatural: true, carHullRiskVandalism: true, carHullRiskAnimalCollision: true,
      carAssistancePlan: "cr_bez_limitu", carAddonGlass: true, carAddonGlassLimit: 25_000,
    });
  });
});
