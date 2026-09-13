import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeCashflow, type CashflowSnapshot } from "@/app/cashflow/computeCashflow";
import { buildCashflowView, type CashflowViewOptions } from "@/app/cashflow/buildCashflowView";
import { CASHFLOW_SHADOW_VERSION, hashCashflowValue } from "@/app/cashflow/shadowProtocol";

const mocks = vi.hoisted(() => ({ load: vi.fn(), rateLimit: vi.fn(), auth: vi.fn(), capture: vi.fn(), publish: vi.fn(), readCandidate: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.auth }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: { name: "test-db" } }));
vi.mock("@/lib/server/cashflowCacheState", () => ({ captureCashflowRevision: mocks.capture }));
vi.mock("@/lib/server/cashflowCandidateStore", () => ({ publishCashflowCandidate: mocks.publish, readCashflowCandidate: mocks.readCandidate }));
vi.mock("@/lib/server/cashflowShadowInputs", async (original) => ({
  ...await original<typeof import("@/lib/server/cashflowShadowInputs")>(),
  loadCashflowShadowInputs: mocks.load,
}));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: mocks.rateLimit }));
import { CashflowShadowInputsError } from "@/lib/server/cashflowShadowInputs";
import { POST } from "./route";

const email = "own@example.test";
const snapshot: CashflowSnapshot = {
  email, myPosition: null, myCommissionMode: null, hasAnyTeam: false,
  ownEntries: [], teamEntriesRaw: [], subscriptionPayments: [],
  tipPayouts: [{ id: "tip1", payoutDate: new Date(2026, 8, 10).getTime(), amount: 123, clientName: "Private client" }],
};
const options: CashflowViewOptions = {
  scopeFilter: "combined", productFilter: "all", tipsterMode: false,
  showPastYears: true, intelligentPredictionEnabled: false, contractNumberQuery: "",
};
const inputs = () => ({ snapshot: structuredClone(snapshot), statements: [], effectiveEmail: email, tipsterMode: false });
async function body() {
  const asOf = new Date();
  const items = computeCashflow(snapshot, { ...options, asOf });
  const months = buildCashflowView(items, [], options, asOf);
  return {
    version: CASHFLOW_SHADOW_VERSION, asOfMs: asOf.getTime(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    options, inputHash: await hashCashflowValue({ snapshot, statements: [] }),
    itemsHash: await hashCashflowValue(items), monthsHash: await hashCashflowValue(months),
  };
}
function request(data: unknown, signal?: AbortSignal) {
  return new NextRequest("https://example.test/api/cashflow/shadow?email=other@example.test", {
    method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: typeof data === "string" ? data : JSON.stringify(data), signal,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CASHFLOW_SHADOW_ENABLED", "1");
  vi.stubEnv("CASHFLOW_SHADOW_EMAILS", email);
  vi.stubEnv("CASHFLOW_CANDIDATES_ENABLED", "");
  vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "");
  mocks.auth.mockResolvedValue({ ok: true, ctx: { email, uid: "verified-uid" } });
  mocks.capture.mockResolvedValue({ epoch: "test-epoch", revision: 1 });
  mocks.publish.mockImplementation(async () => true);
  mocks.readCandidate.mockImplementation(async () => mocks.publish.mock.calls.at(-1)?.[1]);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 300 });
  mocks.load.mockImplementation(async (_req, { authorizeEmail }) => {
    if (!await authorizeEmail(email)) throw new CashflowShadowInputsError("not_allowed", 403);
    return inputs();
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("cashflow server shadow endpoint", () => {
  const enableCandidates = () => {
    vi.stubEnv("CASHFLOW_CANDIDATES_ENABLED", "1");
    vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "1");
  };
  it("authenticates own-account access before revision or source reads", async () => {
    enableCandidates();
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await POST(request(await body()))).status).toBe(401);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("captures the revision before fresh profile loading and verifies the stored result with token identity", async () => {
    enableCandidates();
    const response = await POST(request({ ...await body(), email: "intruder@test", uid: "intruder" }));
    expect(await response.json()).toMatchObject({ status: "match", candidate: "verified" });
    expect(mocks.capture.mock.invocationCallOrder[0]).toBeLessThan(mocks.load.mock.invocationCallOrder[0]);
    expect(mocks.load.mock.calls[0][1]).toMatchObject({ freshCashflowContext: true });
    expect(mocks.publish.mock.calls[0][1].context).toMatchObject({ email, uid: "verified-uid" });
    expect(mocks.auth.mock.calls[0][1]).toMatchObject({ allowImpersonation: false, enforceAdvisorSetup: false });
  });
  it.each(["CASHFLOW_CANDIDATES_ENABLED", "CASHFLOW_CACHE_TRACK_WRITES"])("requires %s before touching storage", async flag => {
    enableCandidates();
    vi.stubEnv(flag, "");
    expect(await (await POST(request(await body()))).json()).toMatchObject({ status: "match" });
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("does not persist an input or calculation mismatch", async () => {
    enableCandidates();
    expect(await (await POST(request({ ...await body(), itemsHash: "0".repeat(64) }))).json()).toMatchObject({ status: "mismatch", candidate: "not_stored" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("does not publish a mixed snapshot if a mutation starts during loading", async () => {
    enableCandidates();
    mocks.load.mockImplementation(async () => {
      mocks.publish.mockResolvedValue(false);
      return inputs();
    });
    expect(await (await POST(request(await body()))).json()).toMatchObject({ status: "match", candidate: "revision_changed" });
    expect(mocks.publish.mock.calls[0][1].revision).toEqual({ epoch: "test-epoch", revision: 1 });
    expect(mocks.readCandidate).not.toHaveBeenCalled();
  });
  it("continues comparison without storage when the revision is unavailable", async () => {
    enableCandidates();
    mocks.capture.mockResolvedValue(null);
    expect(await (await POST(request(await body()))).json()).toMatchObject({ status: "match", candidate: "not_stored" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("rejects a changed effective identity even if a source handler returned success", async () => {
    enableCandidates();
    mocks.load.mockResolvedValue({ ...inputs(), effectiveEmail: "other@test" });
    expect(await (await POST(request(await body()))).json()).toMatchObject({ status: "skipped", reason: "different_inputs" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each(["CASHFLOW_SHADOW_ENABLED", "CASHFLOW_SHADOW_EMAILS"])("does no reads when %s is missing", async (flag) => {
    vi.stubEnv(flag, "");
    const response = await POST(request(await body()));
    expect(await response.json()).toEqual({ ok: true, status: "skipped", reason: "disabled" });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("compares actual computation and months only for the authorized effective account", async () => {
    const response = await POST(request({ ...await body(), email: "other@example.test", snapshot: { amount: 999 } }));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, status: "match", itemsMatch: true, monthsMatch: true });
    expect(mocks.rateLimit).toHaveBeenCalledWith({ namespace: "api:cashflow:shadow", key: email, limit: 1, windowMs: 300000 });
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(/Private client|own@example|123|inputHash/);
  });
  it.each(["itemsHash", "monthsHash"] as const)("reports a changed %s without returning amounts or portfolio", async (key) => {
    const response = await POST(request({ ...await body(), [key]: "0".repeat(64) }));
    expect(await response.json()).toEqual({ ok: true, status: "mismatch", itemsMatch: key !== "itemsHash", monthsMatch: key !== "monthsHash" });
  });
  it("marks newer source data inconclusive instead of claiming a calculation mismatch", async () => {
    const response = await POST(request({ ...await body(), inputHash: "0".repeat(64) }));
    expect(await response.json()).toEqual({ ok: true, status: "skipped", reason: "different_inputs" });
    expect(console.info).not.toHaveBeenCalled();
  });
  it("skips potentially excessive calculation work before generating predictions", async () => {
    mocks.load.mockResolvedValue({
      ...inputs(), snapshot: { ...snapshot, ownEntries: [{ id: "bad", durationYears: 10000000 }] },
    });
    expect(await (await POST(request(await body()))).json()).toEqual({ ok: true, status: "skipped", reason: "resource_limit" });
    expect(console.info).not.toHaveBeenCalled();
  });
  it("does not trust the client account type", async () => {
    const valid = await body();
    const response = await POST(request({ ...valid, options: { ...options, tipsterMode: true } }));
    expect(await response.json()).toMatchObject({ status: "skipped", reason: "different_inputs" });
  });
  it("rejects accounts outside the allowlist before consuming their diagnostic allowance", async () => {
    vi.stubEnv("CASHFLOW_SHADOW_EMAILS", "other@example.test");
    expect((await POST(request(await body()))).status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it("preserves authentication failure", async () => {
    mocks.load.mockRejectedValue(new CashflowShadowInputsError("unauthorized", 401));
    expect((await POST(request(await body()))).status).toBe(401);
  });
  it("limits heavy rereads independently of normal cashflow requests", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 299 });
    const response = await POST(request(await body()));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("299");
  });
  it.each(["time_zone", "stale_context"])("skips %s before reading portfolio", async (reason) => {
    const valid = await body();
    const response = await POST(request({ ...valid, ...(reason === "time_zone" ? { timeZone: "different/zone" } : { asOfMs: valid.asOfMs - 300001 }) }));
    expect(await response.json()).toMatchObject({ status: "skipped", reason });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["incomplete", "limit", "timeout"] as const)("never calls a partial %s result a match", async (code) => {
    mocks.load.mockRejectedValue(new CashflowShadowInputsError(code));
    expect(await (await POST(request(await body()))).json()).toMatchObject({ status: "skipped", reason: code === "timeout" ? "unavailable" : "incomplete_inputs" });
  });
  it("isolates unexpected failures and does not expose source data", async () => {
    mocks.load.mockRejectedValue(new Error("private database contents"));
    const response = await POST(request(await body()));
    expect(await response.json()).toEqual({ ok: true, status: "skipped", reason: "unavailable" });
    expect(console.info).not.toHaveBeenCalled();
  });
  it("ignores completed work after request cancellation", async () => {
    const controller = new AbortController();
    mocks.load.mockImplementation(async () => { controller.abort(); return inputs(); });
    expect(await (await POST(request(await body(), controller.signal))).json()).toMatchObject({ status: "skipped", reason: "unavailable" });
  });
  it.each(["{", "x".repeat(4097)])("bounds and validates the body before data reads", async (raw) => {
    expect((await POST(request(raw))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
