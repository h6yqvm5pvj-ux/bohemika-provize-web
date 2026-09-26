import { describe, expect, it } from "vitest";
import { buildContractReviewWarnings } from "./contractReview";
import { createClientNameIndex, matchClientName } from "./clientNameMatching";
import type { PaymentFrequency, Product } from "../types/domain";

const valid = {
  product: "flexi" as const, clientName: "Jan Novák", contractNumber: "1400000001",
  amount: 704, frequency: "monthly" as const,
};

describe("contract review warnings", () => {
  it("accepts ordinary data, whitespace in the contract number, titles and international names", () => {
    for (const clientName of ["Jan Novák", "Ing. Jan Novák, Ph.D.", "Anna-Marie Dvořáková", "José O’Neill", "Ngô Văn An"]) {
      expect(buildContractReviewWarnings({ ...valid, clientName, contractNumber: "140 000 0001" })).toEqual([]);
    }
  });

  it.each(["123", "123456789012345", "140O000001", "0000000000", "1111111111"])("flags a suspicious contract number: %s", (contractNumber) => {
    expect(buildContractReviewWarnings({ ...valid, contractNumber })[0]).toContain("Číslo smlouvy");
  });

  it("also checks the original contract number", () => {
    expect(buildContractReviewWarnings({ ...valid, originalContractNumber: "123" })[0]).toContain("Číslo původní smlouvy");
  });

  it("flags the CPP Auto number from the screenshot alongside the high-premium warning", () => {
    const warnings = buildContractReviewWarnings({ ...valid, product: "cppAuto", contractNumber: "123456789", amount: 112_000, frequency: "annual" });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("123456789");
    expect(warnings[0]).toContain("ČPP Auto");
    expect(warnings[0]).toContain("10 číslicemi");
    expect(warnings[0]).toContain("32, 31, 37, 38");
    expect(warnings[1]).toContain("112.000 Kč ročně");
  });

  it.each(["1234567890", "4271000001", "327100001", "32710000001"])("checks both CPP Auto prefix and length: %s", (contractNumber) => {
    expect(buildContractReviewWarnings({ ...valid, product: "cppAuto", contractNumber }).join(" ")).toContain("ČPP Auto");
  });

  it.each(["3271000001", "3251000001", "3101000001", "3701000001", "3811000001", "327 100 0001"])("accepts observed CPP Auto series: %s", (contractNumber) => {
    expect(buildContractReviewWarnings({ ...valid, product: "cppAuto", contractNumber })).toEqual([]);
  });

  it("checks the original CPP Auto contract too, without leaking its pattern into other products", () => {
    const warnings = buildContractReviewWarnings({ ...valid, product: "cppAuto", contractNumber: "3271000001", originalContractNumber: "4271000001" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Číslo původní smlouvy");
    expect(buildContractReviewWarnings({ ...valid, product: "neon", contractNumber: "7500000001" })).toEqual([]);
    expect(buildContractReviewWarnings(valid)).toEqual([]);
  });

  it.each(["7500000001", "750 000 0001"])("accepts the usual NEON number: %s", (contractNumber) => {
    expect(buildContractReviewWarnings({ ...valid, product: "neon", contractNumber })).toEqual([]);
  });

  it.each(["123456789", "3271000001", "7510000001", "7310000001", "750000001", "75000000001"])("flags an unusual NEON prefix or length: %s", (contractNumber) => {
    const warnings = buildContractReviewWarnings({ ...valid, product: "neon", contractNumber });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("NEON");
    expect(warnings[0]).toContain("10 číslicemi a začátkem 750");
  });

  it("checks original NEON numbers in a refresh as reviewable exceptions", () => {
    expect(buildContractReviewWarnings({ ...valid, product: "neon", contractNumber: "7500000001", originalContractNumber: "7500000002" })).toEqual([]);
    const warnings = buildContractReviewWarnings({ ...valid, product: "neon", contractNumber: "7500000001", originalContractNumber: "7310000001" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Číslo původní smlouvy");
  });

  it.each<[Product, string]>([
    ["flexi", "1420000001"], ["flexi", "1430000001"],
    ["domex", "0010000001"], ["domex", "0020000001"], ["domex", "0030000001"],
    ["cppsimplex", "0020000001"], ["cppsimplex", "0030000001"], ["zamex", "0030000001"],
    ["kooperativaAuto", "6350000001"], ["kooperativaAuto", "6480000001"],
    ["allianzAuto", "710000001"], ["allianzAuto", "810000001"],
    ["csobAuto", "3700000001"], ["csobAuto", "6190000001"], ["csobAuto", "6200000001"],
    ["uniqaAuto", "5500000001"], ["uniqaAuto", "5520000001"],
    ["slaviaauto", "3700000001"], ["koopodzam", "3950000001"],
    ["cppcestovko", "1800000001"], ["cppcestovko", "1810000001"],
    ["axacestovko", "9400000001"], ["koopcestovko", "5050000001"],
  ])("accepts a documented series for %s: %s", (product, contractNumber) => {
    expect(buildContractReviewWarnings({ ...valid, product, contractNumber })).toEqual([]);
  });

  it.each<[Product, string]>([
    ["flexi", "6480000001"], ["domex", "7500000001"], ["cppsimplex", "3271000001"],
    ["zamex", "3950000001"], ["kooperativaAuto", "3271000001"],
    ["allianzAuto", "123456789"], ["allianzAuto", "8100000001"],
    ["csobAuto", "6480000001"], ["uniqaAuto", "6190000001"],
    ["slaviaauto", "3271000001"], ["koopodzam", "5050000001"],
    ["cppcestovko", "3271000001"], ["axacestovko", "0410000001"], ["koopcestovko", "3950000001"],
  ])("warns about a number from another series or an incorrect length for %s: %s", (product, contractNumber) => {
    const warnings = buildContractReviewWarnings({ ...valid, product, contractNumber });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Číslo smlouvy");
    expect(warnings[0]).toContain("začátkem");
  });

  it("preserves leading zeroes, tolerates spacing and flags truncated or concatenated numbers", () => {
    expect(buildContractReviewWarnings({ ...valid, product: "domex", contractNumber: "003 000 0001" })).toEqual([]);
    for (const contractNumber of ["30000001", "00300000010030000002"]) {
      expect(buildContractReviewWarnings({ ...valid, product: "domex", contractNumber }).join(" ")).toContain("10 číslicemi a začátkem 00");
    }
  });

  it("accepts the older FLEXI original number from the renovation PDF without treating it as a new-contract series", () => {
    expect(buildContractReviewWarnings({ ...valid, originalContractNumber: "4800000002" })).toEqual([]);
    expect(buildContractReviewWarnings({ ...valid, contractNumber: "4800000002" })).toHaveLength(1);
    const warnings = buildContractReviewWarnings({ ...valid, originalContractNumber: "3271000001" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Číslo původní smlouvy");
    expect(warnings[0]).toContain("začátkem 14, 48");
  });

  it.each<Product>(["pillowAuto", "comfortcc", "conseqzenit", "maxdomov", "cpphafan", "cppPPRbez", "cppPPRs", "cppbytex", "koopflotila", "uniqaflotila", "slaviaflotila"])(
    "keeps only generic number checks when %s has insufficient or inconsistent evidence", (product) => {
      expect(buildContractReviewWarnings({ ...valid, product, contractNumber: "123456789" })).toEqual([]);
      expect(buildContractReviewWarnings({ ...valid, product, contractNumber: "123" })).toHaveLength(1);
    }
  );

  it.each(["Novák", "Ing. Novák", "Jan Novák 123", "jan@example.cz", "???"])("flags incomplete or malformed names: %s", (clientName) => {
    expect(buildContractReviewWarnings({ ...valid, clientName }).join(" ")).toContain("Jméno klienta");
  });

  it("does not mistake a company name with numbers for a personal-name typo", () => {
    expect(buildContractReviewWarnings({ ...valid, product: "cppPPRbez", clientName: "Studio 123 s.r.o." })).toEqual([]);
  });

  it("warns about a possible typo against the client directory but accepts a matching full name", () => {
    const index = createClientNameIndex(["Jan Buček", "Jan Bůček"]);
    const clientName = "Jan Bučekk";
    expect(buildContractReviewWarnings({ ...valid, clientName, clientNameMatches: matchClientName(clientName, index) }).join(" ")).toContain("Jan Buček");
    expect(buildContractReviewWarnings({ ...valid, clientName: "Buček Jan", clientNameMatches: matchClientName("Buček Jan", index) })).toEqual([]);
  });

  it("checks life and pension monthly amounts against the review threshold", () => {
    for (const product of ["flexi", "neon", "conseqzenit"] as const) {
      const contractNumber = product === "neon" ? "7500000001" : valid.contractNumber;
      expect(buildContractReviewWarnings({ ...valid, product, contractNumber, amount: 10_000 })).toEqual([]);
      expect(buildContractReviewWarnings({ ...valid, product, contractNumber, amount: 10_001 }).join(" ")).toContain("měsíčně");
    }
  });

  it.each<[PaymentFrequency, number]>([["monthly", 9_000], ["quarterly", 27_000], ["semiannual", 54_000], ["annual", 108_000]])(
    "compares the annual premium consistently for %s payments", (frequency, amount) => {
      const warnings = buildContractReviewWarnings({ ...valid, product: "cppAuto", contractNumber: "3271000001", frequency, amount });
      expect(warnings.join(" ")).toContain("108.000 Kč ročně");
    }
  );

  it("does not flag ordinary annual premiums as if they were monthly", () => {
    expect(buildContractReviewWarnings({ ...valid, product: "domex", contractNumber: "0030000001", frequency: "annual", amount: 30_000 })).toEqual([]);
  });

  it("uses higher annual limits for corporate and fleet policies", () => {
    for (const product of ["cppPPRbez", "koopflotila", "cppbytex"] as const) {
      expect(buildContractReviewWarnings({ ...valid, product, frequency: "annual", amount: 500_000 })).toEqual([]);
      expect(buildContractReviewWarnings({ ...valid, product, frequency: "annual", amount: 1_100_000 }).join(" ")).toContain("ročně");
    }
  });

  it("checks travel cover as a whole contract and does not treat investment fees as insurance premiums", () => {
    expect(buildContractReviewWarnings({ ...valid, product: "cppcestovko", contractNumber: "1800000001", amount: 20_000 })).toEqual([]);
    expect(buildContractReviewWarnings({ ...valid, product: "cppcestovko", contractNumber: "1800000001", amount: 31_000 }).join(" ")).toContain("za smlouvu");
    expect(buildContractReviewWarnings({ ...valid, product: "maxcizinkomplex", amount: 90_000 })).toEqual([]);
    expect(buildContractReviewWarnings({ ...valid, product: "comfortcc", amount: 2_000_000 })).toEqual([]);
  });
});
