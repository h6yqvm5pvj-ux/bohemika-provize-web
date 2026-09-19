import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryDoc } from "@/app/cashflow/types";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), get: vi.fn(), update: vi.fn(), transaction: vi.fn(), history: vi.fn(), track: vi.fn() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: mocks.get, firestore: { runTransaction: mocks.transaction } }) }) }) }) } }));
vi.mock("@/lib/server/cashflowMutationTracking", () => ({
  withCashflowMutation: (_reason: string, work: () => Promise<unknown>) => work(),
  trackCashflowWrite: mocks.track,
}));
vi.mock("@/lib/server/contractHistory", () => ({ withContractHistory: mocks.history }));
import { POST } from "./route";

const owner = "owner@example.test";
const manager = "manager@example.test";
let entry: EntryDoc;
const context = (email = owner, contractAccessEmails: string[] = []) => ({
  ok: true, ctx: { email, actorEmail: "actor@example.test", contractAccessEmails },
  withRateLimit: (response: Response) => response,
});
const request = (body: Record<string, unknown>) => POST(new NextRequest("https://example.test/api/contracts/payout-plan", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerEmail: owner, entryId: "contract", ...body }),
}));
const preview = async () => (await (await request({ operation: "preview" })).json()).preview;

beforeEach(() => {
  vi.clearAllMocks();
  entry = {
    id: "contract", userEmail: owner, productKey: "kooperativaAuto", frequencyRaw: "annual",
    policyStartDate: "2023-02-12", contractSignedDate: "2023-02-10",
    items: [{ code: "B101", title: "Následná provize", amount: 300 }],
    commissionPayouts: [{ key: "paid", code: "C101", amount: 320, status: "paid", writtenBy: owner, payoutMonthKey: "2024-3" }],
  };
  mocks.guard.mockResolvedValue(context());
  mocks.get.mockImplementation(async () => ({ exists: true, data: () => entry }));
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ get: mocks.get, update: mocks.update }));
  mocks.update.mockImplementation((_ref, patch) => { entry = { ...entry, ...patch }; });
  mocks.history.mockImplementation((_tx, _ref, _before, patch) => patch);
  mocks.track.mockImplementation((work: () => Promise<unknown>) => work());
});

describe("payout-plan contract endpoint", () => {
  it("requires fresh authenticated access and has a read-only preview", async () => {
    const response = await request({ operation: "preview" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), expect.anything(), { freshCashflowContext: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and out-of-scope access before reading the contract", async () => {
    mocks.guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await request({ operation: "preview" })).status).toBe(401);
    mocks.guard.mockResolvedValueOnce(context("stranger@example.test"));
    expect((await request({ operation: "preview" })).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("saves only the separate association in a tracked transaction with a nonfinancial shared audit event", async () => {
    const initial = await preview();
    const originalPayouts = structuredClone(entry.commissionPayouts);
    const response = await request({ operation: "assign", payoutKey: "paid", targetKey: initial.targets[0].key, revision: initial.revision });
    expect(response.status).toBe(200);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0][1]).toEqual({ cashflowPayoutMatches: expect.any(Array) });
    expect(entry.commissionPayouts).toEqual(originalPayouts);
    expect(entry.cashflowPayoutMatches?.[0]).toMatchObject({ writtenBy: owner, actorEmail: "actor@example.test", payoutKey: "paid", plannedCode: "B101" });
    expect(mocks.history.mock.calls[0][4]).toMatchObject({ kind: "updated", changes: [] });
    const next = (await response.json()).preview;
    expect(next.payouts[0].targetKey).toBe(initial.targets[0].key);
  });
  it("rejects a stale confirmation after a concurrent statement change", async () => {
    const initial = await preview();
    entry.commissionPayouts![0].amount = 999;
    expect((await request({ operation: "assign", payoutKey: "paid", targetKey: initial.targets[0].key, revision: initial.revision })).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects a target that was not in the server-generated plan", async () => {
    const initial = await preview();
    expect((await request({ operation: "assign", payoutKey: "paid", targetKey: "A101|2023-03|2023-02-12", revision: initial.revision })).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("ignores a spoofed recipient and prevents a manager from assigning an owner's payout", async () => {
    mocks.guard.mockResolvedValue(context(manager, [owner]));
    entry.managerOverrides = [{ email: manager, position: "manazer4", commissionMode: "standard", items: [{ title: "Následná provize", amount: 40, code: "B101" }], total: 40 }];
    const initial = await preview();
    expect(initial.payouts).toEqual([]);
    expect((await request({ operation: "assign", viewerEmail: owner, writtenBy: owner, payoutKey: "paid", targetKey: initial.targets[0].key, revision: initial.revision })).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("allows a manager to match only their own payout and schedule", async () => {
    mocks.guard.mockResolvedValue(context(manager, [owner]));
    entry.managerOverrides = [{ email: manager, position: "manazer4", commissionMode: "standard", items: [{ title: "Následná provize", amount: 40, code: "B101" }], total: 40 }];
    entry.commissionPayouts!.push({ ...entry.commissionPayouts![0], key: "manager-paid", amount: 45, writtenBy: manager });
    const initial = await preview();
    expect(initial.targets[0].amount).toBe(40);
    expect((await request({ operation: "assign", payoutKey: "manager-paid", targetKey: initial.targets[0].key, revision: initial.revision })).status).toBe(200);
    expect(entry.cashflowPayoutMatches?.[0].writtenBy).toBe(manager);
  });
  it("removes a stale link even if its source row was removed by reprocessing", async () => {
    const initial = await preview();
    await request({ operation: "assign", payoutKey: "paid", targetKey: initial.targets[0].key, revision: initial.revision });
    entry.commissionPayouts = [];
    const stale = await preview();
    expect(stale.missingPayoutMatches).toHaveLength(1);
    expect((await request({ operation: "remove", payoutKey: "paid", revision: stale.revision })).status).toBe(200);
    expect(entry.cashflowPayoutMatches).toEqual([]);
  });
  it("rejects unsupported products and malformed document paths", async () => {
    expect((await request({ operation: "preview", entryId: "../../other" })).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
    entry.productKey = "cppAuto";
    expect((await request({ operation: "preview" })).status).toBe(400);
  });
});
