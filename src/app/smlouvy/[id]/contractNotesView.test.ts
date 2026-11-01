import { describe, expect, it } from "vitest";
import type { ContractNoteDto } from "@/app/api/contracts/notes/contractNotes";
import {
  appendedContractNotesView, contractNoteMutationTarget, contractNotesReadTarget, contractNoteViewKey, linkedContractNoteKey,
  removedContractNoteView, savedContractNoteView, sortedContractNotes,
} from "./contractNotesView";

const note = (sourceEntryId: string, patch: Partial<ContractNoteDto> = {}): ContractNoteDto => ({
  id: "same-note", sourceEntryId, text: "Synthetic note", reminderEnabled: false, reminderAtMs: null,
  reminderLastSentForAtMs: null, reminderSentAtMs: null, createdAtMs: 10, updatedAtMs: 10, legacy: false, ...patch,
});

describe("one policy notes view", () => {
  it("keeps equal note IDs from original and amendments distinct, including legacy notes", () => {
    const notes = [note("root", { id: "legacy", legacy: true }), note("change", { id: "legacy", legacy: true })];
    expect(new Set(notes.map(item => contractNoteViewKey(item, "root"))).size).toBe(2);
    expect(sortedContractNotes(notes, "root")).toHaveLength(2);
    expect(contractNoteViewKey(note("a:b", { id: "c" }), "root"))
      .not.toBe(contractNoteViewKey(note("a", { id: "b:c" }), "root"));
  });

  it("merges sources chronologically and deduplicates only the same physical note", () => {
    const root = note("root", { updatedAtMs: 20 });
    const addon = note("change", { updatedAtMs: 30 });
    const original = [root, addon, { ...root, updatedAtMs: 5 }];
    expect(sortedContractNotes(original, "root")).toEqual([addon, root]);
    expect(original).toHaveLength(3);
    expect(sortedContractNotes([note("old", { createdAtMs: 1, updatedAtMs: 100 }), note("new", { createdAtMs: 20 })], "root")
      .map(item => item.sourceEntryId)).toEqual(["new", "old"]);
  });

  it("keeps old amendment reminder links on their exact note when IDs collide", () => {
    const notes = [note("root"), note("change")];
    expect(linkedContractNoteKey(notes, "root", "change", "same-note")).toBe("change:same-note");
    expect(linkedContractNoteKey(notes, "root", "root", "same-note")).toBe("root:same-note");
    expect(linkedContractNoteKey(notes, "root", "missing", "same-note")).toBeNull();
    expect(linkedContractNoteKey(notes, "root", "change", "missing-note")).toBeNull();
    expect(linkedContractNoteKey([notes[1]], "root", "root", "same-note")).toBe("change:same-note");
  });

  it("always creates new notes on the root while preserving the storage source of old notes", () => {
    expect(contractNoteMutationTarget("root")).toEqual({ entryId: "root" });
    expect(contractNoteMutationTarget("root", note("change"))).toEqual({ entryId: "root", noteId: "same-note", sourceEntryId: "change" });
    const old = note("root");
    delete old.sourceEntryId;
    expect(contractNoteMutationTarget("root", old)).toEqual({ entryId: "root", noteId: "same-note", sourceEntryId: "root" });
    expect(contractNoteMutationTarget("../foreign", old)).toBeNull();
    expect(contractNoteMutationTarget("root", note("../foreign"))).toBeNull();
  });

  it("loads one root feed and pins an old reminder by its exact source without a note scope selector", () => {
    expect(contractNotesReadTarget("root", "change", "")).toEqual({ entryId: "root" });
    expect(contractNotesReadTarget("root", "change", "old-note")).toEqual({ entryId: "root", noteId: "old-note", sourceEntryId: "change" });
    expect(contractNotesReadTarget("root", "../foreign", "old-note")).toEqual({ entryId: "root" });
    expect(contractNotesReadTarget("root", "change", "../note")).toEqual({ entryId: "root" });
  });

  it("edits or migrates one physical legacy note without overwriting an equal ID on another source", () => {
    const root = note("root", { id: "legacy", legacy: true });
    const addon = note("change", { id: "legacy", legacy: true });
    const migrated = note("change", { id: "migrated", updatedAtMs: 20 });
    const state = { requestKey: "owner:root", notes: [root, addon] };
    const updated = savedContractNoteView(state, state.requestKey, "root", migrated, "change:legacy")!;
    expect(updated.notes).toEqual([migrated, root]);
    expect(state.notes).toEqual([root, addon]);
    expect(removedContractNoteView(updated, state.requestKey, "root", "change:migrated")?.notes).toEqual([root]);
  });

  it("ignores an old response after navigating to another policy or impersonated account", () => {
    const current = { requestKey: "new-owner:new-policy", notes: [note("new-policy")] };
    expect(savedContractNoteView(current, "old-owner:old-policy", "old-policy", note("old-policy"))).toBe(current);
    expect(removedContractNoteView(current, "old-owner:old-policy", "old-policy", "new-policy:same-note")).toBe(current);
  });

  it("appends older notes to the same feed without duplicating a pinned reminder or accepting an outdated cursor", () => {
    const recent = note("root", { createdAtMs: 20 });
    const pinned = note("change", { createdAtMs: 1 });
    const state = { requestKey: "owner:root", notes: [recent, pinned], nextCursor: "page-two" };
    const older = note("root", { id: "older", createdAtMs: 10 });
    const appended = appendedContractNotesView(state, state.requestKey, "root", "page-two", [older, pinned], "page-three")!;
    expect(appended.notes).toEqual([recent, older, pinned]);
    expect(appended.nextCursor).toBe("page-three");
    expect(state.notes).toHaveLength(2);
    expect(appendedContractNotesView(appended, state.requestKey, "root", "page-two", [older], null)).toBe(appended);
    expect(appendedContractNotesView(appended, "other-owner:root", "root", "page-three", [older], null)).toBe(appended);
  });
});
