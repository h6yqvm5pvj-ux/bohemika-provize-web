import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFlexiPdf } from "./parseFlexiPdf";

type Item = string | { str: string; transform: number[]; width?: number };
const pdfState = vi.hoisted(() => ({ pages: [] as Item[][] }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      get numPages() { return pdfState.pages.length; },
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: vi.fn(async () => ({
          items: pdfState.pages[pageNumber - 1].map(item => typeof item === "string" ? { str: item } : item),
        })),
      })),
    }),
  })),
}));

const parse = () => parseFlexiPdf(new File(["fixture"], "flexi.pdf", { type: "application/pdf" }));

describe("FLEXI renovation PDF", () => {
  beforeEach(() => {
    // Synthetic values with the same text layout as the supplied contract.
    pdfState.pages = [
      ["Číslo pojistné smlouvy", "1400000001", "Pojistná smlouva – Rizikové životní pojištění FLEXI"],
      ["Částka k úhradě", " ", "704 Kč"],
    ];
  });

  it("finds renovation on a later page without replacing the new contract number", async () => {
    pdfState.pages.push([
      "Ujednání týkající se původní smlouvy",
      "Tato smlouva nahrazuje původní pojistnou smlouvu č. 4800000002 (dále jen „původní smlouva“).",
    ]);
    await expect(parse()).resolves.toMatchObject({
      contractNumber: "1400000001", amount: 704, frequency: "monthly",
      isRefresh: true, refreshOriginalContractNumber: "4800000002",
    });
  });

  it("reads the Renovace heading on both pages and keeps the new policy number", async () => {
    pdfState.pages[0].push("Renovace původní pojistné smlouvy č.", "142 000 0002");
    pdfState.pages.push(["Renovace", "původní pojistné smlouvy", "č.", "1420000002"]);
    await expect(parse()).resolves.toMatchObject({
      contractNumber: "1400000001", isRefresh: true, refreshOriginalContractNumber: "1420000002",
    });
  });

  it("leaves the original number unresolved when the renovation references disagree", async () => {
    pdfState.pages[0].push("Renovace původní pojistné smlouvy č. 1420000002");
    pdfState.pages.push(["Tato smlouva nahrazuje původní pojistnou smlouvu č. 1420000003"]);
    const result = await parse();
    expect(result.isRefresh).toBe(true);
    expect(result.refreshOriginalContractNumber).toBeUndefined();
  });

  it("extracts payment details only from the amount due section and matches the contract number", async () => {
    pdfState.pages = [[
      "Číslo pojistné smlouvy", "1425518739", "Kolik nám za pojištění zaplatíte",
      "Částka k úhradě", "702 Kč", "Číslo účtu", "2226222/0800", "Variabilní symbol",
      "1425518739", "Datum splatnosti", "20. 8. 2026", "Na jak dlouho pojištění sjednáváme",
      "Částka k úhradě 999 Kč", "Číslo účtu 1111111111/0100", "Variabilní symbol 1111111111",
    ]];

    await expect(parse()).resolves.toMatchObject({
      contractNumber: "1425518739",
      paymentDetails: {
        amount: 702,
        accountNumber: "2226222/0800",
        variableSymbol: "1425518739",
        dueDate: "2026-08-20",
      },
    });
  });

  it("uses the annual amount due instead of multiplying the monthly premium itself", async () => {
    pdfState.pages = [[
      "Číslo pojistné smlouvy", "1425544889", "Kolik nám za pojištění zaplatíte",
      "Celkové měsíční pojistné", "236 Kč", "Pojistné za pojistné období po slevě", "2 832 Kč",
      "Způsob platby", "trvalý příkaz", "Částka k úhradě", "2 832 Kč", "Číslo účtu",
      "2226222/0800", "Variabilní symbol", "1425544889", "Datum splatnosti", "1. 11. 2026",
      "Na jak dlouho pojištění sjednáváme",
    ]];

    await expect(parse()).resolves.toMatchObject({
      contractNumber: "1425544889",
      paymentDetails: {
        amount: 2832,
        accountNumber: "2226222/0800",
        variableSymbol: "1425544889",
        dueDate: "2026-11-01",
      },
    });
  });

  it("does not return FLEXI payment details when the bank transfer symbol differs from the contract", async () => {
    pdfState.pages = [[
      "Číslo pojistné smlouvy", "1425518739", "Kolik nám za pojištění zaplatíte",
      "Částka k úhradě", "702 Kč", "Číslo účtu", "2226222/0800", "Variabilní symbol",
      "9999999999", "Datum splatnosti", "20. 8. 2026",
    ]];

    const result = await parse();
    expect(result).not.toHaveProperty("paymentDetails");
  });

  it.each([
    "Tato\nsmlouva nahrazuje původní\npojistnou smlouvu č.\n480 000 0002.",
    "TATO SMLOUVA NAHRAZUJE PUVODNI POJISTNOU SMLOUVU C 4800000002.",
    "Tato\u00a0smlouva nahrazuje původní pojistnou smlouvu č.: 4800000002.",
  ])("handles split text items and whitespace: %s", async (clause) => {
    pdfState.pages.push(clause.split("\n"));
    await expect(parse()).resolves.toMatchObject({
      isRefresh: true, refreshOriginalContractNumber: "4800000002",
    });
  });

  it("keeps renovation active when the original number needs manual completion", async () => {
    pdfState.pages.push(["Tato smlouva nahrazuje původní pojistnou smlouvu č. ______."]);
    const result = await parse();
    expect(result.isRefresh).toBe(true);
    expect(result.refreshOriginalContractNumber).toBeUndefined();
  });

  it("does not infer renovation just from a reference to an original contract", async () => {
    pdfState.pages.push(["Zdravotní dotazníky původní pojistné smlouvy č. 4800000002."]);
    const result = await parse();
    expect(result.isRefresh).not.toBe(true);
    expect(result.refreshOriginalContractNumber).toBeUndefined();
    expect(result.contractNumber).toBe("1400000001");
  });
});

