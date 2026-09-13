import { describe, expect, it } from "vitest";
import { heldCareerPositions, normalizeCareerPositions } from "./careerPositions";

const now = new Date("2026-09-13T12:00:00Z");

describe("positions actually held by a user", () => {
  it("deduplicates history and current position without filling skipped career levels", () => {
    expect(heldCareerPositions({ position: "manazer4", positionTimeline: [
      { position: "poradce5", validFrom: "2025-01-01", validTo: "2026-01-01" },
      { position: "poradce2", validFrom: "2024-01-01", validTo: "2025-01-01" },
      { position: "manazer4", validFrom: "2026-01-01" },
      { position: "poradce5", validFrom: "2023-01-01", validTo: "2024-01-01" },
    ] }, now)).toEqual(["poradce2", "poradce5", "manazer4"]);
  });

  it("excludes future appointments, invalid dates and unknown positions", () => {
    expect(heldCareerPositions({ position: "poradce3", positionTimeline: [
      { position: "poradce4", validFrom: "2026-09-14" },
      { position: "manazer4", validFrom: "2026-02-30" },
      { position: "poradce1", validFrom: "2025-01-01", validTo: "2024-01-01" },
      { position: "poradce2", validFrom: "invalid" },
      { position: "unknown", validFrom: "2020-01-01" }, null,
    ] }, now)).toEqual(["poradce3"]);
  });

  it("includes appointments starting today using the Czech calendar day", () => {
    expect(heldCareerPositions({ positionTimeline: [
      { position: "poradce4", validFrom: "2026-09-14" },
    ] }, new Date("2026-09-13T22:30:00Z"))).toEqual(["poradce4"]);
  });

  it("uses only a known current position when history is missing", () => {
    expect(heldCareerPositions({ position: "poradce5" }, now)).toEqual(["poradce5"]);
    expect(heldCareerPositions(null, now)).toEqual([]);
    expect(heldCareerPositions({ position: "unknown", positionTimeline: {} }, now)).toEqual([]);
    expect(normalizeCareerPositions(["manazer10", "poradce10", "poradce2", "poradce2", null, "constructor"])).toEqual(["poradce2", "poradce10", "manazer10"]);
  });
});
