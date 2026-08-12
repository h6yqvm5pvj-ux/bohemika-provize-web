import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseAllianzAutoPdf } from "./parseAllianzAutoPdf";

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
});
