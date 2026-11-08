import { describe, expect, it } from "vitest";
import { parseKoopMajetekObcanPages } from "./parseKoopMajetekObcanPdf";

const basePages = [
  [
    "Kooperativa pojišťovna",
    "Pojištění majetku a odpovědnosti",
    "Číslo smlouvy 1234567890",
    "Pojistník",
    "Jméno Jana Testovací",
    "Co je pojištěno Varianta pojištění Spoluúčast Pojistná částka / Limit plnění",
    "Trvale obývaná domácnost KOMFORT 1 000 Kč 2 000 000 Kč",
    "Stavební součásti KOMFORT 1 000 Kč 500 000 Kč",
    "Asistence k bydlení IDEÁL 0 Kč",
    "Odpovědnost v běžném občanském životě --- 0 Kč 20 000 000 Kč",
    "Celkové roční pojistné po slevě 2 400 Kč",
  ],
  [
    "Na jak dlouho pojištění sjednáváme",
    "Počátek pojištění 9. 4. 2026",
    "Pojistné období roční",
    "Pojistné za první pojistné období 2 400 Kč",
    "Celkové roční pojistné po slevě 2 400 Kč",
    "Částka k úhradě 2 400 Kč",
    "Číslo účtu 19-2000145399/0800",
    "Variabilní symbol 1234567890",
    "Datum splatnosti 9. 4. 2026",
  ],
  ["Touto smlouvou nahrazujeme Vaši předchozí smlouvu č. 0987654321"],
  ["Datum uzavření smlouvy 7. 4. 2026"],
];

describe("parseKoopMajetekObcanPages", () => {
  it("reads the requested policy fields and original contract number", () => {
    expect(parseKoopMajetekObcanPages(basePages)).toEqual({
      contractNumber: "1234567890",
      clientName: "Jana Testovací",
      policyStartDate: "2026-04-09",
      contractSignedDate: "2026-04-07",
      insuredItems: ["Trvale obývaná domácnost", "Stavební součásti", "Asistence k bydlení", "Odpovědnost v běžném občanském životě"],
      insuredCoverages: [
        { name: "Trvale obývaná domácnost", variant: "KOMFORT", deductible: 1000, sumInsured: 2000000 },
        { name: "Stavební součásti", variant: "KOMFORT", deductible: 1000, sumInsured: 500000 },
        { name: "Asistence k bydlení", variant: "IDEÁL", deductible: 0, sumInsured: null },
        { name: "Odpovědnost v běžném občanském životě", variant: null, deductible: 0, sumInsured: 20000000 },
      ],
      amount: 2400,
      annualPremium: 2400,
      frequency: "annual",
      paymentDetails: {
        amount: 2400,
        accountNumber: "19-2000145399/0800",
        variableSymbol: "1234567890",
        dueDate: "2026-04-09",
      },
      isRefresh: true,
      refreshOriginalContractNumber: "0987654321",
    });
  });

  it.each([
    ["Pojistné období 1 měsíc", "monthly"],
    ["Pojistné období 3 měsíce", "quarterly"],
    ["Pojistné období 6 měsíců", "semiannual"],
    ["Pojistné období pololetní", "semiannual"],
    ["Pojistné období roční", "annual"],
  ] as const)("normalizes %s to %s", (period, frequency) => {
    expect(parseKoopMajetekObcanPages([[period]]).frequency).toBe(frequency);
  });

  it("does not mark an ordinary policy as a replacement", () => {
    const result = parseKoopMajetekObcanPages([["Číslo smlouvy 1234567890"]]);
    expect(result.isRefresh).toBeUndefined();
    expect(result.refreshOriginalContractNumber).toBeUndefined();
  });

  it("warns when installment frequency and annual premium conflict", () => {
    const result = parseKoopMajetekObcanPages([[
      "Pojistné období 6 měsíců",
      "Pojistné za první pojistné období 2 006 Kč",
      "Celkové roční pojistné po slevě 2 006 Kč",
    ]]);
    expect(result).toMatchObject({ frequency: "semiannual", amount: 2006, annualPremium: 2006 });
    expect(result.pdfImportWarnings).toHaveLength(1);
  });
});
