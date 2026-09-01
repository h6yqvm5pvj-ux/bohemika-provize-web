import { describe, expect, it } from "vitest";

import {
  splitWallPostTextIntoBoldSegments,
  wallPostRichTextSegmentsToText,
  wallPostTextToEditorHtml,
} from "./wallPostRichText";

describe("intranet wall rich text", () => {
  it("turns stored markdown bold markers into visual editor HTML", () => {
    expect(wallPostTextToEditorHtml("Běžný **tučný text** a konec.")).toBe(
      "Běžný <strong>tučný text</strong> a konec."
    );
  });

  it("preserves line breaks and hides the formatting markers", () => {
    const html = wallPostTextToEditorHtml("**Nadpis**\nDalší řádek");

    expect(html).toBe("<strong>Nadpis</strong><br>Další řádek");
    expect(html).not.toContain("**");
  });

  it("escapes pasted HTML-like text before rendering it in the editor", () => {
    expect(wallPostTextToEditorHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("round-trips existing bold segments without changing stored data", () => {
    const value = "Úvod\n**Důležitá informace**\nZávěr";

    expect(
      wallPostRichTextSegmentsToText(splitWallPostTextIntoBoldSegments(value))
    ).toBe(value);
  });

  it("keeps unmatched markers visible instead of dropping text", () => {
    expect(wallPostTextToEditorHtml("Text s **nedokončeným označením")).toBe(
      "Text s **nedokončeným označením"
    );
  });
});
