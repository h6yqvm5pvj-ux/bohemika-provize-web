import { describe, expect, it, vi } from "vitest";
import { orderedCashflowReads } from "./contractsApi.cashflowReads";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("ordered cashflow group reads", () => {
  it("overlaps at most two initial reads, without consuming a faster later group first", async () => {
    const groups = Array.from({ length: 4 }, () => deferred<number>());
    const read = vi.fn((index: number) => groups[index].promise);
    const iterator = orderedCashflowReads([0, 1, 2, 3], read, true);
    const first = iterator.next();
    await vi.waitFor(() => expect(read.mock.calls).toEqual([[0], [1]]));
    groups[1].resolve(1);
    groups[0].resolve(0);
    expect((await first).value).toEqual({ ok: true, value: 0 });
    expect(read).toHaveBeenCalledTimes(2);
    expect((await iterator.next()).value).toEqual({ ok: true, value: 1 });
    expect(read.mock.calls).toEqual([[0], [1], [2]]);
    groups[2].resolve(2);
    expect((await iterator.next()).value).toEqual({ ok: true, value: 2 });
    expect(read.mock.calls).toEqual([[0], [1], [2], [3]]);
    groups[3].resolve(3);
    expect((await iterator.next()).value).toEqual({ ok: true, value: 3 });
    expect((await iterator.next()).done).toBe(true);
  });

  it("keeps ordinary reads serial", async () => {
    const firstGroup = deferred<number>();
    const read = vi.fn((index: number) => index === 0 ? firstGroup.promise : Promise.resolve(index));
    const iterator = orderedCashflowReads([0, 1], read, false);
    const pending = iterator.next();
    await vi.waitFor(() => expect(read.mock.calls).toEqual([[0]]));
    firstGroup.resolve(0);
    expect((await pending).value).toEqual({ ok: true, value: 0 });
    expect(read).toHaveBeenCalledTimes(1);
    expect((await iterator.next()).value).toEqual({ ok: true, value: 1 });
    expect((await iterator.next()).done).toBe(true);
  });

  it("observes an early speculative failure and returns the first group failure in order", async () => {
    const groups = [deferred<number>(), deferred<number>()];
    const read = vi.fn((index: number) => groups[index].promise);
    const iterator = orderedCashflowReads([0, 1, 2], read, true);
    const pending = iterator.next();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    const firstError = new Error("first group");
    groups[1].reject(new Error("speculative group"));
    await Promise.resolve();
    groups[0].reject(firstError);
    expect((await pending).value).toEqual({ ok: false, error: firstError });
    expect((await iterator.next()).done).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("drains pending snapshots before an early break completes, without starting another group", async () => {
    const speculative = deferred<number>();
    const read = vi.fn((index: number) => index === 0 ? Promise.resolve(0) : speculative.promise);
    const iterator = orderedCashflowReads([0, 1, 2], read, true);
    expect((await iterator.next()).value).toEqual({ ok: true, value: 0 });
    let drained = false;
    const closing = iterator.return(undefined).then(result => { drained = true; return result; });
    await Promise.resolve();
    expect(drained).toBe(false);
    speculative.resolve(1);
    expect((await closing).done).toBe(true);
    expect(read.mock.calls).toEqual([[0], [1]]);
  });

  it("also drains when snapshot consumption throws", async () => {
    const speculative = deferred<number>();
    const read = vi.fn((index: number) => index === 0 ? Promise.resolve(0) : speculative.promise);
    const failure = new Error("continuation failed");
    const consuming = (async () => {
      for await (const result of orderedCashflowReads([0, 1, 2], read, true)) {
        expect(result).toEqual({ ok: true, value: 0 });
        throw failure;
      }
    })();
    const check = expect(consuming).rejects.toBe(failure);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    speculative.reject(new Error("late speculative failure"));
    await check;
    expect(read.mock.calls).toEqual([[0], [1]]);
  });

  it("handles a synchronous read failure and an empty group list", async () => {
    const failure = new Error("synchronous");
    const read = vi.fn((): Promise<number> => { throw failure; });
    const results = [];
    for await (const result of orderedCashflowReads([0], read, true)) results.push(result);
    expect(results).toEqual([{ ok: false, error: failure }]);
    for await (const result of orderedCashflowReads([], read, true)) results.push(result);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
