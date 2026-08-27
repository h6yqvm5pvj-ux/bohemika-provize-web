import { describe, expect, it } from "vitest";

import { getNextCareerTimelineStart } from "./careerTimeline";

describe("getNextCareerTimelineStart", () => {
  it("naváže datum Od na datum Do bezprostředně předchozí pozice", () => {
    expect(
      getNextCareerTimelineStart([
        { validTo: "2025-01-01" },
        { validTo: "2026-04-01" },
      ])
    ).toBe("2026-04-01");
  });

  it("nepředvyplní datum, pokud předchozí pozice běží do současnosti", () => {
    expect(
      getNextCareerTimelineStart([
        { validTo: "2025-01-01" },
        { validTo: "" },
      ])
    ).toBe("");
  });

  it("nepředvyplní datum u první pozice", () => {
    expect(getNextCareerTimelineStart([])).toBe("");
  });
});