describe("FLEXI change request PDF", () => {
  const request = () => [
    "FLEXI", "Žádost o změnu v pojistné smlouvě",
    "Číslo pojistné smlouvy: 1400000088", "Pojistník", "Jméno: Jana", "Příjmení: Testovací",
    "Požadované datum účinnosti", "1. 12. 2026", "Změna běžného pojistného za pojistné období",
    "Staré měsíční pojistné: 1 000 Kč", "Nové měsíční pojistné:", "1 400 Kč",
    "Pojištěná osoba", "Jméno: Petr", "Příjmení: Jiný", "Datum sepsání žádosti", "12. 11. 2026",
  ];
  beforeEach(() => { pdfState.pages = [request()]; });

  it("reads only request fields, including the policyholder rather than the insured", async () => {
    pdfState.pages.push(["Pojistná smlouva uzavřena dne 1. 1. 2020", "Počátek pojištění 1. 2. 2020", "Částka k úhradě 999 Kč"]);
    await expect(parse()).resolves.toEqual({ isEndorsement: true, contractNumber: "1400000088",
      clientName: "Jana Testovací", policyStartDate: "2026-12-01", contractSignedDate: "2026-11-12",
      amount: 1400, frequency: "monthly" });
  });

  it("uses visual columns when values precede their labels in PDF text order", async () => {
    const cell = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y], width: 50 });
    pdfState.pages = [["FLEXI", "Žádost o změnu v pojistné smlouvě", "Číslo pojistné smlouvy: 1400000088",
      "Pojistník", cell("Jana", 153, 688), cell("Jméno:", 153, 698),
      cell("Testovací", 244, 688), cell("Příjmení:", 244, 698),
      cell("Požadované datum účinnosti", 30, 528), cell("1. 12. 2026", 510, 528),
      "Změna běžného pojistného za pojistné období", cell("1 000 Kč", 439, 500), cell("Staré měsíční pojistné:", 439, 509),
      cell("1 400 Kč", 505, 500), cell("Nové měsíční pojistné:", 505, 509),
    ], [cell("Datum sepsání žádosti", 28, 790), cell("12. 11. 2026", 297, 790)]];
    await expect(parse()).resolves.toMatchObject({ clientName: "Jana Testovací", amount: 1400,
      policyStartDate: "2026-12-01", contractSignedDate: "2026-11-12" });
  });

  it("normalizes accents, case, newlines and nonbreaking spaces", async () => {
    pdfState.pages = [request().map(line => line.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase()
      .replace(/ /g, "\u00a0\n"))];
    await expect(parse()).resolves.toMatchObject({ isEndorsement: true, contractNumber: "1400000088",
      amount: 1400, policyStartDate: "2026-12-01" });
  });

  it.each(["Požadované datum účinnosti", "Nové měsíční pojistné:", "Změna běžného pojistného za pojistné období"])("does not use unrelated contract data when %s is absent", async label => {
    pdfState.pages = [request().filter(line => line !== label),
      ["Počátek pojištění 1. 2. 2020", "Částka k úhradě 999 Kč"]];
    const result = await parse();
    expect(label.startsWith("Požadované") ? result.policyStartDate : result.amount).toBeNull();
  });

  it("never borrows a name from the insured when the policyholder block is missing", async () => {
    pdfState.pages = [request().filter(line => !["Pojistník", "Jméno: Jana", "Příjmení: Testovací"].includes(line))];
    expect((await parse()).clientName).toBeNull();
  });

  it("rejects ambiguous policyholders", async () => {
    pdfState.pages.push(["Pojistník", "Jméno: Marie", "Příjmení: Jiná", "Pojištěná osoba"]);
    expect((await parse()).clientName).toBeNull();
  });

  it.each(["31. 2. 2026", "1. 13. 2026", "0. 12. 2026"])("rejects an impossible effective date: %s", async date => {
    pdfState.pages = [request().map(line => line === "1. 12. 2026" ? date : line)];
    expect((await parse()).policyStartDate).toBeNull();
  });

  it.each(["-1 400 Kč", "1 400<script>", "0 Kč"])("rejects a malformed new premium: %s", async amount => {
    pdfState.pages = [request().map(line => line === "1 400 Kč" ? amount : line)];
    expect((await parse()).amount).toBeNull();
  });

  it("does not mistake a partial FLEXI marker for the product", async () => {
    pdfState.pages = [request().map(line => line === "FLEXI" ? "FLEXIBILNÍ" : line)];
    expect((await parse()).isEndorsement).not.toBe(true);
  });
});
