export type ContractStatementRow = {
  cells: string[];
  highlighted: boolean;
};

export type ContractStatementTable = {
  label: string;
  headers: string[];
  rows: ContractStatementRow[];
};

const sectionLabels: Record<string, string> = {
  provize: "Provize",
  storna: "Storna",
  odecty: "Odpočty",
  manazer: "Meziprovize",
  ostatni_platby: "Ostatní platby",
};

const text = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim();
const labelKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const contractKey = (value: string) => text(value).replace(/\s/g, "").toUpperCase().replace(/^0+(?=\d)/, "");
const codeKey = (value: string) => text(value).replace(/\s/g, "").toUpperCase();
const isContractHeading = (value: string) => /^(?:(?:cislo|c\.)\s+)?smlouv[ay](?:\s+c\.?)?$/.test(labelKey(value));

const fallbackHeaders = (count: number, section: string, storno: boolean): string[] => {
  if (section === "ostatni_platby" && count === 2) return ["Popis", "Částka"];
  if (count === 14 && !storno) return ["ID", "Smlouva", "Sjednáno", "Počátek", "Klient", "Role", "Produkt", "Provize", "Základna", "Jednotky", "Sazba", "Kar.", "Částka", "Stornofond"];
  if (count === 14 && storno) return ["ID", "Smlouva", "Sjednáno", "Klient", "Role", "Produkt", "Provize", "Stav", "Základna", "Jednotky", "Sazba", "Kar.", "Částka", "Stornofond"];
  if (count === 13) return ["ID", "Smlouva", "Sjednáno", "Klient", "Role", "Produkt", "Provize", "Základna", "Jednotky", "Sazba", "Kar.", "Částka", "Stornofond"];
  return Array.from({ length: count }, (_, index) => `Sloupec ${index + 1}`);
};

/** Extract original cell text only. Imported markup never enters the parent DOM. */
export function extractContractStatementRows(
  html: string,
  contractNumber: string,
  commissionCodes: readonly string[] = [],
): ContractStatementTable[] {
  const target = contractKey(contractNumber);
  if (!target || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, template, iframe, object").forEach(node => node.remove());
  const focusedCodes = new Set(commissionCodes.map(codeKey).filter(Boolean));
  const tables = doc.querySelectorAll<HTMLTableElement>(
    "#provize table, table#provize, #storna table, table#storna, #odecty table, table#odecty, #manazer table, table#manazer, #ostatni_platby table, table#ostatni_platby",
  );

  return Array.from(tables).flatMap(table => {
    const section = table.closest("#storna, #odecty, #manazer, #ostatni_platby, #provize")?.id ?? "provize";
    const sourceRows = Array.from(table.rows).filter(row => row.closest("table") === table);
    const header = sourceRows.find(row => Array.from(row.cells).some(cell => isContractHeading(text(cell.textContent))));
    const originalHeaders = header ? Array.from(header.cells, cell => text(cell.textContent)) : [];
    const contractIndex = originalHeaders.findIndex(isContractHeading);
    let label = sectionLabels[section];
    for (let sibling = table.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      const heading = labelKey(text(sibling.textContent));
      if (/^(storna|odecty|provize)$/.test(heading)) {
        label = heading === "storna" ? "Storna" : heading === "odecty" ? "Odpočty" : "Provize";
        break;
      }
    }
    const rows = sourceRows.flatMap(row => {
      if (row === header) return [];
      const cells = Array.from(row.cells, cell => text(cell.textContent));
      // Without column headings, use the same archived layouts as the importer.
      const number = contractIndex >= 0 ? cells[contractIndex]
        : section === "ostatni_platby" ? cells[0]?.match(/smlouv[ay]\s+(?:č\.\s*)?(\d+)/iu)?.[1]
          : cells.length >= 13 && /^\d+$/.test(cells[0]) ? cells[1] : null;
      if (!number || contractKey(number) !== target) return [];
      return [{ cells, highlighted: cells.some(cell => focusedCodes.has(codeKey(cell))) }];
    });
    if (rows.length === 0) return [];
    const headers = originalHeaders.length === rows[0].cells.length
      ? originalHeaders
      : fallbackHeaders(rows[0].cells.length, section, label === "Storna");
    return [{ label, headers, rows }];
  });
}
