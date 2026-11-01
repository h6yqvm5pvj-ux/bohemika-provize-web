import type { ContractDoc } from "./contractDetailTypes";

const email = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** Only select a root already present in the backend-authorized family response. */
export function unifiedContractDetail(
  selected: ContractDoc,
  timeline: ContractDoc[],
  ownerEmail: string | null | undefined
): ContractDoc {
  if (selected.entryType !== "endorsement" || !selected.rootContractEntryId) return selected;
  const owner = email(ownerEmail);
  if (!owner || (selected.userEmail && email(selected.userEmail) !== owner)) return selected;
  const candidates = timeline.filter(entry => entry.id === selected.rootContractEntryId &&
    entry.entryType !== "endorsement" && entry.productKey === selected.productKey &&
    (!entry.userEmail || email(entry.userEmail) === owner));
  return candidates.length === 1 ? candidates[0] : selected;
}

/** A stable target for inline amendment provenance links. */
export const contractTimelineEntryAnchor = (entryId: string) => `contract-entry-${entryId}`;

export function updateContractTimelineEntry(
  entries: ContractDoc[], entryId: string, update: (entry: ContractDoc) => ContractDoc
): ContractDoc[] {
  return entries.map(entry => entry.id === entryId ? update(entry) : entry);
}

/** Resolve a write target without ever replacing the main read-only view identity. */
export function contractEditSource(
  main: ContractDoc | null, entries: ContractDoc[], sourceEntryId: string | null,
  ownerEmail: string | null | undefined
): ContractDoc | null {
  const owner = email(ownerEmail);
  if (!main || !sourceEntryId || !owner || (main.userEmail && email(main.userEmail) !== owner)) return null;
  if (main.id === sourceEntryId) return main;
  const root = main.entryType === "endorsement" ? main.rootContractEntryId : main.id;
  const matches = entries.filter(entry => entry.id === sourceEntryId && entry.productKey === main.productKey &&
    (!entry.userEmail || email(entry.userEmail) === owner) &&
    (entry.entryType === "endorsement" ? entry.rootContractEntryId === root : entry.id === root));
  return matches.length === 1 ? matches[0] : null;
}
