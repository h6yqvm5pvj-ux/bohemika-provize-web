import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePillowAutoPdf } from "./parsePillowAutoPdf";

const pdfState = vi.hoisted(() => ({ pages: [] as string[][] }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      get numPages() { return pdfState.pages.length; },
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: vi.fn(async () => ({
          items: (pdfState.pages[pageNumber - 1] ?? []).map((str, index) => ({
            str,
            transform: [1, 0, 0, 1, 40, 800 - index * 15],
            width: str.length * 5,
          })),
        })),
      })),
    }),
  })),
}));

const parse = () => parsePillowAutoPdf(new File(["fixture"], "pillow-auto.pdf", { type: "application/pdf" }));

describe("parsePillowAutoPdf payment details", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("reads the first bank transfer, its symbol, and first due date", async () => {
    pdfState.pages = [[
      "Návrh pojistné smlouvy číslo 27145525",
      "Způsob první platby: bankovním převodem",
      "Měsíční platba 653 Kč",
      "Číslo účtu: 501401304/2010",
      "Variabilní symbol: 100086377",
      "Splatnost první platby: 30. 9. 2026",
      "Splatnost další platby: 30. měsíčně",
      "Způsob další platby: bankovním převodem",
    ]];

    await expect(parse()).resolves.toMatchObject({
      contractNumber: "27145525",
      paymentDetails: {
        amount: 653,
        accountNumber: "501401304/2010",
        variableSymbol: "100086377",
        dueDate: "2026-09-30",
      },
    });
  });

  it("does not treat the next payment method as the first payment method", async () => {
    pdfState.pages = [[
      "Návrh pojistné smlouvy číslo 27145525",
      "Způsob první platby: platební kartou",
      "Měsíční platba 653 Kč",
      "Číslo účtu: 501401304/2010",
      "Variabilní symbol: 100086377",
      "Splatnost první platby: 30. 9. 2026",
      "Způsob další platby: bankovním převodem",
    ]];

    const parsed = await parse();
    expect(parsed).not.toHaveProperty("paymentDetails");
  });
});
