import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCppAutoVozikZdarmaPdf } from "./parseCppAutoVozikZdarmaPdf";
import { parseContractPdfByProduct } from "../kalkulacka/calculatorPdfImport";

type Item = { str: string; x: number; y: number; width: number };
const state = vi.hoisted(() => ({ pages: [] as Item[][] }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({ promise: Promise.resolve({
    get numPages() { return state.pages.length; },
    getPage: async (pageNumber: number) => ({ view: [0, 0, 595, 842],
      getTextContent: async () => ({ items: state.pages[pageNumber - 1].map(item => ({
        str: item.str, transform: [1, 0, 0, 1, item.x, item.y], width: item.width,
      })) }),
    }),
  }) })),
}));
const item = (str: string, x: number, y: number): Item => ({ str, x, y, width: str.length * 4 });
const row = (str: string, y: number) => item(str, 45, y);
const parse = () => parseCppAutoVozikZdarmaPdf(new File(["synthetic PDF"], "trailer.pdf", { type: "application/pdf" }));

beforeEach(() => {
  state.pages = [[
    item("*3999000001000000*", 190, 800),
    item("3999000001", 276, 748), item("1", 365, 748),
    row("POJISTNÁ SMLOUVA AUTOPOJIŠTĚNÍ VOZÍK ZDARMA", 712),
    row("Česká podnikatelská pojišťovna, a. s.", 660),
    row("POJISTNÍK", 600),
    item("Titul před:", 45, 584), item("Ing.", 92, 584),
    item("Jméno:", 147, 584), item("Jana", 175, 584),
    item("Příjmení:", 275, 584), item("Testovací", 315, 584),
    item("Titul za:", 460, 584), item("Ph.D.", 502, 584),
    row("Rodné číslo: 900101/0000", 570),
    row("E-mail: synthetic@example.test", 550),
    row("PROVOZOVATEL", 520), row("Jméno: Petr Příjmení: Jiný", 505),
    row("DOBA POJIŠTĚNÍ", 475),
    item("Počátek pojištění:", 45, 456), item("16.12.2026 00:00", 130, 456),
    row("VOZIDLO", 440),
    item("Tovární značka:", 45, 420), item("TEST TRAILERS", 147, 420),
    item("VIN (výrobní číslo karoserie):", 278, 420), item("TESTABCDEFG123456", 464, 420),
    item("Obchodní označení / Typ:", 45, 409), item("Model 12", 147, 409),
    item("Série a číslo ORV:", 278, 409), item("AAA000111", 464, 409),
    item("Registrační značka (SPZ):", 45, 378), item("TEST123", 147, 378),
    row("POJIŠTĚNÍ ODPOVĚDNOSTI ZA ÚJMU ZPŮSOBENOU PROVOZEM VOZIDLA", 350),
    item("Limit pojistného plnění (škody na zdraví / majetku):", 278, 321), item("50 mil./50 mil. Kč", 480, 321),
    row("POJISTNÉ", 300), row("Pojistné za pojistné období: 999 Kč", 285),
    row("Číslo hlavní smlouvy: 3999001112", 237),
  ], [
    row("Pojistník prohlašuje, že převzal pojistné podmínky.", 750),
    row("Návrh pojistné smlouvy vyhotoven dne: 12.11.2026", 280),
    row("Jméno a příjmení získatele: Pavel Poradce", 260),
    row("Tisk SUS Plus: 17.11.2026", 30),
  ]];
});

