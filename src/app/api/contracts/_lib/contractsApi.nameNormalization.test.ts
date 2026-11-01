import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { openPrivateRecord } from "@/lib/server/privateRecords";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(), doc: vi.fn(), batch: vi.fn(), guard: vi.fn(),
  read: vi.fn(), write: vi.fn(), commit: vi.fn(),
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
  trackCashflowWrite: (run: () => unknown) => run(), markCashflowMutationIncomplete: vi.fn(),
}));

const owner = "advisor-a@example.test";
const foreign = "advisor-b@example.test";
const entryPath = `users/${owner}/entries/source`;
const foreignPath = `users/${foreign}/entries/source`;
const sourceUpdateTime = Timestamp.fromMillis(1_000);
type Data = Record<string, unknown>;
let records: Map<string, Data>;
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
  return { id: path.split("/").at(-1)!, exists: value != null, updateTime: sourceUpdateTime,
    ref: reference(path), data: () => value };
}
function collection(path: string, filters: Array<[string, unknown]> = []) {
  return {
    select() { return this; },
    doc: (id = `new-${++sequence}`) => reference(`${path}/${id}`),
    where: (field: string, _operation: string, value: unknown) => collection(path, [...filters, [field, value]]),
    limit() { return this; },
    get: async () => {
      const docs = [...records.keys()].filter(key => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
        .filter(key => filters.every(([field, value]) => records.get(key)?.[field] === value)).map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (visit: (doc: ReturnType<typeof snapshot>) => void) => docs.forEach(visit) };
    },
  };
}
function batch() {
  const pending: Array<() => void> = [];
  return {
    set: (ref: { path: string }, data: Data, options?: { merge?: boolean }) => {
      mocks.write("set", ref.path, data, options);
      pending.push(() => records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...data }));
    },
    update: (ref: { path: string }, data: Data, precondition: { lastUpdateTime: Timestamp }) => {
      mocks.write("update", ref.path, data, precondition);
      pending.push(() => records.set(ref.path, { ...records.get(ref.path), ...data }));
    },
    delete: (ref: { path: string }) => {
      mocks.write("delete", ref.path);
      pending.push(() => records.delete(ref.path));
    },
    commit: async () => {
      await mocks.commit();
      pending.forEach(write => write());
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("MAILBOX_ENCRYPTION_KEY", Buffer.alloc(32, 41).toString("base64"));
  vi.stubEnv("MAILBOX_ENCRYPTION_KEY_ID", "synthetic-name-test");
  vi.stubEnv("MAILBOX_ENCRYPTION_PREVIOUS_KEYS", "");
  vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "false");
  sequence = 0;
  const profile = (email: string) => ({ email, userId: email, position: "poradce1", accountType: "advisor", commissionMode: "standard" });
  const contract = (email: string) => ({ clientName: "Petr Novák", userEmail: email, entryType: "contract", productKey: "neon",
    contractNumber: "SYNTH123", status: "active", paid: false,
    contractSignedDate: new Date("2026-01-10T00:00:00Z"), policyStartDate: new Date("2026-02-01T00:00:00Z") });
  records = new Map<string, Data>([
    [`users/${owner}`, profile(owner)], [`users/${foreign}`, profile(foreign)],
    [`usersPrivate/${owner}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" }],
    [entryPath, contract(owner)], [foreignPath, contract(foreign)],
  ]);
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(reference);
  mocks.batch.mockImplementation(batch);
  mocks.commit.mockResolvedValue(undefined);
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email: owner, uid: owner, decoded: { email: owner }, actorEmail: owner, actorUid: owner,
    isImpersonating: false, impersonation: null,
  } });
});

async function update(updates: Data = { clientName: "JAN NOVÁK" }, body: Data = {}) {
  const { handleContractsUpdateFields } = await import("./contractsApi");
  return handleContractsUpdateFields(new NextRequest("https://example.test/api/contracts/update-fields", {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerEmail: owner, entryId: "source", updates, ...body }),
  }));
}

describe("contract client-name normalization authorization and persistence", () => {
  it("requires authentication before any database read or write", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await update()).status).toBe(401);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("denies a tipster without reading contract contents or writing", async () => {
    records.get(`users/${owner}`)!.accountType = "tipster";
    expect((await update()).status).toBe(403);
    expect(mocks.read.mock.calls.some(([path]) => path.includes("/entries/"))).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("denies adviser A targeting adviser B even with spoofed role metadata", async () => {
    expect((await update({ clientName: "JAN NOVÁK" }, { ownerEmail: foreign, role: "admin", userEmail: foreign })).status).toBe(403);
    expect(mocks.read.mock.calls.some(([path]) => path.includes("/entries/"))).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(records.get(foreignPath)?.clientName).toBe("Petr Novák");
  });

  it.each([
    { clientName: null }, { clientName: 42 }, { clientName: { value: "Jan Novák" } },
    { clientName: " " }, { clientName: "J".repeat(201) }, { clientName: "Jan\u0000Novák" },
    { clientName: "Jan Novák", role: "admin" },
    { clientName: "Jan Novák", ownerEmail: foreign },
    { clientName: "Jan Novák", userEmail: foreign },
  ])("rejects manipulated input without contract reads or writes: %j", async updates => {
    expect((await update(updates)).status).toBe(400);
    expect(mocks.read.mock.calls.some(([path]) => path.includes("/entries/"))).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects path traversal before contract access", async () => {
    expect((await update({ clientName: "JAN NOVÁK" }, { entryId: "../foreign" })).status).toBe(400);
    expect(mocks.read.mock.calls.some(([path]) => path.includes("/entries/"))).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("normalizes a personal name and atomically maintains history, client links and search indexes", async () => {
    const before = new Map(records);
    const response = await update();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, updated: 1 });
    const saved = records.get(entryPath)!;
    expect(saved).toMatchObject({ clientName: "Jan Novák", userEmail: owner,
      duplicateLookupKey: "neon___jan novák___2026-01-10", paid: false });
    expect(saved.clientSearchKeys).toEqual(expect.arrayContaining(["jan", "novak"]));
    const sourceWrite = mocks.write.mock.calls.find(([operation, path]) => operation === "update" && path === entryPath)!;
    expect(sourceWrite[3].lastUpdateTime).toBe(sourceUpdateTime);
    const links = [...records.entries()].filter(([path]) => path.startsWith("clientContractLinks/"));
    expect(links).toHaveLength(1);
    expect(links[0][1]).toMatchObject({ ownerEmail: owner, entryId: "source", clientName: "Jan Novák", clientSlug: clientSlugForName("JAN NOVÁK") });
    const history = [...records.entries()].filter(([path]) => path.startsWith("contractHistories/") && path.includes("/events/"));
    expect(history.length).toBeGreaterThan(0);
    expect(history.every(([, event]) => typeof event.changes === "object" && event.changes !== null && "privateEncryption" in event.changes)).toBe(true);
    const events = history.map(([path, event]) => openPrivateRecord(path, event));
    expect(events).toContainEqual(expect.objectContaining({ actorEmail: owner,
      changes: expect.arrayContaining([expect.objectContaining({ before: "Petr Novák", after: "Jan Novák" })]) }));
    expect(records.get(foreignPath)).toEqual(before.get(foreignPath));
    expect(records.has(`users/${owner}/entries/source`)).toBe(true);
  });

  it.each(["PEMI Cars s.r.o.", "PARKETT s.r Woody", "ČSOB a.s."])("preserves company brand and card identity for %s", async clientName => {
    expect((await update({ clientName })).status).toBe(200);
    expect(records.get(entryPath)?.clientName).toBe(clientName);
    const link = [...records.entries()].find(([path]) => path.startsWith("clientContractLinks/"))![1];
    expect(link.clientSlug).toBe(clientSlugForName(clientName));
  });

  it("returns a conflict on a stale source and commits no partial history or index changes", async () => {
    mocks.commit.mockRejectedValueOnce({ code: 9 });
    const before = new Map(records);
    const response = await update();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "Smlouva se mezitím změnila. Obnov detail a zkus uložení znovu." });
    expect(records).toEqual(before);
  });
});
