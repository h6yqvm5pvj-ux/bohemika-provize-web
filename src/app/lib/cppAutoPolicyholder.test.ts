import { describe, expect, it } from "vitest";
import {
  resolveCppAutoPolicyholder,
  extractCppAutoPolicyholderLines,
  type CppAutoPolicyholderLine,
  type CppAutoPolicyholderPage,
} from "./cppAutoPolicyholder";

type Part = readonly [str: string, x: number, width?: number];
const row = (y: number, ...parts: Part[]): CppAutoPolicyholderLine => ({
  text: parts.map(([str]) => str).join(" "),
  items: parts.map(([str, x, width]) => ({ str, x, y, width: width ?? str.length * 4 })),
});
const text = (value: string): CppAutoPolicyholderLine => ({ text: value, items: [] });
const nameRow = (y: number, first = "Adam", last = "Novotný"): CppAutoPolicyholderLine => row(y,
  ["Titul před:", 45, 35], ["Jméno:", 147, 26], [first, 175, 50],
  ["Příjmení:", 275, 32], [last, 310, 60], ["Titul za:", 460, 28]);
const physical = (first = "Adam", last = "Novotný"): CppAutoPolicyholderPage => [
  row(600, ["POJISTNÍK", 45]), nameRow(580, first, last),
  row(560, ["Rodné číslo:", 45, 45], ["900101/1234", 118]),
];

