// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { extractContractStatementRows } from "./contractStatementRows";

const contract = "0012345678";
const row = (number: string, code: string, amount: string, base = "1 500,00", client = "Testovací klient") =>
  `<tr>${["17", number, "01.01.2024", "01.01.2024", client, "Z", "CPP_1C_II", code, base, "", "10,80 %", "6", amount, "0,00"].map(cell => `<td>${cell}</td>`).join("")}</tr>`;

describe("original contract statement rows", () => {
  it("extracts every original matching row, preserves amounts and highlights only the requested commission", () => {
    const html = `<div id="provize"><table><tr>${["ID", "Smlouva", "Sjednáno", "Počátek", "Klient", "Role", "Produkt", "Provize", "Základna", "Body", "Sazba", "Kar.", "Částka", "Rezerva"].map(cell => `<th>${cell}</th>`).join("")}</tr>
      ${row(contract, "B103", "201,85")}${row(contract, "B104", "382,10", "3 538,00")}
      ${row("00123456789", "B103", "900,00")}${row("99999999", "B103", "700,00", contract)}</table></div>`;
    const tables = extractContractStatementRows(html, "00 12345678", ["B103"]);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers[8]).toBe("Základna");
    expect(tables[0].rows.map(row => [row.cells[7], row.cells[8], row.cells[12], row.highlighted])).toEqual([
      ["B103", "1 500,00", "201,85", true], ["B104", "3 538,00", "382,10", false],
    ]);
  });

  it("includes deductions, reversals and nested manager tables without duplicating containing rows", () => {
    const shortRow = `<tr>${["18", contract, "01.01.2024", "Testovací klient", "M", "CPP_1C_II", "B103", "1 500,00", "", "10 %", "6", "-150,00", "0,00"].map(cell => `<td>${cell}</td>`).join("")}</tr>`;
    const html = `<div id="provize"><table>${row(contract, "B103", "150,00")}</table>
      <b>STORNA</b><table>${row(contract, "B103", "-150,00")}</table></div>
      <div id="odecty"><table>${shortRow}</table></div>
      <div id="manazer"><table><tr><td><table>${shortRow}</table></td></tr></table></div>`;
    const tables = extractContractStatementRows(html, contract, ["B103"]);
    expect(tables.map(table => table.label)).toEqual(["Provize", "Storna", "Odpočty", "Meziprovize"]);
    expect(tables.flatMap(table => table.rows)).toHaveLength(4);
    expect(tables[2].rows[0].cells[11]).toBe("-150,00");
  });

  it("extracts a contract-specific other payment and rejects missing or partial identities", () => {
    const html = `<div id="ostatni_platby"><table><tr><td>50 % provize B36 smlouvy ${contract}</td><td>500,00</td></tr>
      <tr><td>50 % provize B36 smlouvy ${contract}9</td><td>900,00</td></tr></table></div>`;
    expect(extractContractStatementRows(html, contract)[0].rows).toHaveLength(1);
    expect(extractContractStatementRows(html, "")).toEqual([]);
    expect(extractContractStatementRows(html, "12345")).toEqual([]);
    expect(extractContractStatementRows(html, "missing")).toEqual([]);
  });

  it("returns cell text without imported scripts, links, markup or handlers", () => {
    const html = `<div id="provize"><table>${row(contract, "B103", "150,00", "1 500,00",
      '<a href="javascript:alert(1)" onclick="alert(1)">Testovací klient</a><script>alert(2)</script><img onerror="alert(3)">')}</table></div>`;
    const extracted = extractContractStatementRows(html, contract);
    expect(extracted[0].rows[0].cells[4]).toBe("Testovací klient");
    expect(JSON.stringify(extracted)).not.toMatch(/alert|javascript:|onerror|<img|<a/);
  });
});
