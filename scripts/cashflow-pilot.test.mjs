import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  assertCashflowPilotEnvironment, CASHFLOW_PILOT_PROJECT,
  parseCashflowPilotArgs, runLocalCashflowPilot, summarizePilotTimings,
  freshCalculation, publishCalculation,
} from "./cashflow-pilot.mjs";
import { CASHFLOW_PILOT_SCENARIOS, makeCashflowPilotFixture, pilotSourceDocuments, pilotInputFromDocuments } from "./cashflow-pilot-fixtures.mjs";
import { computeCashflow } from "../src/app/cashflow/computeCashflow";
import { buildCashflowView } from "../src/app/cashflow/buildCashflowView";
import { serializeCashflowSnapshot, parseCashflowSnapshot } from "../src/app/cashflow/cashflowSnapshotWire";
import { cashflowCanonicalJson } from "../src/app/cashflow/shadowProtocol";
import { isCashflowShadowWithinBudget } from "../src/lib/server/cashflowShadowBudget";

describe("local synthetic pilot safety", () => {
  it("fixes the isolated demo project and accepts only the exact local emulator endpoint", () => {
    expect(CASHFLOW_PILOT_PROJECT).toBe("demo-bohemika-cashflow-pilot");
    expect(() => assertCashflowPilotEnvironment({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180" })).not.toThrow();
    for (const host of [undefined, "", "localhost:8180", "127.0.0.1:8080", "0.0.0.0:8180", "firestore.googleapis.com", "127.0.0.1:8180 ", "https://127.0.0.1:8180"]) {
      expect(() => assertCashflowPilotEnvironment({ FIRESTORE_EMULATOR_HOST: host })).toThrow("Pilot refuses");
    }
  });
  it("defaults to five samples and stdout without an implicit output file", () => {
    expect(parseCashflowPilotArgs([])).toEqual({ samples: 5, output: null });
    expect(parseCashflowPilotArgs(["--samples=20", "--output=/tmp/result.json"]))
      .toEqual({ samples: 20, output: "/tmp/result.json" });
    expect(parseCashflowPilotArgs(["--help"])).toEqual({ help: true });
  });
  it.each(["--samples", "--samples=4", "--samples=21", "--samples=Infinity", "--samples=5.5", "--samples=1e1", "--samples=true", "--output=", "--project=production"])("rejects unsafe or ambiguous argument %s", arg => {
    expect(() => parseCashflowPilotArgs([arg])).toThrow();
  });
  it("rejects duplicated or positional arguments", () => {
    expect(() => parseCashflowPilotArgs(["--samples=5", "--samples=6"])).toThrow();
    expect(() => parseCashflowPilotArgs(["run"])).toThrow();
  });
  it("blocks execution before database or runtime loading in a non-emulator environment", async () => {
    if (process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8180") return;
    await expect(runLocalCashflowPilot({ samples: 5 })).rejects.toThrow("Pilot refuses");
  });
  it("can show help without loading Jiti, Firebase or environment dependencies", () => {
    const loader = "data:text/javascript," + encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === "@next/env" || specifier === "jiti" || specifier.startsWith("firebase-admin")) {
          throw new Error("Forbidden dependency import");
        }
        return nextResolve(specifier, context);
      }
    `);
    const script = fileURLToPath(new URL("./cashflow-pilot.mjs", import.meta.url));
    const invoke = args => spawnSync(process.execPath, ["--no-warnings", "--experimental-loader", loader, script, ...args], {
      encoding: "utf8", timeout: 5_000, env: { ...process.env, FIRESTORE_EMULATOR_HOST: "" },
    });
    const help = invoke(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("never a production or browser benchmark");
    expect(help.stderr).toBe("");
    const rejected = invoke([]);
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toBe("");
  });
});

describe("synthetic pilot calculations and measurements", () => {
  it("calculates reproducible medians and nearest-rank p95 without changing sample order", () => {
    const input = [5, 1, 4, 2, 3];
    expect(summarizePilotTimings(input)).toEqual({ samples: 5, medianMs: 3, p95Ms: 5 });
    expect(input).toEqual([5, 1, 4, 2, 3]);
    expect(summarizePilotTimings([1, 2, 3, 4, 5, 6])).toEqual({ samples: 6, medianMs: 3.5, p95Ms: 6 });
    expect(summarizePilotTimings(Array.from({ length: 20 }, (_, index) => index + 1)).p95Ms).toBe(19);
    for (const values of [[], [1, 2, 3, 4], [1, 2, 3, 4, NaN], [1, 2, 3, 4, -1]]) {
      expect(() => summarizePilotTimings(values)).toThrow();
    }
  });
  it.each(CASHFLOW_PILOT_SCENARIOS)("fully roundtrips the $name fixture through source documents and computed wire data", scenario => {
    const asOf = new Date(2026, 8, 12, 12);
    const fixture = makeCashflowPilotFixture(scenario, asOf);
    expect(fixture.statements.every(statement => /^\d{4}-\d{2}$/.test(statement.payoutMonthKey))).toBe(true);
    const documents = pilotSourceDocuments(fixture).sort((a, b) => a.id.localeCompare(b.id));
    const restored = pilotInputFromDocuments(JSON.parse(JSON.stringify(documents)));
    expect(cashflowCanonicalJson(restored)).toBe(cashflowCanonicalJson(fixture));
    const options = { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
      showPastYears: true, intelligentPredictionEnabled: true, contractNumberQuery: "" };
    const items = computeCashflow(restored.snapshot, { ...options, asOf });
    const months = buildCashflowView(items, restored.statements, options, asOf);
    const wire = serializeCashflowSnapshot({ items, months });
    expect(cashflowCanonicalJson(parseCashflowSnapshot(JSON.parse(JSON.stringify(wire)))))
      .toBe(cashflowCanonicalJson({ items, months }));
    expect(items.some(item => item.isTipPayout)).toBe(true);
    expect(items.some(item => item.source === "manager")).toBe(true);
    expect(months.some(month => month.totalSource === "paid")).toBe(true);
    expect(items.length).toBeGreaterThan(scenario.contracts);
    expect(items.length).toBeLessThanOrEqual(25_000);
    expect(months.reduce((total, month) => total + month.items.length, 0)).toBeLessThanOrEqual(25_000);
    expect(isCashflowShadowWithinBudget(restored.snapshot, asOf)).toBe(true);
    const emails = JSON.stringify(fixture).match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+/g);
    expect(emails.every(email => email.endsWith("@example.test"))).toBe(true);
  });
  it("rejects incomplete synthetic input instead of silently supplying empty metadata", () => {
    expect(() => pilotInputFromDocuments([])).toThrow("Incomplete");
    expect(() => pilotInputFromDocuments([{ kind: "metadata", data: {} }, { kind: "unknown", data: {} }])).toThrow("Incomplete");
    expect(() => makeCashflowPilotFixture({ name: "large", contracts: 1_000_000 }, new Date())).toThrow();
  });
  it("captures the source revision before reading and cannot publish a stale calculation under a newer revision", async () => {
    const calls = [];
    const db = {};
    const revision = { epoch: "synthetic-epoch", revision: 1 };
    const captureCashflowRevision = vi.fn(async () => { calls.push("revision"); return revision; });
    const query = { get: async () => {
      calls.push("sources");
      return { docs: [{ data: () => ({ kind: "metadata", data: {} }) }] };
    } };
    const source = { orderBy: () => query };
    const runtime = {
      captureCashflowRevision,
      computeCashflow: () => [], buildCashflowView: () => [],
      serializeCashflowSnapshot: result => result,
      hashCashflowValue: async () => "synthetic-hash",
      publishCashflowCandidate: vi.fn(async (_db, options) => options.revision.revision === 2),
    };
    const result = await freshCalculation(db, source, new Date(), {}, runtime);
    expect(calls).toEqual(["revision", "sources"]);
    expect(result.revision).toBe(revision);
    captureCashflowRevision.mockResolvedValue({ ...revision, revision: 2 });
    await expect(publishCalculation(db, {}, result, runtime)).rejects.toThrow("publication rejected");
    expect(captureCashflowRevision).toHaveBeenCalledOnce();
    expect(runtime.publishCashflowCandidate.mock.calls[0][1].revision).toEqual(revision);
  });
});
