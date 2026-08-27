import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseSlaviaAutoPdf } from "./parseSlaviaAutoPdf";

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
  new File(["pdf fixture"], "slavia-auto.pdf", { type: "application/pdf" });

describe("parseSlaviaAutoPdf", () => {
  beforeEach(() => {
    pdfState.pages = [];
  });

  it("reads selected Slavia coverages with limits and ignores boilerplate coverages", async () => {
    pdfState.pages = [
      [
        "Návrh pojistné smlouvy č.:",
        "3700857975",
        "Povinné ručení",
        "Limit plnění pro újmu na zdraví:",
        "150 000 000 Kč",
        "Varianta:",
        "Jubileum",
        "Limit plnění pro škodu na majetku a ušlý zisk:",
        "150 000 000 Kč",
        "Garance ceny na 3 roky:",
        "sjednáno",
        "Asistence",
        "sjednáno",
        "Varianta:",
        "XL",
        "Cena POV:",
        "2 814 Kč",
        "Doplňková pojištění",
        "Limit plnění",
        "Spoluúčast",
        "Úraz řidiče:",
        "sjednáno",
        "200 000 Kč trvalé následky",
        "100 000 Kč smrt úrazem",
        "Pojištění pneumatik:",
        "sjednáno",
        "10 000 Kč",
        "500 Kč",
        "Ztráta a odcizení klíčů od vozidla:",
        "sjednáno",
        "7 500 Kč (pro ztrátu 2 500 Kč)",
        "500 Kč",
        "Vandalismus:",
        "sjednáno",
        "30 000 Kč",
        "2 500 Kč",
        "Poškození kabelů vozidla zvířetem:",
        "sjednáno",
        "30 000 Kč",
        "500 Kč",
        "Cena za doplňková pojištění:",
        "0 Kč",
      ],
      [
        "Pro doplňková pojištění skel, živelní, střetu se zvířetem, odcizení, vandalismu, pneumatik se sjednává spoluúčast.",
      ],
    ];

    await expect(parseSlaviaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "3700857975",
      carLiabilityLimit: 150_000_000,
      carAssistancePlan: "XL",
      carAddonGlass: false,
      carAddonAnimalCollision: false,
      carAddonAnimalDamage: true,
      carAddonAnimalDamageLimit: 30_000,
      carAddonVandalism: true,
      carAddonKeyLossTheft: true,
      carSlaviaDetail: {
        liabilityVariant: "Jubileum",
        liabilityPropertyLimit: 150_000_000,
        priceGuarantee3Years: true,
        driverInjury: true,
        driverInjuryPermanentLimit: 200_000,
        driverInjuryDeathLimit: 100_000,
        tires: true,
        tiresLimit: 10_000,
        tiresDeductible: 500,
        keyLossTheftLimit: 7_500,
        keyLossLimit: 2_500,
        keyLossTheftDeductible: 500,
        vandalismLimit: 30_000,
        vandalismDeductible: 2_500,
        animalDamageDeductible: 500,
      },
    });
  });
});
