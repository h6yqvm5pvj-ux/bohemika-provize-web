import type { Firestore } from "firebase-admin/firestore";
import { clientIdentityKey } from "@/app/_klienti/clientIdentity";
import { selectClientContracts, type ClientScopeSelection } from "@/app/_klienti/clientScope";
import type { ClientContractItem } from "@/app/_klienti/clientCardHelpers";
import type { SharedContractSummary } from "@/app/_klienti/sharedClientContracts";
import { CLIENT_CONTRACT_LINKS_COLLECTION, clientContractFromIndex } from "./clientContractIndex";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const phoneKey = (value: unknown) => {
  const raw = text(value);
  if (!/^[+\d\s()./-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (!/^\d{9,15}$/.test(digits) || /^(\d)\1+$/.test(digits)) return "";
  if (digits.length === 9) digits = `420${digits}`;
  return digits;
};
const emailKey = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value)) ? text(value).toLowerCase() : "";
export const hasClientSharingContact = (contract: ClientContractItem) => Boolean(phoneKey(contract.clientPhone) || emailKey(contract.clientEmail));

export function matchesSharedClient(anchor: ClientContractItem, candidate: ClientContractItem): boolean {
  const name = clientIdentityKey(anchor.clientName);
  if (!name || name !== clientIdentityKey(candidate.clientName)) return false;
  const phone = phoneKey(anchor.clientPhone), email = emailKey(anchor.clientEmail);
  return Boolean((phone && phone === phoneKey(candidate.clientPhone)) || (email && email === emailKey(candidate.clientEmail)));
}

export type ClientSharingViewer = {
  email: string;
  teamEmails: string[];
  selection: ClientScopeSelection | null;
  adviserNames: Map<string, string | null>;
};

export function clientSharingAnchors(contracts: ClientContractItem[], viewer: ClientSharingViewer): ClientContractItem[] {
  const owners = new Set([viewer.email, ...viewer.teamEmails]);
  const authorized = contracts.filter(contract => owners.has(contract.adviserEmail ?? ""));
  return viewer.selection ? selectClientContracts(authorized, viewer.email, viewer.selection, viewer.teamEmails.map(email => ({ email, name: viewer.adviserNames.get(email) ?? null }))) : authorized;
}

/** Contacts select related contracts only within the independently authorized
 * owner/team scope. Editable contact data never grants access to outsiders. */
export async function readSharedClientContracts(db: Firestore, slug: string, viewer: ClientSharingViewer) {
  const allowedOwners = new Set([viewer.email, ...viewer.teamEmails]);
  const snapshot = await db.collection(CLIENT_CONTRACT_LINKS_COLLECTION).where("clientSlug", "==", slug).get();
  const candidates = snapshot.docs.map(doc => ({ data: doc.data() })).filter(({ data }) => data.clientSlug === slug && typeof data.ownerEmail === "string" && allowedOwners.has(data.ownerEmail) && typeof data.entryId === "string" && data.entryType !== "endorsement");
  const fullItem = (data: Record<string, unknown>) => clientContractFromIndex(data, viewer.adviserNames.get(String(data.ownerEmail)) ?? null);
  const anchors = clientSharingAnchors(candidates.map(({ data }) => fullItem(data)), viewer);
  if (!anchors.length) return null;
  const anchorKeys = new Set(anchors.map(item => `${item.adviserEmail}\0${item.id}`));
  const contracts: ClientContractItem[] = [];
  const summaries: SharedContractSummary[] = [];
  for (const { data } of candidates) {
    if (anchorKeys.has(`${data.ownerEmail}\0${data.entryId}`)) continue;
    const candidate = fullItem(data);
    if (!anchors.some(anchor => matchesSharedClient(anchor, candidate))) continue;
    contracts.push(candidate);
  }
  return { contracts, summaries, matchingAvailable: anchors.some(hasClientSharingContact) };
}