describe("resolveCppAutoPolicyholder", () => {
  it("reads both name parts and the labelled birth number inside the policyholder box", () => {
    expect(resolveCppAutoPolicyholder([physical()])).toEqual({
      clientName: "Adam Novotný", personalId: "900101/1234", warnings: [],
    });
  });

  it("preserves the supported Přijmení label typo and diacritics", () => {
    expect(resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Jméno:", 45, 26], ["Martin", 75], ["Přijmení:", 150, 35], ["Tamáš", 190]),
    ]]).clientName).toBe("Martin Tamáš");
  });

  it("never uses an adviser or vehicle operator appearing before the policyholder", () => {
    const page = [row(720, ["POJIŠŤOVACÍ ZPROSTŘEDKOVATEL", 45]), nameRow(700, "Petr", "Poradce"),
      row(660, ["PROVOZOVATEL", 45]), nameRow(640, "Pavel", "Provozní"), ...physical()];
    expect(resolveCppAutoPolicyholder([page]).clientName).toBe("Adam Novotný");
  });

  it.each(["PROVOZOVATEL", "VLASTNÍK", "POJIŠTĚNÝ", "ZPROSTŘEDKOVATEL", "JEDNAJÍCÍ OSOBA", "KONTAKTNÍ OSOBA", "ZÁSTUPCE", "ÚDAJE O VOZIDLE"])("does not borrow missing identity from %s", (role) => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Rodné číslo:", 45, 45], ["900101/1234", 118]),
      row(560, [role, 45]), nameRow(540, "Petr", "Cizí"),
      row(520, ["Rodné číslo:", 45, 45], ["800101/4321", 118]),
    ]]);
    expect(result.clientName).toBeNull();
    expect(result.personalId).toBe("900101/1234");
    expect(result.warnings).toHaveLength(1);
  });

  it.each(["Jméno:", "Příjmení:"])("requires the other physical name part when only %s is present", (label) => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]), row(580, [label, 45, 40], ["Novotný", 90]),
    ]]);
    expect(result.clientName).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("prefers the company name and IČ over the company's representative", () => {
    expect(resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Název:", 45, 25], ["Modrá Brána s.r.o.", 84, 100], ["Plátce DPH:", 435, 44], ["ANO", 481]),
      row(560, ["IČ:", 45, 10], ["12 34 56 78", 84]),
      nameRow(540, "Petr", "Jednatel"),
      row(520, ["Rodné číslo:", 45, 45], ["800101/4321", 118]),
    ]])).toEqual({ clientName: "Modrá Brána s.r.o.", personalId: "12345678", warnings: [] });
  });

  it("keeps company priority even when its name is empty", () => {
    const result = resolveCppAutoPolicyholder([[
      text("POJISTNÍK"), text("Název:"), text("IČ: 12345678"),
      text("Jméno: Petr Příjmení: Jednatel"), text("Rodné číslo: 800101/4321"),
    ]]);
    expect(result.clientName).toBeNull();
    expect(result.personalId).toBe("12345678");
  });

  it.each(["neuvedeno", "nevyplněno", "neznámé", "---"])("does not accept a company placeholder %s", (value) => {
    const result = resolveCppAutoPolicyholder([[text("POJISTNÍK"), text(`Název: ${value}`), text("IČ: 12345678")]]);
    expect(result.clientName).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("does not replace an unreadable company IČ with the representative's birth number", () => {
    const result = resolveCppAutoPolicyholder([[text("POJISTNÍK"), text("Název: Modrá Brána s.r.o."),
      text("IČ: nečitelné"), text("Rodné číslo: 800101/4321")]]);
    expect(result.clientName).toBe("Modrá Brána s.r.o.");
    expect(result.personalId).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("does not use a DIČ as IČ", () => {
    const result = resolveCppAutoPolicyholder([[text("POJISTNÍK"), text("Název: Modrá Brána s.r.o."), text("DIČ: CZ12345678")]]);
    expect(result.personalId).toBeNull();
  });

  it.each(["9001011234", "900101 / 1234", "900101 / 123"])("normalizes a labelled birth number %s", (id) => {
    expect(resolveCppAutoPolicyholder([[text("POJISTNÍK"), text(`Rodné číslo: ${id}`)]]).personalId).toBe(id.replace(/\s|\//g, "").replace(/^(\d{6})/, "$1/"));
  });

  it("clips side-by-side operator and policyholder columns", () => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["PROVOZOVATEL", 45, 80], ["POJISTNÍK", 300, 45]),
      row(580, ["Jméno:", 45, 26], ["Petr", 75, 30], ["Příjmení:", 140, 35], ["Cizí", 180, 30],
        ["Jméno:", 300, 26], ["Adam", 330, 30], ["Příjmení:", 400, 35], ["Novotný", 440, 50]),
      row(560, ["Rodné číslo:", 45, 45], ["800101/4321", 95, 55], ["Rodné číslo:", 300, 45], ["900101/1234", 350, 55]),
    ]]);
    expect(result).toEqual({ clientName: "Adam Novotný", personalId: "900101/1234", warnings: [] });
  });

  it("does not use an owner in the right column to complete the policyholder in the left", () => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45, 45], ["VLASTNÍK", 300, 45]),
      row(580, ["Jméno:", 45, 26], ["Adam", 75], ["Příjmení:", 300, 35], ["Cizí", 340]),
    ]]);
    expect(result.clientName).toBeNull();
  });

  it("reads stacked name labels from their corresponding columns", () => {
    expect(resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Jméno", 45], ["Příjmení", 200]),
      row(565, ["Ing. Adam", 45], ["Novotný, Ph.D.", 200]),
    ]]).clientName).toBe("Adam Novotný");
  });

  it("supports a split label and removes explicit academic titles", () => {
    expect(resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Jmé", 45, 12], ["no:", 57, 12], ["Mgr. Adam", 75, 65],
        ["Pří", 200, 12], ["jmení:", 212, 24], ["Novotný, MBA", 240, 80]),
    ]]).clientName).toBe("Adam Novotný");
  });

  it("supports compact text-only labels while retaining role boundaries", () => {
    expect(resolveCppAutoPolicyholder([[
      text("POJISTNÍK Jméno: Mgr. Adam Příjmení: Novotný, Ph.D. PROVOZOVATEL Jméno: Petr Příjmení: Cizí"),
    ]]).clientName).toBe("Adam Novotný");
  });

  it("reads a single explicitly labelled full name", () => {
    expect(resolveCppAutoPolicyholder([[text("POJISTNÍK"), text("Jméno a příjmení: Ing. Adam Novotný")]]).clientName).toBe("Adam Novotný");
  });

  it("does not accept a single word from a combined full-name field", () => {
    expect(resolveCppAutoPolicyholder([[text("POJISTNÍK"), text("Jméno a příjmení: Adam")]]).clientName).toBeNull();
  });

  it("supports unambiguous text-only labels immediately above their values", () => {
    expect(resolveCppAutoPolicyholder([[text("Pojistník"), text("Jméno:"), text("Adam"), text("Příjmení:"), text("Novotný")]]).clientName).toBe("Adam Novotný");
  });

  it.each(["VLASTNÍK", "PROVOZOVATEL", "POJISTNÍK"])("keeps a labelled uppercase surname %s rather than treating it as a role", (surname) => {
    expect(resolveCppAutoPolicyholder([physical("Petr", surname)]).clientName).toBe(`Petr ${surname}`);
  });

  it.each(["Telefon", "Obec", "Mobil"])("preserves a label-like word %s inside a company name", (word) => {
    const company = `Testovací ${word} s.r.o.`;
    expect(resolveCppAutoPolicyholder([[text("POJISTNÍK"), text(`Název: ${company}`), text("IČ: 12345678")]]).clientName).toBe(company);
    expect(resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]), row(580, ["Název:", 45, 25], [company, 84, 130]),
    ]]).clientName).toBe(company);
  });

  it.each(["Telefon", "Obec", "Mobil"])("preserves %s when PDF.js splits the company name into separate word items", (word) => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Název:", 45, 25], ["Testovací", 84, 40], [word, 130, 30], ["s.r.o.", 165, 25],
        ["IČ:", 300, 12], ["12345678", 320, 45]),
    ]]);
    expect(result).toEqual({ clientName: `Testovací ${word} s.r.o.`, personalId: "12345678", warnings: [] });
  });

  it.each(["Poradce", "Makléř", "Vlastník", "PROVOZOVATEL"])("preserves a split company name containing the role word %s", (word) => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Název:", 45, 25], ["Testovací", 84, 40], [word, 130, 50], ["s.r.o.", 185, 25],
        ["IČ:", 300, 12], ["12345678", 320, 45]),
    ]]);
    expect(result).toEqual({ clientName: `Testovací ${word} s.r.o.`, personalId: "12345678", warnings: [] });
  });

  it("does not append an adjacent role heading to an already populated surname", () => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Jméno:", 45, 25], ["Adam", 75, 25], ["Příjmení:", 150, 35], ["Novotný", 190, 40], ["VLASTNÍK", 240, 45]),
      row(560, ["Rodné číslo:", 240, 45], ["800101/4321", 290, 55]),
    ]]);
    expect(result.clientName).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("does not return a shortened company name at an ambiguous distant role boundary", () => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Název:", 45, 25], ["Testovací", 84, 40], ["VLASTNÍK", 320, 45]),
      row(560, ["Jméno:", 320, 25], ["Petr", 350, 20], ["Příjmení:", 400, 35], ["Cizí", 440, 20]),
    ]]);
    expect(result.clientName).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("keeps a distant owner heading as a boundary after an empty surname field", () => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45]),
      row(580, ["Jméno:", 45, 25], ["Adam", 75, 25], ["Příjmení:", 150, 35], ["VLASTNÍK", 320, 45]),
      row(560, ["Příjmení:", 320, 35], ["Cizí", 370, 20]),
    ]]);
    expect(result.clientName).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("does not assign text-only value rows to one of two positioned role columns", () => {
    const result = resolveCppAutoPolicyholder([[
      row(600, ["POJISTNÍK", 45, 45], ["VLASTNÍK", 300, 45]),
      text("Jméno: Petr Příjmení: Cizí"),
    ]]);
    expect(result.clientName).toBeNull();
  });

  it("does not include an unseparated identifier in an ambiguous colon-free company name", () => {
    const result = resolveCppAutoPolicyholder([[text("POJISTNÍK"), text("Název: Modrá Brána s.r.o. IČ 12345678")]]);
    expect(result.clientName).toBeNull();
  });

  it("exports only policyholder rows for contact extraction and closes each independent box", () => {
    const page = [...physical(), row(540, ["E-mail:", 45, 35], ["client@example.test", 90, 90]),
      row(520, ["JEDNAJÍCÍ OSOBA", 45]), row(500, ["E-mail:", 45, 35], ["representative@example.test", 90, 110])];
    const lines = extractCppAutoPolicyholderLines([page]);
    expect(lines[0]).toBe("POJISTNÍK");
    expect(lines.at(-1)).toBe("PODPISY");
    expect(lines.join(" ")).toContain("client@example.test");
    expect(lines.join(" ")).not.toContain("representative@example.test");
  });

  it("clips the neighbouring role's email from the exported policyholder rows", () => {
    const lines = extractCppAutoPolicyholderLines([[
      row(600, ["POJISTNÍK", 45, 45], ["VLASTNÍK", 300, 45]),
      row(580, ["E-mail:", 45, 35], ["client@example.test", 85, 90], ["E-mail:", 300, 35], ["owner@example.test", 340, 90]),
    ]]);
    expect(lines.join(" ")).toContain("client@example.test");
    expect(lines.join(" ")).not.toContain("owner@example.test");
  });

  it("never completes a policyholder name across an unlabelled page break", () => {
    const result = resolveCppAutoPolicyholder([[text("POJISTNÍK"), text("Jméno: Adam")],
      [text("Příjmení: Novotný"), text("Rodné číslo: 900101/1234")]]);
    expect(result.clientName).toBeNull();
    expect(result.personalId).toBeNull();
  });

  it("accepts repeated identical complete boxes, but not conflicting policyholders", () => {
    expect(resolveCppAutoPolicyholder([physical(), physical()]).clientName).toBe("Adam Novotný");
    const conflict = resolveCppAutoPolicyholder([physical(), physical("Petr", "Cizí")]);
    expect(conflict.clientName).toBeNull();
    expect(conflict.warnings).toHaveLength(1);
  });

  it("does not combine incomplete policyholder boxes on different pages", () => {
    const result = resolveCppAutoPolicyholder([
      [text("POJISTNÍK"), text("Jméno: Adam")], [text("POJISTNÍK"), text("Příjmení: Novotný")],
    ]);
    expect(result.clientName).toBeNull();
  });

  it("does not treat later declarations about the policyholder as an identity box", () => {
    const result = resolveCppAutoPolicyholder([physical(), [
      text("Pojistník prohlašuje, že údaje uvedl pravdivě."),
      text("Jméno a příjmení / Název: Petr Cizí"), text("Rodné číslo: 800101/4321"),
    ]]);
    expect(result).toEqual({ clientName: "Adam Novotný", personalId: "900101/1234", warnings: [] });
  });

  it("does not borrow names without a policyholder heading", () => {
    const result = resolveCppAutoPolicyholder([[text("PROVOZOVATEL"), text("Jméno: Petr Příjmení: Cizí")]]);
    expect(result.clientName).toBeNull();
    expect(result.personalId).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects malformed names and keeps all warning text static and free of source values", () => {
    const result = resolveCppAutoPolicyholder([[text("POJISTNÍK"), text("Jméno: Adam123 Příjmení: Novotný"),
      text("Rodné číslo: private-invalid-value")]]);
    expect(result.clientName).toBeNull();
    expect(result.personalId).toBeNull();
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(" ")).not.toMatch(/Adam|Novotný|private-invalid-value/);
  });
});
