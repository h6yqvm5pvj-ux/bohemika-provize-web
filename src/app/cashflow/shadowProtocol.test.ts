import { describe, expect, it } from "vitest";
import { CASHFLOW_SHADOW_VERSION, cashflowCanonicalJson, hashCashflowValue, isCashflowShadowContextCurrent, parseCashflowShadowRequest } from "./shadowProtocol";

const valid = () => ({
  version: CASHFLOW_SHADOW_VERSION, asOfMs: 1_789_200_000_000, timeZone: "Europe/Prague",
  inputHash: "a".repeat(64), itemsHash: "b".repeat(64), monthsHash: "c".repeat(64),
  options: { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
    showPastYears: false, intelligentPredictionEnabled: false, contractNumberQuery: "" },
});

describe("cashflow shadow protocol", () => {
  it("skips a different calendar day even within the five-minute comparison window", () => {
    const now = new Date(2027, 0, 1, 0, 1).getTime();
    expect(isCashflowShadowContextCurrent(now - 120000, now)).toBe(false);
    expect(isCashflowShadowContextCurrent(now - 30000, now)).toBe(true);
  });
  it("whitelists context and fingerprints, never trusts client identity or portfolio", () => {
    expect(parseCashflowShadowRequest({ ...valid(), email: "someone@example.test", snapshot: { amount: 999 } })).toEqual(valid());
  });
  it.each([
    { scopeFilter: ["own"] }, { scopeFilter: "other" }, { productFilter: "other" },
    { tipsterMode: "false" }, { intelligentPredictionEnabled: 1 }, { showPastYears: null },
    { contractNumberQuery: "a".repeat(129) },
  ])("rejects malformed filter context %j", (options) => {
    expect(parseCashflowShadowRequest({ ...valid(), options: { ...valid().options, ...options } })).toBeNull();
  });
  it.each([
    { version: "old" }, { asOfMs: NaN }, { asOfMs: 0 }, { asOfMs: 1e16 },
    { inputHash: "bad" }, { timeZone: "" }, { monthsHash: "B".repeat(64) },
  ])("rejects invalid comparison metadata %j", (override) => {
    expect(parseCashflowShadowRequest({ ...valid(), ...override })).toBeNull();
  });
  it("hashes the same serialized API inputs identically in either object key order", async () => {
    const left = { b: 2, a: { date: new Date("2026-09-12T12:00:00Z"), missing: undefined, value: 0 } };
    const right = { a: { value: 0, date: "2026-09-12T12:00:00.000Z" }, b: 2 };
    expect(await hashCashflowValue(left)).toBe(await hashCashflowValue(right));
    expect(JSON.parse(cashflowCanonicalJson(left))).toEqual(right);
  });
  it("detects equal totals with changed attribution, duplicate rows or fractional amounts", async () => {
    const first = [{ owner: "one", amount: 1.001 }, { owner: "two", amount: 2 }];
    const fingerprint = await hashCashflowValue(first);
    expect(await hashCashflowValue([{ owner: "one", amount: 2 }, { owner: "two", amount: 1.001 }])).not.toBe(fingerprint);
    expect(await hashCashflowValue([...first, first[0]])).not.toBe(fingerprint);
    expect(await hashCashflowValue([{ ...first[0], amount: 1.002 }, first[1]])).not.toBe(fingerprint);
    expect(await hashCashflowValue(first.toReversed())).not.toBe(fingerprint);
  });
  it.each([NaN, Infinity, -Infinity, new Date(NaN)])("does not mask an invalid value as JSON null", (value) => {
    expect(() => cashflowCanonicalJson({ value })).toThrow();
  });
  it("bounds fingerprint input size", async () => {
    await expect(hashCashflowValue("x".repeat(16 * 1024 * 1024))).rejects.toThrow("too large");
  });
});
