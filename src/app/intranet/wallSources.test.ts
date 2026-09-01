import { describe, expect, it } from "vitest";

import {
  INTRANET_WALL_MAX_SOURCES,
  intranetWallSourceHost,
  parseIntranetWallSources,
  parseIntranetWallSourcesJson,
  sanitizeStoredIntranetWallSources,
} from "./wallSources";

describe("intranet wall sources", () => {
  it("normalizes several web links and fills in a missing https scheme", () => {
    expect(
      parseIntranetWallSources([
        "example.com/clanek",
        " https://www.mfcr.cz/novinky?rok=2026 ",
      ])
    ).toEqual({
      ok: true,
      sources: [
        "https://example.com/clanek",
        "https://www.mfcr.cz/novinky?rok=2026",
      ],
    });
  });

  it("removes duplicate and empty rows", () => {
    expect(
      parseIntranetWallSources(["", "https://example.com", "https://example.com/"])
    ).toEqual({ ok: true, sources: ["https://example.com/"] });
  });

  it("rejects unsafe protocols and URLs containing credentials", () => {
    expect(parseIntranetWallSources(["javascript:alert(1)"]).ok).toBe(false);
    expect(parseIntranetWallSources(["ftp://example.com/file"]).ok).toBe(false);
    expect(parseIntranetWallSources(["https://user:secret@example.com"]).ok).toBe(false);
  });

  it("enforces the source count limit", () => {
    const result = parseIntranetWallSources(
      Array.from(
        { length: INTRANET_WALL_MAX_SOURCES + 1 },
        (_, index) => `https://example.com/${index}`
      )
    );

    expect(result).toEqual({
      ok: false,
      error: `Příspěvek může mít maximálně ${INTRANET_WALL_MAX_SOURCES} zdrojů.`,
    });
  });

  it("parses the FormData JSON representation and rejects malformed JSON", () => {
    expect(parseIntranetWallSourcesJson('["bohemika.eu"]')).toEqual({
      ok: true,
      sources: ["https://bohemika.eu/"],
    });
    expect(parseIntranetWallSourcesJson("not-json").ok).toBe(false);
  });

  it("keeps old posts compatible and sanitizes stored legacy objects", () => {
    expect(sanitizeStoredIntranetWallSources(undefined)).toEqual([]);
    expect(
      sanitizeStoredIntranetWallSources([
        { url: "https://example.com/article" },
        { url: "javascript:alert(1)" },
        "mfcr.cz",
      ])
    ).toEqual(["https://example.com/article", "https://mfcr.cz/"]);
    expect(intranetWallSourceHost("https://www.mfcr.cz/clanek")).toBe("mfcr.cz");
  });
});
