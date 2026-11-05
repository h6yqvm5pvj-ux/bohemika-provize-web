import { createHash } from "node:crypto";
import {
  CONTACT_INSTITUTION_BY_KEY,
  normalizeDirectoryContacts,
  type ContactAudience,
  type DirectoryContact,
} from "@/app/lib/contactDirectory";
import { DEFAULT_DIRECTORY_CONTACTS } from "./defaultContactDirectory";

export const CONTACT_DIRECTORY_REF = "appConfig/contactDirectory";
export const CONTACT_DIRECTORY_RESTRICTED_REF = "appConfig/contactDirectoryRestricted";
export const CONTACT_DIRECTORY_MAX_BYTES = 800_000;
export const CONTACT_DIRECTORY_MAX_GROUPS = 30;
export const CONTACT_GROUP_MAX_MEMBERS = 200;
export const PILLOW_DEFAULTS_VERSION = 1;

export type StoredContactGroup = {
  id: string;
  name: string;
  memberUids: string[];
  createdByUid: string;
};
export type StoredContactDirectory = {
  contacts: DirectoryContact[];
  groups: StoredContactGroup[];
  revision: number;
};
export type LoadedContactDirectory = StoredContactDirectory & { publicVersion: string };

export const publicContactDirectoryVersion = (contacts: DirectoryContact[]): string =>
  createHash("sha256").update(JSON.stringify(contacts)).digest("hex");

export function mergeStoredContactDirectories(
  publicSnapshot: Parameters<typeof parseStoredContactDirectory>[0],
  restrictedSnapshot: Parameters<typeof parseStoredContactDirectory>[0],
): LoadedContactDirectory {
  const publicState = parseStoredContactDirectory(publicSnapshot);
  const publicVersion = publicContactDirectoryVersion(publicState.contacts);
  if (!restrictedSnapshot.exists) return { ...publicState, publicVersion };
  const restricted = parseStoredContactDirectory(restrictedSnapshot);
  if (restricted.contacts.some(contact => contact.audience?.type === "everyone")) {
    throw new Error("Invalid restricted contact directory");
  }
  const restrictedIds = new Set(restricted.contacts.map(contact => contact.id));
  return {
    contacts: [...publicState.contacts.filter(contact => !restrictedIds.has(contact.id)), ...restricted.contacts],
    groups: restricted.groups,
    revision: restricted.revision,
    publicVersion,
  };
}

export class ContactDirectoryError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export const isContactDirectoryId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);

export const isContactMemberUid = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128 &&
  value.trim() === value && !/[\u0000-\u001f\u007f/\\]/.test(value);

export function normalizeContactMemberUids(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > CONTACT_GROUP_MAX_MEMBERS ||
      !value.every(isContactMemberUid) || new Set(value).size !== value.length) return null;
  return [...value];
}

export const contactGroupNameKey = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function normalizeContactGroupName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) ||
      ["vsichni", "specialisti", "specialiste"].includes(contactGroupNameKey(name))) return null;
  return name;
}

export function parseStoredContactDirectory(snapshot: {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}): StoredContactDirectory {
  if (!snapshot.exists) return { contacts: DEFAULT_DIRECTORY_CONTACTS, groups: [], revision: 0 };
  const data = snapshot.data();
  const contacts = normalizeDirectoryContacts(data?.contacts);
  // An invalid saved restriction must never restore a public seed contact.
  if (!data || !contacts) throw new Error("Invalid stored contact directory");
  const rawGroups = data.groups === undefined ? [] : data.groups;
  const revision = data.revision === undefined ? 0 : data.revision;
  if (!Array.isArray(rawGroups) || rawGroups.length > CONTACT_DIRECTORY_MAX_GROUPS ||
      !Number.isSafeInteger(revision) || Number(revision) < 0) throw new Error("Invalid stored contact directory");
  const groups: StoredContactGroup[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const raw of rawGroups) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid stored contact group");
    const row = raw as Record<string, unknown>;
    const name = normalizeContactGroupName(row.name);
    const members = normalizeContactMemberUids(row.memberUids);
    if (!isContactDirectoryId(row.id) || ids.has(row.id) || !name || names.has(contactGroupNameKey(name)) ||
        !members || !isContactMemberUid(row.createdByUid)) throw new Error("Invalid stored contact group");
    ids.add(row.id);
    names.add(contactGroupNameKey(name));
    groups.push({ id: row.id, name, memberUids: members, createdByUid: row.createdByUid });
  }
  for (const contact of contacts) {
    if (contact.audience?.type === "group" && !ids.has(contact.audience.groupId)) throw new Error("Missing stored contact group");
  }
  if (data.pillowDefaultsVersion !== PILLOW_DEFAULTS_VERSION) {
    // Preserve the existing Pillow backfill, without duplicating edited records.
    for (const seed of DEFAULT_DIRECTORY_CONTACTS.filter(contact => contact.institutionKey === "pillow")) {
      if (contacts.length >= 200) break;
      if (!contacts.some(contact => contact.institutionKey === seed.institutionKey && (
        contact.id === seed.id || (seed.phone && contact.phone?.href === seed.phone.href) ||
        seed.emails?.some(email => contact.emails?.some(other => other.value.toLowerCase() === email.value.toLowerCase()))
      ))) contacts.push(seed);
    }
  }
  return { contacts, groups, revision: Number(revision) };
}

export function canViewDirectoryContact(
  contact: DirectoryContact,
  groups: StoredContactGroup[],
  viewer: { uid: string; canManage: boolean },
): boolean {
  if (viewer.canManage) return true;
  const audience: ContactAudience = contact.audience ?? { type: "everyone" };
  if (audience.type === "everyone") return true;
  if (audience.type === "specialists") return false;
  return groups.some(group => group.id === audience.groupId && group.memberUids.includes(viewer.uid));
}

export function contactDirectoryNotificationIsRestricted(
  previous: DirectoryContact[], next: DirectoryContact[],
): boolean {
  const previousById = new Map(previous.map(contact => [contact.id, contact]));
  const nextById = new Map(next.map(contact => [contact.id, contact]));
  for (const id of new Set([...previousById.keys(), ...nextById.keys()])) {
    const before = previousById.get(id);
    const after = nextById.get(id);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if ((before?.audience?.type ?? "everyone") !== "everyone" ||
        (after?.audience?.type ?? "everyone") !== "everyone") return true;
  }
  return false;
}

export function assertContactGroupExists(contact: DirectoryContact, groups: StoredContactGroup[]) {
  const audience = contact.audience;
  if (!CONTACT_INSTITUTION_BY_KEY.has(contact.institutionKey) ||
      (audience?.type === "group" && !groups.some(group => group.id === audience.groupId))) {
    throw new ContactDirectoryError(400, "Vyberte existující skupinu kontaktu.");
  }
}
