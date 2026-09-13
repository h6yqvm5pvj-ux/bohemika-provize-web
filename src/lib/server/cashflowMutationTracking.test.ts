import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

const mocks = vi.hoisted(() => ({ begin: vi.fn(), complete: vi.fn(), fail: vi.fn() }));
vi.mock("./cashflowCacheState", () => ({
  beginCashflowMutation: mocks.begin, completeCashflowMutation: mocks.complete, failCashflowMutation: mocks.fail,
}));
import { markCashflowMutationIncomplete, trackCashflowWrite, withCashflowMutation } from "./cashflowMutationTracking";

const db = {} as Firestore;
const token = { id: "operation", epoch: "epoch" };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
beforeEach(() => {
  vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "1");
  vi.clearAllMocks();
  mocks.begin.mockResolvedValue(token);
  mocks.complete.mockResolvedValue(undefined);
  mocks.fail.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("logical cashflow mutation tracking", () => {
  it("does no extra work while disabled", async () => {
    vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "");
    expect(await withCashflowMutation("test", () => trackCashflowWrite(async () => 42, db))).toBe(42);
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it("does not invalidate on authorization, validation or dry-run without writes", async () => {
    const response = await withCashflowMutation("validate", async () => new Response(null, { status: 403 }));
    expect(response.status).toBe(403);
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
  });
  it("waits for the durable barrier before invoking any SDK write", async () => {
    const started = deferred<typeof token>();
    mocks.begin.mockReturnValue(started.promise);
    const write = vi.fn(async () => "saved");
    const result = withCashflowMutation("import", () => trackCashflowWrite(write, db));
    await vi.waitFor(() => expect(mocks.begin).toHaveBeenCalledOnce());
    expect(write).not.toHaveBeenCalled();
    started.resolve(token);
    expect(await result).toBe("saved");
    expect(mocks.complete).toHaveBeenCalledWith(db, token);
  });
  it("shares one fence across concurrent batches and nested helpers", async () => {
    await withCashflowMutation("import", async () => {
      await Promise.all([
        trackCashflowWrite(async () => 1, db),
        withCashflowMutation("nested", () => trackCashflowWrite(async () => 2, db)),
      ]);
      expect(mocks.complete).not.toHaveBeenCalled();
      await trackCashflowWrite(async () => 3, db);
    });
    expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(db, "import");
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it("keeps a partial write failure blocked even when the handler returns success", async () => {
    const result = await withCashflowMutation("import", async () => {
      await trackCashflowWrite(async () => 1, db);
      await trackCashflowWrite(async () => { throw new Error("write failed"); }, db).catch(() => undefined);
      return Response.json({ ok: true });
    });
    expect(result.status).toBe(200);
    expect(mocks.fail).toHaveBeenCalledWith(db, token);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("marks non-write partial failures explicitly", async () => {
    await withCashflowMutation("tip-sync", async () => {
      await trackCashflowWrite(async () => 1, db);
      markCashflowMutationIncomplete();
      return "saved-contract";
    });
    expect(mocks.fail).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("keeps a failure marker set before the first write", async () => {
    await withCashflowMutation("delete", async () => {
      markCashflowMutationIncomplete();
      expect(mocks.begin).not.toHaveBeenCalled();
      await trackCashflowWrite(async () => "deleted", db);
    });
    expect(mocks.fail).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("retains a swallowed nested logical failure after a successful SDK write", async () => {
    await withCashflowMutation("import", async () => {
      await withCashflowMutation("derived", async () => {
        await trackCashflowWrite(async () => 1, db);
        throw new Error("derived read failed");
      }).catch(() => undefined);
      return "saved";
    });
    expect(mocks.fail).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("retains an ignored nested error response even if the outer response succeeds", async () => {
    const response = await withCashflowMutation("import", async () => {
      await trackCashflowWrite(async () => 1, db);
      await withCashflowMutation("derived", async () => new Response(null, { status: 503 }));
      return Response.json({ ok: true });
    });
    expect(response.ok).toBe(true);
    expect(mocks.fail).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("leaves the fence blocked after a later exception or error response", async () => {
    await expect(withCashflowMutation("import", async () => {
      await trackCashflowWrite(async () => 1, db);
      throw new Error("parse next part failed");
    })).rejects.toThrow("parse next part failed");
    expect(mocks.fail).toHaveBeenCalledOnce();
    await withCashflowMutation("import", async () => {
      await trackCashflowWrite(async () => 1, db);
      return new Response(null, { status: 500 });
    });
    expect(mocks.fail).toHaveBeenCalledTimes(2);
  });
  it("does not execute a business write if starting the barrier fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.begin.mockRejectedValue(new Error("fence unavailable"));
    const write = vi.fn(async () => 1);
    await expect(withCashflowMutation("save", () => trackCashflowWrite(write, db))).rejects.toThrow("fence unavailable");
    expect(write).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("preserves a successful business result if finalizing metadata fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.complete.mockRejectedValue(new Error("network failure"));
    expect(await withCashflowMutation("save", () => trackCashflowWrite(async () => "saved", db))).toBe("saved");
    expect(console.error).toHaveBeenCalledOnce();
  });
  it("waits for tracked work even if its caller forgot to await it", async () => {
    const write = deferred<number>();
    const result = withCashflowMutation("save", async () => {
      void trackCashflowWrite(() => write.promise, db);
      return "returned";
    });
    await vi.waitFor(() => expect(mocks.begin).toHaveBeenCalledOnce());
    expect(mocks.complete).not.toHaveBeenCalled();
    write.resolve(1);
    expect(await result).toBe("returned");
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it("records rejection of a forgotten SDK promise without an unhandled rejection", async () => {
    const write = deferred<number>();
    const result = withCashflowMutation("save", async () => {
      void trackCashflowWrite(() => write.promise, db);
      return "returned";
    });
    await vi.waitFor(() => expect(mocks.begin).toHaveBeenCalledOnce());
    write.reject(new Error("late SDK failure"));
    expect(await result).toBe("returned");
    expect(mocks.fail).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  it("waits for unawaited nested work delayed before its first SDK write", async () => {
    const read = deferred<void>();
    const write = vi.fn(async () => 1);
    let returned = false;
    const result = withCashflowMutation("import", async () => {
      void withCashflowMutation("derived", async () => {
        await read.promise;
        await trackCashflowWrite(write, db);
      });
      return "saved";
    }).then(value => { returned = true; return value; });
    await Promise.resolve();
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(mocks.begin).not.toHaveBeenCalled();
    read.resolve();
    expect(await result).toBe("saved");
    expect(write).toHaveBeenCalledOnce();
    expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(db, "import");
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it("records a forgotten nested failure after the first write", async () => {
    const read = deferred<void>();
    const result = withCashflowMutation("import", async () => {
      await trackCashflowWrite(async () => 1, db);
      void withCashflowMutation("derived", async () => {
        await read.promise;
        throw new Error("derived failure");
      });
      return "saved";
    });
    await vi.waitFor(() => expect(mocks.begin).toHaveBeenCalledOnce());
    expect(mocks.complete).not.toHaveBeenCalled();
    read.resolve();
    expect(await result).toBe("saved");
    expect(mocks.fail).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  it("opens a new durable barrier for work starting after its inherited context closed", async () => {
    const wake = deferred<void>();
    let delayed!: Promise<number>;
    await withCashflowMutation("first", async () => {
      await trackCashflowWrite(async () => 1, db);
      delayed = wake.promise.then(() => trackCashflowWrite(async () => 2, db));
    });
    expect(mocks.complete).toHaveBeenCalledOnce();
    const newBarrier = deferred<typeof token>();
    mocks.begin.mockReturnValueOnce(newBarrier.promise);
    let written = false;
    void delayed.then(() => { written = true; });
    wake.resolve();
    await vi.waitFor(() => expect(mocks.begin).toHaveBeenCalledTimes(2));
    expect(written).toBe(false);
    expect(mocks.begin.mock.calls[1]).toEqual([db, "standalone-write"]);
    newBarrier.resolve(token);
    expect(await delayed).toBe(2);
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });
  it("does not stop tracking an open operation when the environment flag is disabled", async () => {
    await withCashflowMutation("save", async () => {
      await trackCashflowWrite(async () => 1, db);
      vi.stubEnv("CASHFLOW_CACHE_TRACK_WRITES", "0");
      await withCashflowMutation("derived", () => trackCashflowWrite(async () => {
        throw new Error("write failed after configuration change");
      }, db)).catch(() => undefined);
    });
    expect(mocks.fail).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("separates overlapping logical operations", async () => {
    const firstWrite = deferred<number>();
    const first = withCashflowMutation("first", () => trackCashflowWrite(() => firstWrite.promise, db));
    const second = withCashflowMutation("second", () => trackCashflowWrite(async () => 2, db));
    expect(await second).toBe(2);
    expect(mocks.begin.mock.calls.map(call => call[1])).toEqual(["first", "second"]);
    expect(mocks.complete).toHaveBeenCalledOnce();
    firstWrite.resolve(1);
    await first;
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });
  it("provides a fence for a standalone SDK operation", async () => {
    await trackCashflowWrite(async () => 1, db);
    expect(mocks.begin).toHaveBeenCalledWith(db, "standalone-write");
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it("rejects switching databases within one operation", async () => {
    const other = {} as Firestore;
    const write = vi.fn(async () => 1);
    await expect(withCashflowMutation("save", async () => {
      await trackCashflowWrite(async () => 1, db);
      await trackCashflowWrite(write, other);
    })).rejects.toThrow("span databases");
    expect(write).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledOnce();
  });
  it("rejects a concurrent second database before its business write starts", async () => {
    const started = deferred<typeof token>();
    mocks.begin.mockReturnValueOnce(started.promise);
    const other = {} as Firestore;
    const rejectedWrite = vi.fn(async () => 2);
    const result = withCashflowMutation("save", async () => {
      const writes = Promise.allSettled([
        trackCashflowWrite(async () => 1, db),
        trackCashflowWrite(rejectedWrite, other),
      ]);
      started.resolve(token);
      return writes;
    });
    const results = await result;
    expect(results.map(item => item.status)).toEqual(["fulfilled", "rejected"]);
    expect(rejectedWrite).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledOnce();
  });
});
