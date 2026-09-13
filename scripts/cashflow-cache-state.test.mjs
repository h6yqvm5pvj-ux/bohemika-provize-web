import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { parseCashflowCacheArgs, runCashflowCacheAction } from "./cashflow-cache-state.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const epoch = "22222222-2222-4222-8222-222222222222";
const recovery = action => [action, "--apply", `--operation=${id}`, `--epoch=${epoch}`, "--revision=17", "--writer-stopped-and-data-verified"];

function harness({ initialized = true, operations = [] } = {}) {
  const ref = { collection: vi.fn() };
  const query = { where: vi.fn(), limit: vi.fn() };
  ref.collection.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  const tx = { get: vi.fn(), set: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() };
  tx.get.mockImplementation(async target => {
    if (target === ref) return {
      exists: initialized,
      data: () => initialized ? { epoch, revision: 17, activeCount: operations.length, secret: "not-for-output" } : undefined,
    };
    if (target === query) return {
      size: operations.length,
      docs: operations.map(operation => ({ id: operation.id, data: () => operation })),
    };
    throw new Error("Unexpected read");
  });
  const db = {
    doc: vi.fn(() => ref),
    runTransaction: vi.fn(async work => work(tx)),
  };
  const state = {
    CASHFLOW_CACHE_STATE_PATH: "_cashflowCache/control",
    initializeCashflowCacheState: vi.fn(async () => ({ epoch, revision: 0 })),
    failCashflowMutation: vi.fn(async () => undefined),
    recoverFailedCashflowMutation: vi.fn(async () => undefined),
  };
  const candidates = { cleanupExpiredCashflowCandidates: vi.fn(async () => ({ candidates: 2, chunks: 7 })) };
  return { db, state, candidates, ref, query, tx };
}

describe("cashflow cache CLI arguments", () => {
  it("defaults to read-only status and recognizes standalone help", () => {
    expect(parseCashflowCacheArgs([])).toEqual({ action: "status" });
    expect(parseCashflowCacheArgs(["status"])).toEqual({ action: "status" });
    expect(parseCashflowCacheArgs(["--help"])).toEqual({ action: "help" });
    expect(parseCashflowCacheArgs(["-h"])).toEqual({ action: "help" });
  });

  it.each(["init", "cleanup", "fail-active", "recover"])("requires a bare --apply for %s", action => {
    expect(() => parseCashflowCacheArgs([action])).toThrow("require --apply");
    expect(() => parseCashflowCacheArgs([action, "--apply=false"])).toThrow("require --apply");
    expect(() => parseCashflowCacheArgs([action, "--apply=true"])).toThrow("require --apply");
  });

  it("accepts explicit initialization and bounded cleanup sizes", () => {
    expect(parseCashflowCacheArgs(["init", "--apply"])).toEqual({ action: "init" });
    expect(parseCashflowCacheArgs(["cleanup", "--apply"])).toEqual({ action: "cleanup", limit: 100 });
    for (const limit of [1, 200]) {
      expect(parseCashflowCacheArgs(["cleanup", "--apply", `--limit=${limit}`])).toEqual({ action: "cleanup", limit });
    }
  });

  it.each(["--limit", "--limit=", "--limit=0", "--limit=201", "--limit=-1", "--limit=1.5", "--limit=1e2", "--limit=0x64", "--limit= 2", "--limit=Infinity", "--limit=true"])("rejects ambiguous or unbounded cleanup limit %s", limit => {
    expect(() => parseCashflowCacheArgs(["cleanup", "--apply", limit])).toThrow("Cleanup limit");
  });

  it.each(["fail-active", "recover"])("requires exact operation, epoch, revision and operator attestation for %s", action => {
    expect(parseCashflowCacheArgs(recovery(action))).toEqual({
      action, token: { id, epoch }, expected: { epoch, revision: 17 },
    });
    for (const prefix of ["--operation", "--epoch", "--revision", "--writer-stopped-and-data-verified"]) {
      expect(() => parseCashflowCacheArgs(recovery(action).filter(arg => !arg.startsWith(prefix)))).toThrow();
    }
    for (const [prefix, value] of [
      ["--operation", "../../other"], ["--epoch", "all"], ["--revision", "-1"],
      ["--revision", "9007199254740992"], ["--revision", "1e2"], ["--revision", "1.5"],
      ["--writer-stopped-and-data-verified", "true"],
    ]) {
      const args = recovery(action).filter(arg => !arg.startsWith(prefix));
      expect(() => parseCashflowCacheArgs([...args, `${prefix}=${value}`])).toThrow();
    }
  });

  it.each([
    ["delete"], ["status", "--apply"], ["--apply"], ["status", "--epoch=unknown"],
    ["init", "--apply", "--apply"], ["cleanup", "--apply", "--limit=1", "--limit=2"],
    ["init", "--apply", "--operation=unknown"], ["init", "--apply", "extra"],
    ["cleanup", "--apply", "--limit", "100"], ["--help", "--apply"],
  ])("rejects unsupported or duplicate argument list %j", (...args) => {
    expect(() => parseCashflowCacheArgs(args)).toThrow();
  });
});

