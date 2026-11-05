import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactAudience, DirectoryContact } from "@/app/lib/contactDirectory";
import { DEFAULT_DIRECTORY_CONTACTS } from "@/lib/server/defaultContactDirectory";
import {
  CONTACT_DIRECTORY_REF,
  CONTACT_DIRECTORY_RESTRICTED_REF,
  mergeStoredContactDirectories,
  parseStoredContactDirectory,
  publicContactDirectoryVersion,
  type StoredContactGroup,
} from "@/lib/server/contactDirectory";

const mocks = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), doc: vi.fn(), transaction: vi.fn(), canManage: vi.fn(), requireAdvisor: vi.fn(),
  loadAllEmails: vi.fn(), sendBroadcast: vi.fn(), writeMailbox: vi.fn(), members: vi.fn(),
  stored: null as Record<string, unknown> | null,
  restrictedStored: null as Record<string, unknown> | null,
}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: vi.fn(() => "server-timestamp") } }));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.requireAdvisor,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { doc: mocks.doc, runTransaction: mocks.transaction } }));
vi.mock("@/lib/server/toolDocuments", () => ({ canManageToolDocuments: mocks.canManage }));
vi.mock("@/lib/server/contactDirectoryMembers", () => ({ loadContactDirectoryMembers: mocks.members }));
vi.mock("@/lib/server/adminBroadcastNotifications", () => ({ loadAllBroadcastUserEmails: mocks.loadAllEmails, sendAdminBroadcastNow: mocks.sendBroadcast }));
vi.mock("@/lib/server/mailbox", () => ({ writeMailboxEntries: mocks.writeMailbox }));

import { GET, PUT } from "./route";

const authContext = { email: "specialist@example.test", uid: "specialist-uid", decoded: {}, rateLimit: {} };
const contact = (id: string, audience: ContactAudience = { type: "everyone" }): DirectoryContact => ({
  id, institutionKey: "cpp", audience, person: `Test ${id}`, emails: [{ value: `${id}@example.test` }],
});
const group = (id: string, memberUids: string[], createdByUid = "specialist-uid"): StoredContactGroup => ({
  id, name: `Skupina ${id}`, memberUids, createdByUid,
});
const store = (contacts: DirectoryContact[], groups: StoredContactGroup[] = [], revision = 3) => {
  mocks.stored = { contacts: contacts.filter(item => item.audience?.type === "everyone"), groups: [], revision, pillowDefaultsVersion: 1 };
  mocks.restrictedStored = { contacts: contacts.filter(item => item.audience?.type !== "everyone"), groups, revision, pillowDefaultsVersion: 1 };
};
const storeLegacy = (contacts: DirectoryContact[], groups: StoredContactGroup[] = [], revision = 0) => {
  mocks.stored = { contacts, groups, revision, pillowDefaultsVersion: 1 };
  mocks.restrictedStored = null;
};
type DocumentRef = { path: string };
const snapshot = (value: Record<string, unknown> | null) => {
  const data = value === null ? undefined : structuredClone(value);
  return { exists: data !== undefined, data: () => data === undefined ? undefined : structuredClone(data) };
};
const directoryState = () => mergeStoredContactDirectories(snapshot(mocks.stored), snapshot(mocks.restrictedStored));
const publicVersion = () => publicContactDirectoryVersion(parseStoredContactDirectory(snapshot(mocks.stored)).contacts);
const storedDocuments = () => structuredClone({ public: mocks.stored, restricted: mocks.restrictedStored });
const getRequest = (query = "") => new NextRequest(`https://app.example.test/api/contacts${query}`);
const putRequest = (body: unknown, headers: Record<string, string> = {}) => new NextRequest("https://app.example.test/api/contacts", {
  method: "PUT", headers: { "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const revisionWrite = (operation: string, payload: Record<string, unknown>, revision = 3) =>
  putRequest({ operation, revision, publicVersion: publicVersion(), ...payload });
const forUser = (uid: string, canManage = false) => {
  mocks.requireAdvisor.mockResolvedValue({ ok: true, ctx: { ...authContext, uid, email: `${uid}@example.test` } });
  mocks.canManage.mockResolvedValue(canManage);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stored = null;
  mocks.restrictedStored = null;
  mocks.requireAdvisor.mockResolvedValue({ ok: true, ctx: authContext });
  mocks.canManage.mockResolvedValue(false);
  mocks.doc.mockImplementation((path: string) => ({ path, get: () => mocks.get({ path }) }));
  mocks.get.mockImplementation(async (ref: DocumentRef, documents = storedDocuments()) => {
    if (ref.path === CONTACT_DIRECTORY_REF) return snapshot(documents.public);
    if (ref.path === CONTACT_DIRECTORY_RESTRICTED_REF) return snapshot(documents.restricted);
    throw new Error("Unexpected test document path");
  });
  let tail = Promise.resolve();
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    const previous = tail;
    let unlock!: () => void;
    tail = new Promise(resolve => { unlock = resolve; });
    await previous;
    const documents = storedDocuments();
    const writes: Array<{ ref: DocumentRef; data: Record<string, unknown>; options: { merge: boolean } }> = [];
    try {
      const result = await callback({
        get: (ref: DocumentRef) => mocks.get(ref, documents),
        set: (ref: DocumentRef, data: Record<string, unknown>, options: { merge: boolean }) => {
          if (![CONTACT_DIRECTORY_REF, CONTACT_DIRECTORY_RESTRICTED_REF].includes(ref.path)) throw new Error("Unexpected test document path");
          writes.push({ ref, data: structuredClone(data), options });
        },
      });
      for (const write of writes) {
        mocks.set(write.ref, write.data, write.options);
        if (write.ref.path === CONTACT_DIRECTORY_REF) mocks.stored = { ...(write.options.merge ? mocks.stored : null), ...write.data };
        else mocks.restrictedStored = { ...(write.options.merge ? mocks.restrictedStored : null), ...write.data };
      }
      return result;
    } finally { unlock(); }
  });
  mocks.loadAllEmails.mockResolvedValue(["first@example.test", "second@example.test"]);
  mocks.writeMailbox.mockResolvedValue({ written: 2 });
  mocks.sendBroadcast.mockResolvedValue({ ok: true, sent: 2 });
  mocks.members.mockResolvedValue([
    { uid: "member-a", name: "Člen A", email: "member-a@example.test" },
    { uid: "member-b", name: "Člen B", email: "member-b@example.test" },
    { uid: "specialist-uid", name: "Specialista", email: "specialist@example.test" },
  ]);
});

