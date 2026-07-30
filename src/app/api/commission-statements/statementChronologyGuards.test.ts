import { describe, expect, it } from "vitest";

import { statementChronologyCanOverwrite } from "./statementChronologyGuards";

describe("statementChronologyCanOverwrite", () => {
  it("allows the first statement-sourced value", () => {
    expect(statementChronologyCanOverwrite(200, null)).toBe(true);
  });

  it("allows same or newer statement chronology", () => {
    expect(statementChronologyCanOverwrite(200, 200)).toBe(true);
    expect(statementChronologyCanOverwrite(300, 200)).toBe(true);
  });

  it("blocks older statements from overwriting newer statement-sourced state", () => {
    expect(statementChronologyCanOverwrite(100, 200)).toBe(false);
  });

  it("allows unknown chronology because legacy statements cannot be ordered safely", () => {
    expect(statementChronologyCanOverwrite(null, 200)).toBe(true);
    expect(statementChronologyCanOverwrite(200, undefined)).toBe(true);
  });
});
