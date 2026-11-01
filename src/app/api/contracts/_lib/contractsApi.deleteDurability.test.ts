import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(), doc: vi.fn(), batch: vi.fn(), guard: vi.fn(),
  read: vi.fn(), write: vi.fn(), beforeCommit: vi.fn(), afterCommit: vi.fn(),
  deletePdf: vi.fn(), incomplete: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, doc: mocks.doc, batch: mocks.batch },
  adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_source: string, run: () => unknown) => run(),
  trackCashflowWrite: (run: () => unknown) => run(), markCashflowMutationIncomplete: mocks.incomplete,
}));
vi.mock("@/lib/server/contractPdfStorage", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/contractPdfStorage")>(),
  deleteContractPdfAttachment: mocks.deletePdf,
}));

const owner = "advisor-a@example.test";
const foreign = "advisor-b@example.test";
const entryPath = `users/${owner}/entries/source`;
const foreignPath = `users/${foreign}/entries/source`;
const sourceUpdateTime = Timestamp.fromMillis(1_000);
type Data = Record<string, unknown>;
type Ref = { path: string };
let records: Map<string, Data>;
let versions: Map<string, Timestamp | undefined>;
let sequence: number;

function reference(path: string) {
  return {
    id: path.split("/").at(-1)!, path,
    parent: { parent: { id: path.split("/").at(-3) } },
    firestore: { collection: mocks.collection, doc: mocks.doc, batch: mocks.batch },
    get: async () => snapshot(path),
    collection: (name: string) => collection(`${path}/${name}`),
  };
}
function snapshot(path: string) {
  mocks.read(path);
  const value = records.get(path);
  return {
    id: path.split("/").at(-1)!, exists: value != null,
    updateTime: versions.has(path) ? versions.get(path) : sourceUpdateTime,
    ref: reference(path), data: () => value,
  };
}
function collection(path: string, filters: Array<[string, unknown]> = []) {
  return {
    select() { return this; },
    doc: (id = `new-${++sequence}`) => reference(`${path}/${id}`),
    where: (field: string, _operation: string, value: unknown) => collection(path, [...filters, [field, value]]),
    limit() { return this; },
    get: async () => {
      const docs = [...records.keys()]
        .filter(key => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
        .filter(key => filters.every(([field, value]) => records.get(key)?.[field] === value)).map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (visit: (doc: ReturnType<typeof snapshot>) => void) => docs.forEach(visit) };
    },
  };
}
function batch() {
  const pending: Array<() => void> = [];
  const checks: Array<() => void> = [];
  return {
    set: (ref: Ref, data: Data, options?: { merge?: boolean }) => {
      mocks.write("set", ref.path, data, options);
      pending.push(() => { records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...data }); });
    },
    delete: (ref: Ref, precondition?: { lastUpdateTime?: Timestamp }) => {
      mocks.write("delete", ref.path, precondition);
      if (precondition?.lastUpdateTime) checks.push(() => {
        const current = versions.has(ref.path) ? versions.get(ref.path) : sourceUpdateTime;
        if (!records.has(ref.path) || !current?.isEqual(precondition.lastUpdateTime!)) {
          throw Object.assign(new Error("synthetic precondition failure"), { code: 9 });
        }
      });
      pending.push(() => { records.delete(ref.path); });
    },
    commit: async () => {
      await mocks.beforeCommit();
      // Firestore validates the complete batch before applying any writes.
      checks.forEach(check => check());
      pending.forEach(write => write());
      await mocks.afterCommit();
    },
  };
}

