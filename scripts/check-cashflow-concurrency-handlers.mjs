/** Actual old/new contract handlers and trusted concurrent scheduling against synthetic Firestore only.
 * No environment files, credentials, network or business data are accessed.
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
const hash = value => createHash("sha256").update(value).digest("hex");
for (const file of manifest.files) assert.equal(hash(await readFile(join(previous, file.path))), file.sha256, "Original release integrity failure");
const work = await mkdtemp(join(tmpdir(), "bohemika-contract-timing-comparison-"));
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("Network is forbidden in synthetic comparison"); };
try {
  await symlink(join(repo, "node_modules"), join(work, "node_modules"), "dir");
  const stub = join(work, "synthetic.mjs");
  await writeFile(stub, `
import { NextResponse } from 'next/server';
let fixture, calls, pendingCount, pendingEntries;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
export function configure(value) {
  fixture = structuredClone(value); calls = [];
  pendingCount = fixture.holdCount ? deferred() : null;
  pendingEntries = fixture.holdEntries ? deferred() : null;
}
export const trace = () => structuredClone(calls);
export const releaseCount = () => pendingCount?.resolve();
export const releaseEntries = () => pendingEntries?.resolve();
export const adminAuth = null, adminMessaging = null, adminStorage = null;
const snapshot = docs => ({ docs, size: docs.length, empty: !docs.length, forEach: visit => docs.forEach(visit) });
const dateValue = value => value instanceof Date ? value.getTime() : value;
const doc = row => ({ id: row.id, ref: { path: 'users/' + row.owner + '/entries/' + row.id,
  parent: { parent: { id: row.owner } } }, data: () => structuredClone(row.data) });
class Query {
  constructor(owners, state = {}) { this.owners = owners; this.state = state; }
  where(field, operator, value) { return new Query(this.owners, { ...this.state, clauses: [...(this.state.clauses || []), [field, operator, value]] }); }
  orderBy(field, order) { return new Query(this.owners, { ...this.state, order: [...(this.state.order || []), [typeof field === 'string' ? field : '__name__', order]] }); }
  limit(size) { return new Query(this.owners, { ...this.state, limit: size }); }
  startAfter(...values) { return new Query(this.owners, { ...this.state, after: values }); }
  count() { return { get: async () => {
    calls.push({ kind: 'count', owners: this.owners });
    if (pendingCount) await pendingCount.promise;
    return { data: () => ({ count: fixture.rows.filter(row => this.owners.includes(row.owner)).length }) };
  } }; }
  async get() {
    const normalized = { ...this.state, clauses: this.state.clauses?.map(([f, op, v]) => [f, op, dateValue(v)]),
      after: this.state.after?.map(value => value?.ref?.path || dateValue(value)) };
    calls.push({ kind: 'entries', owners: this.owners, query: normalized });
    if (pendingEntries) await pendingEntries.promise;
    if (!this.owners && fixture.groupFailure) throw new Error('synthetic missing index');
    let rows = fixture.rows.filter(row => !this.owners || this.owners.includes(row.owner));
    for (const [field, operator, expected] of this.state.clauses || []) {
      rows = rows.filter(row => {
        const actual = dateValue(row.data[field]), value = dateValue(expected);
        if (operator === 'in') return value.includes(actual);
        if (operator === '==') return actual === value;
        if (operator === '<=') return actual != null && actual <= value;
        if (operator === '>=') return actual != null && actual >= value;
        throw new Error('Unsupported synthetic query');
      });
    }
    const order = this.state.order || [];
    if (order.length) rows = rows.filter(row => order.every(([field]) => field === '__name__' || row.data[field] != null));
    const compare = (a, b) => {
      for (const [field, direction] of order) {
        const va = field === '__name__' ? a.id : dateValue(a.data[field]);
        const vb = field === '__name__' ? b.id : dateValue(b.data[field]);
        if (va !== vb) return (va < vb ? -1 : 1) * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    };
    rows.sort(compare);
    if (this.state.after) {
      const [first, id] = this.state.after;
      if (first?.ref?.path) {
        const index = rows.findIndex(row => doc(row).ref.path === first.ref.path);
        if (index >= 0) rows = rows.slice(index + 1);
      } else {
        rows = rows.filter(row => {
          const value = dateValue(row.data[order[0][0]]), boundary = dateValue(first);
          return value < boundary || (value === boundary && id != null && row.id < id);
        });
      }
    }
    return snapshot(rows.slice(0, this.state.limit ?? rows.length).map(doc));
  }
}
export const adminDb = {
  collection: name => {
    if (name === 'users') return {
      get: async () => {
        calls.push({ kind: 'team_context' });
        if (fixture.treeFailure) throw new Error('synthetic tree unavailable');
        return snapshot(Object.entries(fixture.profiles).map(([id, data]) => ({ id, data: () => structuredClone(data) })));
      },
      doc: owner => ({ collection: nested => {
        if (nested !== 'entries') throw new Error('Unexpected synthetic collection');
        return new Query([owner]);
      } }),
    };
    if (name === 'usersPrivate') return { doc: key => ({ get: async () => {
      calls.push({ kind: 'subscription', key });
      return { exists: true, data: () => ({ subscriptionStatus: fixture.subscription ?? 'active',
        subscriptionPaidUntil: fixture.subscription === 'expired' ? '2000-01-01' : '2099-01-01' }) };
    } }) };
    throw new Error('Unexpected synthetic collection');
  },
  collectionGroup: name => { if (name !== 'entries') throw new Error('Unexpected collection group'); return new Query(null); },
};
export async function requireAuthedRateLimited(request, options) {
  calls.push({ kind: 'identity', options });
  if (request.headers.get('authorization') !== 'Bearer synthetic-token') return { ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) };
  if (fixture.guardStatus) return { ok: false, response: NextResponse.json({ ok: false }, { status: fixture.guardStatus }) };
  return { ok: true, ctx: { email: 'viewer@example.test', uid: 'synthetic-uid', decoded: { email: 'viewer@example.test' },
    isImpersonating: false, actorEmail: 'viewer@example.test', actorUid: 'synthetic-uid', impersonation: null } };
}
export const withRateLimitHeaders = response => response;
`, { mode: 0o600 });
  const jiti = createJiti(import.meta.url, { alias: {
    "@/lib/server/firebaseAdmin": stub, "@/lib/server/apiEntryGuard": stub, "@": join(candidate, "src"),
  }, moduleCache: true, fsCache: false });
  const data = await jiti.import(stub);
  const old = await jiti.import(join(previous, "src/app/api/contracts/_lib/contractsApi.ts"));
  const next = await jiti.import(join(candidate, "src/app/api/contracts/_lib/contractsApi.ts"));
  const { NextRequest } = await jiti.import("next/server");
  const profiles = {
    "viewer@example.test": { position: "manazer4", accountType: "advisor", commissionMode: "standard" },
    "member-a@example.test": { position: "poradce2", accountType: "advisor", managerEmail: "viewer@example.test" },
    "member-b@example.test": { position: "poradce3", accountType: "advisor", managerEmail: "viewer@example.test" },
    "stranger@example.test": { position: "manazer8", accountType: "advisor" },
  };
  const fixture = count => ({ profiles: structuredClone(profiles), rows: Object.keys(profiles).flatMap((owner, ownerIndex) => Array.from({ length: count }, (_, i) => ({
    id: `entry-${String(i).padStart(4, "0")}`, owner, data: {
      userEmail: owner, productKey: i % 2 ? "neon" : "auto", contractNumber: `synthetic-${ownerIndex}-${i}`,
      createdAt: new Date(Date.UTC(2026, 9, 8) - i * 86_400_000),
      ...(i % 3 ? { contractSignedDate: new Date(Date.UTC(2026, 9, 8) - i * 86_400_000) } : {}),
      total: 42, inputAmount: 100, paymentFrequency: "monthly", items: [],
      note: "synthetic private note", clientName: "Synthetic client", clientPhone: "synthetic phone",
    },
  }))) });
  const url = params => `https://synthetic.example.test/api/contracts/list?shape=cashflow&${params}`;
  const request = (params, authenticated = true) => new NextRequest(url(params), { headers: {
    ...(authenticated ? { authorization: "Bearer synthetic-token" } : {}),
    "x-cashflow-timing": "true", "x-cashflow-fresh-context": "true",
  } });
  const run = async (implementation, source, params, measured = false, authenticated = true) => {
    data.configure(source);
    const phases = [], teamHints = [];
    const response = await implementation.handleContractsList(request(params, authenticated), {
      freshCashflowContext: true, onCashflowTeamReady: count => teamHints.push(count),
      ...(measured ? { onCashflowTiming: (phase, durationMs) => phases.push({ phase, durationMs }) } : {}),
    });
    return { status: response.status, body: await response.json(), headers: [...response.headers], trace: data.trace(), phases, teamHints };
  };
  let cases = 0, pages = 0;
  const compare = async (source, params, expectedStatus = 200, authenticated = true) => {
    const original = await run(old, source, params, false, authenticated);
    const measured = await run(next, source, params, true, authenticated);
    const unmeasured = await run(next, source, params, false, authenticated);
    for (const result of [measured, unmeasured]) {
      assert.equal(result.status, expectedStatus);
      assert.deepEqual(result.body, original.body, "Contract fields, counts, cursor or authorization changed");
      assert.deepEqual(result.trace, original.trace, "Database queries, authorization order or owners changed");
      assert.deepEqual(result.headers, original.headers, "Contract API response headers changed");
    }
    assert(measured.phases.every(({ phase, durationMs }) => ["identity", "team_context", "subscription", "count", "entries", "response"].includes(phase) && Number.isFinite(durationMs) && durationMs >= 0));
    assert(!JSON.stringify(measured.phases).includes("example.test"));
    assert.equal(unmeasured.phases.length, 0);
    if (expectedStatus === 200) {
      assert(measured.phases.some(({ phase }) => phase === "entries"));
      assert(measured.phases.some(({ phase }) => phase === "response"));
      const requestedCursor = new URL(url(params)).searchParams.get("cursor");
      // The original handler treats an invalid cursor as a first-page request.
      assert.equal(measured.phases.some(({ phase }) => phase === "count"), !requestedCursor || requestedCursor === "malformed");
      assert(measured.body.contracts.every(row => row.adviserEmail !== "stranger@example.test"));
      assert(!JSON.stringify(measured.body).includes("synthetic private note"));
    } else {
      assert(!measured.trace.some(call => call.kind === "entries" || call.kind === "count"), "A denied request read portfolio data");
      assert(!measured.phases.some(({ phase }) => ["entries", "count", "response"].includes(phase)));
    }
    const parsed = new URL(url(params)).searchParams;
    const eligible = expectedStatus === 200 && parsed.get('scope') === 'my' && parsed.get('includeTeam') !== '1' && measured.body.hasTeam && measured.body.totalCount !== null;
    assert.deepEqual(measured.teamHints, eligible ? [measured.body.totalCount] : [], 'Scheduling hint escaped the fresh first own scope');
    assert.deepEqual(unmeasured.teamHints, measured.teamHints, 'Scheduling depends on telemetry');
    assert.equal(original.teamHints.length, 0);
    cases++;
    return measured.body;
  };
  for (const count of [1, 12, 501]) {
    const source = fixture(count);
    for (const scope of ["my", "team"]) {
      let cursor = null;
      const ids = new Set();
      do {
        const params = `scope=${scope}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const body = await compare(source, params);
        for (const row of body.contracts) {
          const key = `${row.adviserEmail}___${row.id}`;
          assert(!ids.has(key), "Duplicate item across pages");
          ids.add(key);
        }
        cursor = body.hasMore ? body.nextCursorToken : null;
        pages++;
        assert(pages < 30, "Synthetic pagination did not finish");
      } while (cursor);
      assert.equal(ids.size, count * (scope === "team" ? 2 : 1), "Portfolio pagination lost contracts");
    }
    await compare(source, "scope=my&includeTeam=1&limit=10");
    await compare({ ...source, groupFailure: true }, "scope=team&limit=500");
  }
  await compare(fixture(2), "scope=my&ownerEmail=stranger@example.test&role=admin&onCashflowTiming=true&limit=500");
  await compare(fixture(2), "scope=team&subordinates=stranger@example.test&limit=500");
  await compare(fixture(2), "scope=my&cursor=malformed&limit=500");
  await compare(fixture(2), "scope=my", 401, false);
  for (const status of [403, 429]) await compare({ ...fixture(2), guardStatus: status }, "scope=my", status);
  for (const subscription of ["unpaid", "expired"]) await compare({ ...fixture(2), subscription }, "scope=my", 403);
  const removed = fixture(2); delete removed.profiles["viewer@example.test"];
  await compare(removed, "scope=my", 403);
  const tipster = fixture(2); tipster.profiles["viewer@example.test"].accountType = "tipster";
  await compare(tipster, "scope=my", 403);
  const revoked = fixture(2);
  for (const key of ["member-a@example.test", "member-b@example.test"]) revoked.profiles[key].managerEmail = null;
  await compare(revoked, "scope=team", 403);

  // Count and entry reads must overlap, including the includeTeam parallel branch.
  const waitUntil = async predicate => {
    for (let i = 0; i < 1000; i++) { if (predicate()) return; await Promise.resolve(); }
    assert.fail("Expected synthetic read did not start");
  };
  for (const implementation of [old, next]) {
    data.configure({ ...fixture(2), holdCount: true, holdEntries: true });
    let settled = false;
    const phases = [];
    const pending = implementation.handleContractsList(request("scope=my&includeTeam=1&limit=500"), {
      freshCashflowContext: true, onCashflowTiming: (phase, durationMs) => phases.push({ phase, durationMs }),
    }).then(response => { settled = true; return response; });
    await waitUntil(() => data.trace().filter(call => call.kind === "entries").length >= 4);
    assert(data.trace().some(call => call.kind === "count"));
    assert.equal(settled, false);
    data.releaseEntries();
    await waitUntil(() => implementation === old || phases.filter(item => item.phase === "entries").length === 2);
    assert.equal(settled, false);
    data.releaseCount();
    assert.equal((await pending).status, 200);
  }
  let schedulingCases = 0;
  for (const order of ['count-first', 'entries-first', 'abort-before-count']) {
    data.configure({ ...fixture(2), holdCount: true, holdEntries: true });
    const controller = new AbortController();
    const req = new NextRequest(url('scope=my&limit=500'), { headers: { authorization: 'Bearer synthetic-token' }, signal: controller.signal });
    const hints = [];
    let settled = false;
    const pending = next.handleContractsList(req, {
      freshCashflowContext: true, onCashflowTeamReady: count => hints.push(count),
    }).then(response => { settled = true; return response; });
    await waitUntil(() => data.trace().some(call => call.kind === 'entries'));
    assert.equal(hints.length, 0, 'A hint started before the first count completed');
    if (order === 'abort-before-count') controller.abort();
    if (order === 'entries-first') { data.releaseEntries(); await Promise.resolve(); assert.equal(hints.length, 0); }
    data.releaseCount();
    await waitUntil(() => order === 'abort-before-count' || hints.length === 1);
    if (order === 'count-first') assert.equal(settled, false, 'Own entries did not remain pending when team became eligible');
    if (order === 'abort-before-count') assert.equal(hints.length, 0);
    data.releaseEntries();
    assert.equal((await pending).status, 200);
    assert.deepEqual(hints, order === 'abort-before-count' ? [] : [2]);
    schedulingCases++;
  }
  // The callback is server-only, optional and cannot break a successful response.
  data.configure(fixture(2));
  const throwing = await next.handleContractsList(request('scope=my&limit=500'), {
    freshCashflowContext: true, onCashflowTeamReady: () => { throw new Error('synthetic scheduling observer'); },
  });
  assert.equal(throwing.status, 200);
  schedulingCases++;
  for (const params of ['scope=my&limit=500', 'scope=team&limit=500', 'scope=my&includeTeam=1&limit=500', 'scope=my&product=auto&limit=500']) {
    data.configure(fixture(2));
    let hints = 0;
    const response = await next.handleContractsList(request(params), {
      freshCashflowContext: false, onCashflowTeamReady: () => { hints++; },
    });
    assert.equal(response.status, 200); assert.equal(hints, 0, 'Unfenced caller enabled early team scheduling');
    schedulingCases++;
  }
  data.configure(revoked);
  let revokedHints = 0;
  const noTeam = await next.handleContractsList(request('scope=my&onCashflowTeamReady=1&limit=500'), {
    freshCashflowContext: true, onCashflowTeamReady: () => { revokedHints++; },
  });
  assert.equal(noTeam.status, 200); assert.equal(revokedHints, 0, 'A revoked team started a scheduling callback');
  schedulingCases++;
  console.log(JSON.stringify({ passed: true, syntheticOnly: true, previousContractTimingPatchSha256: manifest.codePatch.sha256,
    contractCases: cases, schedulingCases, completePages: pages, actualOldNewHandlersCompared: true,
    allResponseFieldsCountsCursorsAndHeadersEqual: true, databaseQueriesAndAuthorizationOrderEqual: true,
    measuredAndUnmeasuredResultsEqual: true, deniedRequestsReadNoContracts: true,
    foreignOwnerAndPrivilegeManipulationRejected: true, countAndEntriesRemainConcurrent: true,
    inputHeadersCannotEnableDiagnostics: true, trustedFreshSchedulingOnly: true, firstOwnCountBeforeHint: true, ownEntriesOverlapHint: true, productionChanged: false, productionDataRead: false }));
} finally {
  globalThis.fetch = originalFetch;
  await rm(work, { recursive: true, force: true });
}
