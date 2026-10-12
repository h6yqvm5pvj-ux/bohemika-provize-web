/** Compare complete model results with an immutable deployed source.
 * Synthetic inputs only; no credentials, environment files or network.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert(process.argv[2], "Pass the immutable schedule release directory");
const previous = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-schedule-2026-10-08.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const changed = new Set(["src/app/cashflow/cashflowServerPilot.client.ts", "src/app/cashflow/cashflowServerPilot.client.test.ts", "src/app/cashflow/useCashflowView.ts", "src/app/cashflow/useCashflowView.test.tsx", "src/app/api/cashflow/view/route.test.ts"]);
for (const file of manifest.files) {
  assert.equal(hash(await readFile(join(previous, file.path))), file.sha256, "Original release integrity failure");
  if (!changed.has(file.path)) assert.equal(hash(await readFile(join(repo, file.path))), file.sha256,
    "Unrelated release source changed, including business calculation");
}
const load = async root => {
  const jiti = createJiti(import.meta.url, { alias: { "@": join(root, "src") }, moduleCache: true, fsCache: false });
  // Jiti imports share a dependency graph, so resolve them sequentially.
  const model = await jiti.import(join(root, "src/app/cashflow/cashflowModel.ts"));
  const budget = await jiti.import(join(root, "src/lib/server/cashflowShadowBudget.ts"));
  const calendar = await jiti.import(join(root, "src/lib/server/cashflowCalendar.ts"));
  const protocol = await jiti.import(join(root, "src/app/cashflow/shadowProtocol.ts"));
  const pilot = await jiti.import(join(root, "src/app/cashflow/cashflowServerPilot.client.ts"));
  return { ...model, ...budget, ...calendar, ...protocol, ...pilot };
};
console.error("Loading the immutable original model");
const old = await load(previous);
console.error("Original model loaded");
const next = await load(repo);
console.error("New model loaded");
const fixtureLoader = createJiti(import.meta.url, { alias: { "@": join(repo, "src") }, moduleCache: true, fsCache: false });
const { makeWorkerFixture, WORKER_FILTER_CASES } = await fixtureLoader.import(join(repo, "scripts/cashflow-worker/fixtures.ts"));
let comparisons = 0, newlyAdmitted = 0, accepted = 0, rejected = 0;
for (const zone of ["UTC", "Europe/Prague", "America/New_York"]) {
  for (const instant of ["2026-10-08T14:00:00Z", "2026-03-29T01:30:00Z", "2026-12-31T23:30:00Z"]) {
    console.error(JSON.stringify({ zone, instant, comparisons }));
    for (const count of [12, 200, 300, 1000]) {
      const oldDate = old.cashflowCalendarDate(Date.parse(instant), zone);
      const nextDate = next.cashflowCalendarDate(Date.parse(instant), zone);
      assert(oldDate && nextDate);
      const fixture = makeWorkerFixture(count, nextDate);
      const before = next.cashflowCanonicalJson(fixture);
      const originalModel = old.createCashflowModel({ ...structuredClone(fixture), asOf: oldDate });
      const nextModel = next.createCashflowModel({ ...structuredClone(fixture), asOf: nextDate });
      try {
        for (const { options } of WORKER_FILTER_CASES) {
          const originalView = originalModel.view(options);
          const nextView = nextModel.view(options);
          assert.equal(hash(next.cashflowCanonicalJson(nextView)), hash(old.cashflowCanonicalJson(originalView)), "Overview changed");
          const originalMonths = originalView.months.map(month => originalModel.month(month.key));
          const nextMonths = nextView.months.map(month => nextModel.month(month.key));
          assert.equal(hash(next.cashflowCanonicalJson(nextMonths)), hash(old.cashflowCanonicalJson(originalMonths)),
            "A month, item, amount, payout date or metadata changed");
          const includeReviews = options.intelligentPredictionEnabled && !options.tipsterMode;
          const admitted = next.isCashflowShadowWithinBudget(fixture.snapshot, nextDate, includeReviews);
          assert.equal(admitted, old.isCashflowShadowWithinBudget(fixture.snapshot, oldDate, includeReviews), "Resource budget changed");
          if (admitted) {
            accepted++;
            assert(nextMonths.reduce((sum, month) => sum + month.items.length, 0) <= 25_000,
              "Accepted synthetic output exceeded the unchanged cap");
            if (!old.isCashflowShadowWithinBudget(fixture.snapshot, oldDate, includeReviews)) newlyAdmitted++;
          } else rejected++;
          comparisons++;
        }
        assert.equal(next.cashflowCanonicalJson(fixture), before, "Synthetic input changed");
      } finally { originalModel.dispose(); nextModel.dispose(); }
    }
  }
}
assert.equal(newlyAdmitted, 0);
assert(accepted > 0 && rejected > 0);
// Reproduce the six-minute idle filter transition against both immutable clients.
// The endpoint stub keeps the original five-minute/day check; the route tests
// separately exercise the real handler, authorization and all filter cases.
const originalNow = Date.now;
const originalZone = process.env.TZ;
let renewalComparisons = 0;
try {
  for (const zone of ["UTC", "Europe/Prague", "America/New_York"]) {
    process.env.TZ = zone;
    for (const instant of ["2026-10-08T14:00:00Z", "2026-12-31T23:58:00Z"]) {
      for (const { options } of WORKER_FILTER_CASES) {
        const initial = Date.parse(instant);
        const fixture = makeWorkerFixture(12, new Date(initial));
        const before = next.cashflowCanonicalJson(fixture);
        const exercise = async implementation => {
          let now = initial;
          Date.now = () => now;
          const createLocal = dataset => {
            const model = implementation.createCashflowModel(dataset);
            return { executionPath: "fallback", view: async value => model.view(value),
              month: async key => model.month(key), verification: () => model.verification(), dispose: () => model.dispose() };
          };
          const dataset = { ...structuredClone(fixture), asOf: new Date(initial) };
          let completion;
          const compare = () => new Promise(resolve => { completion = resolve; });
          const client = implementation.createCashflowServerPilotClient({ dataset, local: createLocal(dataset), createLocal,
            getToken: async () => "synthetic-test-token", measure: value => completion(value),
            request: async (_url, init) => {
              const body = JSON.parse(init.body);
              if (!implementation.isCashflowShadowContextCurrent(body.asOfMs, now))
                return Response.json({ ok: false, reason: "stale_context" }, { status: 409 });
              const model = implementation.createCashflowModel({ ...structuredClone(fixture), asOf: new Date(body.asOfMs) });
              try {
                const overview = model.view(body.options);
                return Response.json({ ok: true, version: "cashflow-server-pilot-v1", kind: "view", overview, ...await model.verification() });
              } finally { model.dispose(); }
            } });
          try {
            let done = compare();
            await client.view(WORKER_FILTER_CASES[0].options);
            assert.equal((await done).status, "match");
            now += 6 * 60_000;
            done = compare();
            const overview = await client.view(options);
            const measured = await done;
            const reference = implementation.createCashflowModel({ ...structuredClone(fixture), asOf: new Date(now) });
            try {
              const freshOverview = reference.view(options);
              if (implementation === next) {
                assert.equal(next.cashflowCanonicalJson(overview), next.cashflowCanonicalJson(freshOverview));
                for (const month of freshOverview.months)
                  assert.equal(next.cashflowCanonicalJson(await client.month(month.key)), next.cashflowCanonicalJson(reference.month(month.key)));
              }
            } finally { reference.dispose(); }
            return measured;
          } finally { client.dispose(); }
        };
        const previousResult = await exercise(old);
        assert.equal(previousResult.status, "unavailable");
        assert.equal(previousResult.reason, "stale_context");
        const refreshedResult = await exercise(next);
        assert.equal(refreshedResult.status, "match");
        assert.equal(next.cashflowCanonicalJson(fixture), before);
        renewalComparisons++;
      }
    }
  }
} finally {
  Date.now = originalNow;
  if (originalZone === undefined) delete process.env.TZ; else process.env.TZ = originalZone;
}
console.log(JSON.stringify({ passed: true, syntheticOnly: true, previousPatchSha256: manifest.codePatch.sha256,
  unchangedReleaseFiles: manifest.files.length - changed.size, comparisons, accepted, rejected, newlyAdmitted,
  allOverviewFieldsAndMonthItemsMatch: true, businessSourcesUnchanged: true, outputCap: 25_000, inputsUnmodified: true,
  renewalComparisons, previousClientReproducesStaleContext: true, refreshedClientMatchesFreshReference: true,
  serverFreshnessGuardUnchanged: true }));
