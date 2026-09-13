import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeCashflowSnapshot } from "@/app/cashflow/cashflowSnapshotWire";
import { CASHFLOW_SHADOW_VERSION, hashCashflowValue } from "@/app/cashflow/shadowProtocol";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), capture: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.auth }));
vi.mock("@/lib/server/cashflowCandidateAccess", () => ({ authorizeCashflowCandidateRead: mocks.access }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("@/lib/server/cashflowCacheState", () => ({ captureCashflowRevision: mocks.capture }));
vi.mock("@/lib/server/cashflowCandidateStore", () => ({ readCashflowCandidate: mocks.read }));
import { POST } from "./route";

const email = "own@example.test";
const revision = { epoch: "epoch", revision: 1 };
const options = { scopeFilter: "combined", productFilter: "all", tipsterMode: false, showPastYears: true, intelligentPredictionEnabled: false, contractNumberQuery: "" } as const;
const result = { items: [{ id: "private-id", date: new Date(), amount: 7744321.87, productKey: "unknown" as const, ownerEmail: email, entryId: "private-entry", clientName: "PRIVATE CLIENT" }], months: [] };
const candidate = () => ({ revision, inputHash: "a".repeat(64), payload: serializeCashflowSnapshot(result) });
async function body() {
  return { version: CASHFLOW_SHADOW_VERSION, asOfMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, options,
    inputHash: "a".repeat(64), itemsHash: await hashCashflowValue(result.items), monthsHash: await hashCashflowValue(result.months) };
}
const request = (value: unknown, signal?: AbortSignal) => new NextRequest("https://example.test/api/cashflow/candidate-check?email=other@test", {
  method: "POST", headers: { Authorization: "Bearer private-token" }, body: typeof value === "string" ? value : JSON.stringify(value), signal,
});
beforeEach(() => {
  vi.resetAllMocks();
  for (const flag of ["CASHFLOW_SHADOW_ENABLED", "CASHFLOW_CANDIDATES_ENABLED", "CASHFLOW_CACHE_TRACK_WRITES"]) vi.stubEnv(flag, "1");
  vi.stubEnv("CASHFLOW_SHADOW_EMAILS", email);
  mocks.auth.mockResolvedValue({ ok: true, ctx: { email, uid: "token-uid" } });
  mocks.access.mockResolvedValue(true);
  mocks.capture.mockResolvedValue(revision);
  mocks.read.mockResolvedValue(candidate());
});
afterEach(() => vi.unstubAllEnvs());

describe("immediate cashflow candidate replay", () => {
  it.each(["CASHFLOW_SHADOW_ENABLED", "CASHFLOW_CANDIDATES_ENABLED", "CASHFLOW_CACHE_TRACK_WRITES", "CASHFLOW_SHADOW_EMAILS"])("does no database or auth work with %s disabled", async flag => {
    vi.stubEnv(flag, "");
    expect(await (await POST(request(await body()))).json()).toMatchObject({ status: "skipped", reason: "disabled" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("reads a current candidate under fresh permissions and returns only comparison results and timings", async () => {
    const data = await body();
    const response = await POST(request({ ...data, email: "intruder@test", uid: "intruder" }));
    expect(await response.json()).toEqual({ ok: true, status: "match", itemsMatch: true, monthsMatch: true });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Server-Timing")).toMatch(/cashflow_total;dur=\d+\.\d+/);
    expect(response.headers.get("Server-Timing")).not.toMatch(/PRIVATE|private|7744321|email/);
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.capture.mock.invocationCallOrder[0]);
    expect(mocks.capture.mock.invocationCallOrder[0]).toBeLessThan(mocks.access.mock.invocationCallOrder[0]);
    expect(mocks.access.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0]);
    expect(mocks.read.mock.calls[0][1].context).toEqual({ email, uid: "token-uid", version: data.version, asOfMs: data.asOfMs, timeZone: data.timeZone, options });
    expect(mocks.auth.mock.calls[0][1]).toMatchObject({ namespace: "api:cashflow:candidate-check", limit: 1, windowMs: 300000, allowImpersonation: false });
  });
  it.each([401, 403, 429])("rejects unauthorized/rate-limited requests (%i) before database reads", async status => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status, headers: { "Retry-After": "299" } }) });
    const response = await POST(request(await body()));
    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe("299");
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("requires an allowlisted identity before reading the revision", async () => {
    vi.stubEnv("CASHFLOW_SHADOW_EMAILS", "other@example.test");
    expect((await POST(request(await body()))).status).toBe(403);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("does not read amounts if fresh role, subscription or setup checks fail", async () => {
    mocks.access.mockResolvedValue(false);
    expect((await POST(request(await body()))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns a miss without rebuilding when a mutation is active or state is missing", async () => {
    mocks.capture.mockResolvedValue(null);
    expect(await (await POST(request(await body()))).json()).toEqual({ ok: true, status: "miss" });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([null, { revision: { ...revision, revision: 2 } }, { revision: { ...revision, epoch: "new-epoch" } }])("rejects a miss or revision changed during authorization (%j)", async stored => {
    mocks.read.mockResolvedValue(stored);
    expect(await (await POST(request(await body()))).json()).toEqual({ ok: true, status: "miss" });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("checks source fingerprint before claiming output comparison", async () => {
    expect(await (await POST(request({ ...await body(), inputHash: "b".repeat(64) }))).json()).toMatchObject({ status: "skipped", reason: "different_inputs" });
  });
  it.each(["itemsHash", "monthsHash"] as const)("reports mismatched %s without exposing amounts", async key => {
    expect(await (await POST(request({ ...await body(), [key]: "b".repeat(64) }))).json()).toEqual({ ok: true, status: "mismatch", itemsMatch: key !== "itemsHash", monthsMatch: key !== "monthsHash" });
  });
  it("treats malformed storage as a miss", async () => {
    mocks.read.mockResolvedValue({ ...candidate(), payload: { version: "bad" } });
    expect(await (await POST(request(await body()))).json()).toEqual({ ok: true, status: "miss" });
  });
  it("contains database failure without retry or fallback generation", async () => {
    mocks.read.mockRejectedValue(new Error("PRIVATE database details"));
    expect(await (await POST(request(await body()))).json()).toEqual({ ok: true, status: "skipped", reason: "unavailable" });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it.each(["before", "authorization", "read"])("honors cancellation %s", async when => {
    const controller = new AbortController();
    if (when === "before") controller.abort();
    if (when === "authorization") mocks.access.mockImplementation(async () => { controller.abort(); return false; });
    if (when === "read") mocks.read.mockImplementation(async () => { controller.abort(); return candidate(); });
    expect(await (await POST(request(await body(), controller.signal))).json()).toMatchObject({ status: "skipped", reason: "unavailable" });
    if (when !== "read") expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["{", "x".repeat(4097)])("bounds and validates request before authorization", async value => {
    expect((await POST(request(value))).status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each(["stale", "zone"])("rejects %s context before reading", async kind => {
    const data = await body();
    expect(await (await POST(request({ ...data, ...(kind === "zone" ? { timeZone: "other/zone" } : { asOfMs: data.asOfMs - 300001 }) }))).json()).toMatchObject({ status: "skipped", reason: kind === "zone" ? "time_zone" : "stale_context" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
