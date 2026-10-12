import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCashflowDiagnosticTiming, readCashflowDiagnosticJson } from "./cashflowDiagnosticHttp";
import { parseCashflowServerTiming, type CashflowInputTimingName } from "@/app/cashflow/candidateCheckProtocol";
afterEach(() => vi.restoreAllMocks());

describe("cashflow diagnostic transport", () => {
  it("aggregates source pages separately from overlapping elapsed time without changing JSON", async () => {
    vi.spyOn(performance, "now").mockReturnValue(100);
    const timing = createCashflowDiagnosticTiming();
    timing.recordInput("cashflow_inputs_own_contracts", 12.5);
    timing.recordInput("cashflow_inputs_own_contracts", 7.5);
    timing.recordInput("cashflow_inputs_team_contracts", 10);
    timing.recordInput("cashflow_inputs_statements", 25);
    timing.recordInput("cashflow_inputs_own_contracts_count", 8);
    timing.recordInput("cashflow_inputs_own_contracts_count", 2);
    timing.recordInput("cashflow_inputs_own_contracts_entries", 20);
    const response = timing.json({ ok: false, reason: "unavailable" }, 503);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "unavailable" });
    expect(parseCashflowServerTiming(response.headers.get("Server-Timing"))).toEqual({
      cashflow_inputs_own_contracts: 20, cashflow_inputs_team_contracts: 10,
      cashflow_inputs_statements: 25, cashflow_total: 0,
      cashflow_inputs_own_contracts_count: 10, cashflow_inputs_own_contracts_entries: 20,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("rejects unexpected source names and invalid or excessive numerical aggregates", () => {
    const timing = createCashflowDiagnosticTiming();
    timing.recordInput("private@example.test;desc=secret" as CashflowInputTimingName, 5);
    for (const invalid of [-1, NaN, Infinity, 3_600_001]) timing.recordInput("cashflow_inputs_profile", invalid);
    timing.recordInput("cashflow_inputs_tips", 3_600_000);
    timing.recordInput("cashflow_inputs_tips", 1);
    const header = timing.json({ ok: true }).headers.get("Server-Timing")!;
    expect(header).not.toMatch(/private|secret|profile|NaN|Infinity/);
    expect(parseCashflowServerTiming(header).cashflow_inputs_tips).toBe(3_600_000);
  });
  it("reports monotonic aggregate durations including repeated phases and failures", async () => {
    let time = 100;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const timing = createCashflowDiagnosticTiming();
    await timing.measure("storage", () => { time += 12.5; });
    await expect(timing.measure("storage", () => { time += 7.5; throw new Error("private"); })).rejects.toThrow();
    await timing.measure("auth", async () => { time += 3; });
    const response = timing.json({ ok: true });
    expect(response.headers.get("Server-Timing")).toBe("cashflow_storage;dur=20.00, cashflow_auth;dur=3.00, cashflow_total;dur=23.00");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("enforces the byte limit across multibyte UTF-8 content", async () => {
    const text = JSON.stringify({ value: "ž".repeat(2100) });
    expect(text.length).toBeLessThan(4096);
    expect(await readCashflowDiagnosticJson(new NextRequest("https://example.test", { method: "POST", body: text }))).toBeNull();
  });
  it("accepts a bounded valid request", async () => {
    expect(await readCashflowDiagnosticJson(new NextRequest("https://example.test", { method: "POST", body: '{"version":1}' }))).toEqual({ version: 1 });
  });
});
