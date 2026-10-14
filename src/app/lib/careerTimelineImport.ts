import type { Position } from "@/app/types/domain";

export type ImportedCareerPeriod = {
  position: Position;
  validFrom: string;
  validTo: string;
};

export type CareerTimelineImportResult =
  | { ok: true; rows: ImportedCareerPeriod[] }
  | { ok: false; error: string };

export const CAREER_IMPORT_MAX_LENGTH = 30_000;
export const CAREER_IMPORT_MAX_ROWS = 100;

const DASH = "[-–—−]";
const CZECH_DATE = "\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*\\d{4}";
const ROW_START = new RegExp(`^(?:Finanční\\s+poradce\\s+)?(\\d+)\\s*${DASH}\\s*`, "iu");
const ROW = new RegExp(
  `^(?:Finanční\\s+poradce\\s+)?(\\d+)\\s*${DASH}\\s*.+?\\s+(${CZECH_DATE})\\s*${DASH}\\s*(${CZECH_DATE}|současnost)(?:\\s+\\d+(?:[.,]\\d+)?)?$`,
  "iu",
);
const HEADER = new RegExp(
  `^(?:(?:Zprostředkovatelská skupina|Kariérní stupeň|Platnost od\\s*${DASH}\\s*do|Indiv\\.\\s*body)\\s*)+$`,
  "iu",
);

function parseCzechDay(value: string): string | null {
  const parts = value.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!parts || Number(parts[3]) === 0) return null;
  const iso = `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function positionFromCode(code: string): Position | null {
  const number = Number(code);
  if (String(number) !== code) return null;
  if (number >= 1 && number <= 10) return `poradce${number}` as Position;
  if (number >= 104 && number <= 110) return `manazer${number - 100}` as Position;
  return null;
}

/** Parse clipboard text locally; never return source labels or unrelated columns. */
export function parseCareerTimelineImport(text: string): CareerTimelineImportResult {
  if (text.length > CAREER_IMPORT_MAX_LENGTH) {
    return { ok: false, error: "Vložený text je příliš dlouhý. Zkopíruj pouze tabulku kariéry z Maxxu." };
  }
  if (!text.trim()) {
    return { ok: false, error: "Nejdřív vlož zkopírovanou tabulku kariéry z Maxxu." };
  }

  const rows: ImportedCareerPeriod[] = [];
  let pending = "";
  const invalidRow = (): CareerTimelineImportResult => ({
    ok: false,
    error: `Období ${rows.length + 1}: nerozpoznaná pozice nebo období. Zkopíruj celé řádky včetně čísel pozic a dat Od–Do.`,
  });

  // Browsers copy table cells with tabs or newlines; Markdown uses pipes.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.replace(/[|\t\u00a0\u202f\ufeff]/g, " ").replace(/\s+/g, " ").trim();
    if (!line || /^[-:\s]+$/.test(line) || HEADER.test(line) || /^Finanční poradce$/iu.test(line)) continue;
    if (!pending && (/^Položek na stranu:\s*\d*$/iu.test(line) || /^\d+ až \d+ z \d+$/iu.test(line) || /^\d+(?:[.,]\d+)?$/.test(line))) continue;

    if (ROW_START.test(line)) {
      if (pending) return invalidRow();
      pending = line;
    } else {
      if (!pending) return invalidRow();
      pending += ` ${line}`;
    }

    const match = pending.match(ROW);
    if (!match) continue;
    const rowNumber = rows.length + 1;
    const position = positionFromCode(match[1]);
    if (!position) {
      return { ok: false, error: `Období ${rowNumber}: neznámé číslo pozice. Podporovaná čísla jsou 1–10 pro poradce a 104–110 pro manažery.` };
    }
    const validFrom = parseCzechDay(match[2]);
    const validTo = /^současnost$/iu.test(match[3]) ? "" : parseCzechDay(match[3]);
    if (!validFrom || validTo === null) {
      return { ok: false, error: `Období ${rowNumber}: neplatné datum. Zkontroluj den, měsíc a rok.` };
    }
    if (validTo && validTo < validFrom) {
      return { ok: false, error: `Období ${rowNumber}: datum Do nesmí být před datem Od.` };
    }
    rows.push({ position, validFrom, validTo });
    if (rows.length > CAREER_IMPORT_MAX_ROWS) {
      return { ok: false, error: `Najednou lze vložit nejvýše ${CAREER_IMPORT_MAX_ROWS} období.` };
    }
    pending = "";
  }

  if (pending) return invalidRow();
  if (!rows.length) {
    return { ok: false, error: "V textu nejsou žádná období kariéry. Zkopíruj řádky včetně čísel pozic a dat Od–Do." };
  }

  rows.sort((a, b) => a.validFrom.localeCompare(b.validFrom) || (a.validTo || "9999-12-31").localeCompare(b.validTo || "9999-12-31"));
  for (let index = 0; index < rows.length; index += 1) {
    if (!rows[index].validTo && index !== rows.length - 1) {
      return { ok: false, error: "Současnost může být jen u jedné poslední pozice. Zkontroluj konce období." };
    }
    if (index > 0 && rows[index - 1].validTo > rows[index].validFrom) {
      return { ok: false, error: `Období ${index} a ${index + 1} se po seřazení podle data překrývají. Zkontroluj data Od–Do.` };
    }
  }
  return { ok: true, rows };
}
