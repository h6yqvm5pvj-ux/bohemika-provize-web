import "../../../../../tests/helpers/privateEncryptionTestKey";
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), deletePdf: vi.fn() }));
vi.mock("@/lib/server/adminAuth", () => ({
  getAdminAuthContext: mocks.auth,
  adminAuthErrorResponse: (ctx: { status: number; error: string }) =>
    NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status }),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({ get adminDb() { return db; } }));
vi.mock("@/lib/server/hallOfFameProjection", () => ({ markHallOwnerDirty: vi.fn(), invalidateHallContractChange: vi.fn() }));
vi.mock("@/lib/server/clientContractIndex", () => ({
  clientContractLinkRef: (_db: unknown, email: string, id: string) => ref(`clientContractLinks/${email}___${id}`),
  writeClientContractLink: vi.fn(),
}));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_name: string, fn: () => unknown) => fn(),
  trackCashflowWrite: (fn: () => unknown) => fn(), markCashflowMutationIncomplete: vi.fn(),
}));
vi.mock("@/lib/server/contractPdfStorage", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/contractPdfStorage")>(), deleteContractPdfAttachment: mocks.deletePdf,
}));

import { DELETE } from "./route";
import { businessLookupToken } from "@/lib/server/businessDataEncryption";
import { openPrivateRecord } from "@/lib/server/privateRecords";

type RecordData = Record<string, unknown>;
type Mutation = { type: "set" | "update" | "delete"; path: string; data?: RecordData; merge?: boolean };
const records = new Map<string, RecordData>();
const versions = new Map<string, number>();
const reads: string[] = [];
const commits: Mutation[][] = [];
let beforeTransaction: (() => void) | undefined;
let beforeCommit: (() => void) | undefined;
let failCommit: "before" | "after" | undefined;
let failRead: string | undefined;
const owner = "advisor@example.test";
const policyNumber = "1234567890";
const path = (id: string, email = owner) => `users/${email}/entries/${id}`;
const source = path("duplicate");
const survivor = path("survivor");
const pdf = { kind: "contractPdf", bucketName: "test-bucket", storagePath: "contract-pdfs/owner/duplicate/original.pdf",
  originalName: "Smlouva.pdf", contentType: "application/pdf", sizeBytes: 123,
  sha256: "a".repeat(64), uploadedAtMs: 1_780_000_000_000, uploadedBy: owner };
