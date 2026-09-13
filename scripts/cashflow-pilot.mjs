#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { CASHFLOW_PILOT_SCENARIOS, makeCashflowPilotFixture, pilotSourceDocuments, pilotInputFromDocuments } from "./cashflow-pilot-fixtures.mjs";

export const CASHFLOW_PILOT_PROJECT = "demo-bohemika-cashflow-pilot";
const SOURCE_COLLECTION = "_cashflowPilotSources";
const LOCK_PATH = "_cashflowPilot/lock";
const HELP = `Local synthetic cashflow pilot (never a production or browser benchmark).
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 node scripts/cashflow-pilot.mjs [--samples=5] [--output=/tmp/cashflow-pilot.json]
Uses only isolated project demo-bohemika-cashflow-pilot, no .env or credentials.
Five to twenty samples per synthetic size; prints aggregate JSON only. All pilot
sources, candidates and barriers are cleaned under an exclusive local run lock.
An existing lock is refused; reset this demo emulator project after a crashed run.
`;

export function assertCashflowPilotEnvironment(env) {
  if (env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") {
    throw new Error("Pilot refuses to run without FIRESTORE_EMULATOR_HOST=127.0.0.1:8180.");
  }
}

export function parseCashflowPilotArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { help: true };
  let samples = 5;
  let output = null;
  const seen = new Set();
  for (const arg of args) {
    const match = /^(--samples|--output)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error("Invalid or duplicate pilot argument. Use --help.");
    seen.add(match[1]);
    if (match[1] === "--output") output = match[2];
    else {
      samples = /^\d+$/.test(match[2]) ? Number(match[2]) : NaN;
      if (!Number.isSafeInteger(samples) || samples < 5 || samples > 20) throw new Error("Pilot samples must be 5..20.");
    }
  }
  return { samples, output };
}

export function summarizePilotTimings(values) {
  if (values.length < 5 || values.some(value => !Number.isFinite(value) || value < 0)) throw new Error("Invalid timing samples.");
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return {
    samples: ordered.length,
    medianMs: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2,
    p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
  };
}

async function loadRuntime() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
  const paths = ["app/cashflow/computeCashflow", "app/cashflow/buildCashflowView", "app/cashflow/cashflowSnapshotWire",
    "app/cashflow/shadowProtocol", "lib/server/cashflowShadowBudget", "lib/server/cashflowCandidateStore",
    "lib/server/cashflowCacheState", "lib/server/cashflowMutationTracking"];
  return Object.assign({}, ...await Promise.all(paths.map(file => jiti.import(`../src/${file}.ts`))));
}

const timed = async work => {
  const start = performance.now();
  const value = await work();
  return { value, ms: performance.now() - start };
};

export async function freshCalculation(db, source, asOf, options, runtime) {
  const started = performance.now();
  const captured = await timed(() => runtime.captureCashflowRevision(db));
  assert(captured.value, "Synthetic mutation barrier is still closed.");
  const read = await timed(async () => {
    const documents = await source.orderBy("__name__").get();
    return pilotInputFromDocuments(documents.docs.map(doc => doc.data()));
  });
  const calculation = await timed(() => runtime.computeCashflow(read.value.snapshot, { ...options, asOf }));
  const view = await timed(() => runtime.buildCashflowView(calculation.value, read.value.statements, options, asOf));
  const totalMs = performance.now() - started;
  const result = { items: calculation.value, months: view.value };
  const serialized = await timed(() => runtime.serializeCashflowSnapshot(result));
  return { revision: captured.value, input: read.value, result, payload: serialized.value,
    timing: { revisionReadMs: captured.ms, sourceReadMs: read.ms, computeMs: calculation.ms, viewMs: view.ms,
      sourceAndComputeViewMs: totalMs, serializeMs: serialized.ms } };
}

async function readCalculatedCandidate(db, context, runtime) {
  const candidate = await runtime.readCashflowCandidate(db, { context });
  assert(candidate, "Synthetic candidate unexpectedly unavailable.");
  const result = runtime.parseCashflowSnapshot(candidate.payload);
  assert(result, "Synthetic candidate failed wire validation.");
  return result;
}

export async function publishCalculation(db, context, calculation, runtime) {
  // Never recapture here: that would certify old source data as a new revision.
  const revision = calculation.revision;
  assert(revision, "Synthetic calculation has no source revision.");
  const inputHash = await runtime.hashCashflowValue(calculation.input);
  return timed(async () => assert.equal(await runtime.publishCashflowCandidate(db, {
    context, revision, inputHash, payload: calculation.payload,
  }), true, "Synthetic candidate publication rejected."));
}

