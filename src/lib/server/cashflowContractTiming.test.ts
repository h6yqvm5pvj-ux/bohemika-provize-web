import { afterEach, describe, expect, it, vi } from "vitest";
import { measureCashflowContractPhase } from "./cashflowContractTiming";

afterEach(() => vi.restoreAllMocks());

describe("trusted contract timing", () => {
  it("does no clock or observer work when disabled and preserves object identity", async () => {
    const clock = vi.spyOn(performance, "now");
    const result = { ok: true };
    expect(await measureCashflowContractPhase(undefined, "entries", () => result)).toBe(result);
    expect(clock).not.toHaveBeenCalled();
  });

  it("waits for asynchronous work and passes only a fixed phase and elapsed duration", async () => {
    let time = 10;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const observer = vi.fn();
    let done!: (value: object) => void;
    const work = new Promise<object>(resolve => { done = resolve; });
    const result = measureCashflowContractPhase(observer, "entries", () => work);
    expect(observer).not.toHaveBeenCalled();
    const value = { private: "synthetic record" };
    time = 35;
    done(value);
    expect(await result).toBe(value);
    expect(observer.mock.calls).toEqual([["entries", 25]]);
  });

  it.each([false, true])("preserves the original %s asynchronous error even when the observer throws", async asynchronous => {
    const failure = new Error("synthetic denied");
    const observer = vi.fn(() => { throw new Error("observer failed"); });
    await expect(measureCashflowContractPhase(observer, "identity", () => {
      if (asynchronous) return Promise.reject(failure);
      throw failure;
    })).rejects.toBe(failure);
    expect(observer).toHaveBeenCalledOnce();
  });

  it("preserves a successful result when optional diagnostics fail", async () => {
    const result = { ok: true };
    expect(await measureCashflowContractPhase(() => { throw new Error("observer failed"); }, "response", () => result)).toBe(result);
  });
});
