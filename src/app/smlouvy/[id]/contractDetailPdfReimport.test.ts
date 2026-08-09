import { describe, expect, it } from "vitest";

import type { ContractDoc } from "./contractDetailTypes";
import {
  mergeEmptyContractFields,
  mergeEmptyNeonDetailFields,
  mergeEmptyPropertyDetailFields,
  PDF_REIMPORT_PARSERS,
} from "./contractDetailPdfReimport";

describe("PDF reimport detailu smlouvy", () => {
  it("doplní pouze prázdná pole smlouvy a normalizuje číselné hodnoty", () => {
    const contract = {
      id: "contract-1",
      contractNumber: "",
      clientName: "Již vyplněný klient",
      durationYears: null,
      carAddonGlass: false,
    } as ContractDoc;

    const result = mergeEmptyContractFields(contract, {
      contractNumber: "123456789",
      clientName: "Jméno z PDF se nesmí přepsat",
      durationYears: "24",
      carAddonGlass: true,
    });

    expect(result).toEqual({
      updates: {
        contractNumber: "123456789",
        durationYears: 24,
      },
      appliedCount: 2,
    });
  });

  it("zachová vyplněné majetkové údaje a doplní zbytek z PDF", () => {
    const result = mergeEmptyPropertyDetailFields(
      { address: "Již uložená adresa", sumInsured: null },
      {
        domexAddress: "Adresa z PDF se nesmí přepsat",
        domexPropertySumInsured: "1 000 000",
        domexLiabilityMobile: true,
      }
    );

    expect(result).toEqual({
      detail: {
        address: "Již uložená adresa",
        sumInsured: 1_000_000,
        liabilityMobile: true,
      },
      appliedCount: 2,
    });
  });

  it("doplní rizika NEONu, ale nepřepíše dříve uloženou variantu", () => {
    const result = mergeEmptyNeonDetailFields(
      { version: "Varianta uložená poradcem" },
      {
        version: "Varianta z PDF se nesmí přepsat",
        deathAmount: "100 000",
        waiverInvalidity: true,
      }
    );

    expect(result).toEqual({
      detail: {
        version: "Varianta uložená poradcem",
        deathAmount: 100_000,
        waiverInvalidity: true,
      },
      appliedCount: 2,
    });
  });

  it("drží parsery dostupné pro všechny podporované produkty detailu", () => {
    expect(PDF_REIMPORT_PARSERS.cppAuto).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.domex).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.neon).toBeTypeOf("function");
    expect(PDF_REIMPORT_PARSERS.maxdomov).toBeTypeOf("function");
  });
});
