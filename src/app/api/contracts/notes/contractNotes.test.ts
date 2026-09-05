import { describe, expect, it } from "vitest";

import {
  CONTRACT_NOTE_MAX_LENGTH,
  isSafeContractNoteId,
  normalizeContractNoteMutation,
} from "./contractNotes";

describe("normalizeContractNoteMutation", () => {
  const nowMs = new Date("2026-09-05T10:00:00.000Z").getTime();

  it("normalizes a note without a reminder", () => {
    expect(
      normalizeContractNoteMutation(
        { text: "  Přepočítat smlouvu  ", reminderEnabled: false },
        nowMs
      )
    ).toEqual({
      ok: true,
      value: {
        text: "Přepočítat smlouvu",
        reminderEnabled: false,
        reminderAtMs: null,
      },
    });
  });

  it("accepts a future reminder", () => {
    const reminderAtMs = new Date("2026-09-12T00:00:00.000Z").getTime();
    expect(
      normalizeContractNoteMutation(
        { text: "Přepočítat", reminderEnabled: true, reminderAtMs },
        nowMs
      )
    ).toEqual({
      ok: true,
      value: { text: "Přepočítat", reminderEnabled: true, reminderAtMs },
    });
  });

  it("rejects an empty or oversized note", () => {
    expect(normalizeContractNoteMutation({ text: "" }, nowMs)).toEqual({
      ok: false,
      error: "Text poznámky nesmí být prázdný.",
    });
    expect(
      normalizeContractNoteMutation(
        { text: "x".repeat(CONTRACT_NOTE_MAX_LENGTH + 1) },
        nowMs
      ).ok
    ).toBe(false);
  });

  it("requires a valid non-past date for enabled reminders", () => {
    expect(
      normalizeContractNoteMutation(
        { text: "Přepočítat", reminderEnabled: true, reminderAtMs: null },
        nowMs
      ).ok
    ).toBe(false);
    expect(
      normalizeContractNoteMutation(
        {
          text: "Přepočítat",
          reminderEnabled: true,
          reminderAtMs: nowMs - 2 * 24 * 60 * 60 * 1000,
        },
        nowMs
      ).ok
    ).toBe(false);
  });
});

describe("isSafeContractNoteId", () => {
  it("accepts Firestore document ids and rejects path traversal", () => {
    expect(isSafeContractNoteId("legacy")).toBe(true);
    expect(isSafeContractNoteId("abc-123_X")).toBe(true);
    expect(isSafeContractNoteId("../entry")).toBe(false);
    expect(isSafeContractNoteId("folder/note")).toBe(false);
  });
});
