import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseNeonPdf } from "./parseNeonPdf";

const pdfState = vi.hoisted(() => ({
  pages: [] as string[][],
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
          items: (pdfState.pages[pageNumber - 1] ?? []).map((str) => ({ str })),
        })),
      })),
    }),
  })),
}));

const makePdfFile = () =>
  new File(["pdf fixture"], "neon.pdf", { type: "application/pdf" });

describe("parseNeonPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("parses core NEON contract values from text content", async () => {
    pdfState.pages = [
      [
        "ŽIVOTNÍ POJIŠTĚNÍ NEON",
        "Česká podnikatelská pojišťovna",
        "Číslo pojistné smlouvy: 1234567890",
        "Jméno a příjmení, titul Jan Novák",
        "Počátek pojištění 1.7.2024",
        "Konec pojištění",
        "1.7.2044",
        "DATUM UZAVŘENÍ 15.6.2024",
        "Doba trvání smlouvy 15",
        "Měsíční pojistné včetně slev a přirážek celkem v Kč 1 234",
        "Smrt s konstantní pojistnou částkou",
        "1 000 000 Kč",
      ],
    ];

    await expect(parseNeonPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "1234567890",
      clientName: "Jan Novák",
      policyStartDate: "2024-07-01",
      policyEndDate: "2044-07-01",
      contractSignedDate: "2024-06-15",
      durationYears: 15,
      amount: 1234,
      frequency: "monthly",
      riskFields: {
        version: "neon_life",
        deathType: "konstantni",
        deathAmount: "1000000",
      },
    });
  });

  it("marks travel insurance when it appears as an insured risk before the payment section", async () => {
    pdfState.pages = [[
      "ZÁKLADNÍ POJIŠTĚNÍ",
      "Cestovní připojištění včetně COVIDU PLUS",
      "Rozšířená varianta",
      "800 Kč",
      "SLEVY Z CELKOVÉ VÝŠE POJISTNÉHO",
      "PLACENÍ POJISTNÉHO",
    ]];

    const parsed = await parseNeonPdf(makePdfFile());

    expect(parsed.riskFields?.travelInsurance).toBe(true);
    expect(parsed.risks?.some(risk => risk.title.includes("cestovni pripojisteni vcetne covidu plus"))).toBe(true);
  });

  it("does not mark travel insurance from general terms after the policy coverage table", async () => {
    pdfState.pages = [
      [
        "ZÁKLADNÍ POJIŠTĚNÍ",
        "Základní pojištění pro případ smrti s konstantní pojistnou částkou",
        "1 000 000 Kč",
        "SLEVY Z CELKOVÉ VÝŠE POJISTNÉHO",
        "PLACENÍ POJISTNÉHO",
      ],
      [
        "Zdravotní údaje uvedené ve zdravotním dotazníku se nezohledňují pro účely poskytnutí pojistného plnění z cestovního připojištění.",
        "Doplňkové pojistné podmínky pro cestovní připojištění v pojištění osob.",
        "Cestovní připojištění včetně COVIDU PLUS je upraveno následujícími podmínkami.",
      ],
    ];

    const parsed = await parseNeonPdf(makePdfFile());

    expect(parsed.riskFields?.travelInsurance).toBe(false);
    expect(parsed.risks?.some(risk => risk.title.includes("cestovni pripojisteni"))).toBe(false);
  });

  it("parses NEON payment details and does not append the following QR instruction number to the premium", async () => {
    pdfState.pages = [[
      "ŽIVOTNÍ POJIŠTĚNÍ NEON",
      "Česká podnikatelská pojišťovna",
      "Číslo pojistné smlouvy: 1234567890",
      "PLACENÍ POJISTNÉHO",
      "Číslo účtu",
      "700135002/0800",
      "Variabilní symbol",
      "1234567890",
      "Měsíční pojistné včetně slev a přirážek celkem v Kč",
      "891 3) Načtením QR kódu proveďte platbu či zadejte",
    ]];

    await expect(parseNeonPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "1234567890",
      amount: 891,
      frequency: "monthly",
      paymentDetails: {
        amount: 891,
        accountNumber: "700135002/0800",
        variableSymbol: "1234567890",
        dueDate: null,
      },
    });
  });

  it("does not accept NEON payment details when the printed variable symbol belongs to another contract", async () => {
    pdfState.pages = [[
      "Číslo pojistné smlouvy: 1234567890",
      "PLACENÍ POJISTNÉHO",
      "Číslo účtu 700135002/0800",
      "Variabilní symbol 9999999999",
      "Měsíční pojistné včetně slev a přirážek celkem v Kč 891",
    ]];

    const result = await parseNeonPdf(makePdfFile());
    expect(result).toMatchObject({
      contractNumber: "1234567890",
      amount: 891,
    });
    expect(result.paymentDetails).toBeUndefined();
  });

  it("parses endorsement refresh values from NEON change request text", async () => {
    pdfState.pages = [
      [
        "9876543210",
        "Žádanka o změnu",
        "NEON",
        "Česká podnikatelská pojišťovna",
        "Náhrada - refresh",
        "Náhrada pojistné smlouvy č.",
        "1234567890",
        "Modelováno s účinností změny od:",
        "1.8.2024",
        "Datum uzavření:",
        "20.7.2024",
        "Celkové měsíční pojistné:",
        "1 500 Kč",
      ],
    ];

    await expect(parseNeonPdf(makePdfFile())).resolves.toMatchObject({
      isEndorsement: true,
      isRefresh: true,
      contractNumber: "9876543210",
      refreshOriginalContractNumber: "1234567890",
      policyStartDate: "2024-08-01",
      contractSignedDate: "2024-07-20",
      amount: 1500,
      frequency: "monthly",
    });
  });

  it("parses NEON Risk basic accident death amount separately from regular death", async () => {
    pdfState.pages = [
      [
        "RIZIKOVÉ POJIŠTĚNÍ NEON RISK",
        "Česká podnikatelská pojišťovna",
        "Číslo pojistné smlouvy: 7503378964",
        "Jméno a příjmení, titul František Rauscher",
        "Počátek pojištění 26.7.2026",
        "Konec pojištění",
        "26.7.2046",
        "DATUM UZAVŘENÍ 25.7.2026",
        "Měsíční pojistné včetně slev a přirážek celkem v Kč 1 083",
        "ZÁKLADNÍ POJIŠTĚNÍ",
        "Základní pojištění pro případ smrti úrazem",
        "standardní plnění / úraz PLUS",
        "20",
        "30 000",
        "3",
        "Pro stanovení pojistného plnění z připojištění invalidity a zproštění od placení pojistného z důvodu přiznání invalidního důchodu se ujednává:",
      ],
    ];

    const parsed = await parseNeonPdf(makePdfFile());

    expect(parsed.riskFields).toMatchObject({
      version: "neon_risk",
      deathAccidentAmount: "30000",
    });
    expect(parsed.policyEndDate).toBe("2046-07-26");
    expect(parsed.riskFields?.deathAmount).toBeUndefined();
    expect(parsed.riskFields?.waiverInvalidity).toBe(false);
  });

  it("parses waiver only when it appears in the insured risks table", async () => {
    pdfState.pages = [
      [
        "RIZIKOVÉ POJIŠTĚNÍ NEON RISK",
        "Česká podnikatelská pojišťovna",
        "1. POJIŠTĚNÝ | SJEDNANÁ PŘI/POJIŠTĚNÍ",
        "ZPROŠTĚNÍ OD PLACENÍ",
        "Zproštění od placení pojistného z důvodu přiznání invalidního důchodu",
        "SLEVY Z CELKOVÉ VÝŠE POJISTNÉHO",
      ],
    ];

    await expect(parseNeonPdf(makePdfFile())).resolves.toMatchObject({
      riskFields: {
        waiverInvalidity: true,
        waiverUnemployment: false,
      },
    });
  });
});
