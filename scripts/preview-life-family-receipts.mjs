// Read-only database inspection. The only writes are a private local backup and review plan.
// Usage: node scripts/preview-life-family-receipts.mjs <contract-number>
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(`${process.cwd()}/package.json`);
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@": `${process.cwd()}/src` }, fsCache: false });
const contractNumber = process.argv[2];
if (process.argv.length !== 3 || !/^\d{6,32}$/.test(contractNumber ?? "")) throw new Error("Pass one contract number; no mutation options are supported.");
const hash = (value, length = 32) => createHash("sha256").update(value).digest("hex").slice(0, length);
const money = value => {
  const normalized = String(value ?? "").replace(/[\s\u00a0]/g, "").replace(/Kč/g, "").replace(",", ".");
  return normalized && Number.isFinite(Number(normalized)) ? Number(normalized) : null;
};
const rounded = value => Math.round(value * 100) / 100;

async function main() {
  const [{ adminDb }, { matchLifeStatementEntry }, increase, { computeCashflow }] = await Promise.all([
    jiti.import("../src/lib/server/firebaseAdmin.ts"), jiti.import("../src/app/lib/lifeStatementMatching.ts"),
    jiti.import("../src/app/lib/lifePremiumIncrease.ts"), jiti.import("../src/app/cashflow/computeCashflow.ts"),
  ]);
  if (!adminDb) throw new Error("Database is not configured.");
  const matches = await adminDb.collectionGroup("entries").where("contractNumber", "==", contractNumber).limit(21).get();
  if (!matches.docs.length || matches.docs.length > 20) throw new Error("Contract family is missing or exceeds the review bound.");
  const docs = matches.docs;
  const entries = docs.map(doc => ({ ...doc.data(), id: doc.id, userEmail: doc.ref.path.split("/")[1] }));
  const roots = new Set(entries.map(entry => `${entry.userEmail}/${entry.productKey}/${entry.rootContractEntryId || entry.id}`));
  if (roots.size !== 1 || entries.some(entry => entry.productKey !== "neon")) throw new Error("Expected one explicit NEON family and one owner.");
  const references = new Map();
  for (const entry of entries) for (const payout of entry.commissionPayouts ?? []) {
    if (!payout.statementId || !payout.writtenBy) throw new Error("An existing receipt lacks source provenance.");
    if (/[\\/]/.test(payout.statementId) || /[\\/]/.test(payout.writtenBy)) throw new Error("Invalid source reference.");
    const path = `usersPrivate/${payout.writtenBy}/commissionStatements/${payout.statementId}`;
    references.set(path, { ref: adminDb.doc(path), writer: payout.writtenBy, id: payout.statementId });
  }
  const { Window } = require("happy-dom");
  const window = new Window();
  globalThis.DOMParser = window.DOMParser;
  const { extractContractStatementRows } = await jiti.import("../src/lib/contractStatementRows.ts");
  const sources = new Map();
  for (const source of references.values()) {
    const snap = await source.ref.get();
    if (!snap.exists) throw new Error("A referenced statement is missing.");
    const statement = snap.data();
    for (const table of extractContractStatementRows(statement.html ?? "", contractNumber)) {
      for (const row of table.rows) {
        const cells = Object.fromEntries(table.headers.map((header, index) => [header, row.cells[index]]));
        const code = cells.Provize?.toUpperCase();
        const amount = money(cells["Částka"]);
        const base = money(cells["Základna"]);
        if (!code || amount == null || !cells.ID) continue;
        // Require the exact immutable identity used by the import endpoint.
        const kind = table.label === "Meziprovize" ? "manager" : "own";
        const layout = table.label === "Storna" ? "own_storno" : table.label === "Odpočty" ? "own_deduction" : "commission";
        const status = layout !== "commission" || amount < 0 ? "storno" : "paid";
        const rowKey = hash([kind, layout, cells.ID, contractNumber, cells.Produkt, code, base ?? "", amount, status].join(":"), 24);
        const key = hash(`${source.id}:${rowKey}:${contractNumber}:${code}`);
        const target = matchLifeStatementEntry(entries, { commissionCode: code, baseAmount: base,
          validFrom: cells["Počátek"] || null, signedAt: cells["Sjednáno"] || null });
        sources.set(`${source.writer}/${source.id}/${key}`, { targetId: target?.id ?? null, code, amount,
          validFrom: cells["Počátek"] || null, signedAt: cells["Sjednáno"] || null, base });
      }
    }
  }
  const planned = entries.map(entry => ({ ...entry, commissionPayouts: [] }));
  const seen = new Set();
  const changes = [];
  const unresolved = [];
  for (const entry of entries) for (const receipt of entry.commissionPayouts ?? []) {
    const identity = `${receipt.writtenBy}/${receipt.statementId}/${receipt.key}`;
    const source = sources.get(identity);
    if (!source || !source.targetId || source.code !== receipt.code || rounded(source.amount) !== rounded(receipt.amount)) {
      unresolved.push({ entryId: entry.id, receiptKey: receipt.key, reason: "source-or-target-not-unambiguous" });
      continue;
    }
    if (seen.has(identity)) {
      changes.push({ kind: "remove-duplicate-copy", entryId: entry.id, code: receipt.code, statementNumber: receipt.statementNumber });
      continue;
    }
    seen.add(identity);
    const target = planned.find(candidate => candidate.id === source.targetId);
    const next = { ...receipt, sourceValidFrom: source.validFrom, sourceSignedAt: source.signedAt, sourceBaseAmount: source.base };
    if (increase.isLifeIncreaseCode(receipt.code)) {
      const expected = increase.lifeIncreaseExpectedAmount(target.items, [receipt.code]);
      if (expected == null) throw new Error("Missing expected acquisition amount on the matched amendment.");
      next.expectedAmount = expected;
      next.difference = rounded(receipt.amount - expected);
      next.status = Math.abs(next.difference) > 10 ? "difference" : "paid";
      next.differenceReason = next.status === "difference" ? "commission_amount_mismatch" : null;
      next.detail = `${receipt.code}: vyplaceno ${receipt.amount.toFixed(2)} Kč, očekáváno ${expected.toFixed(2)} Kč, rozdíl ${next.difference.toFixed(2)} Kč. Přiřazeno podle počátku dodatku a základny výpisu.`;
    }
    target.commissionPayouts.push(next);
    if (target.id !== entry.id) changes.push({ kind: "assign-source-row", fromEntryId: entry.id, toEntryId: target.id,
      code: receipt.code, amount: receipt.amount, statementNumber: receipt.statementNumber });
  }
  // A preview with an unresolved source must never be mistaken for an applicable repair.
  const ready = unresolved.length === 0;
  const asOf = new Date();
  const compute = values => computeCashflow({ email: entries[0].userEmail, myPosition: entries[0].position,
    myCommissionMode: entries[0].commissionMode, hasAnyTeam: false, ownEntries: values, teamEntriesRaw: [],
    tipPayouts: [], subscriptionPayments: [] }, { scopeFilter: "own", productFilter: "all", asOf });
  const items = ready ? compute(planned) : [];
  const directory = await mkdtemp(join(tmpdir(), "bohemika-life-receipts-"));
  const backup = docs.map(doc => ({ path: doc.ref.path,
    updateTime: doc.updateTime ? { seconds: doc.updateTime.seconds, nanoseconds: doc.updateTime.nanoseconds } : null,
    commissionPayouts: doc.data().commissionPayouts ?? [] }));
  await writeFile(join(directory, "backup.json"), JSON.stringify(backup, null, 2), { mode: 0o600 });
  const plan = { mode: "preview-only", ready, createdAt: asOf.toISOString(), changes, unresolved,
    beforeHash: hash(JSON.stringify(backup), 64),
    entries: planned.map(entry => ({ entryId: entry.id, commissionPayouts: entry.commissionPayouts })) };
  await writeFile(join(directory, "plan.json"), JSON.stringify(plan, null, 2), { mode: 0o600 });
  const format = value => new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const paidTotal = rounded(items.filter(item => item.payoutStatus === "paid").reduce((sum, item) => sum + item.amount, 0));
  const { endorsementCommissionDay } = await jiti.import("../src/app/lib/endorsementCommissionPlan.ts");
  const orderedEntries = [...planned].sort((left, right) =>
    (endorsementCommissionDay(left.policyStartDate) ?? "").localeCompare(endorsementCommissionDay(right.policyStartDate) ?? ""));
  let amendmentIndex = 0;
  const labels = new Map(orderedEntries.map(entry => [entry.id, entry.entryType === "endorsement" ? `Dodatek ${++amendmentIndex}` : "Původní smlouva"]));
  const review = [
    `# Náhled opravy smlouvy ${contractNumber}`, "", "Stav: pouze náhled, databáze nebyla změněna.", "",
    `Ověřeno ${seen.size} unikátních plateb. Nejednoznačné zdroje: ${unresolved.length}.`,
    `Vyplaceno po navržené opravě: ${format(paidTotal)} Kč před stornofondem.`, "",
    "| Část smlouvy | Výpis | Kód | Vyplaceno před stornofondem |", "|---|---|---|---:|",
    ...orderedEntries.flatMap(entry => entry.commissionPayouts.map(receipt =>
      `| ${labels.get(entry.id)} | ${receipt.statementNumber} | ${receipt.code} | ${format(receipt.amount)} Kč |`)),
    "", "Běžné B položky se nepřekládají k dodatku podle podobné částky. Jejich dosavadní rozdíly zůstávají beze změny.",
    "Případné provedení vyžaduje kontrolu aktuálních verzí všech tří dokumentů a atomický zápis.",
    "Původní platební pole a přesné verze dokumentů jsou v backup.json; konkrétní nové vazby v plan.json.", "",
  ].join("\n");
  await writeFile(join(directory, "review.md"), review, { mode: 0o600 });
  console.log(JSON.stringify({ mode: "preview-only", ready, entryCount: entries.length,
    sourceRows: seen.size, changes: changes.length, unresolved: unresolved.length, directory,
    plannedPaidTotalBeforeReserve: paidTotal,
    remainingAcquisition: items.filter(item => item.entryType === "endorsement" && item.payoutStatus !== "paid" &&
      ["A101", "B0301"].includes(item.commissionCode)).map(item => ({ code: item.commissionCode, amount: item.amount })) }, null, 2));
}
main().catch(() => { console.error("Read-only receipt preview failed. No database records were changed."); process.exitCode = 1; });
