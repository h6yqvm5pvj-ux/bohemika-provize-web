import { describe, expect, it } from "vitest";

import {
  WALL_POST_PREVIEW_MAX_CHARACTERS,
  WALL_POST_PREVIEW_MAX_LINES,
  shouldCollapseWallPostText,
  wallPostReadingMinutes,
} from "./wallPostPreview";

describe("intranet wall post preview", () => {
  it("keeps ordinary short posts fully visible", () => {
    expect(shouldCollapseWallPostText("Krátká týmová zpráva.")).toBe(false);
  });

  it("collapses a long article in the feed", () => {
    expect(
      shouldCollapseWallPostText("A".repeat(WALL_POST_PREVIEW_MAX_CHARACTERS + 1))
    ).toBe(true);
  });

  it("collapses a structured post with many short lines", () => {
    expect(
      shouldCollapseWallPostText(
        Array.from(
          { length: WALL_POST_PREVIEW_MAX_LINES + 1 },
          (_, index) => `Řádek ${index + 1}`
        ).join("\n")
      )
    ).toBe(true);
  });

  it("does not count hidden bold markers as visible article length", () => {
    const visibleLength = WALL_POST_PREVIEW_MAX_CHARACTERS - 2;
    expect(shouldCollapseWallPostText(`**${"A".repeat(visibleLength)}**`)).toBe(false);
  });

  it("estimates at least one minute of reading time", () => {
    expect(wallPostReadingMinutes("Krátká zpráva")).toBe(1);
    expect(wallPostReadingMinutes(Array.from({ length: 401 }, () => "slovo").join(" "))).toBe(3);
  });
});
