/** Synthetic comparisons only. Run from the prepared release: node scripts/check-cashflow-server-pilot.mjs ../base
 * No .env, database, authentication or network. Prints aggregate diagnostics.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert(process.argv.length === 3, "Provide the isolated original source directory.");
const baseline = resolve(process.argv[2]);
assert(baseline !== repo, "Original and new source must be separate.");
const oldJiti = createJiti(import.meta.url, { alias: { "@": join(baseline, "src") }, moduleCache: false, fsCache: false });
const newJiti = createJiti(import.meta.url, { alias: { "@": join(repo, "src") }, moduleCache: false, fsCache: false });
const original = await oldJiti.import(join(baseline, "src/app/cashflow/generator.ts"));
const current = await newJiti.import(join(repo, "src/app/cashflow/generator.ts"));
const { createCashflowModel } = await newJiti.import(join(repo, "src/app/cashflow/cashflowModel.ts"));
const { runReference } = await newJiti.import(join(repo, "scripts/cashflow-worker/reference.ts"));
const { makeWorkerFixture, WORKER_FILTER_CASES } = await newJiti.import(join(repo, "scripts/cashflow-worker/fixtures.ts"));
const { cashflowCanonicalJson } = await newJiti.import(join(repo, "src/app/cashflow/shadowProtocol.ts"));
const { isCashflowShadowWithinBudget } = await newJiti.import(join(repo, "src/lib/server/cashflowShadowBudget.ts"));
const digest = value => createHash("sha256").update(cashflowCanonicalJson(value)).digest("hex");
const domain = await readFile(join(repo, "src/app/types/domain.ts"), "utf8");
const products = [...domain.slice(domain.indexOf("export type Product ="), domain.indexOf(";", domain.indexOf("export type Product ="))).matchAll(/"([^"]+)"/g)].map(match => match[1]);
assert(products.length >= 20, "Missing product cases");
const life = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);
const asOf = new Date(2026, 9, 8, 12);
let compared = 0;
let changedLifeRows = 0;
for (const productKey of products) for (const frequencyRaw of ["monthly", "quarterly", "semiannual", "annual"]) {
  for (const signed of [new Date(2026, 9, 8), new Date(2026, 10, 28), new Date(2026, 11, 8), null]) {
    for (const paid of [false, true]) {
      const entry = { id: "synthetic-contract", userEmail: "advisor@example.test", productKey, frequencyRaw,
        policyStartDate: new Date(2026, 11, 1), contractSignedDate: signed, status: "active", durationYears: 10,
        items: [{ code: "A101", title: "Okamžitá provize", amount: 1000 },
          { code: "B101-B104", title: "Následná provize (2.–5. rok)", amount: 40 },
          { code: "B201-B206", title: "Pečovatelská provize (5.–10. rok)", amount: 20 }],
        ...(paid ? { commissionPayouts: [{ key: "synthetic-paid", code: "A101", status: "paid", amount: 1000, payoutMonthKey: "2027-1" }] } : {}),
      };
      const before = original.generateCashflow([entry], 10, entry.userEmail, asOf);
      const after = current.generateCashflow([entry], 10, entry.userEmail, asOf);
      assert.equal(after.length, before.length, "Unexpected change in payout row count");
      for (let index = 0; index < after.length; index++) {
        const oldRow = before[index], newRow = after[index];
        if (digest(oldRow) === digest(newRow)) continue;
        assert(life.has(productKey) && signed && newRow.commissionCode === "A101", "Unexpected business-rule difference");
        const oldFields = { ...oldRow, id: null, date: null, originalDate: null };
        const newFields = { ...newRow, id: null, date: null, originalDate: null };
        assert.equal(digest(newFields), digest(oldFields), "Changed amount or provenance");
        const expected = new Date(signed.getFullYear(), signed.getMonth() + (signed.getDate() > 25 ? 2 : 1), 25);
        const firstAllowed = new Date(2026, 11, 25);
        const prediction = expected > firstAllowed ? expected : firstAllowed;
        if (paid) {
          assert.equal(newRow.date.getTime(), oldRow.date.getTime(), "Changed a real payout date");
          const shifted = prediction.getFullYear() !== newRow.date.getFullYear() || prediction.getMonth() !== newRow.date.getMonth();
          assert.equal(newRow.originalDate?.getTime() ?? null, shifted ? prediction.getTime() : null, "Incorrect original prediction");
        } else assert.equal(newRow.date.getTime(), prediction.getTime(), "Incorrect first life payout");
        changedLifeRows++;
      }
      compared++;
    }
  }
}
assert(changedLifeRows > 0, "Production baseline was not exercised");
const portfolios = [];
for (const count of [12, 60, 132, 300, 1000]) {
  const fixture = makeWorkerFixture(count, asOf);
  const model = createCashflowModel({ ...fixture, asOf });
  let displayedItems = 0, monthsBytes = 0, fingerprintsAvailable = true;
  try {
    for (const { options } of WORKER_FILTER_CASES) {
      const reference = runReference(fixture.snapshot, fixture.statements, options, asOf);
      const view = model.view(options);
      const months = view.months.map(month => model.month(month.key));
      assert.equal(digest(months), digest(reference.months), "Full original/new month contents differ");
      if (options === WORKER_FILTER_CASES[0].options) {
        displayedItems = months.reduce((count, month) => count + month.items.length, 0);
        monthsBytes = Buffer.byteLength(cashflowCanonicalJson(months));
        try { await model.verification(); } catch { fingerprintsAvailable = false; }
      }
    }
    portfolios.push({ contracts: count, filtersCompared: WORKER_FILTER_CASES.length, monthsMatch: true, displayedItems,
      inputBytes: Buffer.byteLength(cashflowCanonicalJson(fixture)), monthsBytes, fingerprintsAvailable,
      serverBudgetAccepted: isCashflowShadowWithinBudget(fixture.snapshot, asOf) });
  } finally { model.dispose(); }
}
console.log(JSON.stringify({ syntheticOnly: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  productionGeneratorCases: compared, allowedFirstLifeDifferences: changedLifeRows, portfolios }));
