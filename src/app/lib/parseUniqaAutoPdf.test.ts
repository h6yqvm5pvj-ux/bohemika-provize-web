import { describe, expect, it } from "vitest";

import { extractUniqaPolicyholderPersonalId } from "./parseUniqaAutoPdf";

describe("extractUniqaPolicyholderPersonalId", () => {
  it("načte rodné číslo pouze ze sekce Pojistník", () => {
    expect(
      extractUniqaPolicyholderPersonalId([
        "POJISTNÍK (VY)",
        "Jméno a příjmení: Testovací Klient RČ: 900101/1234",
        "POJIŠTĚNÝ ŘIDIČ",
        "Jméno a příjmení: Jiná Osoba RČ: 850101/4321",
      ]),
    ).toBe("900101/1234");
  });

  it("načte IČO, pokud je pojistníkem firma", () => {
    expect(
      extractUniqaPolicyholderPersonalId([
        "POJISTNÍK (VY)",
        "Obchodní firma: Testovací firma s.r.o. IČ: 12345678",
      ]),
    ).toBe("12345678");
  });

  it("nepoužije rodné číslo z jiné sekce", () => {
    expect(
      extractUniqaPolicyholderPersonalId([
        "POJISTNÍK (VY)",
        "Jméno a příjmení: Testovací Klient",
        "Adresa: Testovací 1",
        "POJIŠTĚNÝ ŘIDIČ",
        "RČ: 850101/4321",
      ]),
    ).toBeNull();
  });
});