async function verifyMutationAndRecovery(db, source, context, before, runtime) {
  const tip = source.doc("tip-0");
  const original = before.input.snapshot.tipPayouts[0];
  const movedDate = new Date(original.payoutDate);
  movedDate.setMonth(movedDate.getMonth() + 1);
  const changed = { amount: original.amount + 13.25, payoutDate: movedDate.getTime() };
  await runtime.withCashflowMutation("pilot:change-amount-and-date", () => runtime.trackCashflowWrite(async () => {
    assert.equal(await runtime.readCashflowCandidate(db, { context }), null);
    return tip.update({ "data.amount": changed.amount, "data.payoutDate": changed.payoutDate });
  }, db));
  assert.equal(await runtime.readCashflowCandidate(db, { context }), null);
  const rebuilt = await freshCalculation(db, source, new Date(context.asOfMs), context.options, runtime);
  const changedTip = rebuilt.result.items.find(item => item.id === `tip-${original.id}`);
  assert.equal(changedTip?.amount, changed.amount);
  assert.equal(changedTip?.date.getTime(), changed.payoutDate);
  await publishCalculation(db, context, rebuilt, runtime);
  const rebuiltHash = await runtime.hashCashflowValue(rebuilt.result);
  assert.equal(await runtime.hashCashflowValue(await readCalculatedCandidate(db, context, runtime)), rebuiltHash);

  // A real first SDK batch commits; the second fails on a nonexistent document.
  let failed = false;
  try {
    await runtime.withCashflowMutation("pilot:failed-two-batch-import", async () => {
      const first = db.batch();
      first.update(tip, { "data.amount": changed.amount + 17 });
      await runtime.trackCashflowWrite(() => first.commit(), db);
      const second = db.batch();
      second.update(source.doc("intentionally-missing"), { absent: true });
      await runtime.trackCashflowWrite(() => second.commit(), db);
    });
  } catch { failed = true; }
  assert(failed, "Synthetic second batch must fail.");
  assert.equal((await tip.get()).data().data.amount, changed.amount + 17);
  assert.equal(await runtime.captureCashflowRevision(db), null);
  assert.equal(await runtime.readCashflowCandidate(db, { context }), null);

  // The writer has settled. Repair its known synthetic partial write first.
  await runtime.withCashflowMutation("pilot:repair", () => runtime.trackCashflowWrite(
    () => tip.update({ "data.amount": changed.amount }), db,
  ));
  assert.equal((await tip.get()).data().data.amount, changed.amount);
  assert.equal(await runtime.readCashflowCandidate(db, { context }), null);
  const control = db.doc(runtime.CASHFLOW_CACHE_STATE_PATH);
  const operations = await control.collection("mutations").where("status", "==", "failed").get();
  assert.equal(operations.size, 1);
  const operation = operations.docs[0];
  const inspected = (await control.get()).data();
  assert.equal(inspected.activeCount, 1);
  await runtime.recoverFailedCashflowMutation(db, { id: operation.id, epoch: operation.data().epoch },
    { epoch: inspected.epoch, revision: inspected.revision });
  assert.equal(await runtime.readCashflowCandidate(db, { context }), null);
  const repaired = await freshCalculation(db, source, new Date(context.asOfMs), context.options, runtime);
  assert.equal(await runtime.hashCashflowValue(repaired.result), rebuiltHash);
  await publishCalculation(db, context, repaired, runtime);
  assert.equal(await runtime.hashCashflowValue(await readCalculatedCandidate(db, context, runtime)), rebuiltHash);
  return { activeWriteBlocked: true, completedWriteInvalidated: true, changedAmountAndDateVerified: true,
    rebuildMatched: true, partialBatchFailureBlocked: true, repairedBeforeRecovery: true, recoveredResultMatched: true };
}

