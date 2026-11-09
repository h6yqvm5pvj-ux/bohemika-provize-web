import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractAllianzAutoPolicyholderData,
  parseAllianzAutoPdf,
} from "./parseAllianzAutoPdf";
import { mapSinglePdfFormValues } from "../kalkulacka/calculatorPdfFormValues";

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
  new File(["pdf fixture"], "allianz-auto.pdf", { type: "application/pdf" });

const setLines = (...lines: string[]) => {
  pdfState.pages = [lines.map((str, index) => ({ str, x: 28, y: 800 - index * 15, width: 250 }))];
};

describe("parseAllianzAutoPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("parses the original contract number for an Allianz Auto replacement", async () => {
    // The real Allianz PDF splits Czech diacritics into separate text items.
    pdfState.pages = [
      [
        { str: "Nahrazuje p", x: 42.52, y: 630.67, width: 40.01 },
        { str: "ů", x: 82.53, y: 630.67, width: 4.04 },
        { str: "vodn", x: 86.57, y: 630.67, width: 16.21 },
        { str: "í", x: 102.77, y: 630.67, width: 1.69 },
        { str: " ", x: 104.47, y: 630.67, width: 1.65 },
        { str: "pojistnou smlouvu", x: 106.12, y: 630.67, width: 58.27 },
        { str: " ", x: 164.39, y: 630.67, width: 1.65 },
        { str: "čí", x: 166.04, y: 630.67, width: 5.06 },
        { str: "slo: 789525166", x: 171.1, y: 630.67, width: 48.54 },
      ],
    ];

    await expect(parseAllianzAutoPdf(makePdfFile())).resolves.toMatchObject({
      isRefresh: true,
      refreshOriginalContractNumber: "789525166",
    });
  });

  it("extracts bank transfer payment details from the Allianz payment section only", async () => {
    setLines(
      "Nabídka pojistitele na uzavření pojistné smlouvy č. 810480926",
      "Pojistník",
      "Pojištěné vozidlo",
      "Pojistná rizika",
      "Pojistné podmínky",
      "Platba bankovním převodem:",
      "Vaše pojistné: 1 671 Kč",
      "Číslo účtu *: 20001-0038138021/0100",
      "Variabilní symbol: 810480926",
      "Zaplatit kartou",
      "Vaše pojistné: 9 999 Kč",
      "Číslo účtu *: 1111111111/0100",
      "Variabilní symbol: 1111111111",
    );

    await expect(parseAllianzAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "810480926",
      paymentDetails: {
        amount: 1671,
        accountNumber: "20001-0038138021/0100",
        variableSymbol: "810480926",
        dueDate: null,
      },
    });
  });

  it("does not accept Allianz payment details when the variable symbol differs from the contract", async () => {
    setLines(
      "Nabídka pojistitele na uzavření pojistné smlouvy č. 810480926",
      "Platba bankovním převodem:",
      "Vaše pojistné: 1 671 Kč",
      "Číslo účtu *: 20001-0038138021/0100",
      "Variabilní symbol: 999999999",
    );

    const parsed = await parseAllianzAutoPdf(makePdfFile());
    expect(parsed).not.toHaveProperty("paymentDetails");
  });

  it("načte osobní údaje pouze ze sekce Pojistník (vy)", () => {
    expect(
      extractAllianzAutoPolicyholderData([
        "Zprostředkovatel",
        "E-mail poradce@example.cz",
        "Pojistník (vy)",
        "Gabriela Mikerová",
        "Rodné číslo: 005101/1236",
        "E-mail",
        "mikerka.g@seznam.cz",
        "Pojištěné vozidlo",
        "E-mail ridic@example.cz",
      ]),
    ).toEqual({
      clientName: "Gabriela Mikerová",
      personalId: "005101/1236",
      clientEmail: "mikerka.g@seznam.cz",
    });
  });

  it("načte IČO, pokud je pojistníkem firma", () => {
    expect(
      extractAllianzAutoPolicyholderData([
        "Pojistník (vy)",
        "Testovací Firma",
        "IČO: 12 34 56 78",
        "E-mail firma@example.cz",
      ]),
    ).toMatchObject({
      personalId: "12345678",
      clientEmail: "firma@example.cz",
    });
  });

  it("reads the older two-column vehicle layout without treating the coverage heading as the make", async () => {
    pdfState.pages = [[
      { str: "Nabídka pojistitele č. 700000001", x: 28, y: 800 },
      { str: "Pojistník (vy)", x: 28, y: 760 },
      { str: "ŠTĚPÁN TESTOVACÍ", x: 28, y: 745 },
      { str: "Požadovaný počátek pojištění: 20. 6. 2024", x: 28, y: 710 },
      { str: "Pojištěné vozidlo", x: 28, y: 355, width: 62 },
      { str: "Druh: Motocykly do 50 ccm", x: 300, y: 356, width: 100 },
      { str: "Účel použití: Běžný provoz", x: 300, y: 345, width: 100 },
      { str: "Test Scooters", x: 28, y: 338, width: 90 },
      { str: "Celková hmotnost (kg): 80", x: 300, y: 336, width: 100 },
      { str: "SPZ: nesdě", x: 28, y: 325, width: 38 },
      { str: "lena", x: 66, y: 325, width: 15 },
      { str: "Zdvihový objem válců (ccm): 0", x: 300, y: 326, width: 110 },
      { str: "VIN: TEST0000000000001", x: 28, y: 295, width: 100 },
      { str: "Rozsah a parametry sjednávaného pojištění", x: 28, y: 273, width: 200 },
      { str: "Cena pojištění 1 200 Kč Ročně", x: 28, y: 250 },
      { str: "Nabídka pojistitele č. 700000001 Datum a čas vytvoření nabídky: 10. 6. 2024 12:30", x: 325, y: 13 },
    ]];
    const parsed = await parseAllianzAutoPdf(makePdfFile());
    expect(parsed).toMatchObject({ contractNumber: "700000001", clientName: "Štěpán Testovací",
      contractSignedDate: "2024-06-10", policyStartDate: "2024-06-20", carMake: "Test Scooters", carPlate: "nesdělena", carVin: "TEST0000000000001" });
    expect(mapSinglePdfFormValues("allianzAuto", parsed).values).toMatchObject({
      clientName: "Štěpán Testovací", contractSignedDate: "2024-06-10", policyStartDate: "2024-06-20",
      autoCarMake: "Test Scooters", autoCarPlate: "nesdělena", autoCarVin: "TEST0000000000001",
    });
  });

  it("preserves the current inline vehicle layout, real registration plates and mixed-case names", async () => {
    setLines("Nabídka pojistitele na uzavření pojistné smlouvy č. 700000002", "Pojistník (vy)", "Anna McDonald",
      "Požadovaný počátek pojištění: 20. 10. 2026", "Pojištěné vozidlo Škoda Octavia", "SPZ: 1AB2345",
      "VIN: TEST0000000000002", "Sjednaný balíček: Max", "Cena pojištění 12 000 Kč Ročně",
      "Datum a čas vytvoření nabídky: 10. 10. 2026 12:30");
    expect(await parseAllianzAutoPdf(makePdfFile())).toMatchObject({ contractNumber: "700000002", clientName: "Anna McDonald",
      contractSignedDate: "2026-10-10", policyStartDate: "2026-10-20", carMake: "Škoda Octavia", carPlate: "1AB2345",
      carVin: "TEST0000000000002", carAllianzScope: "Max", amount: 12000, frequency: "annual" });
  });

  it("reads the creation date after its own label when another date precedes it on the same row", async () => {
    setLines("Požadovaný počátek pojištění: 20. 6. 2024 Datum a čas vytvoření nabídky: 10. 6. 2024 12:30");
    expect(await parseAllianzAutoPdf(makePdfFile())).toMatchObject({ contractSignedDate: "2024-06-10", policyStartDate: "2024-06-20" });
  });

  it("reads a creation date split below its label", async () => {
    setLines("Datum a čas vytvoření nabídky:", "10. 6. 2024 12:30");
    expect(await parseAllianzAutoPdf(makePdfFile())).toMatchObject({ contractSignedDate: "2024-06-10" });
  });

  it.each(["31. 2. 2024", "0. 6. 2024", "10. 13. 2024"])("rejects an invalid creation date %s", async date => {
    setLines(`Datum a čas vytvoření nabídky: ${date}`);
    expect(await parseAllianzAutoPdf(makePdfFile())).not.toHaveProperty("contractSignedDate");
  });

  it("does not invent a make from later headings when the vehicle make is missing", async () => {
    setLines("Pojištěné vozidlo", "Druh: Osobní automobil", "SPZ: nesdělena", "VIN: TEST0000000000001",
      "Rozsah a parametry sjednávaného pojištění", "Sjednaný balíček: Komfort");
    expect(await parseAllianzAutoPdf(makePdfFile())).not.toHaveProperty("carMake");
  });

  it.each(["SPZ: NESDĚLENA", "RZ: nesdělena", "RZ:\nnesdělena"])("preserves the undeclared-plate value for %s", async label => {
    setLines(...label.split("\n"));
    expect(await parseAllianzAutoPdf(makePdfFile())).toMatchObject({ carPlate: "nesdělena" });
  });

  it.each([
    ["ŠTĚPÁN TESTOVACÍ", "Štěpán Testovací"],
    ["ANNA NOVÁKOVÁ-SVOBODOVÁ", "Anna Nováková-Svobodová"],
    ["PATRICK O'NEILL", "Patrick O'Neill"],
  ])("normalizes an uppercase person name %s without losing accents", (name, expected) => {
    expect(extractAllianzAutoPolicyholderData(["Pojistník (vy)", name]).clientName).toBe(expected);
  });

  it("preserves an uppercase company name when the policyholder has a company ID", () => {
    expect(extractAllianzAutoPolicyholderData(["Pojistník (vy)", "ABC SERVIS", "IČO: 12345678"]).clientName).toBe("ABC SERVIS");
  });
});