const attachment = {
  kind: "contractPdf", bucketName: "synthetic-bucket", storagePath: "contract-pdfs/source/unique.pdf",
  originalName: "synthetic.pdf", contentType: "application/pdf", sizeBytes: 11,
  sha256: "a".repeat(64), uploadedAtMs: 1_000, uploadedBy: owner,
};
const contract = (email: string) => ({
  clientName: "Synthetic client", userEmail: email, entryType: "contract", productKey: "neon",
  contractNumber: "SYNTH123", status: "active", paid: false,
  contractSignedDate: new Date("2026-01-10T00:00:00Z"), policyStartDate: new Date("2026-02-01T00:00:00Z"),
});

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  sequence = 0;
  versions = new Map();
  const profile = (email: string) => ({ email, userId: email, position: "poradce1", accountType: "advisor", commissionMode: "standard" });
  records = new Map<string, Data>([
    [`users/${owner}`, profile(owner)], [`users/${foreign}`, profile(foreign)],
    [`usersPrivate/${owner}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }],
    [entryPath, { ...contract(owner), contractPdfAttachment: attachment }],
    [foreignPath, contract(foreign)],
  ]);
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(reference);
  mocks.batch.mockImplementation(batch);
  mocks.beforeCommit.mockResolvedValue(undefined);
  mocks.afterCommit.mockResolvedValue(undefined);
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email: owner, uid: owner, decoded: { email: owner }, actorEmail: owner, actorUid: owner,
    isImpersonating: false, impersonation: null,
  } });
});

async function remove(entries: unknown = [{ ownerEmail: owner, entryId: "source" }]) {
  const { handleContractsDelete } = await import("./contractsApi");
  return handleContractsDelete(new NextRequest("https://example.test/api/contracts", {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries }),
  }));
}

describe("contract deletion PDF durability", () => {
  it("deletes the original version after a confirmed commit and retains its encrypted PDF", async () => {
    const response = await remove();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deleted: 1 });
    expect(records.has(entryPath)).toBe(false);
    expect(mocks.write).toHaveBeenCalledWith("delete", entryPath, { lastUpdateTime: sourceUpdateTime });
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("preserves a PDF also referenced by another existing contract", async () => {
    const files = new Set([attachment.storagePath]);
    records.set(foreignPath, { ...records.get(foreignPath), contractPdfAttachment: attachment });
    mocks.deletePdf.mockImplementation(async item => { files.delete(item.storagePath); });
    const response = await remove();
    expect(response.status).toBe(200);
    expect(records.has(entryPath)).toBe(false);
    expect(records.get(foreignPath)?.contractPdfAttachment).toEqual(attachment);
    expect(files.has(attachment.storagePath)).toBe(true);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("preserves the PDF when transfer completes after the deletion reads the source", async () => {
    const { buildTransferredContractData } = await import("./contractsApi.transfer");
    records.delete(foreignPath);
    mocks.beforeCommit.mockImplementationOnce(async () => {
      records.set(foreignPath, buildTransferredContractData({
        contract: records.get(entryPath)!, fromOwnerEmail: owner, toOwnerEmail: foreign,
        toOwnerUserId: foreign, actorEmail: owner, transferredAt: new Date(5_000),
      }));
      records.delete(entryPath);
    });
    const response = await remove();
    expect(response.status).toBe(409);
    expect((await response.json()).deleted).toBe(0);
    expect(records.get(foreignPath)?.contractPdfAttachment).toEqual(attachment);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it.each(["field edit", "PDF upload"])("preserves a newer source after a concurrent %s", async change => {
    const replacement = { ...attachment, storagePath: "contract-pdfs/source/replacement.pdf" };
    mocks.beforeCommit.mockImplementationOnce(async () => {
      records.set(entryPath, { ...records.get(entryPath), ...(change === "PDF upload"
        ? { contractPdfAttachment: replacement } : { paid: true }) });
      versions.set(entryPath, Timestamp.fromMillis(2_000));
    });
    const response = await remove();
    expect(response.status).toBe(409);
    expect(records.has(entryPath)).toBe(true);
    expect(records.get(entryPath)?.contractPdfAttachment).toEqual(change === "PDF upload" ? replacement : attachment);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("does not delete blindly after a source read failure or expose its raw error", async () => {
    mocks.read.mockImplementation(path => {
      if (path === entryPath) throw new Error("private internal sentinel");
    });
    const response = await remove();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private internal sentinel");
    expect(records.has(entryPath)).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("does not clean PDFs queued in an uncommitted batch when a later source read fails", async () => {
    const laterPath = `users/${owner}/entries/later`;
    records.set(laterPath, contract(owner));
    mocks.read.mockImplementation(path => {
      if (path === laterPath) throw new Error("synthetic read failure");
    });
    const response = await remove([
      { ownerEmail: owner, entryId: "source" }, { ownerEmail: owner, entryId: "later" },
    ]);
    expect(response.status).toBe(503);
    expect((await response.json()).deleted).toBe(0);
    expect(records.has(entryPath)).toBe(true);
    expect(records.has(laterPath)).toBe(true);
    expect(mocks.beforeCommit).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("aborts before deleting the source if its TIP metadata cannot be resolved", async () => {
    const tipster = "tipster@example.test";
    records.set(entryPath, { ...records.get(entryPath), tipContractTipsterEmail: tipster });
    mocks.read.mockImplementation(path => {
      if (path === `users/${tipster}`) throw new Error("synthetic TIP lookup failure");
    });
    const response = await remove();
    expect(response.status).toBe(503);
    expect(records.has(entryPath)).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("rejects a source snapshot without a verifiable version", async () => {
    versions.set(entryPath, undefined);
    const response = await remove();
    expect(response.status).toBe(503);
    expect(records.has(entryPath)).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("treats an already missing source as an idempotent no-op", async () => {
    records.delete(entryPath);
    const response = await remove();
    expect(await response.json()).toEqual({ ok: true, deleted: 0 });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it.each([9, 14])("retains the PDF when the deletion batch fails with code %s", async code => {
    mocks.beforeCommit.mockRejectedValueOnce(Object.assign(new Error("synthetic failure"), { code }));
    const response = await remove();
    expect(response.status).toBe(code === 9 ? 409 : 503);
    expect(records.has(entryPath)).toBe(true);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("retains the PDF if deletion committed but its acknowledgement was lost", async () => {
    mocks.afterCommit.mockRejectedValueOnce(Object.assign(new Error("synthetic deadline"), { code: 4 }));
    const response = await remove();
    expect(response.status).toBe(503);
    expect(records.has(entryPath)).toBe(false);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("counts only confirmed earlier batches after a later failure and retains every PDF", async () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({ ownerEmail: owner, entryId: `entry-${index}` }));
    for (const [index, item] of entries.entries()) {
      records.set(`users/${owner}/entries/${item.entryId}`, { ...contract(owner),
        contractPdfAttachment: { ...attachment, storagePath: `contract-pdfs/source/${index}.pdf` } });
    }
    mocks.beforeCommit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Object.assign(new Error("synthetic conflict"), { code: 9 }));
    const response = await remove(entries);
    expect(response.status).toBe(409);
    expect((await response.json()).deleted).toBe(100);
    expect(mocks.deletePdf).not.toHaveBeenCalled();
    expect(records.has(`users/${owner}/entries/entry-0`)).toBe(false);
    expect(records.has(`users/${owner}/entries/entry-99`)).toBe(false);
    expect(records.has(`users/${owner}/entries/entry-100`)).toBe(true);
  });

  it("deduplicates repeated source IDs within one request", async () => {
    const response = await remove(Array(2).fill({ ownerEmail: owner, entryId: "source" }));
    expect(await response.json()).toEqual({ ok: true, deleted: 1 });
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("requires authentication before source reads or writes", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const response = await remove();
    expect(response.status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("cannot delete another advisor's source by replacing ownerEmail", async () => {
    const response = await remove([{ ownerEmail: foreign, entryId: "source" }]);
    expect(await response.json()).toEqual({ ok: true, deleted: 0 });
    expect(records.has(foreignPath)).toBe(true);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("rejects tipster accounts", async () => {
    records.set(`users/${owner}`, { ...records.get(`users/${owner}`), accountType: "tipster" });
    const response = await remove();
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });

  it("rejects manipulated source paths before writes", async () => {
    const response = await remove([{ ownerEmail: owner, entryId: "source/contractNotes/secret" }]);
    expect(response.status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.deletePdf).not.toHaveBeenCalled();
  });
});