describe("contact directory reads and legacy assignment", () => {
  it("assigns every initial contact to Everyone without a database write", async () => {
    const response = await GET(getRequest());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, canManage: false, groups: [], revision: 0,
      publicVersion: publicContactDirectoryVersion(DEFAULT_DIRECTORY_CONTACTS) });
    expect(payload.contacts).toEqual(DEFAULT_DIRECTORY_CONTACTS);
    expect(payload.contacts.every((item: DirectoryContact) => item.audience?.type === "everyone")).toBe(true);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization, Cookie");
    expect(mocks.doc).toHaveBeenCalledWith(CONTACT_DIRECTORY_REF);
    expect(mocks.doc).toHaveBeenCalledWith(CONTACT_DIRECTORY_RESTRICTED_REF);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT"] as const)("rejects unauthenticated %s before reading storage or roles", async method => {
    mocks.requireAdvisor.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const response = await (method === "GET" ? GET(getRequest()) : PUT(putRequest({ contacts: [] })));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.canManage).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("normalizes existing contacts without audience to Everyone and keeps the Pillow backfill", async () => {
    const existing = { id: "existing-cpp", institutionKey: "cpp", emails: [{ value: "existing@example.test" }] };
    mocks.stored = { contacts: [existing] };
    const payload = await (await GET(getRequest())).json();
    expect(payload.contacts).toEqual([{ ...existing, audience: { type: "everyone" } }, ...DEFAULT_DIRECTORY_CONTACTS.filter(item => item.institutionKey === "pillow")]);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it.each(["id", "email", "phone"] as const)("does not duplicate edited Pillow contacts by %s", async match => {
    const seeds = DEFAULT_DIRECTORY_CONTACTS.filter(item => item.institutionKey === "pillow");
    const first = seeds[0];
    const edited: DirectoryContact = {
      id: match === "id" ? first.id : "edited-pillow", institutionKey: "pillow", person: "Syntetická podpora",
      emails: [{ value: match === "email" ? first.emails![0].value.toUpperCase() : "edited@example.test" }],
      ...(match === "phone" ? { phone: first.phone } : {}),
    };
    mocks.stored = { contacts: [edited] };
    const payload = await (await GET(getRequest())).json();
    expect(payload.contacts).toEqual([{ ...edited, audience: { type: "everyone" } }, seeds[1]]);
  });

  it("does not restore intentionally deleted contacts in a current directory", async () => {
    store([]);
    expect((await (await GET(getRequest())).json()).contacts).toEqual([]);
  });

  it.each([
    { type: "unknown" }, null, { type: "group", groupId: "missing-group" }, { type: "group", groupId: "../other" },
  ])("fails closed for an invalid saved restriction instead of returning public defaults: %j", async audience => {
    mocks.stored = { contacts: [{ ...contact("restricted"), audience }], pillowDefaultsVersion: 1 };
    const response = await GET(getRequest());
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).not.toHaveProperty("contacts");
    expect(JSON.stringify(payload)).not.toContain("restricted@example.test");
  });

  it("shows an ordinary user only Everyone and their UID's own groups, with no member list", async () => {
    const publicContact = contact("public");
    const specialistContact = contact("specialist", { type: "specialists" });
    const ownContact = contact("group-a-contact", { type: "group", groupId: "group-a" });
    const foreignContact = contact("group-b-contact", { type: "group", groupId: "group-b" });
    store([publicContact, specialistContact, ownContact, foreignContact], [group("group-a", ["member-a"]), group("group-b", ["member-b"])]);
    forUser("member-a");
    const response = await GET(getRequest("?uid=member-b&role=admin&groupId=group-b"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.contacts).toEqual([publicContact, ownContact]);
    expect(payload.groups).toEqual([{ id: "group-a", name: "Skupina group-a", memberCount: 1 }]);
    expect(payload).toMatchObject({ canManage: false, revision: 3, publicVersion: publicContactDirectoryVersion([publicContact]) });
    expect(mocks.members).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain("member-b");
    expect(JSON.stringify(payload)).not.toContain("group-b");
    expect(JSON.stringify(payload)).not.toContain("specialist@example.test");
  });

  it("does not grant a group creator visibility after they cease being a specialist unless they are a member", async () => {
    store([contact("restricted", { type: "group", groupId: "owned-group" })], [group("owned-group", [], "former-specialist")]);
    forUser("former-specialist");
    const payload = await (await GET(getRequest())).json();
    expect(payload.contacts).toEqual([]);
    expect(payload.groups).toEqual([]);
  });

  it("lets administrators and every specialist view all contacts and group editing metadata", async () => {
    const restricted = contact("restricted", { type: "group", groupId: "foreign-group" });
    store([contact("public"), contact("specialist", { type: "specialists" }), restricted], [group("foreign-group", ["member-a"], "another-specialist")]);
    forUser("specialist-b", true);
    const payload = await (await GET(getRequest())).json();
    expect(payload.contacts).toHaveLength(3);
    expect(payload.groups).toEqual([{ id: "foreign-group", name: "Skupina foreign-group", memberCount: 1,
      members: [{ uid: "member-a", name: "Člen A", email: "member-a@example.test" }] }]);
    expect(JSON.stringify(payload)).not.toContain("createdByUid");
  });

  it("does not disclose a restricted contact copied into the public document by an old client", async () => {
    const restricted = contact("copied-contact", { type: "group", groupId: "private-group" });
    store([contact("public"), restricted], [group("private-group", ["member-b"])]);
    mocks.stored!.contacts = [contact("public"), { ...restricted, audience: { type: "everyone" }, person: "Outdated public copy" }];
    forUser("member-a");
    const response = await GET(getRequest());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.contacts).toEqual([contact("public")]);
    expect(payload.groups).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("copied-contact");
    expect(JSON.stringify(payload)).not.toContain("private-group");
    expect(JSON.stringify(payload)).not.toContain("Outdated public copy");
    forUser("member-b");
    expect((await (await GET(getRequest())).json()).contacts).toEqual([contact("public"), restricted]);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("fails closed when the private document contains a malformed restriction", async () => {
    store([contact("public")]);
    mocks.restrictedStored!.contacts = [{ ...contact("private"), audience: null }];
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await GET(getRequest());
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ ok: false, error: "Kontakty se momentálně nepodařilo načíst." });
      expect(spy).toHaveBeenCalledExactlyOnceWith("CONTACT_DIRECTORY_READ_FAILED");
    } finally { spy.mockRestore(); }
  });
});

