import { describe, expect, it } from "vitest";

import { extractTerminationPolicyholderFromLines } from "./parseTerminationPolicyholderPdf";

describe("extractTerminationPolicyholderFromLines", () => {
  it("načte identifikační a kontaktní údaje fyzické osoby", () => {
    expect(
      extractTerminationPolicyholderFromLines([
        "Pojistník",
        "Jméno a příjmení",
        "Jaroslav Černý",
        "Rodné číslo",
        "850101/1234",
        "Trvalý pobyt",
        "Dlouhá 125, 430 01 Chomutov",
        "Telefon",
        "+420 777 123 456",
        "E-mail",
        "jaroslav.cerny@example.cz",
      ]),
    ).toEqual({
      policyholderName: "Jaroslav Černý",
      personalId: "850101/1234",
      address: "Dlouhá 125, 430 01 Chomutov",
      phone: "+420 777 123 456",
      email: "jaroslav.cerny@example.cz",
    });
  });

  it("načte název a IČO právnické osoby", () => {
    const result = extractTerminationPolicyholderFromLines([
      "Pojistník",
      "Obchodní firma",
      "Ukázková firma s.r.o.",
      "IČO",
      "12345678",
      "Sídlo",
      "Vinohradská 10, 120 00 Praha 2",
      "Mobil: 602 111 222",
      "E-mail: firma@example.cz",
    ]);

    expect(result).toMatchObject({
      policyholderName: "Ukázková firma s.r.o.",
      personalId: "12345678",
      address: "Vinohradská 10, 120 00 Praha 2",
      phone: "602 111 222",
      email: "firma@example.cz",
    });
  });

  it("načte rodné číslo nebo IČO ze společného pole UNIQA", () => {
    expect(
      extractTerminationPolicyholderFromLines([
        "Pojistník",
        "Jméno a příjmení / Obchodní firma",
        "Petr Novák",
        "RČ / IČO",
        "900101/1234",
      ]),
    ).toMatchObject({ personalId: "900101/1234" });

    expect(
      extractTerminationPolicyholderFromLines([
        "Pojistník",
        "Obchodní firma",
        "Ukázková firma s.r.o.",
        "Rodné číslo / IČO: 12345678",
      ]),
    ).toMatchObject({ personalId: "12345678" });
  });

  it("nepovažuje popisek Titul před za jméno pojistníka", () => {
    const result = extractTerminationPolicyholderFromLines([
      "Pojistník",
      "Jméno a příjmení",
      "Titul před:",
      "Jméno:",
      "Martin",
      "Příjmení:",
      "Tamáš",
    ]);

    expect(result.policyholderName).not.toBe("Titul před:");
  });
});
