import { describe, expect, it } from "vitest";
import type { ContactAudience, DirectoryContact } from "@/app/lib/contactDirectory";
import { DEFAULT_DIRECTORY_CONTACTS } from "./defaultContactDirectory";
import {
  assertContactGroupExists,
  canViewDirectoryContact,
  contactDirectoryNotificationIsRestricted,
  mergeStoredContactDirectories,
  normalizeContactGroupName,
  normalizeContactMemberUids,
  parseStoredContactDirectory,
  publicContactDirectoryVersion,
  type StoredContactGroup,
} from "./contactDirectory";

const contact = (id: string, audience: ContactAudience = { type: "everyone" }): DirectoryContact => ({
  id, institutionKey: "cpp", audience, person: `Test ${id}`, emails: [{ value: `${id}@example.test` }],
});
const group = (id = "group-a", members = ["member-a"]): StoredContactGroup => ({
  id, name: `Skupina ${id}`, memberUids: members, createdByUid: "specialist-a",
});
const snapshot = (data?: Record<string, unknown>) => ({ exists: data !== undefined, data: () => data });
const stored = (contacts: DirectoryContact[], groups: StoredContactGroup[] = []) => ({ contacts, groups, revision: 4, pillowDefaultsVersion: 1 });

describe("stored contact directory compatibility and fail-closed parsing", () => {
  it("uses all-Everyone defaults only when the document is absent", () => {
    const result = parseStoredContactDirectory(snapshot());
    expect(result).toEqual({ contacts: DEFAULT_DIRECTORY_CONTACTS, groups: [], revision: 0 });
    expect(result.contacts.length).toBeGreaterThan(0);
    expect(result.contacts.every(item => item.audience?.type === "everyone")).toBe(true);
  });

  it("treats legacy contacts with no audience as Everyone", () => {
    const oldContact = { id: "legacy", institutionKey: "cpp", emails: [{ value: "legacy@example.test" }] };
    expect(parseStoredContactDirectory(snapshot({ contacts: [oldContact], pillowDefaultsVersion: 1 }))).toEqual({
      contacts: [{ ...oldContact, audience: { type: "everyone" } }], groups: [], revision: 0,
    });
  });

  it.each([null, "everyone", { type: "administrator" }, { type: "group" }, { type: "group", groupId: "../other" }, { type: "everyone", groupId: "group-a" }])(
    "does not reinterpret a malformed saved audience as Everyone: %j", audience => {
      expect(() => parseStoredContactDirectory(snapshot({ ...stored([]), contacts: [{ ...contact("restricted"), audience }] }))).toThrow();
    },
  );

  it("rejects dangling group references instead of restoring public seed records", () => {
    expect(() => parseStoredContactDirectory(snapshot(stored([contact("restricted", { type: "group", groupId: "missing" })])))).toThrow();
  });

  it.each([
    {}, { contacts: null }, { contacts: [], groups: null }, { contacts: [], groups: {} },
    { contacts: [], revision: -1 }, { contacts: [], revision: 0.5 }, { contacts: [], revision: "4" },
  ])("rejects malformed existing state: %j", data => {
    expect(() => parseStoredContactDirectory(snapshot(data))).toThrow();
  });

  it.each([
    [group(), group()],
    [group(), { ...group("group-b"), name: "Skupina group-a" }],
    [{ ...group(), createdByUid: "../owner" }],
    [{ ...group(), memberUids: ["member-a", "member-a"] }],
    [{ ...group(), name: "Všichni" }],
    Array.from({ length: 31 }, (_, index) => group(`group-${index}`)),
  ].map(groups => ({ groups })))("rejects ambiguous or unsafe stored groups", ({ groups }) => {
    expect(() => parseStoredContactDirectory(snapshot(stored([], groups)))).toThrow();
  });

  it("preserves explicit restrictions and current revision", () => {
    const value = stored([contact("restricted", { type: "group", groupId: "group-a" })], [group()]);
    expect(parseStoredContactDirectory(snapshot(value))).toEqual({ contacts: value.contacts, groups: value.groups, revision: 4 });
  });

  it.each([198, 199, 200])("keeps a full legacy directory readable after Pillow backfill and a group save (%i)", count => {
    const contacts = Array.from({ length: count }, (_, index) => contact(`legacy-${index}`));
    const parsed = parseStoredContactDirectory(snapshot({ contacts }));
    expect(parsed.contacts).toHaveLength(200);
    expect(parsed.contacts.slice(0, count)).toEqual(contacts);
    const saved = parseStoredContactDirectory(snapshot({ ...parsed, groups: [group()], pillowDefaultsVersion: 1 }));
    expect(saved.contacts).toEqual(parsed.contacts);
    expect(saved.groups).toEqual([group()]);
  });
});

