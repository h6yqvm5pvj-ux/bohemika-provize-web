import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  batch: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/app/api/contracts/_lib/contractsApi", async () => ({
  requireContractsEntryGuard: mocks.guard,
  hasContractAccess: (await import("@/app/api/contracts/_lib/contractsApi.access")).hasContractAccess,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, doc: mocks.doc, batch: mocks.batch },
}));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_reason: string, work: () => Promise<unknown>) => work(),
  trackCashflowWrite: (work: () => Promise<unknown>) => work(),
  markCashflowMutationIncomplete: vi.fn(),
}));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: mocks.history }));

import { POST } from "./route";

const viewer = "represented@example.test";
const owner = "owner@example.test";
const actor = "admin@example.test";
const contractNumber = "1234567890";
const entryPath = `users/${owner}/entries/entry-1`;
const statementPath = `usersPrivate/${viewer}/commissionStatements/statement-1`;
const records = new Map<string, Record<string, unknown>>();
const reads: string[] = [];
const writes: string[] = [];
const baseContext = {
  email: viewer,
  actorEmail: viewer,
  teamEmails: [] as string[],
  accountType: "advisor",
  canManageContractsAsAdmin: false,
  isImpersonating: false,
  impersonation: null,
};
const setContext = (changes: Record<string, unknown> = {}) => mocks.guard.mockResolvedValue({
  ok: true,
  ctx: { ...baseContext, ...changes },
  withRateLimit: (response: Response) => response,
});
const request = (changes: Record<string, unknown> = {}) => new NextRequest("http://localhost/api/commission-statements", {
  method: "POST",
  body: JSON.stringify({ action: "rebuild-contract-from-statements", ownerEmail: owner, entryId: "entry-1", contractNumber, ...changes }),
});
const snapshot = (path: string) => ({
  id: path.split("/").at(-1)!, ref: document(path), exists: records.has(path), updateTime: 1,
  data: () => records.has(path) ? structuredClone(records.get(path)) : undefined,
});
const write = (path: string, patch: Record<string, unknown>) => {
  writes.push(path);
  records.set(path, { ...records.get(path), ...structuredClone(patch) });
};
function document(path: string) {
  return {
    path, id: path.split("/").at(-1)!,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => { reads.push(path); return snapshot(path); },
    set: async (patch: Record<string, unknown>) => write(path, patch),
  };
}
function collection(path: string) {
  return {
    doc: (id: string) => document(`${path}/${id}`),
    get: async () => {
      reads.push(path);
      return { docs: [...records.keys()].filter(key => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/")).map(snapshot) };
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks(); records.clear(); reads.length = 0; writes.length = 0;
  setContext();
  mocks.collection.mockImplementation(collection);
  mocks.doc.mockImplementation(document);
  mocks.history.mockImplementation((_batch, _ref, _before, patch) => patch);
  mocks.batch.mockImplementation(() => {
    const pending: (() => void)[] = [];
    const set = (ref: { path: string }, patch: Record<string, unknown>) => pending.push(() => write(ref.path, patch));
    return { set, update: set, commit: async () => pending.forEach(work => work()) };
  });
  records.set(entryPath, { contractNumber, productKey: "neon", userEmail: owner, commissionPayouts: [] });
  records.set(statementPath, {
    statementNumber: "1", statementDate: "23.04.2026", period: "01.03.2026 - 31.03.2026",
    html: `<div id="ostatni_platby"><table><tr><td>Doplatek smlouvy ${contractNumber} 50 % provize B36</td><td>2 228,00</td></tr></table></div>`,
  });
});

async function expectRebuilt(actorEmail: string) {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true, matchedStatements: 1, processedStatements: 1,
    processingResult: { contractsUpdated: 1, contractsMatched: 1, payoutRecordsAdded: 1, errors: [], skippedContracts: [] },
  });
  expect(records.get(entryPath)?.commissionPayouts).toEqual([
    expect.objectContaining({ statementId: "statement-1", amount: 2228, writtenBy: viewer }),
  ]);
  expect(mocks.history).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: entryPath }), expect.anything(), expect.anything(), expect.objectContaining({ actorEmail }));
  expect(reads).toContain(`usersPrivate/${viewer}/commissionStatements`);
  expect(reads).not.toContain(`usersPrivate/${actor}/commissionStatements`);
  expect(reads).not.toContain(`usersPrivate/${owner}/commissionStatements`);
}

describe("rebuilding a contract from saved statements", () => {
  it("allows an administrator outside the owner's team through both access checks", async () => {
    setContext({ canManageContractsAsAdmin: true });
    await expectRebuilt(viewer);
  });

  it.each(["admin", "owner"])("retains verified %s authority while impersonating an adviser", async actorRole => {
    setContext({ actorEmail: actor, isImpersonating: true, impersonation: { actorEmail: actor, actorRole, targetEmail: viewer } });
    await expectRebuilt(actor);
  });

  it("preserves ordinary team access", async () => {
    setContext({ teamEmails: [owner] });
    await expectRebuilt(viewer);
  });

  it("preserves access through the saved manager chain", async () => {
    records.get(entryPath)!.managerChain = [{ email: viewer }];
    await expectRebuilt(viewer);
  });

  it("does not grant a support role administrator rights", async () => {
    setContext({ actorEmail: actor, isImpersonating: true, impersonation: { actorEmail: actor, actorRole: "support", targetEmail: viewer } });
    expect((await POST(request())).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("rejects an unrelated adviser even if the request claims administrator rights", async () => {
    const response = await POST(request({ canManageContractsAsAdmin: true, actorEmail: actor, impersonation: { actorRole: "owner" } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Nemáš oprávnění přepočítat tuto smlouvu." });
    expect(reads).toEqual([entryPath]);
    expect(writes).toEqual([]);
  });

  it("requires authentication before reading or writing", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(reads).toEqual([]); expect(writes).toEqual([]);
  });

  it("still rejects a mismatched contract number for an administrator", async () => {
    setContext({ canManageContractsAsAdmin: true });
    expect((await POST(request({ contractNumber: "9999999999" }))).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("keeps the contract intact when the represented account has no matching statements", async () => {
    setContext({ actorEmail: actor, isImpersonating: true, impersonation: { actorEmail: actor, actorRole: "admin", targetEmail: viewer } });
    records.set(`usersPrivate/${actor}/commissionStatements/statement-1`, records.get(statementPath)!);
    records.delete(statementPath);
    const before = structuredClone(records.get(entryPath));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ matchedStatements: 0, reset: null });
    expect(writes).toEqual([]);
    expect(records.get(entryPath)).toEqual(before);
  });
});
