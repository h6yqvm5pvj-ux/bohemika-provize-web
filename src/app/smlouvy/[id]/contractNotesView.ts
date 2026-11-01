import { isSafeContractNoteId, type ContractNoteDto } from "@/app/api/contracts/notes/contractNotes";

export type ContractNotesViewState = { requestKey: string; notes: ContractNoteDto[]; nextCursor?: string | null };

export function contractNotesReadTarget(rootEntryId: string, requestedEntryId: string | null, linkedNoteId: string): {
  entryId: string; noteId?: string; sourceEntryId?: string;
} {
  return linkedNoteId && isSafeContractNoteId(linkedNoteId) && isSafeContractNoteId(requestedEntryId)
    ? { entryId: rootEntryId, noteId: linkedNoteId, sourceEntryId: requestedEntryId }
    : { entryId: rootEntryId };
}

export function contractNoteEntryId(note: ContractNoteDto, rootEntryId: string): string | null {
  const source = note.sourceEntryId ?? rootEntryId;
  return isSafeContractNoteId(source) ? source : null;
}

/** Keep storage identity internal; IDs such as "legacy" can occur in several sources. */
export function contractNoteViewKey(note: ContractNoteDto, rootEntryId: string): string {
  return `${encodeURIComponent(note.sourceEntryId ?? rootEntryId)}:${encodeURIComponent(note.id)}`;
}

export function sortedContractNotes(notes: ContractNoteDto[], rootEntryId: string): ContractNoteDto[] {
  const unique = new Map<string, ContractNoteDto>();
  for (const note of notes) {
    if (!isSafeContractNoteId(note.id) || !contractNoteEntryId(note, rootEntryId)) continue;
    const key = contractNoteViewKey(note, rootEntryId);
    const previous = unique.get(key);
    if (!previous || note.updatedAtMs >= previous.updatedAtMs) unique.set(key, note);
  }
  return [...unique.values()].sort((left, right) => right.createdAtMs - left.createdAtMs ||
    right.updatedAtMs - left.updatedAtMs || contractNoteViewKey(left, rootEntryId).localeCompare(contractNoteViewKey(right, rootEntryId)));
}

/** An old reminder URL identifies its physical source as well as the note ID. */
export function linkedContractNoteKey(
  notes: ContractNoteDto[], rootEntryId: string, requestedEntryId: string | null, noteId: string
): string | null {
  if (!noteId) return null;
  const matches = notes.filter(note => note.id === noteId);
  const exact = matches.filter(note => contractNoteEntryId(note, rootEntryId) === requestedEntryId);
  const selected = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
  return selected ? contractNoteViewKey(selected, rootEntryId) : null;
}

/** All operations address one logical policy; old notes retain their physical source. */
export function contractNoteMutationTarget(rootEntryId: string, note?: ContractNoteDto): {
  entryId: string; noteId?: string; sourceEntryId?: string;
} | null {
  if (!isSafeContractNoteId(rootEntryId)) return null;
  if (!note) return { entryId: rootEntryId };
  const sourceEntryId = contractNoteEntryId(note, rootEntryId);
  return sourceEntryId && isSafeContractNoteId(note.id)
    ? { entryId: rootEntryId, noteId: note.id, sourceEntryId }
    : null;
}

export function savedContractNoteView(
  state: ContractNotesViewState | null, requestKey: string, rootEntryId: string,
  note: ContractNoteDto, replacedKey?: string
): ContractNotesViewState | null {
  if (!state || state.requestKey !== requestKey) return state;
  const key = contractNoteViewKey(note, rootEntryId);
  return { ...state, notes: sortedContractNotes([
    ...state.notes.filter(current => {
      const currentKey = contractNoteViewKey(current, rootEntryId);
      return currentKey !== key && currentKey !== replacedKey;
    }), note,
  ], rootEntryId) };
}

export function removedContractNoteView(
  state: ContractNotesViewState | null, requestKey: string, rootEntryId: string, key: string
): ContractNotesViewState | null {
  if (!state || state.requestKey !== requestKey) return state;
  return { ...state, notes: state.notes.filter(note => contractNoteViewKey(note, rootEntryId) !== key) };
}

export function appendedContractNotesView(
  state: ContractNotesViewState | null, requestKey: string, rootEntryId: string, cursor: string,
  notes: ContractNoteDto[], nextCursor: string | null
): ContractNotesViewState | null {
  if (!state || state.requestKey !== requestKey || state.nextCursor !== cursor) return state;
  return { ...state, notes: sortedContractNotes([...state.notes, ...notes], rootEntryId), nextCursor };
}