describe("split public and private contact directory storage", () => {
  it("preserves a legacy directory and its revision until private storage exists", () => {
    const contacts = [contact("public"), contact("private", { type: "group", groupId: "group-a" })];
    const groups = [group()];
    expect(mergeStoredContactDirectories(snapshot(stored(contacts, groups)), snapshot())).toEqual({
      contacts, groups, revision: 4, publicVersion: publicContactDirectoryVersion(contacts),
    });
  });

  it("uses the normalized public document for its version and the private document for groups and revision", () => {
    const legacyPublic = { id: "public", institutionKey: "cpp", emails: [{ value: "public@example.test" }] };
    const restricted = contact("private", { type: "group", groupId: "group-a" });
    const result = mergeStoredContactDirectories(
      snapshot({ contacts: [legacyPublic], revision: 99, pillowDefaultsVersion: 1 }),
      snapshot(stored([restricted], [group()])),
    );
    expect(result).toEqual({ contacts: [{ ...legacyPublic, audience: { type: "everyone" } }, restricted], groups: [group()], revision: 4,
      publicVersion: publicContactDirectoryVersion(parseStoredContactDirectory(snapshot({ contacts: [legacyPublic], pillowDefaultsVersion: 1 })).contacts),
    });
    expect(result.publicVersion).toMatch(/^[a-f\d]{64}$/);
  });

  it("lets the private restriction override an old public copy with the same ID", () => {
    const restricted = contact("same-id", { type: "group", groupId: "group-a" });
    const stalePublicCopy = { ...contact("same-id"), person: "Outdated synthetic public copy" };
    const result = mergeStoredContactDirectories(
      snapshot(stored([contact("public"), stalePublicCopy])),
      snapshot(stored([restricted], [group()])),
    );
    expect(result.contacts).toEqual([contact("public"), restricted]);
    expect(result.publicVersion).toBe(publicContactDirectoryVersion([contact("public"), stalePublicCopy]));
    expect(canViewDirectoryContact(result.contacts[1], result.groups, { uid: "member-b", canManage: false })).toBe(false);
    expect(canViewDirectoryContact(result.contacts[1], result.groups, { uid: "member-a", canManage: false })).toBe(true);
  });

  it("keeps public version stable across private edits but changes it when public content changes", () => {
    const publicSnapshot = snapshot(stored([contact("public")]));
    const before = mergeStoredContactDirectories(publicSnapshot, snapshot(stored([contact("private", { type: "specialists" })])));
    const after = mergeStoredContactDirectories(publicSnapshot, snapshot({ ...stored([contact("another-private", { type: "specialists" })]), revision: 5 }));
    const publicEdit = mergeStoredContactDirectories(snapshot(stored([{ ...contact("public"), person: "Syntetická úprava" }])), snapshot(stored([])));
    expect(after.publicVersion).toBe(before.publicVersion);
    expect(after.revision).toBe(5);
    expect(publicEdit.publicVersion).not.toBe(before.publicVersion);
  });

  it("merges up to 200 contacts per document without applying a combined 200-contact limit", () => {
    const publicContacts = Array.from({ length: 200 }, (_, index) => contact(`public-${index}`));
    const privateContacts = Array.from({ length: 200 }, (_, index) => contact(`private-${index}`, { type: "specialists" }));
    const result = mergeStoredContactDirectories(snapshot(stored(publicContacts)), snapshot(stored(privateContacts)));
    expect(result.contacts).toEqual([...publicContacts, ...privateContacts]);
    expect(result.publicVersion).toBe(publicContactDirectoryVersion(publicContacts));
  });

  it.each(["public", "private"])("fails closed for an oversized %s document", partition => {
    const publicContacts = Array.from({ length: partition === "public" ? 201 : 1 }, (_, index) => contact(`public-${index}`));
    const privateContacts = Array.from({ length: partition === "private" ? 201 : 1 }, (_, index) => contact(`private-${index}`, { type: "specialists" }));
    expect(() => mergeStoredContactDirectories(snapshot(stored(publicContacts)), snapshot(stored(privateContacts)))).toThrow();
  });

  it.each([
    stored([contact("public-in-private")]),
    stored([contact("dangling", { type: "group", groupId: "missing-group" })]),
    { contacts: null, groups: [], revision: 4, pillowDefaultsVersion: 1 },
    { ...stored([]), revision: -1 },
  ])("fails closed for invalid private storage instead of falling back to public state", privateState => {
    expect(() => mergeStoredContactDirectories(snapshot(stored([contact("public")])), snapshot(privateState))).toThrow();
  });
});