describe("ČPP Auto / Vozík ZDARMA parser", () => {
  it("reads the header box, the titled policyholder, labelled dates and vehicle details", async () => {
    expect(await parse()).toEqual({ contractNumber: "3999000001", clientName: "Ing. Jana Testovací, Ph.D.",
      policyStartDate: "2026-12-16", contractSignedDate: "2026-11-12", carMake: "TEST TRAILERS Model 12",
      carVin: "TESTABCDEFG123456", carPlate: "TEST123", carOrv: "AAA000111", carLiabilityLimit: 50_000_000 });
  });

  it("never returns personal identifiers, contacts, premiums or payment instructions", async () => {
    const parsed = await parse();
    for (const key of ["personalId", "clientEmail", "amount", "frequency", "paymentDetails", "isRefresh", "refreshOriginalContractNumber"]) {
      expect(parsed).not.toHaveProperty(key);
    }
    expect(JSON.stringify(parsed)).not.toContain("synthetic@example.test");
    expect(JSON.stringify(parsed)).not.toContain("900101/0000");
  });

  it("runs through the shared import entry point with extraction metadata and no premium", async () => {
    const parsed = await parseContractPdfByProduct("cppAutoVozikZdarma", new File(["synthetic PDF"], "trailer.pdf", { type: "application/pdf" }));
    expect(parsed).toMatchObject({ contractNumber: "3999000001", carLiabilityLimit: 50_000_000, pdfNativeTextReadable: true });
    expect(parsed).not.toHaveProperty("amount");
    expect(parsed).not.toHaveProperty("frequency");
  });

  it("also supports an unambiguous labelled contract box", async () => {
    state.pages[0] = state.pages[0].filter(entry => entry.str !== "3999000001" && entry.str !== "1");
    state.pages[0].unshift(row("Číslo pojistné smlouvy: 3999000001", 748));
    expect((await parse()).contractNumber).toBe("3999000001");
  });

  it("does not mistake the barcode or main contract reference for the trailer contract", async () => {
    state.pages[0] = state.pages[0].filter(entry => entry.str !== "3999000001");
    const parsed = await parse();
    expect(parsed.contractNumber).toBeNull();
    expect(parsed.pdfImportWarnings?.length).toBeGreaterThan(0);
    expect(parsed.pdfImportWarnings?.join(" ")).not.toContain("3999001112");
  });

  it("requires manual review for conflicting numbers inside the header", async () => {
    state.pages[0].push(item("3999000002", 300, 760));
    expect((await parse()).contractNumber).toBeNull();
  });

  it("does not substitute print or proposal presentation dates for the prepared date", async () => {
    state.pages[1] = [row("Návrh pojistné smlouvy předložen dne: 13.11.2026", 280), row("Tisk SUS Plus: 17.11.2026", 30)];
    expect((await parse()).contractSignedDate).toBeNull();
  });

  it("rejects an impossible prepared date instead of falling back to print", async () => {
    state.pages[1][1].str = "Návrh pojistné smlouvy vyhotoven dne: 31.2.2026";
    const parsed = await parse();
    expect(parsed.contractSignedDate).toBeNull();
    expect(parsed.pdfImportWarnings?.some(warning => warning.includes("neplatné"))).toBe(true);
  });

  it("reads the start only from DOBA POJIŠTĚNÍ", async () => {
    state.pages[0] = state.pages[0].filter(entry => !entry.str.includes("Počátek pojištění"));
    state.pages[1].unshift(row("Počátek pojištění: 15.12.2026", 790));
    expect((await parse()).policyStartDate).toBeNull();
  });

  it("takes the liability limit only from the liability section", async () => {
    state.pages[0] = state.pages[0].filter(entry => !entry.str.startsWith("Limit pojistného plnění"));
    state.pages[1].push(row("Limit pojistného plnění: 200 mil./200 mil. Kč", 120));
    expect((await parse()).carLiabilityLimit).toBeNull();
  });

  it("does not collapse unequal health and property limits into a symmetric limit", async () => {
    state.pages[0].find(entry => entry.str === "50 mil./50 mil. Kč")!.str = "50 mil./100 mil. Kč";
    const parsed = await parse();
    expect(parsed.carLiabilityLimit).toBeNull();
    expect(parsed.pdfImportWarnings).toContain("Limity škod na zdraví a majetku se liší; zkontroluj je ručně.");
  });

  it("does not populate a policyholder from an operator or adviser box", async () => {
    state.pages[0] = state.pages[0].filter(entry => entry.y !== 584);
    expect((await parse()).clientName).toBeNull();
  });

  it.each(["Česká podnikatelská pojišťovna, a. s.", "POJISTNÁ SMLOUVA AUTOPOJIŠTĚNÍ VOZÍK ZDARMA"])("requires both product markers before parsing: %s", async marker => {
    state.pages[0] = state.pages[0].filter(entry => entry.str !== marker);
    const parsed = await parse();
    expect(parsed.contractNumber).toBeNull();
    expect(parsed.clientName).toBeNull();
    expect(parsed.carMake).toBeNull();
    expect(parsed.pdfImportWarnings).toEqual(["PDF neodpovídá produktu ČPP Auto / Vozík ZDARMA."]);
  });
});
