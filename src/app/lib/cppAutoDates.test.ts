import { describe, expect, it } from "vitest";

import { resolveCppAutoDates } from "./cppAutoDates";

describe("resolveCppAutoDates", () => {
  it("reads explicit start and proposal dates with spaces and non-breaking spaces", () => {
    expect(resolveCppAutoDates([[
      "Počátek pojištění: 3. 11. 2026 00:00 hodin",
      "Návrh pojistné smlouvy vyhotoven dne: 2.\u00a011.\u00a02026",
    ]])).toEqual({
      policyStartDate: "2026-11-03",
      contractSignedDate: "2026-11-02",
      warnings: [],
    });
  });

  it.each(["vyhotoven", "předložen", "predlozen"])("accepts the explicit %s proposal label", (verb) => {
    expect(resolveCppAutoDates([[
      `Návrh pojistné smlouvy ${verb} dne: 3.11.2026`,
      "Tisk SUS Plus, 4.11.2026 12:30",
    ]])).toEqual({ policyStartDate: null, contractSignedDate: "2026-11-03", warnings: [] });
  });

  it("reads a separate date-only value on the same page", () => {
    expect(resolveCppAutoDates([[
      "Počátek pojištění:",
      "",
      "3. 11. 2026 00:00 hod.",
      "Návrh pojistné smlouvy předložen dne:",
      "2. 11. 2026",
    ]])).toEqual({ policyStartDate: "2026-11-03", contractSignedDate: "2026-11-02", warnings: [] });
  });

  it("uses Tisk SUS Plus only when there is no explicit proposal date", () => {
    expect(resolveCppAutoDates([[
      "Datum narození: 3.11.1990",
      "Tisk SUS Plus, 2. 11. 2026 12:30:00",
    ]])).toEqual({ policyStartDate: null, contractSignedDate: "2026-11-02", warnings: [] });
  });

  it("accepts repeated identical explicit values across pages", () => {
    expect(resolveCppAutoDates([
      ["Počátek pojištění: 3.11.2026", "Návrh pojistné smlouvy vyhotoven dne: 2.11.2026"],
      ["Počátek pojištění: 3. 11. 2026", "Návrh pojistné smlouvy předložen dne: 2.11.2026"],
    ])).toEqual({ policyStartDate: "2026-11-03", contractSignedDate: "2026-11-02", warnings: [] });
  });

  it.each([
    "Počátek pojištění nastává v nula hodin, pokud se strany nedohodnou jinak.",
    "Podmínky uvádějí počátek pojištění, který může být odlišný.",
    "Pro pozdější počátek pojištění se použije sjednané datum.",
  ])("does not treat policy wording as a missing date field: %s", wording => {
    expect(resolveCppAutoDates([
      ["Počátek pojištění: 3.11.2026 00:00 Konec pojištění: na dobu neurčitou"],
      [wording],
    ])).toEqual({ policyStartDate: "2026-11-03", contractSignedDate: null, warnings: [] });
    expect(resolveCppAutoDates([[wording]])).toEqual({ policyStartDate: null, contractSignedDate: null, warnings: [] });
  });

  it("accepts an explicit start date or a standalone label without a colon", () => {
    expect(resolveCppAutoDates([["Počátek pojištění 3.11.2026"]])).toEqual({
      policyStartDate: "2026-11-03", contractSignedDate: null, warnings: [],
    });
    expect(resolveCppAutoDates([["Počátek pojištění", "3.11.2026"]])).toEqual({
      policyStartDate: "2026-11-03", contractSignedDate: null, warnings: [],
    });
  });

  it("still rejects a genuinely unreadable duplicate start field", () => {
    expect(resolveCppAutoDates([
      ["Počátek pojištění: 3.11.2026"],
      ["Počátek pojištění: nečitelné"],
    ])).toEqual({ policyStartDate: null, contractSignedDate: null,
      warnings: ["ČPP Auto: Počátek pojištění obsahuje neplatné nebo neúplné datum."] });
  });

  it("returns null for conflicting explicit start dates", () => {
    const result = resolveCppAutoDates([[
      "Počátek pojištění: 3.11.2026",
      "Počátek pojištění: 4.11.2026",
      "Návrh pojistné smlouvy vyhotoven dne: 2.11.2026",
    ]]);
    expect(result).toMatchObject({ policyStartDate: null, contractSignedDate: "2026-11-02" });
    expect(result.warnings).toEqual(["ČPP Auto: Počátek pojištění má více rozdílných dat."]);
  });

  it("returns null for conflicting prepared dates without choosing a secondary source", () => {
    const result = resolveCppAutoDates([[
      "Návrh pojistné smlouvy vyhotoven dne: 2.11.2026",
      "Návrh pojistné smlouvy vyhotoven dne: 3.11.2026",
      "Návrh pojistné smlouvy předložen dne: 2.11.2026",
      "Tisk SUS Plus, 2.11.2026",
    ]]);
    expect(result.contractSignedDate).toBeNull();
    expect(result.warnings).toEqual(["ČPP Auto: Návrh pojistné smlouvy má více rozdílných dat."]);
  });

  it("always prefers vyhotoven over different předložen and footer dates", () => {
    expect(resolveCppAutoDates([[
      "Návrh pojistné smlouvy předložen dne: 3.11.2026",
      "Tisk SUS Plus, 4.11.2026",
      "Návrh pojistné smlouvy vyhotoven dne: 2.11.2026",
    ]])).toEqual({ policyStartDate: null, contractSignedDate: "2026-11-02", warnings: [] });
  });

  it.each(["", "31.2.2026"])("does not replace missing/invalid vyhotoven (%s) with předložen", (date) => {
    const result = resolveCppAutoDates([[
      `Návrh pojistné smlouvy vyhotoven dne: ${date}`,
      "Návrh pojistné smlouvy předložen dne: 3.11.2026",
      "Tisk SUS Plus, 4.11.2026",
    ]]);
    expect(result.contractSignedDate).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("reads exact labels wrapped across visual rows without crossing unrelated content", () => {
    expect(resolveCppAutoDates([[
      "Počátek",
      "pojištění: 3. 11. 2026",
      "Návrh pojistné smlouvy",
      "vyhotoven dne:",
      "2. 11. 2026",
    ]])).toEqual({ policyStartDate: "2026-11-03", contractSignedDate: "2026-11-02", warnings: [] });
    expect(resolveCppAutoDates([[
      "Počátek",
      "POJISTNÍK",
      "pojištění: 3.11.2026",
      "Návrh pojistné smlouvy",
      "POJISTNÍK",
      "vyhotoven dne: 2.11.2026",
    ]])).toEqual({ policyStartDate: null, contractSignedDate: null, warnings: [] });
    expect(resolveCppAutoDates([
      ["Návrh pojistné smlouvy"],
      ["vyhotoven dne: 2.11.2026"],
    ])).toEqual({ policyStartDate: null, contractSignedDate: null, warnings: [] });
  });

  it("also detects conflicting repeated labels on one line", () => {
    const result = resolveCppAutoDates([[
      "Počátek pojištění: 3.11.2026 Počátek pojištění: 4.11.2026",
    ]]);
    expect(result.policyStartDate).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("returns null for conflicting print dates when the footer is the only source", () => {
    const result = resolveCppAutoDates([
      ["Tisk SUS Plus, 2.11.2026"],
      ["Tisk SUS Plus, 3.11.2026"],
    ]);
    expect(result.contractSignedDate).toBeNull();
    expect(result.warnings).toEqual(["ČPP Auto: Tisk SUS Plus má více rozdílných dat."]);
  });

  it.each(["31. 2. 2026", "29.2.2026", "31.4.2026", "0.11.2026", "3.13.2026", "3.11.0000", "3.11.20260"])(
    "rejects invalid calendar date %s and blocks the footer fallback",
    (date) => {
      const result = resolveCppAutoDates([[
        `Počátek pojištění: ${date}`,
        `Návrh pojistné smlouvy vyhotoven dne: ${date}`,
        "Tisk SUS Plus, 2.11.2026",
      ]]);
      expect(result.policyStartDate).toBeNull();
      expect(result.contractSignedDate).toBeNull();
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.join(" ")).not.toContain(date);
    },
  );

  it("validates leap years without rolling the date into March", () => {
    expect(resolveCppAutoDates([[
      "Počátek pojištění: 29.2.2028",
      "Návrh pojistné smlouvy vyhotoven dne: 29.2.2000",
    ]])).toEqual({ policyStartDate: "2028-02-29", contractSignedDate: "2000-02-29", warnings: [] });
    expect(resolveCppAutoDates([["Počátek pojištění: 29.2.2100"]]).policyStartDate).toBeNull();
  });

  it("does not ignore an invalid duplicate when another explicit value is valid", () => {
    const result = resolveCppAutoDates([[
      "Návrh pojistné smlouvy vyhotoven dne: 31.2.2026",
      "Návrh pojistné smlouvy vyhotoven dne: 2.11.2026",
      "Tisk SUS Plus, 2.11.2026",
    ]]);
    expect(result.contractSignedDate).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("does not borrow the next field's date or scan past a section heading", () => {
    const result = resolveCppAutoDates([[
      "Počátek pojištění:",
      "Konec pojištění: 3.11.2027",
      "Návrh pojistné smlouvy vyhotoven dne:",
      "POJISTNÍK",
      "3.11.2026",
      "Tisk SUS Plus, 2.11.2026",
    ]]);
    expect(result.policyStartDate).toBeNull();
    expect(result.contractSignedDate).toBeNull();
    expect(result.warnings).toHaveLength(2);
  });

  it("does not borrow an unrelated inline label's value", () => {
    const result = resolveCppAutoDates([[
      "Počátek pojištění: Konec pojištění: 3.11.2027",
      "Návrh pojistné smlouvy vyhotoven dne: Tisk SUS Plus, 2.11.2026",
    ]]);
    expect(result.policyStartDate).toBeNull();
    expect(result.contractSignedDate).toBeNull();
    expect(result.warnings).toHaveLength(2);
  });

  it("does not borrow a value across a page boundary", () => {
    const result = resolveCppAutoDates([
      ["Počátek pojištění:", "Návrh pojistné smlouvy předložen dne:"],
      ["3.11.2026", "Tisk SUS Plus, 2.11.2026"],
    ]);
    expect(result.policyStartDate).toBeNull();
    expect(result.contractSignedDate).toBeNull();
    expect(result.warnings).toHaveLength(2);
  });

  it("does not infer a date from unrelated labels or unlabelled text", () => {
    const pages = [[
      "Pojistná smlouva uzavřena dne: 3.11.2026",
      "Datum narození: 1.1.1990",
      "3.11.2026",
    ]] as const;
    expect(resolveCppAutoDates(pages)).toEqual({ policyStartDate: null, contractSignedDate: null, warnings: [] });
    expect(pages[0][0]).toBe("Pojistná smlouva uzavřena dne: 3.11.2026");
  });

  it("ignores an invalid footer if an authoritative proposal date is valid", () => {
    expect(resolveCppAutoDates([[
      "Návrh pojistné smlouvy předložen dne: 2.11.2026",
      "Tisk SUS Plus, 31.2.2026",
    ]])).toEqual({ policyStartDate: null, contractSignedDate: "2026-11-02", warnings: [] });
  });
});
