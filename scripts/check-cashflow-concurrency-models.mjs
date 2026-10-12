/** Compare actual old/new input loaders and complete cashflow results.
 * Synthetic direct handlers only; no environment files, credentials or network.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert(process.argv[2], "Pass the immutable deployed contract-timing release directory");
const previous = resolve(process.argv[2]);
const candidate = resolve(process.argv[3] || repo);
const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-contract-timing-2026-10-10.json"), "utf8"));
const allowedChanges = new Set(['src/app/api/contracts/_lib/contractsApi.ts', 'src/app/api/contracts/_lib/contractsApi.types.ts', 'src/app/api/contracts/_lib/contractsApi.freshContext.test.ts', 'src/lib/server/cashflowShadowInputs.ts', 'src/lib/server/cashflowShadowInputs.test.ts']);
const hash = value => createHash("sha256").update(value).digest("hex");
for (const file of manifest.files) {
  assert.equal(hash(await readFile(join(previous, file.path))), file.sha256, "Original release integrity failure");
  if (!allowedChanges.has(file.path)) assert.equal(hash(await readFile(join(candidate, file.path))), file.sha256, "Unrelated release source changed");
}
const work = await mkdtemp(join(tmpdir(), "bohemika-cashflow-input-comparison-"));
const oldFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("Network is forbidden in this synthetic comparison"); };
try {
  await symlink(join(repo, "node_modules"), join(work, "node_modules"), "dir");
  const stub = join(work, "handlers.mjs");
  await writeFile(stub, `
let fixture, calls = [];
export const configure = next => { fixture = structuredClone(next); calls = []; };
export const metrics = () => ({ requests: structuredClone(calls), contracts: calls.filter(call => call.path === '/api/contracts/list').length });
export async function GET(request) {
  const url = request.nextUrl;
  calls.push({ path: url.pathname, scope: url.searchParams.get('scope'), limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor') });
  if (request.headers.get('authorization') !== 'Bearer synthetic-token' || url.searchParams.has('targetEmail')) throw new Error('Invalid authenticated fixture request');
  const snapshot = fixture.snapshot;
  if (url.pathname === '/api/user/profile') return Response.json({ ok: true, hasProfile: true, email: snapshot.email, profile: { accountType: 'advisor' } });
  if (url.pathname === '/api/commission-statements') return Response.json({ ok: true, items: fixture.statements, hasMore: false, processingComplete: true });
  if (url.pathname === '/api/tip-payouts/list') return page(snapshot.tipPayouts, url, 'payouts');
  if (url.pathname === '/api/contracts/list') {
    const scope = url.searchParams.get('scope');
    if (fixture.failure === 'team-forbidden' && scope === 'team') return Response.json({ ok: false }, { status: 403 });
    if (fixture.failure === 'later-forbidden' && url.searchParams.has('cursor')) return Response.json({ ok: false }, { status: 403 });
    const source = scope === 'team' ? snapshot.teamEntriesRaw : snapshot.ownEntries;
    const result = await page(source, url, 'contracts', true);
    return result;
  }
  throw new Error('Unexpected input handler');
}
export async function handleContractsList(request, options) {
  if (options?.freshCashflowContext !== true) throw new Error('Every page must have fresh authorization');
  if (request.nextUrl.searchParams.get('scope') === 'my' && !request.nextUrl.searchParams.has('cursor') && fixture.snapshot.hasAnyTeam) {
    options?.onCashflowTeamReady?.(new Set(fixture.snapshot.ownEntries.map(row => (row.adviserEmail ?? row.userEmail).trim().toLowerCase() + '___' + row.id.trim())).size);
  }
  for (const phase of ['identity', 'team_context', 'subscription', 'count', 'entries', 'response']) options?.onCashflowTiming?.(phase, 1);
  return GET(request);
}
function page(source, url, key, contracts = false) {
  const limit = Number(url.searchParams.get('limit'));
  const offset = Number((url.searchParams.get('cursor') || 'offset:0').replace('offset:', ''));
  const next = offset + limit;
  const metadata = contracts ? {
    totalCount: offset ? null : new Set(source.map(row => (row.adviserEmail ?? row.userEmail).trim().toLowerCase() + '___' + row.id.trim())).size,
    position: fixture.snapshot.myPosition, commissionMode: fixture.snapshot.myCommissionMode,
    hasTeam: fixture.snapshot.hasAnyTeam, teamEmails: fixture.snapshot.hasAnyTeam ? ['member@example.test'] : [],
  } : {};
  return Response.json({ ok: true, [key]: source.slice(offset, next), ...metadata,
    hasMore: next < source.length, nextCursorToken: next < source.length ? 'offset:' + next : null });
}
`, { mode: 0o600 });
  const routes = ["user/profile/route", "contracts/_lib/contractsApi", "tip-payouts/list/route",
    "subscription-payments/list/route", "commission-statements/route"];
  const jiti = createJiti(import.meta.url, {
    alias: Object.fromEntries([...routes.map(route => [`@/app/api/${route}`, stub]), ["@", join(candidate, "src")]]),
    moduleCache: true, fsCache: false,
  });
  const handlers = await jiti.import(stub);
  const old = await jiti.import(join(previous, "src/lib/server/cashflowShadowInputs.ts"));
  const next = await jiti.import(join(candidate, "src/lib/server/cashflowShadowInputs.ts"));
  const { NextRequest } = await jiti.import("next/server");
  const { makeWorkerFixture, WORKER_FILTER_CASES } = await jiti.import(join(candidate, "scripts/cashflow-worker/fixtures.ts"));
  const { createCashflowModel } = await jiti.import(join(candidate, "src/app/cashflow/cashflowModel.ts"));
  const { cashflowCanonicalJson } = await jiti.import(join(candidate, "src/app/cashflow/shadowProtocol.ts"));
  const { cashflowCalendarDate } = await jiti.import(join(candidate, "src/lib/server/cashflowCalendar.ts"));
  const canonical = value => hash(cashflowCanonicalJson(value));
  const load = async (implementation, fixture) => {
    handlers.configure(fixture);
    const measurements = [];
    const result = await implementation.loadCashflowShadowInputs(new NextRequest("https://synthetic.example.test/api/cashflow/view?targetEmail=foreign@example.test", {
      method: "POST", headers: { authorization: "Bearer synthetic-token" },
    }), { authorizeEmail: email => email === fixture.snapshot.email, freshCashflowContext: true, onSourceTiming: (name, durationMs) => measurements.push({ name, durationMs }) });
    return { result, measurements, metrics: handlers.metrics() };
  };
  let portfolios = 0, views = 0, oldContractRequests = 0, nextContractRequests = 0;
  let unchangedPaginationWitness;
  for (const zone of ["UTC", "Europe/Prague", "America/New_York"]) {
    const asOf = cashflowCalendarDate(Date.parse("2026-10-09T10:00:00Z"), zone);
    assert(asOf);
    for (const count of [1, 100, 101, 500, 501, 1000, 1502]) {
      for (const duplicates of [false, true]) {
        const fixture = makeWorkerFixture(Math.min(count, 1000), asOf);
        if (count === 1502) {
          fixture.snapshot.ownEntries = Array.from({ length: 1001 }, (_, i) => ({ ...fixture.snapshot.ownEntries[0], id: `own-${i}` }));
          fixture.snapshot.teamEntriesRaw = Array.from({ length: 501 }, (_, i) => ({ ...fixture.snapshot.teamEntriesRaw[0], id: `team-${i}` }));
        }
        if (duplicates) {
          for (const source of [fixture.snapshot.ownEntries, fixture.snapshot.teamEntriesRaw]) {
            if (!source.length) continue;
            source.splice(Math.min(99, source.length), 0, { ...source[0], total: 999999 });
            if (source.length > 500) source.splice(499, 0, { ...source[0], total: 888888 });
          }
        }
        const unchanged = canonical(fixture);
        const original = await load(old, fixture);
        const current = await load(next, fixture);
        assert.equal(canonical(current.result), canonical(original.result), "Input fields, order, owners, deduplication or statements changed");
        assert.equal(canonical(fixture), unchanged, "Synthetic source was mutated");
        assert.equal(current.metrics.contracts, original.metrics.contracts, 'Contract read count changed');
        for (const source of ['profile', 'my', 'team', 'tips', 'subscriptions', 'statements']) {
          const matches = call => source === 'profile' ? call.path === '/api/user/profile' : source === 'tips' ? call.path === '/api/tip-payouts/list' : source === 'subscriptions' ? call.path === '/api/subscription-payments/list' : source === 'statements' ? call.path === '/api/commission-statements' : call.scope === source;
          assert.deepEqual(current.metrics.requests.filter(matches), original.metrics.requests.filter(matches), 'Per-source requests, parameters or cursor order changed');
        }
        assert.equal(current.measurements.filter(item => !/(identity|team_context|subscription|count|entries|response)$/.test(item.name)).length, current.metrics.requests.length, "A started source request was not timed");
        assert.equal(current.measurements.filter(item => /_(own|team)_contracts_(identity|team_context|subscription|count|entries|response)$/.test(item.name)).length, current.metrics.contracts * 6, "Inner contract phase forwarding failed");
        assert(current.measurements.every(item => Number.isFinite(item.durationMs) && item.durationMs >= 0 && /^cashflow_inputs_(profile|(?:own_contracts|team_contracts)(?:_(?:identity|team_context|subscription|count|entries|response))?|tips|statements)$/.test(item.name)), "Invalid/private timing metadata");
        oldContractRequests += original.metrics.contracts;
        nextContractRequests += current.metrics.contracts;
        if (count === 1502 && !duplicates) unchangedPaginationWitness = { ownContracts: 1001, teamContracts: 501,
          oldContractRequests: original.metrics.contracts, nextContractRequests: current.metrics.contracts };
        const originalModel = createCashflowModel({ ...original.result, asOf });
        const currentModel = createCashflowModel({ ...current.result, asOf });
        try {
          for (const { options } of WORKER_FILTER_CASES) {
            const originalView = originalModel.view(options);
            const currentView = currentModel.view(options);
            assert.equal(canonical(currentView), canonical(originalView), "An overview field changed");
            assert.equal(canonical(currentView.months.map(month => currentModel.month(month.key))),
              canonical(originalView.months.map(month => originalModel.month(month.key))), "A month or full commission item changed");
            views++;
          }
        } finally { originalModel.dispose(); currentModel.dispose(); }
        portfolios++;
      }
    }
    console.error(JSON.stringify({ zone, portfolios, views }));
  }
  for (const failure of ["team-forbidden", "later-forbidden"]) {
    const fixture = makeWorkerFixture(1000, new Date(2026, 9, 9));
    fixture.failure = failure;
    for (const implementation of [old, next]) {
      await assert.rejects(load(implementation, fixture), { code: "forbidden", status: 403, message: "Cashflow shadow inputs are unavailable." });
    }
  }
  assert.equal(portfolios, 42);
  assert.equal(views, 378);
  console.log(JSON.stringify({ passed: true, syntheticOnly: true, previousPatchSha256: manifest.codePatch.sha256,
    unchangedReleaseFiles: manifest.files.filter(file => !allowedChanges.has(file.path)).length, portfolios, views, oldContractRequests, nextContractRequests,
    unchangedPaginationWitness, completeInputsEqual: true, allOverviewFieldsAndMonthItemsMatch: true,
    authorizationRevocationRejectedByBoth: true, businessSourcesUnchanged: true, inputsUnmodified: true,
    perSourceRequestsUnchanged: true, crossSourceInterleavingChanged: true, sourceTimingEnabled: true, innerContractTimingForwarded: true, productionSpeedupEstablished: false }));
} finally {
  globalThis.fetch = oldFetch;
  await rm(work, { recursive: true, force: true });
}