async function scenarioReport(db, scenario, runId, samples, runtime) {
  const asOf = new Date();
  const options = { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
    showPastYears: true, intelligentPredictionEnabled: true, contractNumberQuery: "" };
  const context = { email: "advisor@example.test", uid: `${runId}-${scenario.name}`,
    asOfMs: asOf.getTime(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    version: runtime.CASHFLOW_SHADOW_VERSION, options };
  const input = makeCashflowPilotFixture(scenario, asOf);
  const rows = pilotSourceDocuments(input);
  const source = db.collection(SOURCE_COLLECTION).doc(scenario.name).collection("rows");
  const seed = db.batch();
  for (const row of rows) seed.create(source.doc(row.id), row);
  await runtime.withCashflowMutation("pilot:seed", () => runtime.trackCashflowWrite(() => seed.commit(), db));
  const cold = await freshCalculation(db, source, asOf, options, runtime);
  const expected = await runtime.hashCashflowValue(cold.result);
  const published = await publishCalculation(db, context, cold, runtime);
  const timings = { revisionReadMs: [], sourceReadMs: [], computeMs: [], viewMs: [], sourceAndComputeViewMs: [], serializeMs: [], candidateReadAndParseMs: [] };
  for (let sample = 0; sample < samples; sample++) {
    const fresh = await freshCalculation(db, source, asOf, options, runtime);
    const warm = await timed(() => readCalculatedCandidate(db, context, runtime));
    assert.equal(await runtime.hashCashflowValue(fresh.result), expected, "Fresh calculation drifted.");
    assert.equal(await runtime.hashCashflowValue(warm.value), expected, "Persisted output differs.");
    for (const [key, value] of Object.entries(fresh.timing)) timings[key].push(value);
    timings.candidateReadAndParseMs.push(warm.ms);
  }
  return {
    scenario: scenario.name, asOfMs: asOf.getTime(), contractCount: scenario.contracts,
    ownContracts: input.snapshot.ownEntries.length, teamContracts: input.snapshot.teamEntriesRaw.length,
    tips: input.snapshot.tipPayouts.length, statements: input.statements.length,
    sourceDocuments: rows.length, sourceJsonBytes: Buffer.byteLength(runtime.cashflowCanonicalJson(cold.input)),
    wireBytes: Buffer.byteLength(runtime.cashflowCanonicalJson(cold.payload)),
    items: cold.result.items.length, monthItems: cold.result.months.reduce((total, month) => total + month.items.length, 0),
    months: cold.result.months.length,
    withinCurrentDiagnosticBudget: runtime.isCashflowShadowWithinBudget(input.snapshot, asOf),
    firstCalculationMs: cold.timing, publishMs: published.ms,
    repeated: Object.fromEntries(Object.entries(timings).map(([key, values]) => [key, summarizePilotTimings(values)])),
    verifiedSamples: samples, outputHashMatch: true,
    consistency: await verifyMutationAndRecovery(db, source, context, cold, runtime),
  };
}

export async function runLocalCashflowPilot(options) {
  assertCashflowPilotEnvironment(process.env);
  if (!Number.isSafeInteger(options.samples) || options.samples < 5 || options.samples > 20) throw new Error("Pilot samples must be 5..20.");
  // Named, explicit demo app: never import application firebaseAdmin or ADC credentials.
  const [{ initializeApp, deleteApp }, { getFirestore }, runtime] = await Promise.all([
    import("firebase-admin/app"), import("firebase-admin/firestore"), loadRuntime(),
  ]);
  assertCashflowPilotEnvironment(process.env);
  const runId = randomUUID();
  const app = initializeApp({ projectId: CASHFLOW_PILOT_PROJECT }, `cashflow-pilot-${runId}`);
  const db = getFirestore(app);
  db.settings({ host: "127.0.0.1:8180", ssl: false });
  const previousTracking = process.env.CASHFLOW_CACHE_TRACK_WRITES;
  let locked = false;
  const clean = async () => {
    for (const collection of [SOURCE_COLLECTION, "_cashflowCache", runtime.CASHFLOW_CANDIDATE_COLLECTION, runtime.CASHFLOW_CANDIDATE_CHUNK_COLLECTION]) {
      await db.recursiveDelete(db.collection(collection));
    }
  };
  try {
    await db.doc(LOCK_PATH).create({ runId });
    locked = true;
    await clean();
    process.env.CASHFLOW_CACHE_TRACK_WRITES = "1";
    await runtime.initializeCashflowCacheState(db);
    const scenarios = [];
    for (const scenario of CASHFLOW_PILOT_SCENARIOS) scenarios.push(await scenarioReport(db, scenario, runId, options.samples, runtime));
    return {
      schema: "cashflow-synthetic-pilot-v1", generatedAt: new Date().toISOString(),
      environment: "local-firestore-emulator", project: CASHFLOW_PILOT_PROJECT,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, nodeVersion: process.version,
      scope: "Synthetic source collection read + shared compute/view versus diagnostic candidate read/parse; excludes production loaders, authorization, WAN and browser rendering.",
      measurementNotes: "First calculation runs after seeding in this process; it is not a cold-process measurement. Source-plus-compute/view includes capturing the revision before the source query. Hash comparisons occur outside timed samples. No timing thresholds are asserted.",
      samples: options.samples, scenarios,
    };
  } finally {
    if (previousTracking === undefined) delete process.env.CASHFLOW_CACHE_TRACK_WRITES;
    else process.env.CASHFLOW_CACHE_TRACK_WRITES = previousTracking;
    try {
      if (locked) { await clean(); await db.doc(LOCK_PATH).delete(); }
    } finally { await db.terminate(); await deleteApp(app); }
  }
}

async function main() {
  const options = parseCashflowPilotArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const result = await runLocalCashflowPilot(options);
  const json = JSON.stringify(result, null, 2) + "\n";
  if (options.output) await writeFile(options.output, json, { mode: 0o600 });
  process.stdout.write(json);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error("Local synthetic cashflow pilot failed. Check the exact emulator host, exclusive demo-project lock and run assertions."); process.exitCode = 1; });
}
