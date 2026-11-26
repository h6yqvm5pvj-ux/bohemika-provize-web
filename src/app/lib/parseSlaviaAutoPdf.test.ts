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

  it("reads payment instructions, installment frequency and preserves the account prefix", async () => {
    pdfState.pages = [[
      "Návrh pojistné smlouvy č.:", "3700857975",
      "Platební instrukce",
      "Číslo účtu:", "000019-6017530267/0100",
      "Variabilní symbol:", "3700857975",
      "Výše splátky:", "2 814 Kč",
      "Frekvence placení:", "1 x ročně",
    ]];
    await expect(parseSlaviaAutoPdf(makePdfFile())).resolves.toMatchObject({
      contractNumber: "3700857975",
      frequency: "annual",
      amount: 2814,
      paymentDetails: {
        amount: 2814,
        accountNumber: "000019-6017530267/0100",
        variableSymbol: "3700857975",
        dueDate: null,
      },
    });
  });

  it("extracts a birth number only from the policyholder section", async () => {
    pdfState.pages = [[
      "Pojistník:", "Rodné číslo:", "900101/1234", "Jméno a příjmení:", "Jana Testovací",
      "Pojištěný řidič:", "Rodné číslo:", "850101/4321",
    ]];
    await expect(parseSlaviaAutoPdf(makePdfFile())).resolves.toMatchObject({
      personalId: "900101/1234",
      personalIdType: "birthNumber",
    });
  });

  it("uses the policyholder company ID when no birth number is present", async () => {
    pdfState.pages = [["Pojistník:", "IČO:", "01234567", "Pojištěný řidič:", "RČ:", "900101/1234"]];
    await expect(parseSlaviaAutoPdf(makePdfFile())).resolves.toMatchObject({
      personalId: "01234567",
      personalIdType: "companyId",
    });
  });
});
