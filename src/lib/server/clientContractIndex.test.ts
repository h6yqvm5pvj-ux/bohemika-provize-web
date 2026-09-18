import { beforeEach, describe, expect, it } from "vitest";
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { clientContractIndexRecord, clientContractLinkRef, advanceSharedClientIndex, ensureClientContractIndex, readClientContractLinks, writeClientContractLink } from "./clientContractIndex";
import { withContractHistory } from "./contractHistory";

const records = new Map<string, Record<string, unknown>>();
const reads: string[] = [];
const queries: { path: string; conditions: unknown[][] }[] = [];
let beforeTransaction: (() => void) | undefined;
const snapshot = (path: string) => ({ id: path.split("/").at(-1)!, ref: ref(path), exists: records.has(path), data: () => records.get(path) });
const ref = (path: string): DocumentReference => ({ path, id: path.split("/").at(-1)!, firestore: db,
  get parent() { return collection(path.split("/").slice(0, -1).join("/")); },
  collection: (name: string) => collection(path + "/" + name), get: async () => { reads.push(path); return snapshot(path); },
}) as unknown as DocumentReference;
function collection(path: string, conditions: unknown[][] = [], after = "", limit = Infinity) {
  return {
    get parent() { return path.includes("/") ? ref(path.split("/").slice(0, -1).join("/")) : null; },
    doc: (id: string) => ref(path + "/" + id),
    select: () => collection(path, conditions, after, limit),
    orderBy: () => collection(path, conditions, after, limit),
    startAfter: (id: string) => collection(path, conditions, id, limit),
    limit: (size: number) => collection(path, conditions, after, size),
    where: (field: string, operator: string, value: unknown) => collection(path, [...conditions, [field, operator, value]], after, limit),
    get: async () => {
      queries.push({ path, conditions });
      const docs = [...records.keys()].filter(key => key.startsWith(path + "/") && !key.slice(path.length + 1).includes("/"))
        .sort().map(snapshot).filter(doc => doc.id > after && conditions.every(([field, op, value]) => op === "in" ? (value as unknown[]).includes(doc.data()![field as string]) : doc.data()![field as string] === value)).slice(0, limit);
      return { docs, size: docs.length };
    },
  };
}
const writer = { set: (target: DocumentReference, data: Record<string, unknown>) => { records.set(target.path, data); }, delete: (target: DocumentReference) => { records.delete(target.path); } };
const db = { collection, doc: ref, runTransaction: async (work: (tx: unknown) => unknown) => {
  beforeTransaction?.(); beforeTransaction = undefined;
  return work({ ...writer, get: (target: DocumentReference) => { reads.push(target.path); return snapshot(target.path); }, getAll: async (...args: unknown[]) => args.filter((arg): arg is DocumentReference => Boolean(arg && typeof arg === "object" && "path" in arg)).map(target => { reads.push(target.path); return snapshot(target.path); }) });
} } as unknown as Firestore;
const owner = "own@example.test";
const sourcePath = (id: string, email = owner) => `users/${email}/entries/${id}`;
const linkPath = (id: string, email = owner) => clientContractLinkRef(db, email, id).path;
const petr = { clientName: "Bc. Petr Novák", productKey: "neon", clientPhone: "777123456", originalAdviserEmail: owner };
beforeEach(() => { records.clear(); reads.length = 0; queries.length = 0; beforeTransaction = undefined; });

