import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCppKomplexLines, parseCppKomplexPdf } from "./parseCppKomplexPdf";

const pdf = vi.hoisted(() => ({ pages: [] as string[][], destroy: vi.fn(), cleanup: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy: pdf.destroy,
    promise: Promise.resolve({
      get numPages() { return pdf.pages.length; },
      getPage: async (number: number) => ({
        cleanup: pdf.cleanup,
        getTextContent: async () => ({ items: pdf.pages[number - 1].map((str, index) => ({ str, transform: [1, 0, 0, 1, 30, 800 - index * 12] })) }),
      }),
    }),
  }),
}));

// Synthetic identity; layout follows the supplied SUS KOMPLEX sample.
const identity = [
  "*0012345678222000*", "Číslo pojistné smlouvy", "0012345678",
  "Nabídka pojistné smlouvy pro pojištění podnikatelů KOMPLEX",
  "Pojistitel:", "Česká podnikatelská pojišťovna, a.s., Vienna Insurance Group",
  "IČO:", "63998530", "Pojistník (shodný s pojištěným):", "Test servis s.r.o.",
  "Sídlo:", "Testovací 10, Praha", "IČO:", "00123456", "Jednající osoba:", "Jan Novák",
  "Článek I.", "Počátek pojištění:", "17.09.2026", "Konec pojištění:", "16.09.2027",
];
const premium = (frequency = "2 splátky (pololetní)", installment = "6 989 Kč") => [
  "Celkové pojistné za sjednané pojistné období (roční)", "20 801 Kč",
  "Celkové pojistné za sjednané pojistné období po obchodní slevě", "14 561 Kč",
  "Celkové pojistné za sjednané pojistné období po slevách", "13 978 Kč",
  "Frekvence plateb:", frequency, "První splátka pojistného:", installment,
  "V případě sjednání pololetních splátek a čtvrtletních splátek se pojistné hradí...",
];
const closing = ["DISTRIBUTOR POJIŠTĚNÍ", "Nabídka vytvořena dne: 16.09.2026 19:26", "IČO: 28506405"];
beforeEach(() => { pdf.pages = []; vi.clearAllMocks(); });

describe("ČPP KOMPLEX PDF", () => {
  it("reads the full multi-page PDF and releases its resources", async () => {
    pdf.pages = [identity, premium(), closing];
    await expect(parseCppKomplexPdf(new File(["fixture"], "komplex.pdf"))).resolves.toMatchObject({
      contractNumber: "0012345678", clientName: "Test servis s.r.o.", companyId: "00123456",
      contractSignedDate: "2026-09-16", policyStartDate: "2026-09-17", policyEndDate: "2027-09-16",
      annualPremium: 13978, amount: 6989, frequency: "semiannual",
    });
    expect(pdf.destroy).toHaveBeenCalledOnce();
    expect(pdf.cleanup).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["1 splátka (roční)", "13 978 Kč", "annual", 13978],
    ["2 splátky (pololetní)", "6 989 Kč", "semiannual", 6989],
    ["4 splátky (čtvrtletní)", "3 494,50 Kč", "quarterly", 3494.5],
    ["1 splátka", "13 978 Kč", "annual", 13978],
    ["2 splátky", "6 989 Kč", "semiannual", 6989],
    ["4 splátky", "3 494,50 Kč", "quarterly", 3494.5],
    ["roční", "13 978 Kč", "annual", 13978],
    ["pololetní", "6 989 Kč", "semiannual", 6989],
    ["čtvrtletní", "3 494,50 Kč", "quarterly", 3494.5],
  ])("reads %s as an installment, without using boilerplate frequencies", (label, money, frequency, amount) => {
    expect(parseCppKomplexLines([...identity, ...premium(label, money)])).toMatchObject({ frequency, amount, annualPremium: 13978 });
  });

  it("accepts inline labels, nonbreaking spaces and a plain Pojistník heading", () => {
    const lines = [
      "Česká podnikatelská pojišťovna KOMPLEX", "Číslo pojistné smlouvy: 0012345678",
      "Pojistník: Jana Nová IČO: 00 12 34 56", "Pojištěný: Jiná firma IČO: 99999999",
      "Počátek pojištění: 17. 9. 2026 Konec pojištění: 16. 9. 2027",
      "Celkové pojistné za sjednané pojistné období po slevách: 13\u00a0978 Kč",
      "Frekvence plateb: 2 splátky (pololetní) První splátka pojistného: 6\u202f989 Kč",
    ];
    expect(parseCppKomplexLines(lines)).toMatchObject({ clientName: "Jana Nová", companyId: "00123456", policyStartDate: "2026-09-17", policyEndDate: "2027-09-16", amount: 6989, frequency: "semiannual" });
  });

  it.each([["1 splátka", 13978], ["2 splátky", 6989], ["4 splátky", 3494.5]])("derives a missing installment for %s from the discounted annual total", (frequency, amount) => {
    expect(parseCppKomplexLines([...identity, ...premium(frequency, "neuvedeno")])).toMatchObject({ amount });
  });

  it.each(["2 splátky (čtvrtletní)", "3 splátky (roční)"])("does not guess when frequency is contradictory: %s", frequency => {
    const result = parseCppKomplexLines([...identity, ...premium(frequency)]);
    expect(result.frequency).toBeUndefined();
    expect(result.pdfImportWarnings?.[0]).toContain("Frekvence");
  });

  it("does not interpret the annual total as an installment without a known frequency", () => {
    const result = parseCppKomplexLines([...identity, ...premium("neuvedeno", "neuvedeno")]);
    expect(result.annualPremium).toBe(13978);
    expect(result.frequency).toBeUndefined();
    expect(result.amount).toBeUndefined();
  });

  it("warns about conflicting annual and installment amounts", () => {
    const result = parseCppKomplexLines([...identity, ...premium("2 splátky (pololetní)", "13 978 Kč")]);
    expect(result.pdfImportWarnings?.[0]).toContain("součet splátek");
  });

  it("never fills a missing policyholder IČO with the insurer or distributor IČO", () => {
    const result = parseCppKomplexLines([...identity.filter(line => line !== "00123456"), ...closing]);
    expect(result.companyId).toBeUndefined();
    expect(result.clientName).toBe("Test servis s.r.o.");
  });

  it("rejects different IČOs within the same policyholder section", () => {
    const lines = identity.map(line => line === "00123456" ? "00123456 IČO: 87654321" : line);
    expect(parseCppKomplexLines(lines).companyId).toBeUndefined();
  });

  it("does not invent a signing date from the coverage start or printing date", () => {
    expect(parseCppKomplexLines([...identity, "Tisk SUS Plus, 15.09.2026 12:00"]).contractSignedDate).toBeUndefined();
  });

  it("prefers explicit signing over offer creation and rejects invalid dates", () => {
    expect(parseCppKomplexLines([...identity, ...closing, "Datum sjednání: 15.09.2026"]).contractSignedDate).toBe("2026-09-15");
    expect(parseCppKomplexLines(identity.map(line => line === "17.09.2026" ? "31.02.2026" : line)).policyStartDate).toBeUndefined();
  });

  it.each(["Jiná pojišťovna KOMPLEX", "Česká podnikatelská pojišťovna Komplexní služby"])("ignores unrelated documents: %s", heading => {
    expect(parseCppKomplexLines([heading, ...premium()])).toEqual({});
  });
});
