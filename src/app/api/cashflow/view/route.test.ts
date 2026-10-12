import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture, WORKER_FILTER_CASES } from "../../../../../scripts/cashflow-worker/fixtures";
import { runReference } from "../../../../../scripts/cashflow-worker/reference";
import { CASHFLOW_SERVER_PILOT_VERSION } from "@/app/cashflow/cashflowServerProtocol";
import { cashflowCanonicalJson, hashCashflowValue } from "@/app/cashflow/shadowProtocol";
import { parseCashflowSnapshot } from "@/app/cashflow/cashflowSnapshotWire";
import { formatCashflowItemCount } from "@/app/cashflow/cashflowLabels";
import type { CashflowViewOptions } from "@/app/cashflow/buildCashflowView";
import { createCashflowModel } from "@/app/cashflow/cashflowModel";
import { createCashflowServerPilotClient } from "@/app/cashflow/cashflowServerPilot.client";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({ requireAuthedRateLimited: mocks.auth }));
vi.mock("@/lib/server/cashflowShadowInputs", async original => ({
  ...await original<typeof import("@/lib/server/cashflowShadowInputs")>(), loadCashflowShadowInputs: mocks.load,
}));
import { CashflowShadowInputsError } from "@/lib/server/cashflowShadowInputs";
import { POST } from "./route";

