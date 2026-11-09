import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFlexiPdf } from "./parseFlexiPdf";

const pdfState = vi.hoisted(() => ({ pages: [] as string[][] }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      get numPages() { return pdfState.pages.length; },
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: vi.fn(async () => ({
          items: pdfState.pages[pageNumber - 1].map((str) => ({ str })),
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
