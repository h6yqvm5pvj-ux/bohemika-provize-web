import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCashflowDiagnosticTiming, readCashflowDiagnosticJson } from "./cashflowDiagnosticHttp";
afterEach(() => vi.restoreAllMocks());

describe("cashflow diagnostic transport", () => {
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
