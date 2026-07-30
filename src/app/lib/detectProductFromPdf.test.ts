import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectProductFromPdf } from "./detectProductFromPdf";

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
