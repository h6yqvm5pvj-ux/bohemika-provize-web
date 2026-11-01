import { describe, expect, it } from "vitest";
import { clientSlugForName } from "../_klienti/clientIdentity";
import { clientCompanySearchParts, formatClientDisplayName } from "./clientNamePresentation";

describe("client display names", () => {
  it.each([
    ["MIROSLAV HRUŠKA", "Miroslav Hruška"],
    ["  štěpán   salvetr ", "Štěpán Salvetr"],
    ["RADEK DVořák", "Radek Dvořák"],
    ["ANNA NOVÁKOVÁ-SVOBODOVÁ", "Anna Nováková-Svobodová"],
    ["PATRICK O'NEILL", "Patrick O'Neill"],
    ["jean–pierre d’angelo", "Jean–Pierre D’Angelo"],
    ["THOMAS ASCHENBRENNER", "Thomas Aschenbrenner"],
    ["PETR NOVA\u0301K", "Petr Novák"],
    ["李 小龍", "李 小龍"],
    ["\u{10428}\u{10429} NOVÁK", "\u{10400}\u{10429} Novák"],
    ["", ""],
    [" \t ", ""],
  ])("formats %s as %s and keeps the card identity", (value, expected) => {
    expect(formatClientDisplayName(value)).toBe(expected);
    expect(clientSlugForName(formatClientDisplayName(value))).toBe(clientSlugForName(value));
  });

  it.each([
    ["ING. PETR NOVÁK", "Ing. Petr Novák"],
    ["ing.petr novák", "Ing. Petr Novák"],
    ["prof. ING.ARCH. PETR NOVÁK, PH.D., MBA", "prof. Ing. arch. Petr Novák, Ph.D., MBA"],
    ["MUDR. JANA NOVÁ, csc.", "MUDr. Jana Nová, CSc."],
    ["MGA. JANA NOVÁ, dis.", "MgA. Jana Nová, DiS."],
    ["JANA INGOLFOVÁ", "Jana Ingolfová"],
  ])("preserves titles without splitting names in %s", (value, expected) => {
    expect(formatClientDisplayName(value)).toBe(expected);
    expect(clientSlugForName(formatClientDisplayName(value))).toBe(clientSlugForName(value));
  });

  it.each([
    "AQUATECHNIC - EKO s.r.o.", "PEMI Cars s.r.o.", "ČSOB a.s.",
    "Parkett s.r Woody", "ABC s r o", "NADACE Modrý svět", "Obec MALÁ LHOTA",
    "spol. NOVÁK", "DRUŽSTVO PRAHA", "Město KLADNO",
  ])("preserves company spelling and punctuation in %s", value => {
    expect(formatClientDisplayName(value)).toBe(value);
    expect(clientSlugForName(formatClientDisplayName(value))).toBe(clientSlugForName(value));
  });

  it("uses an explicit company hint for a brand without a legal-form marker", () => {
    expect(formatClientDisplayName("  ČSOB   Group ", { isCompany: true })).toBe("ČSOB Group");
  });

  it.each(["ČSOB", "PEMI", "ABC", "PETR"])("preserves an ambiguous uppercase single token %s and its identity", value => {
    expect(formatClientDisplayName(`  ${value} `)).toBe(value);
    expect(clientSlugForName(formatClientDisplayName(value))).toBe(clientSlugForName(value));
  });

  it("still formats full uppercase personal names and standalone lowercase words", () => {
    expect(formatClientDisplayName("PETR NOVÁK")).toBe("Petr Novák");
    expect(formatClientDisplayName("MIROSLAV HRUŠKA")).toBe("Miroslav Hruška");
    expect(formatClientDisplayName("petr")).toBe("Petr");
  });

  it("rejects a formatting expansion that would change an existing identity", () => {
    expect(formatClientDisplayName("ßeta NOVÁK")).toBe("ßeta NOVÁK");
    expect(clientSlugForName(formatClientDisplayName("ßeta NOVÁK"))).toBe(clientSlugForName("ßeta NOVÁK"));
  });

  it("does not expand repeated titles beyond the validated name limit", () => {
    const value = "Ing ".repeat(49) + "Jan";
    expect(value.length).toBeLessThanOrEqual(200);
    expect(formatClientDisplayName(value)).toBe(value);
    expect(formatClientDisplayName(value).length).toBeLessThanOrEqual(200);
    expect(clientSlugForName(formatClientDisplayName(value))).toBe(clientSlugForName(value));
  });
});

describe("company search parts", () => {
  it.each([
    ["PEMI Cars s.r.o.", "sro", ["pemi", "cars"]],
    ["Cars PÉMI s. r. o.", "sro", ["cars", "pemi"]],
    ["PEMI Cars SRO", "sro", ["pemi", "cars"]],
    ["Parkett s.r Woody", "sro", ["parkett", "woody"]],
    ["Woody s r Parkett", "sro", ["woody", "parkett"]],
    ["ABC spol. s r o", "sro", ["abc"]],
    ["ČSOB a.s.", "as", ["csob"]],
    ["ČSOB a s", "as", ["csob"]],
    ["ČSOB AS", "as", ["csob"]],
    ["ABC a.s. Praha", "as", ["abc", "praha"]],
    ["ABC ABC s.r.o.", "sro", ["abc", "abc"]],
    ["s.r.o.", "sro", []],
    ["s.r.", "sro", []],
    ["a.s.", "as", []],
    ["Obec Malá Lhota", "obec", ["mala", "lhota"]],
  ])("extracts legal form and business words from %s", (value, form, words) => {
    expect(clientCompanySearchParts(value)).toEqual({ form, words });
  });

  it.each(["Miroslav Hruška", "Thomas Aschenbrenner", "Jan As Novák", "SR Novák", "Kaspar Vosek"])("keeps a person separate from company search for %s", value => {
    expect(clientCompanySearchParts(value)).toBeNull();
  });

  it("keeps s.r.o. and a.s. as different legal forms", () => {
    expect(clientCompanySearchParts("ABC s.r.o.")?.form).not.toBe(clientCompanySearchParts("ABC a.s.")?.form);
  });
});
