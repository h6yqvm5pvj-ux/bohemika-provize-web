import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseUniqaAutoPdf } from "./parseUniqaAutoPdf";

const pdfState = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      get numPages() { return pdfState.lines.length ? 1 : 0; },
      cleanup: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => ({ items: pdfState.lines.map((str, index) => ({
          str, transform: [1, 0, 0, 1, 40, 800 - index * 15], width: str.length * 5,
        })) })),
      })),
    }),
  })),
}));

describe("parseUniqaAutoPdf payment details", () => {
  beforeEach(() => { pdfState.lines = []; });

  it("reads semiannual installment, recurring due dates, account and variable symbol", async () => {
    pdfState.lines = [
      "Návrh pojistné smlouvy č. 5521579499",
      "Pojistné a platební údaje",
      "SPLÁTKA POJISTNÉHO - pololetně 2 888 Kč",
      "Splatnost dalších splátek",
      "17.8.|17.2.",
      "Číslo účtu pojistitele",
      "1071001005/5500",
      "Variabilní symbol",
      "5521579499",
    ];
    const result = await parseUniqaAutoPdf(new File(["fixture"], "uniqa.pdf", { type: "application/pdf" }));
    expect(result).toMatchObject({
      contractNumber: "5521579499",
      amount: 2888,
      frequency: "semiannual",
      paymentDetails: {
        amount: 2888,
        accountNumber: "1071001005/5500",
        variableSymbol: "5521579499",
        dueDate: null,
        installmentDueDates: "17.8.|17.2.",
      },
    });
  });
});
