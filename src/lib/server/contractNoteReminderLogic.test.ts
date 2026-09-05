import { describe, expect, it } from "vitest";

import {
  contractNoteReminderDeepLink,
  contractNoteReminderMailboxId,
  contractNoteReminderTitle,
  resolveContractNoteReminderCandidate,
} from "./contractNoteReminderLogic";

const reminderData = {
  ownerEmail: "jakub.rauscher@bohemika.eu",
  reminderRecipientEmail: "manager@bohemika.eu",
  entryId: "entry-123",
  text: "Přepočítat smlouvu",
  contractNumber: "810480926",
  clientName: "Bianka Rauscherová",
  productKey: "allianzAuto",
  reminderEnabled: true,
  reminderAtMs: 1_800_000_000_000,
};

describe("contract note reminder logic", () => {
  it("returns a due reminder only once for a schedule", () => {
    expect(
      resolveContractNoteReminderCandidate({
        noteId: "note-1",
        data: reminderData,
        nowMs: reminderData.reminderAtMs,
      })
    ).toMatchObject({
      noteId: "note-1",
      recipientEmail: "manager@bohemika.eu",
      text: "Přepočítat smlouvu",
    });

    expect(
      resolveContractNoteReminderCandidate({
        noteId: "note-1",
        data: {
          ...reminderData,
          reminderLastSentForAtMs: reminderData.reminderAtMs,
        },
        nowMs: reminderData.reminderAtMs + 1,
      })
    ).toBeNull();
  });

  it("ignores disabled and future reminders", () => {
    expect(
      resolveContractNoteReminderCandidate({
        noteId: "note-1",
        data: { ...reminderData, reminderEnabled: false },
        nowMs: reminderData.reminderAtMs,
      })
    ).toBeNull();
    expect(
      resolveContractNoteReminderCandidate({
        noteId: "note-1",
        data: reminderData,
        nowMs: reminderData.reminderAtMs - 1,
      })
    ).toBeNull();
  });

  it("builds a direct contract link and stable mailbox id", () => {
    const reminder = resolveContractNoteReminderCandidate({
      noteId: "note-1",
      data: reminderData,
      nowMs: reminderData.reminderAtMs,
    });
    expect(reminder).not.toBeNull();
    expect(contractNoteReminderDeepLink(reminder!)).toContain(
      "/smlouvy/jakub.rauscher%40bohemika.eu___entry-123"
    );
    expect(contractNoteReminderDeepLink(reminder!)).toContain("noteId=note-1");
    expect(contractNoteReminderMailboxId(reminder!)).toMatch(/^contract-note-[a-z0-9]+$/);
    expect(contractNoteReminderMailboxId(reminder!)).toBe(
      contractNoteReminderMailboxId(reminder!)
    );
    expect(contractNoteReminderTitle(reminder!)).toBe(
      "Připomínka ke smlouvě 810480926"
    );
  });

  it("falls back to the note author as reminder recipient", () => {
    expect(
      resolveContractNoteReminderCandidate({
        noteId: "note-2",
        data: {
          ...reminderData,
          reminderRecipientEmail: undefined,
          createdByEmail: "autor@bohemika.eu",
        },
        nowMs: reminderData.reminderAtMs,
      })
    ).toMatchObject({ recipientEmail: "autor@bohemika.eu" });
  });
});
