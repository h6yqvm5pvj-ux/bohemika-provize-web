/** Compare the unchanged budget decision against an immutable deployed source.
 * Synthetic data only; no environment files, credentials, portfolio or network.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert(process.argv[2], "Pass the immutable background release source directory");
const previous = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-background-2026-10-08.json"), "utf8"));
const budgetPath = "src/lib/server/cashflowShadowBudget.ts";
assert.equal(createHash("sha256").update(await readFile(join(previous, budgetPath))).digest("hex"),
  manifest.files.find(file => file.path === budgetPath).sha256, "The original budget must match the deployed artifact");
// Both versions deliberately share only the unchanged date parser/calendar.
const jiti = createJiti(import.meta.url, { alias: { "@": join(repo, "src") }, moduleCache: true, fsCache: false });
const old = await jiti.import(join(previous, budgetPath));
const next = await jiti.import(join(repo, budgetPath));
const { makeWorkerFixture } = await jiti.import(join(repo, "scripts/cashflow-worker/fixtures.ts"));
const { cashflowCalendarDate } = await jiti.import(join(repo, "src/lib/server/cashflowCalendar.ts"));
const { parseCashflowServerResourceLimit } = await jiti.import(join(repo, "src/app/cashflow/cashflowServerProtocol.ts"));
const mutations = [
  () => {},
  entry => { entry.durationYears = 101; },
  entry => { entry.durationMonths = 1201; },
  entry => { entry.durationYears = Infinity; },
  entry => { entry.policyStartDate = "private-invalid-date"; },
  entry => { entry.policyStartDate = "1899-12-31"; },
  entry => { entry.contractSignedDate = "2000-01-01"; },
  entry => { entry.createdAt = { seconds: Date.parse("2000-01-01") / 1000 }; },
  entry => { entry.items = {}; },
  entry => { entry.items = Array.from({ length: 129 }, () => ({ amount: 1 })); },
  entry => { entry.commissionPayouts = Array.from({ length: 501 }, () => ({})); },
  entry => { entry.commissionPayouts = Array.from({ length: 500 }, () => ({})); },
  entry => { entry.managerChain = Array.from({ length: 21 }, () => ({})); },
  entry => { entry.managerOverrides = [{ items: Array.from({ length: 129 }, () => ({})) }]; },
  entry => { entry.managerOverrides = [null]; },
];
let comparisons = 0, accepted = 0, rejected = 0;
const verify = (snapshot, asOf) => {
  const before = structuredClone(snapshot);
  const original = old.isCashflowShadowWithinBudget(snapshot, asOf);
  const actual = next.isCashflowShadowWithinBudget(snapshot, asOf);
  const failure = next.cashflowShadowBudgetFailure(snapshot, asOf);
  assert.equal(actual, original, "Resource gate decisions changed");
  assert.equal(actual, failure === null);
  if (failure !== null) assert.equal(parseCashflowServerResourceLimit(failure), failure);
  assert.deepEqual(snapshot, before, "The diagnostic modified its input");
  comparisons++;
  if (original) accepted++;
  else rejected++;
};
for (const zone of ["UTC", "Europe/Prague", "America/New_York"]) {
  for (const instant of ["2026-10-08T14:00:00Z", "2026-03-29T01:30:00Z", "2026-12-31T23:30:00Z"]) {
    const asOf = cashflowCalendarDate(Date.parse(instant), zone);
    assert(asOf);
    for (const count of [1, 6, 7, 12, 60, 100, 132, 200, 300, 1000]) {
      for (const mutate of mutations) {
        const { snapshot } = makeWorkerFixture(count, asOf);
        mutate(snapshot.ownEntries[0]); verify(snapshot, asOf);
      }
    }
    for (const count of [206, 207]) {
      const { snapshot } = makeWorkerFixture(1, asOf);
      snapshot.ownEntries = [];
      snapshot.subscriptionPayments = Array.from({ length: count }, () => ({}));
      verify(snapshot, asOf);
    }
    for (const field of ["tipPayouts", "subscriptionPayments"]) {
      for (const value of [{}, { length: "invalid" }]) {
        const { snapshot } = makeWorkerFixture(1, asOf);
        snapshot[field] = value;
        verify(snapshot, asOf);
      }
    }
  }
}
console.log(JSON.stringify({ passed: true, syntheticOnly: true, originalBudgetSha256: manifest.files.find(file => file.path === budgetPath).sha256,
  comparisons, accepted, rejected, budgetDecisionsUnchanged: true, inputsUnmodified: true, fixedCodesOnly: true }));
