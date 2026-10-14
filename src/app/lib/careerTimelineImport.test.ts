import { describe, expect, it } from "vitest";
import {
  CAREER_IMPORT_MAX_LENGTH,
  CAREER_IMPORT_MAX_ROWS,
  parseCareerTimelineImport,
} from "./careerTimelineImport";

const table = `Zprostředkovatelská skupina\tKariérní stupeň\tPlatnost od - do\tIndiv. body
Finanční poradce\t7 - V.I.P. konzultant\t01.01.1989 - 01.09.2010
Finanční poradce\t106 - Řídící manažer\t01.09.2010 - 13.07.2011
Finanční poradce\t8 - Finanční expert\t13.07.2011 - 01.08.2013
Finanční poradce\t106 - Řídící manažer\t01.08.2013 - 01.09.2014
Finanční poradce\t8 - Finanční expert\t01.09.2014 - 01.05.2024
Finanční poradce\t108 - Regionální ředitel\t01.05.2024 - 01.01.2026
Finanční poradce\t10 - Top Finanční expert\t01.01.2026 - současnost`;

describe("Maxx career clipboard import", () => {
  it("imports the entire seven-period example, preserving promotions and returns to advisor positions", () => {
    expect(parseCareerTimelineImport(table)).toEqual({ ok: true, rows: [
      { position: "poradce7", validFrom: "1989-01-01", validTo: "2010-09-01" },
      { position: "manazer6", validFrom: "2010-09-01", validTo: "2011-07-13" },
      { position: "poradce8", validFrom: "2011-07-13", validTo: "2013-08-01" },
      { position: "manazer6", validFrom: "2013-08-01", validTo: "2014-09-01" },
      { position: "poradce8", validFrom: "2014-09-01", validTo: "2024-05-01" },
      { position: "manazer8", validFrom: "2024-05-01", validTo: "2026-01-01" },
      { position: "poradce10", validFrom: "2026-01-01", validTo: "" },
    ] });
  });

  it("imports the eight-period Markdown example without inferring a higher level from previous positions", () => {
    const text = `| Finanční poradce | 5 - Konzultant referent | 01.01.1989 - 01.02.2022 | |
| ---------------- | ------------------------- | ----------------------- | - |
| Finanční poradce | 4 - Samostatný konzultant | 01.02.2022 - 01.08.2023 | |
| Finanční poradce | 6 - Profi konzultant | 01.08.2023 - 01.10.2024 | |
| Finanční poradce | 5 - Konzultant referent | 01.10.2024 - 01.11.2024 | |
| Finanční poradce | 6 - Profi konzultant | 01.11.2024 - 01.05.2025 | |
| Finanční poradce | 106 - Řídící manažer | 01.05.2025 - 01.09.2025 | |
| Finanční poradce | 107 - TOP manažer | 01.09.2025 - 01.04.2026 | |
| Finanční poradce | 108 - Regionální ředitel | 01.04.2026 - současnost | |`;
    expect(parseCareerTimelineImport(text)).toEqual({ ok: true, rows: [
      { position: "poradce5", validFrom: "1989-01-01", validTo: "2022-02-01" },
      { position: "poradce4", validFrom: "2022-02-01", validTo: "2023-08-01" },
      { position: "poradce6", validFrom: "2023-08-01", validTo: "2024-10-01" },
      { position: "poradce5", validFrom: "2024-10-01", validTo: "2024-11-01" },
      { position: "poradce6", validFrom: "2024-11-01", validTo: "2025-05-01" },
      { position: "manazer6", validFrom: "2025-05-01", validTo: "2025-09-01" },
      { position: "manazer7", validFrom: "2025-09-01", validTo: "2026-04-01" },
      { position: "manazer8", validFrom: "2026-04-01", validTo: "" },
    ] });
  });

  it.each([
    ...Array.from({ length: 10 }, (_, index) => [index + 1, `poradce${index + 1}`]),
    ...Array.from({ length: 7 }, (_, index) => [index + 104, `manazer${index + 4}`]),
  ])("maps numeric code %s to %s independently of the title", (code, position) => {
    expect(parseCareerTimelineImport(`${code} - Název pozice 01.01.2020 - současnost`)).toEqual({ ok: true, rows: [
      { position, validFrom: "2020-01-01", validTo: "" },
    ] });
  });

  it("handles cells on separate lines, Windows newlines, points, pagination and typographic spaces and dashes", () => {
    const text = "Zprostředkovatelská skupina\r\nKariérní stupeň\r\nPlatnost od – do\r\nIndiv. body\r\nFinanční poradce\r\n104 — Manažer\r\n1.\u00a01. 2020 – 29. 2. 2020\r\n12,5\r\nFinanční poradce\r\n110 − Manažer\r\n29. 2. 2020 — SOUČASNOST\r\nPoložek na stranu:\r\n20\r\n1 až 2 z 2";
    expect(parseCareerTimelineImport(text)).toEqual({ ok: true, rows: [
      { position: "manazer4", validFrom: "2020-01-01", validTo: "2020-02-29" },
      { position: "manazer10", validFrom: "2020-02-29", validTo: "" },
    ] });
  });

  it("sorts reverse chronological selections before checking the open-ended period", () => {
    expect(parseCareerTimelineImport("106 - Manažer 01.01.2025 - současnost\n5 - Poradce 01.01.2020 - 01.01.2025")).toEqual({ ok: true, rows: [
      { position: "poradce5", validFrom: "2020-01-01", validTo: "2025-01-01" },
      { position: "manazer6", validFrom: "2025-01-01", validTo: "" },
    ] });
  });

  it.each([0, 11, 103, 111, 1000, "01", "admin", "constructor"])("rejects unsupported or manipulated code %s without returning a partial history", (code) => {
    const result = parseCareerTimelineImport(`5 - Poradce 01.01.2020 - 01.01.2025\n${code} - Pozice 01.01.2025 - současnost`);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("rows");
  });

  it.each(["31.02.2024", "29.02.2023", "31.04.2020", "00.01.2020", "01.13.2020", "01.01.0000", "2020-01-01"])("rejects invalid date %s", (date) => {
    expect(parseCareerTimelineImport(`5 - Poradce ${date} - současnost`).ok).toBe(false);
  });

  it.each([
    "5 - Poradce 01.01.2025 - 01.01.2020",
    "5 - Poradce 01.01.2020 - 01.02.2025\n6 - Poradce 01.01.2025 - současnost",
    "5 - Poradce 01.01.2020 - současnost\n6 - Poradce 01.01.2025 - současnost",
    "5 - Poradce 01.01.2020 - současnost\n6 - Poradce 01.01.2025 - 01.02.2025",
    "5 - Poradce\n6 - Poradce 01.01.2025 - současnost",
    "5 - Poradce 01.01.2020 - 01.01.2025\n6 - Poradce 01.01.2025 -",
    "5 - Poradce 01.01.2020 - současnost\nNeznámá data",
  ])("rejects inconsistent or incomplete history without silently skipping a period", (text) => {
    const result = parseCareerTimelineImport(text);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("rows");
  });

  it.each(["", "   ", "Zprostředkovatelská skupina\nKariérní stupeň\nPlatnost od - do", "<script>alert('synthetic')</script>"])("does not import empty or unrelated input", (text) => {
    const result = parseCareerTimelineImport(text);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("rows");
    expect(JSON.stringify(result)).not.toContain("<script>");
  });

  it("bounds input and record count", () => {
    expect(parseCareerTimelineImport("x".repeat(CAREER_IMPORT_MAX_LENGTH + 1)).ok).toBe(false);
    const records = Array.from({ length: CAREER_IMPORT_MAX_ROWS + 1 }, (_, index) => `5 - Poradce 01.01.${1900 + index} - 01.01.${1901 + index}`);
    expect(parseCareerTimelineImport(records.join("\n"))).toMatchObject({ ok: false, error: expect.stringContaining("nejvýše") });
  });
});