const asOf = new Date(2026, 9, 8, 12);
const email = "advisor@example.test";
const options = WORKER_FILTER_CASES[0].options;
let fixture = makeWorkerFixture(12, asOf);
const inputs = () => ({ ...fixture, effectiveEmail: email, tipsterMode: false });
const body = async (selected: CashflowViewOptions = options, monthKey?: string) => ({
  version: CASHFLOW_SERVER_PILOT_VERSION, kind: monthKey ? "month" : "view",
  asOfMs: asOf.getTime(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  options: selected, inputHash: await hashCashflowValue(fixture), ...(monthKey ? { monthKey } : {}),
});
const request = (value: unknown, signal?: AbortSignal) => new NextRequest("https://example.test/api/cashflow/view?email=other@example.test", {
  method: "POST", body: typeof value === "string" ? value : JSON.stringify(value), signal,
  headers: { Authorization: "Bearer synthetic-token", "Content-Type": "application/json" },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(asOf);
  vi.stubEnv("CASHFLOW_SERVER_PILOT_ENABLED", "1");
  vi.stubEnv("CASHFLOW_SERVER_PILOT_EMAILS", email);
  fixture = makeWorkerFixture(12, asOf);
  mocks.auth.mockResolvedValue({ ok: true, ctx: { email, uid: "verified-uid" } });
  mocks.load.mockImplementation(async (_req, { authorizeEmail }) => {
    if (!await authorizeEmail(email)) throw new CashflowShadowInputsError("not_allowed", 403);
    return inputs();
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("read-only server cashflow pilot", () => {
  it("wires trusted source timing into headers while preserving the complete response and hashes", async () => {
    const selected = await body();
    const original = await (await POST(request(selected))).json();
    mocks.load.mockImplementation(async (_req, { authorizeEmail, onSourceTiming }) => {
      expect(await authorizeEmail(email)).toBe(true);
      onSourceTiming("cashflow_inputs_own_contracts", 4.5);
      onSourceTiming("cashflow_inputs_own_contracts", 5.5);
      onSourceTiming("cashflow_inputs_statements", 3);
      onSourceTiming("cashflow_inputs_own_contracts_identity", 1);
      onSourceTiming("cashflow_inputs_own_contracts_entries", 7);
      return inputs();
    });
    const response = await POST(request(selected));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(original);
    expect(response.headers.get("Server-Timing")).toContain("cashflow_inputs_own_contracts;dur=10.00");
    expect(response.headers.get("Server-Timing")).toContain("cashflow_inputs_statements;dur=3.00");
    expect(response.headers.get("Server-Timing")).toContain("cashflow_inputs_own_contracts_identity;dur=1.00");
    expect(response.headers.get("Server-Timing")).toContain("cashflow_inputs_own_contracts_entries;dur=7.00");
    expect(response.headers.get("Server-Timing")).not.toMatch(/advisor@example|synthetic-token|contract-/);
  });
  it.each(WORKER_FILTER_CASES)("matches the independent original calculation and every month/item for $id", async ({ options }) => {
    const reference = runReference(fixture.snapshot, fixture.statements, options, asOf);
    const before = cashflowCanonicalJson(fixture);
    const response = await POST(request(await body(options)));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Server-Timing")).toContain("cashflow_compute");
    const actual = await response.json();
    expect(actual.monthsHash).toBe(await hashCashflowValue(reference.months));
    expect(actual.overview.months).toEqual(reference.months.map(({ items, ...month }) => ({
      ...month, itemCountLabel: formatCashflowItemCount(items),
    })));
    expect(actual.overview.months.every((month: object) => !Object.hasOwn(month, "items"))).toBe(true);
    const decoded = [];
    for (const month of reference.months) {
      const detailResponse = await POST(request(await body(options, month.key)));
      expect(detailResponse.status).toBe(200);
      const detail = await detailResponse.json();
      expect(detail.monthsHash).toBe(actual.monthsHash);
      const parsed = parseCashflowSnapshot(detail.payload)!;
      expect(parsed.items).toEqual([]);
      expect(parsed.months).toHaveLength(1);
      decoded.push(parsed.months[0]);
    }
    expect(cashflowCanonicalJson(decoded)).toBe(cashflowCanonicalJson(reference.months));
    expect(cashflowCanonicalJson(fixture)).toBe(before);
  }, 30_000);

  it("returns only aggregate data without client names, emails or contract numbers in an unfiltered overview", async () => {
    const value = await (await POST(request(await body()))).json();
    expect(value.overview.contractSearchStats.summary).toBeNull();
    expect(JSON.stringify(value)).not.toMatch(/Syntetický|advisor@example|member-|100000|contract-0000/);
    expect(Object.keys(value).sort()).toEqual(["inputHash", "kind", "monthsHash", "ok", "overview", "version"]);
    expect(mocks.load.mock.calls[0][1].freshCashflowContext).toBe(true);
  });
  it("returns an empty detail for a month outside the current filtered view", async () => {
    const value = await (await POST(request(await body(options, "2001-01")))).json();
    expect(parseCashflowSnapshot(value.payload)).toEqual({ items: [], months: [] });
  });
  it("connects the background client, model, endpoint and Date codec, then detects a source change", async () => {
    const model = createCashflowModel({ ...structuredClone(fixture), asOf });
    const local = { executionPath: "fallback" as const,
      view: async (options: CashflowViewOptions) => model.view(options),
      month: async (key: string) => model.month(key), verification: () => model.verification!(), dispose: () => model.dispose(),
    };
    const measure = vi.fn();
    const client = createCashflowServerPilotClient({
      dataset: { ...fixture, asOf }, local, createLocal: fresh => {
        const model = createCashflowModel(fresh);
        return { executionPath: "fallback", view: async selected => model.view(selected),
          month: async key => model.month(key), verification: () => model.verification!(), dispose: () => model.dispose() };
      }, getToken: async () => "synthetic-token", measure,
      request: async (_url, init) => POST(new NextRequest("https://example.test/api/cashflow/view", { ...init, signal: init?.signal ?? undefined })),
    });
    try {
      const overview = await client.view(options);
      expect(measure).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(measure).toHaveBeenCalledTimes(1));
      expect(measure.mock.calls.at(-1)![0].status).toBe("match");
      const key = overview.months.find(month => model.month(month.key)!.items.length > 0)!.key;
      expect(await client.month(key)).toEqual(model.month(key));
      await vi.waitFor(() => expect(measure).toHaveBeenCalledTimes(2));
      expect(measure.mock.calls.at(-1)![0].status).toBe("match");
      fixture.snapshot.ownEntries[0].items![0].amount += 100;
      expect(await client.month(key)).toBe(model.month(key));
      await vi.waitFor(() => expect(measure).toHaveBeenCalledTimes(3));
      expect(measure.mock.calls.at(-1)![0]).toMatchObject({ status: "unavailable", reason: "different_inputs" });
    } finally { client.dispose(); }
  });
  it.each(WORKER_FILTER_CASES)("renews an idle browser calculation and matches the real endpoint for $id", async ({ options: selected }) => {
    const source = structuredClone(fixture);
    const before = cashflowCanonicalJson(source);
    const createLocal = (fresh: Parameters<typeof createCashflowModel>[0]) => {
      const model = createCashflowModel(fresh);
      return { executionPath: "fallback" as const, view: async (value: CashflowViewOptions) => model.view(value),
        month: async (key: string) => model.month(key), verification: () => model.verification!(), dispose: () => model.dispose() };
    };
    const dataset = { ...source, asOf };
    const measure = vi.fn();
    const client = createCashflowServerPilotClient({ dataset, local: createLocal(dataset), createLocal,
      getToken: async () => "synthetic-token", measure,
      request: async (_url, init) => POST(new NextRequest("https://example.test/api/cashflow/view", { ...init, signal: init?.signal ?? undefined })),
    });
    try {
      await client.view(options);
      await vi.waitFor(() => expect(measure).toHaveBeenCalledTimes(1));
      expect(measure.mock.calls[0][0].status).toBe("match");
      const now = new Date(asOf.getTime() + 6 * 60_000);
      vi.setSystemTime(now);
      const stale = await POST(request(await body(selected)));
      expect(stale.status).toBe(409);
      expect((await stale.json()).reason).toBe("stale_context");
      const reference = runReference(source.snapshot, source.statements, selected, now);
      const actual = await client.view(selected);
      expect(actual.months).toEqual(reference.months.map(({ items, ...month }) => ({ ...month, itemCountLabel: formatCashflowItemCount(items) })));
      await vi.waitFor(() => expect(measure).toHaveBeenCalledTimes(2));
      expect(measure.mock.calls[1][0].status).toBe("match");
      for (const month of reference.months) expect(cashflowCanonicalJson(await client.month(month.key))).toBe(cashflowCanonicalJson(month));
      expect(cashflowCanonicalJson(source)).toBe(before);
    } finally { client.dispose(); }
  }, 30_000);
  it.each(["CASHFLOW_SERVER_PILOT_ENABLED", "CASHFLOW_SERVER_PILOT_EMAILS"])("is disabled by default without %s", async flag => {
    vi.stubEnv(flag, "");
    expect((await POST(request(await body()))).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429])("preserves authentication denial %s and hides upstream errors", async status => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response("private token diagnostics", { status, headers: { "Retry-After": "30" } }) });
    const response = await POST(request(await body()));
    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.text()).not.toContain("private token");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("rejects a valid account outside the server allowlist before portfolio reads", async () => {
    mocks.auth.mockResolvedValue({ ok: true, ctx: { email: "other@example.test", uid: "other" } });
    expect((await POST(request(await body()))).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("ignores supplied identities, roles and financial inputs and binds access to the token", async () => {
    const response = await POST(request({ ...await body(), email: "other@example.test", uid: "other", role: "owner", snapshot: { amount: 999 } }));
    expect(response.status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ allowImpersonation: false, limit: 12 }));
    const authorization = mocks.load.mock.calls[0][1].authorizeEmail;
    expect(authorization("other@example.test")).toBe(false);
    expect(authorization(email)).toBe(true);
  });
  it.each(["effectiveEmail", "snapshot"])("rejects another account returned through %s", async field => {
    mocks.load.mockResolvedValue({ ...inputs(), ...(field === "effectiveEmail"
      ? { effectiveEmail: "other@example.test" } : { snapshot: { ...fixture.snapshot, email: "other@example.test" } }) });
    expect((await POST(request(await body()))).status).toBe(403);
  });
  it("rejects client manipulation of account type", async () => {
    expect((await POST(request(await body({ ...options, tipsterMode: true })))).status).toBe(409);
  });
  it("rejects changed source data between overview and month reads", async () => {
    const original = await body(options, "2026-10");
    fixture.snapshot.ownEntries[0].items![0].amount += 1;
    expect((await POST(request(original))).status).toBe(409);
  });
  it.each(["incomplete", "limit", "timeout", "upstream_failed"] as const)("never returns partial amounts after %s", async code => {
    mocks.load.mockRejectedValue(new CashflowShadowInputsError(code));
    const response = await POST(request(await body()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Cashflow není dostupné.", reason:
      code === "incomplete" ? "incomplete_inputs" : code === "limit" ? "resource_limit" : code === "timeout" ? "timeout" : "unavailable",
      ...(code === "limit" ? { resourceLimit: "input_requests" } : {}) });
  });
  it.each([401, 403, 429])("honors source authorization/rate denial %s", async status => {
    mocks.load.mockRejectedValue(new CashflowShadowInputsError("forbidden", status));
    expect((await POST(request(await body()))).status).toBe(status);
  });
  it("bounds calculation work for corrupt or excessive contracts", async () => {
    fixture.snapshot.ownEntries[0].durationYears = 10000000;
    const response = await POST(request(await body()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Cashflow není dostupné.",
      reason: "resource_limit", resourceLimit: "duration" });
    expect(response.headers.get("Server-Timing")).not.toMatch(/cashflow_(compute|hash)/);
  });
  it("reports a rejected date without exposing the rejected value or contract identity", async () => {
    fixture.snapshot.ownEntries[0].policyStartDate = "private-invalid-date";
    const response = await POST(request(await body()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Cashflow není dostupné.",
      reason: "resource_limit", resourceLimit: "date_range" });
    expect(response.headers.get("Server-Timing")).not.toMatch(/cashflow_(compute|hash)/);
  });
  it.each(WORKER_FILTER_CASES.map(filter => ({ ...filter, count: filter.id === "prediction" ? 200 : 300 })))(
    "preserves all month fields for a newly admitted $count-contract portfolio and $id", async ({ options, count }) => {
    fixture = makeWorkerFixture(count, asOf);
    const reference = runReference(fixture.snapshot, fixture.statements, options, asOf);
    const response = await POST(request(await body(options)));
    expect(response.status).toBe(200);
    const actual = await response.json();
    expect(actual.monthsHash).toBe(await hashCashflowValue(reference.months));
    expect(actual.overview.months).toEqual(reference.months.map(({ items, ...month }) => ({
      ...month, itemCountLabel: formatCashflowItemCount(items),
    })));
    const occupied = reference.months.find(month => month.items.length > 0)!;
    const detail = await (await POST(request(await body(options, occupied.key)))).json();
    expect(cashflowCanonicalJson(parseCashflowSnapshot(detail.payload)!.months)).toBe(cashflowCanonicalJson([occupied]));
  }, 30_000);

  it("binds the life-review budget to the same validated option used by computation", async () => {
    fixture = makeWorkerFixture(1, asOf);
    const template = fixture.snapshot.ownEntries[0];
    fixture.snapshot.ownEntries = Array.from({ length: 1_000 }, (_, index) => ({ ...template,
      id: `synthetic-life-${index}`, productKey: "neon" as const, items: [{ title: "Okamžitá provize", amount: 10 }],
    }));
    const disabled = await POST(request(await body({ ...options, intelligentPredictionEnabled: false })));
    expect(disabled.status).toBe(200);
    const original = runReference(fixture.snapshot, fixture.statements, options, asOf);
    expect((await disabled.json()).monthsHash).toBe(await hashCashflowValue(original.months));
    const enabled = await POST(request(await body({ ...options, intelligentPredictionEnabled: true })));
    expect(enabled.status).toBe(503);
    expect(await enabled.json()).toMatchObject({ reason: "resource_limit", resourceLimit: "output_estimate" });
    expect(enabled.headers.get("Server-Timing")).not.toMatch(/cashflow_(compute|hash)/);
  });

  it("admits bounded team life predictions and matches every original month/item without raising the cap", async () => {
    fixture = makeWorkerFixture(1, asOf);
    const template = fixture.snapshot.ownEntries[0];
    fixture.snapshot.ownEntries = [];
    fixture.snapshot.hasAnyTeam = true;
    fixture.snapshot.teamEntriesRaw = Array.from({ length: 200 }, (_, index) => ({ ...template,
      id: `synthetic-team-life-${index}`, userEmail: "member@example.test", productKey: "neon" as const,
      items: [{ title: "Okamžitá provize", amount: 10 }],
      managerOverrides: [{ email, position: "manazer8", commissionMode: "standard",
        items: [{ title: "Okamžitá provize", amount: 2 }], total: 2 }],
    }));
    const selected: CashflowViewOptions = { ...options, scopeFilter: "team", intelligentPredictionEnabled: true };
    const reference = runReference(fixture.snapshot, fixture.statements, selected, asOf);
    const response = await POST(request(await body(selected)));
    expect(response.status).toBe(200);
    const actual = await response.json();
    expect(actual.monthsHash).toBe(await hashCashflowValue(reference.months));
    expect(actual.overview.months).toEqual(reference.months.map(({ items, ...month }) => ({
      ...month, itemCountLabel: formatCashflowItemCount(items),
    })));
    expect(reference.months.reduce((sum, month) => sum + month.items.length, 0)).toBeLessThanOrEqual(25_000);
    expect(response.headers.get("Server-Timing")).toContain("cashflow_compute");
  });

  it("keeps the bounded fallback for an excessive portfolio without returning partial totals", async () => {
    fixture = makeWorkerFixture(1000, asOf);
    const response = await POST(request(await body()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Cashflow není dostupné.", reason: "resource_limit", resourceLimit: "output_estimate" });
    expect(response.headers.get("Server-Timing")).not.toContain("cashflow_compute");
  });
  it.each(["view", "month"] as const)("matches the full original prediction for a selected team %s despite excluded own contracts", async kind => {
    fixture = makeWorkerFixture(1, asOf);
    const template = fixture.snapshot.ownEntries[0];
    fixture.snapshot.ownEntries = Array.from({ length: 1_000 }, (_, index) => ({ ...template,
      id: `own-life-${index}`, productKey: "neon" as const, items: [{ title: "Okamžitá provize", amount: 10 }],
    }));
    fixture.snapshot.teamEntriesRaw = Array.from({ length: 300 }, (_, index) => ({ ...template,
      id: `team-life-${index}`, userEmail: "member@example.test", productKey: "neon" as const,
      items: [{ title: "Okamžitá provize", amount: 10 }],
      managerOverrides: [{ email, position: "manazer8", commissionMode: "standard",
        items: [{ title: "Okamžitá provize", amount: 2 }], total: 2 }],
    }));
    const selected = { ...options, scopeFilter: "team" as const, intelligentPredictionEnabled: true };
    const before = cashflowCanonicalJson(fixture);
    const reference = runReference(fixture.snapshot, fixture.statements, selected, asOf);
    const occupied = reference.months.find(month => month.items.length > 0)!;
    const response = await POST(request(await body(selected, kind === "month" ? occupied.key : undefined)));
    expect(response.status).toBe(200);
    const actual = await response.json();
    expect(actual.inputHash).toBe(await hashCashflowValue(fixture));
    expect(actual.monthsHash).toBe(await hashCashflowValue(reference.months));
    if (kind === "month") expect(cashflowCanonicalJson(parseCashflowSnapshot(actual.payload)!.months)).toBe(cashflowCanonicalJson([occupied]));
    else expect(actual.overview.months).toEqual(reference.months.map(({ items, ...month }) => ({
      ...month, itemCountLabel: formatCashflowItemCount(items),
    })));
    expect(cashflowCanonicalJson(fixture)).toBe(before);
    const previousBody = await body(selected);
    fixture.snapshot.ownEntries[0].items![0].amount += 1;
    const stale = await POST(request(previousBody));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ reason: "different_inputs" });
  });

  it("cannot bypass a selected excessive portfolio with a search query or hidden historical years", async () => {
    fixture = makeWorkerFixture(1, asOf);
    const template = fixture.snapshot.ownEntries[0];
    fixture.snapshot.ownEntries = Array.from({ length: 1_000 }, (_, index) => ({ ...template,
      id: `synthetic-life-${index}`, productKey: "neon" as const,
    }));
    const selected = { ...options, scopeFilter: "own" as const, intelligentPredictionEnabled: true,
      contractNumberQuery: "absent-contract", showPastYears: false };
    const response = await POST(request(await body(selected)));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: "resource_limit", resourceLimit: "output_estimate" });
    expect(response.headers.get("Server-Timing")).not.toMatch(/cashflow_(compute|hash)/);
  });
  it.each(["{", "x".repeat(4097), { kind: "month", monthKey: "../other" }])("rejects malformed/oversized requests before reading data (%s)", async value => {
    expect((await POST(request(value))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([
    { kind: "admin" }, { kind: { toString: "view" } }, { version: "old-version" },
    { asOfMs: -1 }, { asOfMs: 1.5 }, { inputHash: "invalid" }, { timeZone: "x".repeat(101) },
    { kind: "month", monthKey: "2026-13" }, { kind: "month", monthKey: "../other" },
    { options: { ...options, scopeFilter: "admin" } }, { options: { ...options, productFilter: "private" } },
    { options: { ...options, tipsterMode: "false" } }, { options: { ...options, showPastYears: 1 } },
    { options: { ...options, contractNumberQuery: "x".repeat(129) } },
  ])("rejects manipulated request fields before portfolio loading (%j)", async changed => {
    expect((await POST(request({ ...await body(), ...changed }))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["timeZone", "asOfMs"])("rejects incompatible %s", async field => {
    const raw = { ...await body(), ...(field === "timeZone" ? { timeZone: "different/zone" } : { asOfMs: asOf.getTime() - 300001 }) };
    const response = await POST(request(raw));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe(field === "timeZone" ? "time_zone" : "stale_context");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("accepts a different valid IANA timezone with an isolated calculation calendar", async () => {
    const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await POST(request({ ...await body(), timeZone: current === "UTC" ? "Europe/Prague" : "UTC" }));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(mocks.load).toHaveBeenCalledOnce();
  });
  it("rejects the previous calendar day even within the five-minute clock window", async () => {
    const now = new Date(2027, 0, 1, 0, 2);
    vi.setSystemTime(now);
    const response = await POST(request({ ...await body(), asOfMs: now.getTime() - 3 * 60_000 }));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("stale_context");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("rejects a changed client calendar day before reads even if UTC remains on the same date", async () => {
    vi.setSystemTime(new Date("2026-12-31T23:01:00Z"));
    const response = await POST(request({ ...await body(), timeZone: "Europe/Prague", asOfMs: Date.parse("2026-12-31T22:59:00Z") }));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("stale_context");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["+03:00", "../../Europe/Prague", "Europe/Invalid"])("rejects manipulated timezone %s without portfolio reads", async timeZone => {
    const response = await POST(request({ ...await body(), timeZone }));
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("time_zone");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([new Date(2026, 2, 29, 12), new Date(2026, 9, 25, 12), new Date(2028, 1, 29, 12)])(
    "matches the independent original at DST/leap-year boundaries %s", async current => {
      vi.setSystemTime(current);
      const reference = runReference(fixture.snapshot, fixture.statements, options, current);
      const response = await POST(request({ ...await body(), asOfMs: current.getTime() }));
      expect(response.status).toBe(200);
      expect((await response.json()).monthsHash).toBe(await hashCashflowValue(reference.months));
    });
  it("discards results after cancellation", async () => {
    const controller = new AbortController();
    mocks.load.mockImplementation(async () => { controller.abort(); return inputs(); });
    expect((await POST(request(await body(), controller.signal))).status).toBe(409);
  });
  it("does not expose unexpected failures", async () => {
    mocks.load.mockRejectedValue(new Error("sensitive database contents"));
    const response = await POST(request(await body()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive");
  });
});