describe("contact directory writes and concurrency", () => {
  it.each(["saveContact", "deleteContact", "saveGroup", "deleteGroup"])("rejects ordinary-user %s even with forged roles", async operation => {
    const response = await PUT(revisionWrite(operation, { role: "admin", specialist: true, uid: "administrator", contacts: [] }));
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("keeps the legacy all-Everyone save working but persists the new schema and server version", async () => {
    mocks.canManage.mockResolvedValue(true);
    const legacy = { id: "pillow-kam", institutionKey: "pillow", person: "Syntetická podpora", emails: [{ value: "support@example.test" }] };
    const response = await PUT(putRequest({ contacts: [legacy], pillowDefaultsVersion: 999 }));
    const payload = await response.json();
    const canonicalLegacy = parseStoredContactDirectory(snapshot({ contacts: [legacy], pillowDefaultsVersion: 1 })).contacts;
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ canManage: true, groups: [], revision: 1, notificationSent: true,
      publicVersion: publicContactDirectoryVersion(canonicalLegacy) });
    expect(payload.contacts).toEqual([{ ...legacy, audience: { type: "everyone" } }]);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ path: CONTACT_DIRECTORY_REF }),
      expect.objectContaining({ contacts: [{ ...legacy, audience: { type: "everyone" } }], groups: [], audienceSchemaVersion: 1,
        pillowDefaultsVersion: 1, revision: 1, updatedByEmail: authContext.email }), { merge: true });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ path: CONTACT_DIRECTORY_RESTRICTED_REF }),
      expect.objectContaining({ contacts: [], groups: [], revision: 1, audienceSchemaVersion: 1,
        pillowDefaultsVersion: 1, updatedByEmail: authContext.email }), { merge: true });
  });

  it.each(["restricted", "groups", "new-restriction"])("prevents an old bulk client from dropping hidden restrictions: %s", async variant => {
    mocks.canManage.mockResolvedValue(true);
    storeLegacy([contact("public")], variant === "groups" ? [group("custom-group", [])] : []);
    if (variant === "restricted") storeLegacy([contact("public"), contact("secret", { type: "specialists" })]);
    const before = storedDocuments();
    const response = await PUT(putRequest({ contacts: [contact("replacement", variant === "new-restriction" ? { type: "specialists" } : { type: "everyone" })] }));
    expect(response.status).toBe(400);
    expect(storedDocuments()).toEqual(before);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it.each(["revision", "schema"])("rejects a revisionless bulk save after a modern %s marker without deleting public additions", async marker => {
    mocks.canManage.mockResolvedValue(true);
    storeLegacy([contact("old-public"), contact("new-public")], [], marker === "revision" ? 1 : 0);
    if (marker === "schema") mocks.stored!.audienceSchemaVersion = 1;
    const before = storedDocuments();
    const response = await PUT(putRequest({ contacts: [contact("old-public")] }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "contact-directory/revision-conflict" });
    expect(storedDocuments()).toEqual(before);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it("keeps revisionless saves compatible with an untouched legacy revision-zero directory", async () => {
    mocks.canManage.mockResolvedValue(true);
    mocks.stored = { contacts: [{ id: "legacy", institutionKey: "cpp", emails: [{ value: "legacy@example.test" }] }], pillowDefaultsVersion: 1 };
    const response = await PUT(putRequest({ contacts: [contact("replacement")] }));
    expect(response.status).toBe(200);
    expect(mocks.stored?.contacts).toEqual([contact("replacement")]);
    expect(mocks.stored?.revision).toBe(1);
    expect(mocks.stored?.audienceSchemaVersion).toBe(1);
    expect(mocks.restrictedStored).toMatchObject({ contacts: [], groups: [], revision: 1 });
  });

  it("rejects a legacy bulk save once private storage exists, including at revision zero", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([contact("public")], [], 0);
    const before = storedDocuments();
    const response = await PUT(putRequest({ contacts: [contact("replacement")] }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "contact-directory/revision-conflict" });
    expect(storedDocuments()).toEqual(before);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it("merges a single contact update without removing other restricted records", async () => {
    mocks.canManage.mockResolvedValue(true);
    const hidden = contact("hidden", { type: "group", groupId: "foreign-group" });
    store([contact("public"), hidden], [group("foreign-group", ["member-b"])]);
    const edited = { ...contact("public"), person: "Aktualizovaný veřejný kontakt" };
    const response = await PUT(revisionWrite("saveContact", { contact: edited }));
    expect(response.status).toBe(200);
    expect(directoryState()).toMatchObject({ contacts: [edited, hidden], groups: [group("foreign-group", ["member-b"])], revision: 4 });
    expect(mocks.stored).toMatchObject({ contacts: [edited], groups: [], revision: 4 });
    expect(mocks.restrictedStored).toMatchObject({ contacts: [hidden], groups: [group("foreign-group", ["member-b"])], revision: 4 });
    expect(mocks.set).toHaveBeenCalledTimes(2);
  });

  it("migrates legacy restrictions and groups out of the public document on a modern mutation", async () => {
    mocks.canManage.mockResolvedValue(true);
    const hidden = contact("legacy-private", { type: "group", groupId: "legacy-group" });
    const privateGroup = group("legacy-group", ["member-a"]);
    storeLegacy([contact("public"), hidden], [privateGroup], 3);
    const response = await PUT(revisionWrite("saveContact", { contact: contact("new-public") }));
    expect(response.status).toBe(200);
    expect(mocks.stored).toMatchObject({ contacts: [contact("public"), contact("new-public")], groups: [], revision: 4 });
    expect(mocks.restrictedStored).toMatchObject({ contacts: [hidden], groups: [privateGroup], revision: 4 });
    expect((await response.json()).publicVersion).toBe(publicContactDirectoryVersion([contact("public"), contact("new-public")]));
    forUser("member-b");
    expect((await (await GET(getRequest())).json()).contacts).toEqual([contact("public"), contact("new-public")]);
    expect(JSON.stringify(mocks.stored)).not.toContain("legacy-private");
    expect(JSON.stringify(mocks.stored)).not.toContain("legacy-group");
    expect(JSON.stringify(mocks.stored)).not.toContain("member-a");
  });

  it("rejects a stale revision before changing or notifying anything", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([contact("existing")]);
    const response = await PUT(revisionWrite("saveContact", { contact: contact("new") }, 2));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "contact-directory/revision-conflict" });
    expect(mocks.stored?.contacts).toEqual([contact("existing")]);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it("rejects a stale public version after an old writer edits public contacts without changing revision", async () => {
    mocks.canManage.mockResolvedValue(true);
    const hidden = contact("hidden", { type: "group", groupId: "private-group" });
    const privateGroup = group("private-group", ["member-b"]);
    store([contact("public"), hidden], [privateGroup]);
    const staleRequest = revisionWrite("saveContact", { contact: contact("modern-edit") });
    const oldClientUpdate = { ...contact("public"), person: "Syntetická změna ze staré aplikace" };
    mocks.stored!.contacts = [oldClientUpdate, contact("old-client-addition")];
    const before = storedDocuments();
    const staleResponse = await PUT(staleRequest);
    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toMatchObject({ code: "contact-directory/revision-conflict" });
    expect(storedDocuments()).toEqual(before);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
    const fresh = await (await GET(getRequest())).json();
    expect(fresh).toMatchObject({ contacts: [oldClientUpdate, contact("old-client-addition"), hidden], revision: 3,
      publicVersion: publicContactDirectoryVersion([oldClientUpdate, contact("old-client-addition")]) });
    const response = await PUT(putRequest({ operation: "saveContact", revision: fresh.revision,
      publicVersion: fresh.publicVersion, contact: contact("modern-edit") }));
    expect(response.status).toBe(200);
    expect(mocks.stored?.contacts).toEqual([oldClientUpdate, contact("old-client-addition"), contact("modern-edit")]);
    expect(mocks.restrictedStored).toMatchObject({ contacts: [hidden], groups: [privateGroup], revision: 4 });
  });

  it.each(["saveContact", "deleteContact", "saveGroup", "deleteGroup"])("requires the current public version for %s", async operation => {
    mocks.canManage.mockResolvedValue(true);
    store([contact("existing")], [group("empty-group", [])]);
    const before = storedDocuments();
    const response = await PUT(putRequest({ operation, revision: 3, contact: contact("new"), contactId: "existing",
      group: { name: "Nová skupina", memberUids: [] }, groupId: "empty-group" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "contact-directory/revision-conflict" });
    expect(storedDocuments()).toEqual(before);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it("allows only one concurrent write for the same revision and preserves hidden records", async () => {
    mocks.canManage.mockResolvedValue(true);
    const hidden = contact("hidden", { type: "specialists" });
    store([contact("public"), hidden]);
    const results = await Promise.all([
      PUT(revisionWrite("saveContact", { contact: contact("concurrent-a") })),
      PUT(revisionWrite("saveContact", { contact: contact("concurrent-b") })),
    ]);
    expect(results.map(item => item.status).sort()).toEqual([200, 409]);
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.set.mock.calls.map(([ref]) => ref.path).sort()).toEqual([CONTACT_DIRECTORY_REF, CONTACT_DIRECTORY_RESTRICTED_REF].sort());
    expect(directoryState().revision).toBe(4);
    const saved = directoryState().contacts;
    expect(saved).toContainEqual(hidden);
    expect(saved).toContainEqual(contact("public"));
    expect(saved.filter(item => item.id.startsWith("concurrent-"))).toHaveLength(1);
  });

  it.each([undefined, null, { type: "unknown" }, { type: "group", groupId: "missing-group" }, { type: "group", groupId: "../other" }])(
    "never makes a restricted contact public through a missing or invalid audience: %j", async audience => {
      mocks.canManage.mockResolvedValue(true);
      store([contact("secret", { type: "specialists" })]);
      const input: Record<string, unknown> = { ...contact("secret"), audience };
      if (audience === undefined) delete input.audience;
      const response = await PUT(revisionWrite("saveContact", { contact: input }));
      expect(response.status).toBe(400);
      expect(directoryState().contacts).toEqual([contact("secret", { type: "specialists" })]);
      expect(mocks.stored?.contacts).toEqual([]);
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, -1, 0.5, "3", Number.MAX_SAFE_INTEGER + 1])("requires a valid revision for new mutations: %j", async revision => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    expect((await PUT(putRequest({ operation: "saveContact", contact: contact("new"), revision }))).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("deletes only the requested contact and preserves the groups", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([contact("one"), contact("two")], [group("empty-group", [])]);
    const response = await PUT(revisionWrite("deleteContact", { contactId: "one" }));
    expect(response.status).toBe(200);
    expect(mocks.stored?.contacts).toEqual([contact("two")]);
    expect(mocks.restrictedStored?.groups).toEqual([group("empty-group", [])]);
    expect(mocks.stored?.groups).toEqual([]);
  });

  it("lets specialist B edit specialist A's group without accepting forged creator ownership", async () => {
    store([], [group("group-a", ["member-a"], "specialist-a")]);
    forUser("specialist-b", true);
    const response = await PUT(revisionWrite("saveGroup", {
      group: { id: "group-a", name: "Upravená skupina", memberUids: ["member-b"], createdByUid: "forged-owner" },
    }));
    expect(response.status).toBe(200);
    expect(mocks.restrictedStored?.groups).toEqual([{ id: "group-a", name: "Upravená skupina", memberUids: ["member-b"], createdByUid: "specialist-a" }]);
    expect(mocks.stored?.groups).toEqual([]);
  });

  it("creates a group with a server-generated ID and creator from the verified UID", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    const response = await PUT(revisionWrite("saveGroup", { group: { name: "Pracovní skupina", memberUids: ["member-a"], createdByUid: "forged-owner" } }));
    expect(response.status).toBe(200);
    const saved = (mocks.restrictedStored?.groups as StoredContactGroup[])[0];
    expect(saved).toMatchObject({ name: "Pracovní skupina", memberUids: ["member-a"], createdByUid: authContext.uid });
    expect(saved.id).toMatch(/^[a-f\d-]{36}$/);
    expect(mocks.stored?.groups).toEqual([]);
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it("persists newly restricted contacts and group membership only in the private document", async () => {
    mocks.canManage.mockResolvedValue(true);
    const privateGroup = group("private-group", ["member-a"]);
    store([contact("public")], [privateGroup]);
    const restricted = contact("new-private", { type: "group", groupId: "private-group" });
    const response = await PUT(revisionWrite("saveContact", { contact: restricted }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contacts: [contact("public"), restricted], revision: 4,
      publicVersion: publicContactDirectoryVersion([contact("public")]) });
    expect(mocks.stored).toMatchObject({ contacts: [contact("public")], groups: [], revision: 4 });
    expect(mocks.restrictedStored).toMatchObject({ contacts: [restricted], groups: [privateGroup], revision: 4 });
    const legacyPublicDocument = JSON.stringify(mocks.stored);
    expect(legacyPublicDocument).not.toContain("new-private");
    expect(legacyPublicDocument).not.toContain("private-group");
    expect(legacyPublicDocument).not.toContain("member-a");
  });

  it("supports 200 public and 200 restricted contacts without truncating either document", async () => {
    mocks.canManage.mockResolvedValue(true);
    const publicContacts = Array.from({ length: 200 }, (_, index) => contact(`public-${index}`));
    const privateContacts = Array.from({ length: 200 }, (_, index) => contact(`private-${index}`, { type: "specialists" }));
    store([...publicContacts, ...privateContacts]);
    const edited = { ...privateContacts[199], person: "Aktualizovaný soukromý kontakt" };
    const response = await PUT(revisionWrite("saveContact", { contact: edited }));
    expect(response.status).toBe(200);
    expect((await response.json()).contacts).toEqual([...publicContacts, ...privateContacts.slice(0, 199), edited]);
    expect(mocks.stored?.contacts).toEqual(publicContacts);
    expect(mocks.restrictedStored?.contacts).toEqual([...privateContacts.slice(0, 199), edited]);
  });

  it.each(["everyone", "specialists"] as const)("rejects the 201st %s contact without writing either document", async audience => {
    mocks.canManage.mockResolvedValue(true);
    store(Array.from({ length: 200 }, (_, index) => contact(`existing-${index}`, { type: audience })));
    const before = storedDocuments();
    const response = await PUT(revisionWrite("saveContact", { contact: contact("overflow", { type: audience }) }));
    expect(response.status).toBe(400);
    expect(storedDocuments()).toEqual(before);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
  });

  it.each([
    { name: "Všichni", memberUids: [] }, { name: "Specialisté", memberUids: [] },
    { name: "Neznámí členové", memberUids: ["unknown-user"] }, { name: "Duplicitní", memberUids: ["member-a", "member-a"] },
    { name: "Špatné ID", memberUids: ["../member-a"] }, { name: "Neplatný počet", memberUids: Array.from({ length: 201 }, () => "member-a") },
  ])("rejects an invalid custom group without storage changes: %j", async candidate => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    expect((await PUT(revisionWrite("saveGroup", { group: candidate }))).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("does not delete a group while contacts still refer to it", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([contact("restricted", { type: "group", groupId: "used-group" })], [group("used-group", [])]);
    const response = await PUT(revisionWrite("deleteGroup", { groupId: "used-group" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "contact-directory/group-in-use" });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("allows deleting an unused group without publishing or removing contacts", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([contact("public")], [group("empty-group", [])]);
    expect((await PUT(revisionWrite("deleteGroup", { groupId: "empty-group" }))).status).toBe(200);
    expect(mocks.stored?.groups).toEqual([]);
    expect(mocks.restrictedStored?.groups).toEqual([]);
    expect(mocks.stored?.contacts).toEqual([contact("public")]);
  });

  it.each([
    { operation: "deleteContact", contactId: "missing" }, { operation: "deleteGroup", groupId: "missing" },
    { operation: "saveGroup", group: { id: "missing", name: "Nová", memberUids: [] } },
  ])("does not create records when an edit targets a nonexistent ID: %j", async body => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    expect((await PUT(putRequest({ ...body, revision: 3, publicVersion: publicVersion() }))).status).toBe(404);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "[]", "", JSON.stringify({ operation: "other", revision: 3, publicVersion: publicContactDirectoryVersion([]) })])("rejects malformed operations: %s", async body => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    expect((await PUT(putRequest(body))).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("checks actual streamed bytes when the client understates Content-Length", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    const body = JSON.stringify({ operation: "saveContact", revision: 3, padding: "é".repeat(270000) });
    expect((await PUT(putRequest(body, { "Content-Length": "1" }))).status).toBe(413);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("never exposes provider status/code/details as a domain error", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error("synthetic-private-provider-error"), { status: 409, code: "provider/private-code" }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await PUT(revisionWrite("saveContact", { contact: contact("new") }));
      expect(response.status).toBe(500);
      const payload = await response.json();
      expect(payload).not.toHaveProperty("code");
      expect(JSON.stringify(payload)).not.toContain("synthetic-private-provider-error");
      expect(spy).toHaveBeenCalledExactlyOnceWith("CONTACT_DIRECTORY_WRITE_FAILED");
    } finally { spy.mockRestore(); }
  });
});

describe("contact change notification privacy", () => {
  it("keeps public contact change details and notification batching", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    mocks.loadAllEmails.mockResolvedValue(Array.from({ length: 401 }, (_, index) => `member${index}@example.test`));
    expect((await PUT(revisionWrite("saveContact", { contact: contact("public-contact") }))).status).toBe(200);
    expect(mocks.writeMailbox).toHaveBeenCalledTimes(2);
    expect(mocks.writeMailbox.mock.calls[0][0].recipientEmails).toHaveLength(400);
    expect(mocks.writeMailbox.mock.calls[1][0].recipientEmails).toHaveLength(1);
    expect(mocks.writeMailbox.mock.calls[0][0]).toMatchObject({ type: "contact_directory_update",
      body: expect.stringContaining("Test public-contact"), metadata: { contactId: "public-contact", institutionKey: "cpp" } });
    expect(mocks.sendBroadcast).toHaveBeenCalledWith(expect.objectContaining({ targetMode: "all", message: expect.stringContaining("Test public-contact") }),
      expect.objectContaining({ adminEmail: authContext.email }), expect.any(NextRequest));
  });

  it.each(["everyone-to-restricted", "restricted-to-everyone", "restricted-update"])("uses generic notification content for %s", async scenario => {
    mocks.canManage.mockResolvedValue(true);
    const beforeAudience: ContactAudience = scenario === "everyone-to-restricted" ? { type: "everyone" } : { type: "specialists" };
    const afterAudience: ContactAudience = scenario === "restricted-to-everyone" ? { type: "everyone" } : { type: "specialists" };
    store([contact("confidential-id", beforeAudience)]);
    const updated = { ...contact("confidential-id", afterAudience), person: "Confidential synthetic contact" };
    expect((await PUT(revisionWrite("saveContact", { contact: updated }))).status).toBe(200);
    expect(mocks.stored?.contacts).toEqual(afterAudience.type === "everyone" ? [updated] : []);
    expect(mocks.restrictedStored?.contacts).toEqual(afterAudience.type === "everyone" ? [] : [updated]);
    expect(mocks.writeMailbox).toHaveBeenCalled();
    const mailbox = mocks.writeMailbox.mock.calls[0][0];
    const push = mocks.sendBroadcast.mock.calls[0][0];
    expect(mailbox.body).toBe("Adresář kontaktů byl aktualizován.");
    expect(mailbox.metadata.contactId).toBeNull();
    expect(mailbox.metadata.institutionKey).toBeNull();
    expect(mailbox.metadata).not.toHaveProperty("changedByEmail");
    for (const exposed of [JSON.stringify({ title: mailbox.title, body: mailbox.body, metadata: mailbox.metadata }), JSON.stringify(push)]) {
      expect(exposed).not.toContain("confidential-id");
      expect(exposed).not.toContain("Confidential synthetic contact");
      expect(exposed).not.toContain("@example.test");
    }
  });

  it("does not send notifications when contact content is unchanged", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([contact("unchanged")]);
    const response = await PUT(revisionWrite("saveContact", { contact: contact("unchanged") }));
    expect(response.status).toBe(200);
    expect((await response.json()).notificationSent).toBe(false);
    expect(mocks.sendBroadcast).not.toHaveBeenCalled();
    expect(mocks.writeMailbox).not.toHaveBeenCalled();
  });

  it("keeps a successful contact write if notification delivery fails and logs only a fixed code", async () => {
    mocks.canManage.mockResolvedValue(true);
    store([]);
    mocks.sendBroadcast.mockRejectedValue(new Error("synthetic-private-provider-error"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect((await PUT(revisionWrite("saveContact", { contact: contact("public") }))).status).toBe(200);
      expect(mocks.stored?.contacts).toEqual([contact("public")]);
      expect(spy).toHaveBeenCalledExactlyOnceWith("CONTACT_DIRECTORY_NOTIFICATION_FAILED");
    } finally { spy.mockRestore(); }
  });
});
