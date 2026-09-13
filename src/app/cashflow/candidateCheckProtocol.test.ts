import { describe, expect, it } from "vitest";
import { parseCashflowCandidateCheckResult, parseCashflowServerTiming, parseCashflowShadowResult } from "./candidateCheckProtocol";

const matched = { ok: true, status: "match", itemsMatch: true, monthsMatch: true };

describe("cashflow diagnostic response protocol", () => {
  it("whitelists comparison outcomes and excludes raw inputs and identity", () => {
    const extra = { email: "private@example.test", amount: 123, inputHash: "secret-hash", data: [{ contract: "private" }] };
    expect(parseCashflowShadowResult({ ...matched, candidate: "verified", ...extra })).toEqual({ ...matched, candidate: "verified" });
    expect(parseCashflowCandidateCheckResult({ ...matched, ...extra })).toEqual(matched);
    expect(parseCashflowCandidateCheckResult({ ok: true, status: "miss", ...extra })).toEqual({ ok: true, status: "miss" });
  });

  it.each([
    null, [], "match", { ...matched, ok: false }, { ...matched, status: "unexpected" },
    { ...matched, status: ["mismatch"], itemsMatch: false },
    { ...matched, itemsMatch: false }, { ...matched, monthsMatch: "true" },
    { ...matched, status: "mismatch" }, { ok: true, status: "match" },
    { ok: true, status: "skipped", reason: "private-details" },
  ])("rejects malformed or contradictory comparisons: %j", value => {
    expect(parseCashflowShadowResult(value)).toBeNull();
    expect(parseCashflowCandidateCheckResult(value)).toBeNull();
  });

  it("accepts genuine mismatches and known skip reasons", () => {
    const mismatch = { ...matched, status: "mismatch", itemsMatch: false };
    expect(parseCashflowCandidateCheckResult(mismatch)).toEqual(mismatch);
    expect(parseCashflowShadowResult({ ...mismatch, candidate: "not_stored" })).toEqual({ ...mismatch, candidate: "not_stored" });
    expect(parseCashflowCandidateCheckResult({ ok: true, status: "skipped", reason: "stale_context" })).toEqual({ ok: true, status: "skipped", reason: "stale_context" });
    expect(parseCashflowShadowResult({ ok: true, status: "skipped", reason: "resource_limit" })).toEqual({ ok: true, status: "skipped", reason: "resource_limit" });
  });

  it.each([
    { ...matched, candidate: "other" },
    { ...matched, candidate: { status: "verified" } },
    { ...matched, status: "mismatch", itemsMatch: false, candidate: "verified" },
    { ok: true, status: "skipped", reason: "different_inputs", candidate: "verified" },
  ])("cannot trigger replay using a bogus stored candidate: %j", value => {
    expect(parseCashflowShadowResult(value)).toBeNull();
  });
});

describe("cashflow Server-Timing aggregates", () => {
  it("retains only finite numerical durations for named metrics", () => {
    expect(parseCashflowServerTiming('cashflow_total;dur=12.5;desc="private text", cashflow_auth;dur=0, cashflow_hash;dur=.25, unrelated;dur=42, cashflow_inputs;desc="private"')).toEqual({
      cashflow_total: 12.5, cashflow_auth: 0, cashflow_hash: 0.25,
    });
  });

  it.each(["NaN", "Infinity", "-1", "1e3", "3600001", '"12"', "private-value"])("discards invalid duration %s", value => {
    expect(parseCashflowServerTiming(`cashflow_total;dur=${value}`)).toEqual({});
  });

  it("discards duplicate metrics/parameters and oversized headers", () => {
    expect(parseCashflowServerTiming("cashflow_total;dur=1, cashflow_total;dur=2, cashflow_total;dur=3, cashflow_auth;dur=1;dur=2")).toEqual({});
    expect(parseCashflowServerTiming("x".repeat(8193))).toEqual({});
    expect(parseCashflowServerTiming(null)).toEqual({});
  });
});