describe("cashflow cache CLI dispatch", () => {
  it("reads status consistently without invoking any mutation or exposing extra document fields", async () => {
    const operation = { id, epoch, status: "active", reason: "import", startedAtMs: 123, privateData: "not-for-output" };
    const services = harness({ operations: [operation] });
    const result = await runCashflowCacheAction(parseCashflowCacheArgs([]), services);
    expect(result).toEqual({
      initialized: true, epoch, revision: 17, activeCount: 1, possiblyTruncated: false,
      operations: [{ id, epoch, status: "active", reason: "import", startedAtMs: 123 }],
    });
    expect(services.db.doc).toHaveBeenCalledExactlyOnceWith("_cashflowCache/control");
    expect(services.db.runTransaction).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
    expect(services.ref.collection).toHaveBeenCalledExactlyOnceWith("mutations");
    expect(services.query.where).toHaveBeenCalledExactlyOnceWith("status", "in", ["active", "failed"]);
    expect(services.query.limit).toHaveBeenCalledExactlyOnceWith(100);
    expect(services.tx.get).toHaveBeenCalledTimes(2);
    for (const method of ["create", "set", "update", "delete"]) expect(services.tx[method]).not.toHaveBeenCalled();
    expect(services.state.initializeCashflowCacheState).not.toHaveBeenCalled();
    expect(services.state.failCashflowMutation).not.toHaveBeenCalled();
    expect(services.state.recoverFailedCashflowMutation).not.toHaveBeenCalled();
    expect(services.candidates.cleanupExpiredCashflowCandidates).not.toHaveBeenCalled();
  });

  it("reports missing control state without initializing it and flags truncated operation lists", async () => {
    const services = harness({ initialized: false });
    expect(await runCashflowCacheAction({ action: "status" }, services)).toEqual({
      initialized: false, epoch: null, revision: null, activeCount: null, possiblyTruncated: false, operations: [],
    });
    expect(services.state.initializeCashflowCacheState).not.toHaveBeenCalled();
    const many = harness({ operations: Array(100).fill({ id, epoch, status: "failed", reason: "import", startedAtMs: 1 }) });
    expect((await runCashflowCacheAction({ action: "status" }, many)).possiblyTruncated).toBe(true);
  });

  it("delegates initialization only to the existing non-resetting state initializer", async () => {
    const services = harness();
    expect(await runCashflowCacheAction(parseCashflowCacheArgs(["init", "--apply"]), services))
      .toEqual({ epoch, revision: 0 });
    expect(services.state.initializeCashflowCacheState).toHaveBeenCalledExactlyOnceWith(services.db);
    expect(services.db.runTransaction).not.toHaveBeenCalled();
    expect(services.state.recoverFailedCashflowMutation).not.toHaveBeenCalled();
  });

  it("passes the explicit cleanup bound without resetting or recovering barriers", async () => {
    const services = harness();
    expect(await runCashflowCacheAction(parseCashflowCacheArgs(["cleanup", "--apply", "--limit=7"]), services))
      .toEqual({ candidates: 2, chunks: 7 });
    expect(services.candidates.cleanupExpiredCashflowCandidates).toHaveBeenCalledExactlyOnceWith(services.db, { limit: 7 });
    expect(services.state.initializeCashflowCacheState).not.toHaveBeenCalled();
    expect(services.state.failCashflowMutation).not.toHaveBeenCalled();
    expect(services.state.recoverFailedCashflowMutation).not.toHaveBeenCalled();
  });

  it.each(["fail-active", "recover"])("passes exact revision to %s and leaves other operations to the durable state protocol", async action => {
    const services = harness();
    const selected = action === "fail-active" ? services.state.failCashflowMutation : services.state.recoverFailedCashflowMutation;
    const other = action === "fail-active" ? services.state.recoverFailedCashflowMutation : services.state.failCashflowMutation;
    expect(await runCashflowCacheAction(parseCashflowCacheArgs(recovery(action)), services))
      .toEqual({ status: action === "fail-active" ? "failed" : "recovered", operation: id });
    expect(selected).toHaveBeenCalledExactlyOnceWith(services.db, { id, epoch }, { epoch, revision: 17 });
    expect(other).not.toHaveBeenCalled();
    const changedRevision = new Error("revision_changed");
    selected.mockRejectedValueOnce(changedRevision);
    await expect(runCashflowCacheAction(parseCashflowCacheArgs(recovery(action)), services)).rejects.toBe(changedRevision);
    expect(other).not.toHaveBeenCalled();
    expect(services.state.initializeCashflowCacheState).not.toHaveBeenCalled();
  });

  it("does not attempt mutations for an unsupported dispatcher action", async () => {
    const services = harness();
    await expect(runCashflowCacheAction({ action: "delete" }, services)).rejects.toThrow("Unsupported action");
    expect(services.db.doc).not.toHaveBeenCalled();
    expect(services.state.initializeCashflowCacheState).not.toHaveBeenCalled();
    expect(services.state.failCashflowMutation).not.toHaveBeenCalled();
    expect(services.state.recoverFailedCashflowMutation).not.toHaveBeenCalled();
  });
});

describe("cashflow cache CLI startup", () => {
  const script = fileURLToPath(new URL("./cashflow-cache-state.mjs", import.meta.url));
  const blockedDependencies = "data:text/javascript," + encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "@next/env" || specifier === "jiti" || specifier.startsWith("firebase-admin")) {
        throw new Error("Unexpected environment or database dependency import");
      }
      return nextResolve(specifier, context);
    }
  `);
  const invoke = args => spawnSync(process.execPath, ["--no-warnings", "--experimental-loader", blockedDependencies, script, ...args], {
    cwd: tmpdir(), encoding: "utf8", timeout: 5_000,
  });

  it("prints help without loading environment files, Jiti or Firebase", () => {
    const result = invoke(["--help"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("status is read-only");
    expect(result.stderr).toBe("");
  });

  it("rejects invalid mutation arguments before loading environment or database dependencies", () => {
    const result = invoke(["recover", "--apply"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Recovery requires a specific operation UUID");
    expect(result.stderr).not.toContain("Unexpected environment");
    expect(result.stdout).toBe("");
  });
});