const contract = { entryType: "contract", contractNumber: policyNumber, clientName: "Jan Novák", productKey: "cppAuto" };
const put = (key: string, value: RecordData) => { records.set(key, value); versions.set(key, (versions.get(key) ?? 0) + 1); };
const snapshot = (key: string) => {
  const data = records.get(key);
  return { id: key.split("/").at(-1)!, ref: ref(key), exists: data !== undefined,
    data: () => data, updateTime: data ? Timestamp.fromMillis(versions.get(key)!) : undefined };
};
function ref(key: string): DocumentReference {
  return { path: key, id: key.split("/").at(-1)!, firestore: db,
    get parent() { return collection(key.split("/").slice(0, -1).join("/")); },
    collection: (name: string) => collection(`${key}/${name}`),
    get: async () => { reads.push(key); if (failRead === key) throw new Error("private infrastructure detail"); return snapshot(key); },
  } as unknown as DocumentReference;
}
function collection(key: string, conditions: [string, unknown][] = [], group = false) {
  return { id: key.split("/").at(-1),
    get parent() { return key.includes("/") ? ref(key.split("/").slice(0, -1).join("/")) : null; },
    doc: (id: string) => ref(`${key}/${id}`),
    where: (field: string, _operation: string, value: unknown) => collection(key, [...conditions, [field, value]], group),
    limit: () => collection(key, conditions, group),
    get: async () => {
      const docs = [...records.keys()].filter(candidate => group
        ? candidate.split("/").at(-2) === key
        : candidate.startsWith(`${key}/`) && !candidate.slice(key.length + 1).includes("/"))
        .map(snapshot).filter(doc => conditions.every(([field, value]) => doc.data()?.[field] === value));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  };
}
function apply(writes: Mutation[]) {
  for (const write of writes) {
    if (write.type === "delete") { records.delete(write.path); versions.delete(write.path); }
    else put(write.path, { ...(write.type === "update" || write.merge ? records.get(write.path) : {}), ...write.data });
  }
  commits.push(writes);
}
function writer(writes: Mutation[]) {
  return {
    set: (target: DocumentReference, data: RecordData, options?: { merge: boolean }) => writes.push({ type: "set", path: target.path, data, merge: options?.merge }),
    update: (target: DocumentReference, data: RecordData) => writes.push({ type: "update", path: target.path, data }),
    delete: (target: DocumentReference) => writes.push({ type: "delete", path: target.path }),
  };
}
const db = {
  doc: ref, collection, collectionGroup: (key: string) => collection(key, [], true),
  batch: () => { const writes: Mutation[] = []; return { ...writer(writes), commit: async () => apply(writes) }; },
  runTransaction: async (work: (tx: unknown) => Promise<unknown>) => {
    beforeTransaction?.(); beforeTransaction = undefined;
    const writes: Mutation[] = [];
    const readVersions = new Map<string, number | undefined>();
    const result = await work({ ...writer(writes), getAll: async (...targets: DocumentReference[]) => targets.map(target => {
      if (failRead === target.path) throw new Error("private infrastructure detail");
      reads.push(target.path); readVersions.set(target.path, versions.get(target.path)); return snapshot(target.path);
    }) });
    beforeCommit?.(); beforeCommit = undefined;
    if ([...readVersions].some(([key, version]) => version !== versions.get(key))) throw Object.assign(new Error("conflict"), { code: 10 });
    if (failCommit === "before") throw Object.assign(new Error("private infrastructure detail"), { code: 14 });
    apply(writes);
    if (failCommit === "after") throw Object.assign(new Error("lost acknowledgement"), { code: 4 });
    return result;
  },
} as unknown as Firestore;

const claimPath = () => `contractNumberClaims/b1_${businessLookupToken("contract-claim", policyNumber)}`;
function request(patch: RecordData = {}) {
  return new NextRequest("http://localhost/api/admin/data-health", { method: "DELETE", body: JSON.stringify({
    action: "deleteDuplicateContract", ownerEmail: owner, entryId: "duplicate", contractNumber: policyNumber,
    confirmContractNumber: policyNumber, ...patch,
  }), headers: { "content-type": "application/json" } });
}
beforeEach(() => {
  vi.clearAllMocks(); records.clear(); versions.clear(); reads.length = 0; commits.length = 0;
  beforeTransaction = undefined; beforeCommit = undefined; failCommit = undefined; failRead = undefined;
  mocks.auth.mockResolvedValue({ adminEmail: "admin@example.test" });
  put(source, { ...contract, contractPdfAttachment: pdf }); put(survivor, { ...contract, clientName: " JAN   NOVÁK " });
  put(claimPath(), { entryPath: source });
});

describe("duplicate contract PDF preservation", () => {
  it("retains the PDF and atomically records its history with duplicate deletion and claim reassignment", async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ minimumRole: "admin" }));
    expect(await response.json()).toMatchObject({ ok: true, preservedPdf: true, reassignedContractNumberClaim: true });
    expect(records.has(source)).toBe(false); expect(records.get(survivor)?.contractPdfAttachment).toEqual(pdf);
    expect(records.get(claimPath())?.entryPath).toBe(survivor);
    const atomic = commits.find(writes => writes.some(write => write.type === "delete" && write.path === source))!;
    expect(atomic.some(write => write.type === "update" && write.path === survivor)).toBe(true);
    const event = atomic.find(write => write.path.startsWith("contractHistories/") && write.path.includes("/events/"))!;
    expect(openPrivateRecord(event.path, event.data!)).toMatchObject({ kind: "attachment", actorEmail: "admin@example.test",
      changes: [{ label: "Soubor", before: null, after: "Smlouva.pdf" }] });
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
  it("keeps a file already referenced by both duplicate records", async () => {
    put(survivor, { ...contract, contractPdfAttachment: pdf });
    expect((await DELETE(request())).status).toBe(200); expect(records.has(source)).toBe(false);
    expect(records.get(survivor)?.contractPdfAttachment).toEqual(pdf); expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
  it("does not replace or delete either of two different PDFs", async () => {
    const otherPdf = { ...pdf, storagePath: "contract-pdfs/owner/survivor/other.pdf" };
    put(survivor, { ...contract, contractPdfAttachment: otherPdf });
    expect((await DELETE(request())).status).toBe(409); expect(commits).toEqual([]);
    expect(records.get(source)?.contractPdfAttachment).toEqual(pdf); expect(records.get(survivor)?.contractPdfAttachment).toEqual(otherPdf);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
  it.each(["source", "survivor"])("refuses to discard malformed %s attachment metadata", async target => {
    const key = target === "source" ? source : survivor;
    put(key, { ...records.get(key), contractPdfAttachment: { storagePath: "valuable.pdf" } });
    expect((await DELETE(request())).status).toBe(409); expect(records.has(source)).toBe(true); expect(commits).toEqual([]);
  });
  it.each([
    { productKey: "kooperativaAuto" }, { productKey: null }, { clientName: "Jiný Klient" }, { clientName: "" },
  ])("refuses mismatched or unknown survivor identity %j", async patch => {
    put(survivor, { ...contract, ...patch });
    expect((await DELETE(request())).status).toBe(409); expect(records.has(source)).toBe(true); expect(commits).toEqual([]);
  });
  it("does not grant another owner access to the PDF", async () => {
    records.delete(survivor); put(path("survivor", "other@example.test"), contract);
    expect((await DELETE(request())).status).toBe(409); expect(commits).toEqual([]); expect(records.has(source)).toBe(true);
  });
  it.each([{ productKey: "unknown-product" }, { clientName: "" }])("refuses to merge an unidentified source %j", async patch => {
    put(source, { ...contract, contractPdfAttachment: pdf, ...patch });
    expect((await DELETE(request())).status).toBe(409); expect(commits).toEqual([]);
  });
  it("refuses an ambiguous group even when a claim selects one survivor", async () => {
    put(path("third"), contract); put(claimPath(), { entryPath: survivor });
    expect((await DELETE(request())).status).toBe(409); expect(commits).toEqual([]);
  });
  it("does not mistake an endorsement for a second contract", async () => {
    put(survivor, { ...contract, entryType: "endorsement" });
    expect((await DELETE(request())).status).toBe(409); expect(records.has(source)).toBe(true);
  });
  it("still removes a duplicate without an attachment and keeps the survivor's PDF", async () => {
    put(source, contract); put(survivor, { ...contract, contractPdfAttachment: pdf });
    expect((await DELETE(request())).status).toBe(200); expect(records.get(survivor)?.contractPdfAttachment).toEqual(pdf);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
  it.each(["source", "survivor", "claim"])("rejects a %s change before the transaction", async target => {
    const key = target === "source" ? source : target === "survivor" ? survivor : claimPath();
    beforeTransaction = () => put(key, { ...records.get(key), concurrentEdit: true });
    expect((await DELETE(request())).status).toBe(409); expect(records.has(source)).toBe(true); expect(commits).toEqual([]);
  });
  it("rejects a competing ownership transfer instead of deleting the moved PDF", async () => {
    const moved = path("survivor", "other@example.test");
    beforeCommit = () => { put(moved, { ...records.get(survivor), contractPdfAttachment: pdf }); records.delete(survivor); versions.delete(survivor); };
    expect((await DELETE(request())).status).toBe(409); expect(records.has(source)).toBe(true);
    expect(records.get(moved)?.contractPdfAttachment).toEqual(pdf); expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
  it("rejects simultaneous duplicate deletions so that one retained PDF always remains", async () => {
    beforeCommit = () => { put(source, { ...records.get(source), concurrentCleanup: true }); records.delete(survivor); versions.delete(survivor); };
    expect((await DELETE(request())).status).toBe(409); expect(records.get(source)?.contractPdfAttachment).toEqual(pdf);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
  it.each(["before", "after"] as const)("preserves the PDF when a commit fails %s acknowledgement", async failure => {
    failCommit = failure;
    const response = await DELETE(request()); expect(response.status).toBe(503);
    if (failure === "before") expect(records.get(source)?.contractPdfAttachment).toEqual(pdf);
    else { expect(records.has(source)).toBe(false); expect(records.get(survivor)?.contractPdfAttachment).toEqual(pdf); }
    expect(mocks.deletePdf).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("private infrastructure detail");
  });
  it("does not mutate data when a required snapshot cannot be read", async () => {
    failRead = source; const response = await DELETE(request()); expect(response.status).toBe(503);
    expect(commits).toEqual([]); expect(mocks.deletePdf).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("private infrastructure detail");
  });
  it("fails closed when transactional revalidation cannot read the retained contract", async () => {
    beforeTransaction = () => { failRead = survivor; };
    expect((await DELETE(request())).status).toBe(503); expect(records.has(source)).toBe(true); expect(commits).toEqual([]);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
  it.each([401, 403])("denies unauthorized access (%s) before reading contracts", async status => {
    mocks.auth.mockResolvedValue({ error: "Denied", status });
    expect((await DELETE(request())).status).toBe(status); expect(reads).toEqual([]); expect(commits).toEqual([]);
  });
  it.each([{ entryId: "../../../elsewhere" }, { ownerEmail: "other/path@example.test" }, { confirmContractNumber: "wrong" }])("rejects manipulated input %j", async patch => {
    expect((await DELETE(request(patch))).status).toBe(400); expect(reads).toEqual([]); expect(commits).toEqual([]);
  });
});