describe("persistent client–contract links", () => {
  it("links title variants to one card and stores only the permitted projection", () => {
    const data = clientContractIndexRecord({ ...petr, birthNumber: "secret", identityDocuments: ["secret"], items: ["commission"], note: "private" }, owner)!;
    expect(data.clientSlug).toBe(clientSlugForName("Petr Novák"));
    expect(data).not.toHaveProperty("birthNumber"); expect(data).not.toHaveProperty("identityDocuments"); expect(data).not.toHaveProperty("items"); expect(data).not.toHaveProperty("note");
    expect(clientContractIndexRecord({ ...petr, entryType: "endorsement" }, owner)).toBeNull();
    expect(clientContractIndexRecord({ clientName: "" }, owner)).toBeNull();
  });
  it("updates the link through the existing history writer, including contact and name edits", () => {
    const source = ref(sourcePath("one"));
    withContractHistory(writer, source, {}, petr, { actorEmail: owner, kind: "created" });
    expect(records.get(linkPath("one"))?.clientSlug).toBe(clientSlugForName("Petr Novák"));
    withContractHistory(writer, source, petr, { clientName: "Jana Nová", clientPhone: "999999999", clientEmail: FieldValue.delete() }, { actorEmail: owner });
    expect(records.get(linkPath("one"))).toMatchObject({ clientSlug: clientSlugForName("Jana Nová"), clientPhone: "999999999" });
    expect(records.get(linkPath("one"))).not.toHaveProperty("clientEmail");
    withContractHistory(writer, source, petr, {}, { actorEmail: owner });
    expect(records.get(linkPath("one"))?.clientSlug).toBe(clientSlugForName("Jana Nová"));
  });
  it("moves the index atomically with a transfer and preserves the concluding adviser", () => {
    writeClientContractLink(writer, ref(sourcePath("one")), {}, petr);
    withContractHistory(writer, ref(sourcePath("one")), petr, { userEmail: "new@example.test", acquisitionType: "inherited" }, { actorEmail: owner, kind: "transfer" });
    expect(records.has(linkPath("one"))).toBe(false);
    expect(records.get(linkPath("one", "new@example.test"))).toMatchObject({ originalAdviserEmail: owner, clientSlug: clientSlugForName("Petr Novák") });
  });
  it("does not assign an inherited contract with an unknown author to its new owner", () => {
    expect(clientContractIndexRecord({ ...petr, originalAdviserEmail: null, acquisitionType: "inherited" }, owner)?.originalAdviserEmail).toBe("");
  });
  it("resumes a bounded first backfill and subsequently reads only indexed matches", async () => {
    for (let i = 0; i < 151; i++) records.set(sourcePath(String(i).padStart(3, "0")), { ...petr, clientName: i === 0 ? petr.clientName : `Klient ${i}` });
    expect(await ensureClientContractIndex(db, owner)).toEqual({ ready: false, processed: 150 });
    expect(await ensureClientContractIndex(db, owner)).toEqual({ ready: true, processed: 151 });
    reads.length = 0; queries.length = 0;
    expect(await ensureClientContractIndex(db, owner)).toEqual({ ready: true, processed: 151 });
    const contracts = await readClientContractLinks(db, owner, [owner], clientSlugForName(petr.clientName), "Poradce");
    expect(contracts.map(item => item.id)).toEqual(["000"]);
    expect(reads).toEqual([`clientContractIndex/${owner}`]);
    expect(queries).toEqual([{ path: "clientContractLinks", conditions: [["ownerClientKey", "==", records.get(linkPath("000"))!.ownerClientKey]] }]);
  });
  it("indexes current source data when a contract changes or disappears during backfill", async () => {
    records.set(sourcePath("edited"), petr); records.set(sourcePath("deleted"), petr);
    beforeTransaction = () => { records.set(sourcePath("edited"), { ...petr, clientName: "Jana Nová" }); records.delete(sourcePath("deleted")); };
    await ensureClientContractIndex(db, owner);
    expect(records.get(linkPath("edited"))?.clientSlug).toBe(clientSlugForName("Jana Nová"));
    expect(records.has(linkPath("deleted"))).toBe(false);
  });
  it("does not overwrite a checkpoint completed by another request", async () => {
    records.set(sourcePath("one"), petr);
    beforeTransaction = () => records.set(`clientContractIndex/${owner}`, { version: 2, buildVersion: 2, processed: 42 });
    expect(await ensureClientContractIndex(db, owner)).toEqual({ ready: true, processed: 42 });
    expect(records.has(linkPath("one"))).toBe(false);
  });
  it("uses author indexes for lists, filters shared cards and converts timestamps", async () => {
    writeClientContractLink(writer, ref(sourcePath("own")), {}, { ...petr, policyStartDate: Timestamp.fromMillis(1_780_000_000_000) });
    writeClientContractLink(writer, ref(sourcePath("team")), {}, { ...petr, originalAdviserEmail: "team@example.test" });
    const own = await readClientContractLinks(db, owner, [owner], null, null);
    expect(own.map(item => item.id)).toEqual(["own"]); expect(own[0].policyStartDate).toBe(1_780_000_000_000);
    expect(queries[0].conditions).toEqual([["ownerAuthorKey", "==", records.get(linkPath("own"))!.ownerAuthorKey]]);
    expect((await readClientContractLinks(db, owner, ["team@example.test"], clientSlugForName(petr.clientName), null)).map(item => item.id)).toEqual(["team"]);
    expect(await readClientContractLinks(db, owner, [], null, null)).toEqual([]);
  });
});

 it("migrates a completed legacy per-owner index from the start", async () => {
   records.set(`clientContractIndex/${owner}`, { version: 1, after: "zzz-last", processed: 1000 });
   records.set(sourcePath("first"), petr);
   expect(await ensureClientContractIndex(db, owner)).toEqual({ ready: true, processed: 1 });
   expect(records.get(linkPath("first"))).toMatchObject({ ownerEmail: owner, entryId: "first" });
 });
 it("checkpoints the company migration and only reads its marker after completion", async () => {
   const owners = Array.from({length:7}, (_, i) => `advisor${i}@example.test`);
   for (const email of owners) records.set(sourcePath("one", email), petr);
   expect(await advanceSharedClientIndex(db, owners)).toBe(false);
   expect(await advanceSharedClientIndex(db, owners)).toBe(true);
   reads.length = 0; queries.length = 0;
   expect(await advanceSharedClientIndex(db, owners)).toBe(true);
   expect(reads).toEqual(["clientContractIndexMigrations/shared-clients"]); expect(queries).toEqual([]);
   records.set(sourcePath("two", "new@example.test"), petr);
   while (!(await advanceSharedClientIndex(db, [...owners,"new@example.test"]))) { /* bounded test migration */ }
   expect(records.get(linkPath("two", "new@example.test"))).toMatchObject({ entryId: "two" });
 });
