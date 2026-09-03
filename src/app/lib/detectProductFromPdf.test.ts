import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectProductFromPdf } from "./detectProductFromPdf";

type MockPdfItem =
  | string
  | {
      str: string;
      x: number;
      y: number;
      width?: number;
    };

const pdfState = vi.hoisted(() => ({
  pages: [] as MockPdfItem[][],
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
          items: (pdfState.pages[pageNumber - 1] ?? []).map((item) =>
            typeof item === "string"
              ? { str: item }
              : {
                  str: item.str,
                  transform: [1, 0, 0, 1, item.x, item.y],
                  width: item.width ?? 80,
                }
          ),
        })),
      })),
    }),
  })),
}));

const makePdfFile = () =>
  new File(["pdf fixture"], "fixture.pdf", { type: "application/pdf" });

describe("detectProductFromPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("detects NEON from first page text", async () => {
    pdfState.pages = [
      [
        "ŽIVOTNÍ POJIŠTĚNÍ NEON",
        "Česká podnikatelská pojišťovna, a. s.",
      ],
    ];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "neon",
      confidence: "high",
    });
  });

  it("detects NEON RISK as the NEON product", async () => {
    pdfState.pages = [
      [
        "POJISTNÁ SMLOUVA",
        "RIZIKOVÉ POJIŠTĚNÍ NEON RISK",
        "Česká podnikatelská pojišťovna, a.s.",
      ],
    ];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "neon",
      confidence: "high",
    });
  });

  it("detects CPP BYTEX from contract text", async () => {
    pdfState.pages = [
      [
        "CPP BYTEX+",
        "Česká podnikatelská pojišťovna, a. s.",
      ],
    ];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "cppbytex",
      confidence: "high",
    });
  });

  it("detects DOMEX NEURON before the generic DOMEX signature", async () => {
    pdfState.pages = [
      [
        "DOMEX NEURON",
        "Česká podnikatelská pojišťovna, a.s.",
      ],
    ];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "domexneuron",
      confidence: "high",
    });
  });

  it("detects Kooperativa KOLUMBUS travel insurance anywhere in the PDF", async () => {
    pdfState.pages = [
      ["Průvodní strana", "Kooperativa pojišťovna, a.s."],
      ["Návrh pojistné smlouvy – Cestovní pojištění KOLUMBUS"],
    ];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "koopcestovko",
      confidence: "high",
    });
  });

  it("detects MAXDOMOV 3 from Maxima contract text", async () => {
    pdfState.pages = [["MAXIMA pojišťovna", "MAXDOMOV 3"]];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "maxdomov",
      confidence: "high",
      reason: "V PDF jsou nalezeny texty „MAXDOMOV 3“ a „MAXIMA“.",
    });
  });

  it("detects old MAXDOMOV 3 filled-form PDFs without static text labels", async () => {
    pdfState.pages = [
      [
        { str: "1009822272", x: 110.5, y: 755, width: 61.1 },
        { str: "František Pavelka", x: 28.3, y: 655.3, width: 79.4 },
      ],
      [],
      [],
      [
        { str: "15.10.2025", x: 92.1, y: 198, width: 50 },
        { str: "X", x: 135.4, y: 125.2, width: 6.7 },
        { str: "2 302", x: 541.4, y: 25.1, width: 25 },
      ],
      [{ str: "14.10.2025", x: 408, y: 117.8, width: 50 }],
    ];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "maxdomov",
      confidence: "high",
      reason:
        "PDF odpovídá staršímu formuláři MAXDOMOV 3 podle vyplněných polí.",
    });
  });

  it("supports last-page requirements for Slavia auto", async () => {
    pdfState.pages = [
      ["Povinné ručení"],
      ["Mezistrana bez rozhodujících textů"],
      ["Slavia pojišťovna"],
    ];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toMatchObject({
      product: "slaviaauto",
      confidence: "high",
    });
  });

  it("does not match whole-word AUTO inside a longer token", async () => {
    pdfState.pages = [["ALLIANZ", "AUTOBUS"]];

    await expect(detectProductFromPdf(makePdfFile())).resolves.toBeNull();
  });
});
