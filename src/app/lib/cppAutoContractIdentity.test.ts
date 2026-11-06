import { describe, expect, it } from "vitest";

import {
  resolveCppAutoContractIdentity,
  type CppAutoContractIdentityItem,
  type CppAutoContractIdentityLine,
  type CppAutoContractIdentityPage,
} from "./cppAutoContractIdentity";

const item = (str: string, x: number, y: number, width = 80): CppAutoContractIdentityItem => ({
  str, x, y, width,
});
const line = (...items: CppAutoContractIdentityItem[]): CppAutoContractIdentityLine => ({
  text: items.map((value) => value.str).join(" "), items,
});
const textPage = (...lines: string[]): CppAutoContractIdentityPage => lines.map((text) => ({ text, items: [] }));
const pairedPage = (original: string | null, current: string | null): CppAutoContractIdentityPage => [
  line(item("Náhrada smlouvy", 45, 750, 90), item("Číslo pojistné smlouvy", 240, 750, 116)),
  line(...[
    original ? item(original, 65, 737, 45) : null,
    current ? item(current, 276, 737, 45) : null,
  ].filter((value): value is CppAutoContractIdentityItem => value != null)),
];

describe("resolveCppAutoContractIdentity", () => {
  it.each([
    "Číslo pojistné smlouvy",
    "Číslo návrhu pojistné smlouvy",
    "Číslo nabídky pojistné smlouvy",
  ])("keeps the known stacked header layout for %s", (label) => {
    expect(resolveCppAutoContractIdentity([[
      line(item(label, 240, 750, 116)),
      line(item("0001234567", 276, 737, 45)),
    ]])).toEqual({
      contractNumber: "0001234567",
      replacementOriginalContractNumber: null,
      warnings: [],
    });
  });

  it("reads replacement and current numbers from their own side-by-side boxes", () => {
    expect(resolveCppAutoContractIdentity([pairedPage("0001111111", "0002222222")])).toEqual({
      contractNumber: "0002222222",
      replacementOriginalContractNumber: "0001111111",
      warnings: [],
    });
  });

  it("keeps the observed header geometry separate from an extra digit in the next column", () => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Číslo návrhu pojistné smlouvy", 239.7, 750, 115.9)),
      line(item("0001234567", 275.5, 736.7, 44.5), item("1", 364.6, 736.7, 4.4)),
    ]])).toEqual({ contractNumber: "0001234567", replacementOriginalContractNumber: null, warnings: [] });
  });

  it("does not depend on the PDF item order within a visual row", () => {
    const page = pairedPage("0001111111", "0002222222").map((row) => ({
      ...row, items: [...row.items].reverse(),
    }));
    expect(resolveCppAutoContractIdentity([page])).toMatchObject({
      contractNumber: "0002222222", replacementOriginalContractNumber: "0001111111",
    });
  });

  it("does not borrow the current policy number for an empty replacement box", () => {
    expect(resolveCppAutoContractIdentity([pairedPage(null, "0002222222")])).toEqual({
      contractNumber: "0002222222", replacementOriginalContractNumber: null,
      warnings: ["cpp_auto_replacement_number_missing"],
    });
  });

  it("does not borrow the replacement number for an empty current box", () => {
    expect(resolveCppAutoContractIdentity([pairedPage("0001111111", null)])).toEqual({
      contractNumber: null, replacementOriginalContractNumber: "0001111111",
      warnings: ["cpp_auto_contract_number_missing"],
    });
  });

  it("supports separate inline label/value boxes on the same row", () => {
    expect(resolveCppAutoContractIdentity([[
      line(
        item("Náhrada smlouvy:", 45, 750, 90), item("0001111111", 140, 750, 45),
        item("Číslo pojistné smlouvy:", 240, 750, 116), item("0002222222", 365, 750, 45),
      ),
    ]])).toMatchObject({ contractNumber: "0002222222", replacementOriginalContractNumber: "0001111111", warnings: [] });
  });

  it("supports two explicit inline labels in one PDF text item", () => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Náhrada smlouvy: 0001111111 Číslo pojistné smlouvy: 0002222222", 45, 750, 390)),
    ]])).toMatchObject({ contractNumber: "0002222222", replacementOriginalContractNumber: "0001111111", warnings: [] });
  });

  it("joins a heading split into adjacent positioned words", () => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Číslo", 240, 750, 20), item("návrhu", 265, 750, 30), item("pojistné", 300, 750, 32), item("smlouvy", 337, 750, 34)),
      line(item("0001234567", 276, 737, 45)),
    ]])).toMatchObject({ contractNumber: "0001234567", warnings: [] });
  });

  it("accepts identical repeated headers but rejects conflicting numbers across pages", () => {
    const first = pairedPage("0001111111", "0002222222");
    expect(resolveCppAutoContractIdentity([first, first])).toMatchObject({ contractNumber: "0002222222", warnings: [] });
    expect(resolveCppAutoContractIdentity([first, pairedPage("0001111111", "0003333333")])).toEqual({
      contractNumber: null, replacementOriginalContractNumber: "0001111111",
      warnings: ["cpp_auto_contract_number_ambiguous"],
    });
  });

  it("rejects conflicting replacement fields without discarding a proven current number", () => {
    expect(resolveCppAutoContractIdentity([
      pairedPage("0001111111", "0002222222"), pairedPage("0003333333", "0002222222"),
    ])).toEqual({
      contractNumber: "0002222222", replacementOriginalContractNumber: null,
      warnings: ["cpp_auto_replacement_number_ambiguous"],
    });
  });

  it("never uses document-wide repetition, variable symbols, or unlabelled personal IDs", () => {
    expect(resolveCppAutoContractIdentity([textPage(
      "Variabilní symbol: 0005555555", "Rodné číslo: 900101/0001", "IČO: 12345678", "0005555555", "0005555555",
    )])).toEqual({
      contractNumber: null, replacementOriginalContractNumber: null,
      warnings: ["cpp_auto_contract_number_missing"],
    });
  });

  it("does not skip a neighbouring field to take its value", () => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Číslo pojistné smlouvy", 240, 750, 116)),
      line(item("IČO:", 260, 740, 20)),
      line(item("12345678", 276, 730, 45)),
    ]])).toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_missing"] });
  });

  it.each(["IČO:", "IČO", "Rodné číslo", "Variabilní symbol"])("does not take the value of a neighbouring labelled personal field %s", (foreignLabel) => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Číslo pojistné smlouvy", 240, 750, 116)),
      line(item(foreignLabel, 200, 737, 30), item("12345678", 276, 737, 45)),
    ]])).toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_missing"] });
  });

  it("does not replace an explicitly empty/invalid header value with a lower number", () => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Číslo pojistné smlouvy: neuvedeno", 240, 750, 170)),
      line(item("12345678", 276, 737, 45)),
    ]])).toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_missing"] });
  });

  it.each(["Číslo pojistné smlouvy:", "Náhrada smlouvy:"])("respects an invalid inline value in a separate span for %s", (label) => {
    const result = resolveCppAutoContractIdentity([[
      line(item(label, 240, 750, 116), item("neuvedeno", 365, 750, 45)),
      line(item("12345678", 276, 737, 45)),
    ]]);
    expect(result.contractNumber).toBeNull();
    expect(result.replacementOriginalContractNumber).toBeNull();
    expect(result.warnings).toContain(label.startsWith("Náhrada")
      ? "cpp_auto_replacement_number_missing" : "cpp_auto_contract_number_missing");
  });

  it("does not assign a value in overlapping column padding to either contract box", () => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Náhrada smlouvy", 45, 750, 90), item("Číslo pojistné smlouvy", 137, 750, 116)),
      line(item("0001111111", 113, 737, 44)),
    ]])).toEqual({
      contractNumber: null, replacementOriginalContractNumber: null,
      warnings: ["cpp_auto_contract_number_ambiguous", "cpp_auto_replacement_number_ambiguous"],
    });
  });

  it("does not treat prose containing the label as a header field", () => {
    expect(resolveCppAutoContractIdentity([textPage("Pro platbu použijte číslo pojistné smlouvy: 0001234567")]))
      .toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_missing"] });
  });

  it("does not borrow a far-away value on the same row", () => {
    expect(resolveCppAutoContractIdentity([[
      line(item("Číslo pojistné smlouvy", 45, 750, 116), item("12345678", 400, 750, 45)),
    ]])).toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_missing"] });
  });

  it("does not cross page boundaries even for adjacent text-only rows", () => {
    expect(resolveCppAutoContractIdentity([
      textPage("Číslo pojistné smlouvy:"), textPage("0001234567"),
    ])).toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_missing"] });
  });

  it("supports a single immediate text-only label/value pair", () => {
    expect(resolveCppAutoContractIdentity([textPage("Číslo návrhu pojistné smlouvy:", "0001234567")]))
      .toMatchObject({ contractNumber: "0001234567", warnings: [] });
  });

  it("supports explicit text-only inline values but never guesses two stacked columns", () => {
    expect(resolveCppAutoContractIdentity([textPage("Číslo pojistné smlouvy: 0001234567")]))
      .toMatchObject({ contractNumber: "0001234567", warnings: [] });
    expect(resolveCppAutoContractIdentity([textPage("Náhrada smlouvy Číslo pojistné smlouvy", "0001111111 0002222222")]))
      .toEqual({
        contractNumber: null, replacementOriginalContractNumber: null,
        warnings: ["cpp_auto_contract_number_missing", "cpp_auto_replacement_number_missing"],
      });
  });

  it("rejects multiple plausible numbers in one box or consecutive value rows", () => {
    expect(resolveCppAutoContractIdentity([textPage("Číslo pojistné smlouvy: 123456 654321")]))
      .toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_ambiguous"] });
    expect(resolveCppAutoContractIdentity([[
      line(item("Číslo pojistné smlouvy", 240, 750, 116)),
      line(item("0001234567", 276, 737, 45)),
      line(item("0009876543", 276, 725, 45)),
    ]])).toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_ambiguous"] });
    expect(resolveCppAutoContractIdentity([textPage("Číslo pojistné smlouvy: 0001234567 1")]))
      .toMatchObject({ contractNumber: null, warnings: ["cpp_auto_contract_number_ambiguous"] });
  });

  it.each(["000123", "00012345678901", "00 1234 5678"])("preserves compatible 6–14-digit values including leading zeros: %s", (number) => {
    expect(resolveCppAutoContractIdentity([textPage(`Číslo pojistné smlouvy: ${number}`)]).contractNumber)
      .toBe(number.replace(/ /g, ""));
  });

  it.each(["12345", "123456789012345", "900101/1234", "12345678 Kč", "AB12345678"])("rejects invalid identifier syntax: %s", (number) => {
    expect(resolveCppAutoContractIdentity([textPage(`Číslo pojistné smlouvy: ${number}`)]).contractNumber).toBeNull();
  });

  it("prevents self-replacement and keeps diagnostics free of PDF values", () => {
    const result = resolveCppAutoContractIdentity([pairedPage("0002222222", "0002222222")]);
    expect(result).toEqual({
      contractNumber: "0002222222", replacementOriginalContractNumber: null,
      warnings: ["cpp_auto_replacement_matches_contract"],
    });
    expect(result.warnings.join(" ")).not.toMatch(/\d|pojistne|smlouvy/i);
  });

  it("does not mutate caller-owned rows or items", () => {
    const page = pairedPage("0001111111", "0002222222");
    const snapshot = structuredClone(page);
    resolveCppAutoContractIdentity([page]);
    expect(page).toEqual(snapshot);
  });
});