describe("contact group validation", () => {
  it.each(["Všichni", "VŠICHNI", "specialisti", "Specialisté", "", " ", "x".repeat(81), "Skupina\nA"])(
    "rejects reserved or invalid group names: %j", name => expect(normalizeContactGroupName(name)).toBeNull(),
  );
  it("accepts a custom group name while normalizing surrounding whitespace", () => {
    expect(normalizeContactGroupName("  Metodická podpora  ")).toBe("Metodická podpora");
  });
  it.each([null, "member-a", ["member-a", "member-a"], ["../member"], ["member\\other"], [" member "], ["x".repeat(129)], ["member\u0000other"], Array.from({ length: 201 }, (_, index) => `member-${index}`)].map(members => ({ members })))(
    "rejects malformed, duplicate or excessive member UIDs: %j", ({ members }) => expect(normalizeContactMemberUids(members)).toBeNull(),
  );
  it("supports an empty group and the maximum of 200 unique valid members", () => {
    expect(normalizeContactMemberUids([])).toEqual([]);
    const members = Array.from({ length: 200 }, (_, index) => `member-${index}`);
    expect(normalizeContactMemberUids(members)).toEqual(members);
  });
});

describe("contact visibility boundary", () => {
  const groups = [group()];
  it("allows Everyone to ordinary internal users", () => {
    expect(canViewDirectoryContact(contact("public"), groups, { uid: "ordinary", canManage: false })).toBe(true);
  });
  it("denies the specialist audience to ordinary users, even group members", () => {
    expect(canViewDirectoryContact(contact("specialist", { type: "specialists" }), groups, { uid: "member-a", canManage: false })).toBe(false);
  });
  it("allows only the actual UID's custom groups for ordinary users", () => {
    const restricted = contact("restricted", { type: "group", groupId: "group-a" });
    expect(canViewDirectoryContact(restricted, groups, { uid: "member-a", canManage: false })).toBe(true);
    expect(canViewDirectoryContact(restricted, groups, { uid: "member-b", canManage: false })).toBe(false);
    expect(canViewDirectoryContact(restricted, groups, { uid: "specialist-a", canManage: false })).toBe(false);
    expect(canViewDirectoryContact(restricted, [], { uid: "member-a", canManage: false })).toBe(false);
  });
  it.each<ContactAudience>([{ type: "everyone" }, { type: "specialists" }, { type: "group", groupId: "group-a" }])(
    "allows the common administrative/specialist editing role across audiences", audience => {
      expect(canViewDirectoryContact(contact("editable", audience), groups, { uid: "another-specialist", canManage: true })).toBe(true);
    },
  );
  it("requires a valid institution and a known custom group on contact writes", () => {
    expect(() => assertContactGroupExists(contact("known", { type: "group", groupId: "group-a" }), groups)).not.toThrow();
    expect(() => assertContactGroupExists(contact("unknown", { type: "group", groupId: "group-b" }), groups)).toThrow();
    expect(() => assertContactGroupExists({ ...contact("unknown"), institutionKey: "unknown" }, groups)).toThrow();
  });
});

describe("notification confidentiality", () => {
  it("keeps ordinary public changes eligible for their existing public summary", () => {
    expect(contactDirectoryNotificationIsRestricted([], [contact("public")])).toBe(false);
    expect(contactDirectoryNotificationIsRestricted([contact("public")], [])).toBe(false);
  });
  it("does not redact a public change just because another restricted contact exists", () => {
    const restricted = contact("restricted", { type: "specialists" });
    expect(contactDirectoryNotificationIsRestricted([restricted], [restricted, contact("public")])).toBe(false);
  });
  it.each(["new", "removed", "updated", "to-everyone", "from-everyone"])("requires a generic summary for a %s restricted contact", change => {
    const restricted = contact("private", { type: "specialists" });
    const before = change === "new" ? [] : change === "from-everyone" ? [contact("private")] : [restricted];
    const after = change === "removed" ? [] : change === "to-everyone" ? [contact("private")]
      : [{ ...restricted, person: "Upravený syntetický kontakt" }];
    expect(contactDirectoryNotificationIsRestricted(before, after)).toBe(true);
  });
});
