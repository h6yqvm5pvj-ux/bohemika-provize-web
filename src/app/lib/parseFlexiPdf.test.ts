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
