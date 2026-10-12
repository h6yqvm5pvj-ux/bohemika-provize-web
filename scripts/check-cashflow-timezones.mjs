/** Full original/new comparisons on synthetic data in separate native timezone
 * processes. Run with the immutable, pre-timezone pilot source directory.
 * Does not read .env, credentials, databases, production portfolios or network.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const here = fileURLToPath(import.meta.url);
const repo = resolve(dirname(here), "..");
const mode = process.argv[2];
const encode = value => value instanceof Date ? { syntheticDateMs: value.getTime() }
  : Array.isArray(value) ? value.map(encode)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode(child)])) : value;
const decode = value => value && typeof value === "object" && Object.keys(value).length === 1 && "syntheticDateMs" in value
  ? new Date(value.syntheticDateMs) : Array.isArray(value) ? value.map(decode)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child)])) : value;
// Each subprocess owns exactly one source tree. Share its module graph like
// Node/Next do, so per-date calendar metadata belongs to the same module.
const makeJiti = source => createJiti(import.meta.url, { alias: { "@": join(source, "src") }, moduleCache: true, fsCache: false });

if (mode === "reference") {
  const originalRoot = resolve(process.argv[3]);
  const outputPath = process.argv[4];
  const oldJiti = makeJiti(originalRoot);
  const { createCashflowModel } = await oldJiti.import(join(originalRoot, "src/app/cashflow/cashflowModel.ts"));
  const { cashflowCanonicalJson } = await oldJiti.import(join(originalRoot, "src/app/cashflow/shadowProtocol.ts"));
  const { makeWorkerFixture, WORKER_FILTER_CASES } = await oldJiti.import(join(originalRoot, "scripts/cashflow-worker/fixtures.ts"));
  const { SUBSCRIPTION_CASHFLOW_OWNER_EMAIL } = await oldJiti.import(join(originalRoot, "src/app/cashflow/subscriptionCashflow.ts"));
  const hash = value => createHash("sha256").update(cashflowCanonicalJson(value)).digest("hex");
  const cases = [];
  const calendarChecks = [
    [2026, 2, 29, 2, 30], [2026, 9, 25, 2, 30], [2026, 9, 24, 2, 30],
    [2026, 2, 8, 2, 30], [2026, 10, 1, 1, 30], [2026, 9, 1, 1, 30],
    [2028, 1, 29, 12], [2026, 0, 31, 0], [2026, 12, 0, 0], [2026, 1, 31, 1],
  ].map(parts => {
    const initial = new Date(...parts);
    const expected = [initial.toISOString()];
    for (const operation of ["day", "month", "year"]) {
      const next = new Date(initial);
      if (operation === "day") next.setDate(next.getDate() + 1);
      if (operation === "month") next.setMonth(next.getMonth() + 1);
      if (operation === "year") next.setFullYear(next.getFullYear() + 1);
      expected.push(next.toISOString());
    }
    return { parts, expected };
  });
  const instants = ["2026-10-08T14:23:00Z", "2026-12-31T23:30:00Z", "2026-12-01T00:15:00Z",
    "2026-03-29T00:59:59Z", "2026-03-29T01:00:00Z", "2026-10-25T00:59:59Z", "2026-10-25T01:00:00Z", "2028-02-29T12:00:00Z"];
  for (const instant of instants) for (const count of [12, 60]) {
    const asOf = new Date(instant);
    const fixture = makeWorkerFixture(count, asOf);
    // Explicit local date-times, date-only UTC, Czech dates and imported payouts.
    fixture.snapshot.ownEntries[0].policyStartDate = "2026-12-01T00:00:00.125";
    fixture.snapshot.ownEntries[0].contractSignedDate = "8.10.2026";
    const auto = fixture.snapshot.ownEntries.find(entry => entry.productKey === "kooperativaAuto");
    auto.commissionPayouts = [{ key: "synthetic-C", code: "C101", amount: 70, status: "paid",
      writtenBy: auto.userEmail, payoutMonthKey: "2027-1", statementPeriod: "1.1.2027 - 31.1.2027" }];
    fixture.snapshot.ownEntries[2].status = "storno";
    fixture.snapshot.ownEntries[2].stornoDate = new Date(asOf.getFullYear(), asOf.getMonth() + 2, 1);
    const model = createCashflowModel({ ...fixture, asOf });
    try {
      cases.push({ count, instant, data: encode({ ...fixture, asOf }), inputHash: hash(fixture),
        filters: WORKER_FILTER_CASES.map(({ id, options }) => {
          const overview = model.view(options);
          return { id, options, overviewHash: hash(overview),
            monthsHash: hash(overview.months.map(month => model.month(month.key))) };
        }) });
    } finally { model.dispose(); }
  }
  // This calculator intentionally restricts subscription cashflow to its owner.
  // Only that existing constant is reused; every payment/customer is synthetic.
  for (const instant of [instants[0], instants[1]]) {
    const asOf = new Date(instant);
    const snapshot = { email: SUBSCRIPTION_CASHFLOW_OWNER_EMAIL, myPosition: null, myCommissionMode: null,
      hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [], tipPayouts: [],
      subscriptionPayments: [{ id: "synthetic-subscription", userEmail: "subscriber@example.test", userName: "Synthetic",
        plan: "monthly", amountCzk: 100, periodFrom: "2026-01-31", paymentDateMs: Date.parse("2026-01-31T23:30:00Z") }] };
    const fixture = { snapshot, statements: [] };
    const model = createCashflowModel({ ...fixture, asOf });
    try {
      cases.push({ count: 0, instant, data: encode({ ...fixture, asOf }), inputHash: hash(fixture),
        filters: WORKER_FILTER_CASES.map(({ id, options }) => {
          const overview = model.view(options);
          return { id, options, overviewHash: hash(overview), monthsHash: hash(overview.months.map(month => model.month(month.key))) };
        }) });
    } finally { model.dispose(); }
  }
  await writeFile(outputPath, JSON.stringify({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, cases, calendarChecks }), { mode: 0o600 });
} else if (mode === "compare") {
  const inputPath = process.argv[3];
  const jiti = makeJiti(repo);
  const { createCashflowModel } = await jiti.import(join(repo, "src/app/cashflow/cashflowModel.ts"));
  const { cashflowCalendarDate } = await jiti.import(join(repo, "src/lib/server/cashflowCalendar.ts"));
  const { calendarDate } = await jiti.import(join(repo, "src/app/lib/calendarDates.ts"));
  const { cashflowCanonicalJson } = await jiti.import(join(repo, "src/app/cashflow/shadowProtocol.ts"));
  const reference = JSON.parse(await readFile(inputPath, "utf8"));
  const hash = value => createHash("sha256").update(cashflowCanonicalJson(value)).digest("hex");
  const calendar = cashflowCalendarDate(Date.parse("2026-10-08T14:23:00Z"), reference.zone);
  let calendarChecksPassed = 0;
  for (const { parts, expected } of reference.calendarChecks) {
    const initial = calendarDate(calendar, ...parts);
    const actual = [initial.toISOString()];
    for (const operation of ["day", "month", "year"]) {
      const next = calendarDate(initial, initial);
      if (operation === "day") next.setDate(next.getDate() + 1);
      if (operation === "month") next.setMonth(next.getMonth() + 1);
      if (operation === "year") next.setFullYear(next.getFullYear() + 1);
      actual.push(next.toISOString());
    }
    assert.deepEqual(actual, expected, `Calendar/DST mismatch: ${reference.zone}/${parts.join("-")}`);
    calendarChecksPassed += expected.length;
  }
  let compared = 0;
  for (const item of reference.cases) {
    const dataset = decode(item.data);
    const before = hash({ snapshot: dataset.snapshot, statements: dataset.statements });
    assert.equal(before, item.inputHash, "Source data must match the immutable reference");
    dataset.asOf = cashflowCalendarDate(dataset.asOf.getTime(), reference.zone);
    assert(dataset.asOf, "Calendar must be supported");
    const model = createCashflowModel(dataset);
    try {
      for (const filter of item.filters) {
        const overview = model.view(filter.options);
        const context = `${reference.zone}/${item.instant}/${item.count}/${filter.id}`;
        assert.equal(hash(overview), filter.overviewHash, `Overview mismatch: ${context}`);
        assert.equal(hash(overview.months.map(month => model.month(month.key))), filter.monthsHash, `Full month items mismatch: ${context}`);
        const verified = await model.verification();
        assert.equal(verified.inputHash, item.inputHash, `Source verification mismatch: ${context}`);
        assert.equal(verified.monthsHash, filter.monthsHash, `Month verification mismatch: ${context}`);
        compared++;
      }
    } finally { model.dispose(); }
    assert.equal(hash({ snapshot: dataset.snapshot, statements: dataset.statements }), before, "Source objects were mutated");
  }
  console.log(JSON.stringify({ syntheticOnly: true, referenceZone: reference.zone,
    hostZone: Intl.DateTimeFormat().resolvedOptions().timeZone, datasets: reference.cases.length,
    filtersCompared: compared, calendarChecksPassed, fullMonthItemsMatch: true, sourceDataUnchanged: true }));
} else {
  assert(process.argv.length === 3, "Provide the immutable pre-timezone source directory");
  const originalRoot = resolve(mode);
  assert(originalRoot !== repo, "Original/new sources must be separate");
  const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-release-2026-10-08.json"), "utf8"));
  for (const file of manifest.files) {
    const hash = createHash("sha256").update(await readFile(join(originalRoot, file.path))).digest("hex");
    assert.equal(hash, file.sha256, "Original pilot source checksum mismatch");
  }
  const directory = await mkdtemp(join(tmpdir(), "bohemika-cashflow-timezones-"));
  const run = async (args, zone) => {
    const child = spawn(process.execPath, [here, ...args], { env: { PATH: process.env.PATH, TZ: zone }, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    if (code !== 0) throw new Error(stderr || "Synthetic comparison process failed");
    return stdout ? JSON.parse(stdout) : null;
  };
  const results = [];
  try {
    for (const zone of ["Europe/Prague", "UTC", "America/New_York", "Pacific/Kiritimati"]) {
      const file = join(directory, `synthetic-${results.length}.json`);
      await run(["reference", originalRoot, file], zone);
      results.push(await run(["compare", file], "UTC"));
      // The same new code in the native browser zone must remain equivalent too.
      results.push(await run(["compare", file], zone));
    }
    console.log(JSON.stringify({ syntheticOnly: true, immutableReferenceSourcesVerified: manifest.files.length,
      comparisonsPassed: results.reduce((sum, result) => sum + result.filtersCompared, 0), results }));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
