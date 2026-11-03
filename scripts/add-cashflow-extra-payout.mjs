#!/usr/bin/env node
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { withCashflowScriptMutation, trackCashflowScriptWrite } from "./cashflow-mutation.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const jiti = createJiti(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname } });
const args = new Map();
let apply = false;
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index];
  if (key === "--apply") { apply = true; continue; }
  if (!["--email", "--month", "--amount", "--title"].includes(key) || args.has(key) || !process.argv[index + 1]) {
    throw new Error("Use --email, --month YYYY-MM, --amount CZK, --title; optionally --apply.");
  }
  args.set(key, process.argv[++index]);
}

async function main() {
  return withCashflowScriptMutation("operator:cashflow-extra-payout", async () => {
    const email = String(args.get("--email") ?? "").trim().toLowerCase();
    if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) throw new Error("invalid-target");
    const { normalizeCashflowExtraPayouts, CASHFLOW_EXTRA_PAYOUTS_MAX } = await jiti.import("../src/app/cashflow/extraPayouts.ts");
    const input = { title: args.get("--title"), amountCzk: Number(args.get("--amount")), payoutMonthKey: args.get("--month"), status: "paid" };
    const candidate = normalizeCashflowExtraPayouts([{ id: "candidate", ...input }])[0];
    if (!candidate) throw new Error("invalid-payout");
    const id = "extra-" + createHash("sha256").update(JSON.stringify([email, candidate.payoutMonthKey, candidate.title, candidate.amountCzk])).digest("hex").slice(0, 32);
    const payout = { ...candidate, id };
    const { adminDb, adminAuth } = await jiti.import("../src/lib/server/firebaseAdmin.ts");
    const { openPrivateValue, sealPrivateValue } = await jiti.import("../src/lib/server/privateEncryption.ts");
    if (!adminDb || !adminAuth) throw new Error("admin-unavailable");
    const user = await adminAuth.getUserByEmail(email);
    if (user.disabled || user.email?.toLowerCase() !== email) throw new Error("target-unavailable");
    const publicProfile = await adminDb.collection("users").doc(email).get();
    if (!publicProfile.exists) throw new Error("target-profile-missing");
    const profileUid = publicProfile.get("userId");
    if (typeof profileUid === "string" && profileUid && profileUid !== user.uid) throw new Error("target-profile-conflict");
    const ref = adminDb.collection("usersPrivate").doc(email);
    const context = `${ref.path}:cashflowExtraPayouts`;
    const readRows = snapshot => {
      const value = openPrivateValue(snapshot.get("cashflowExtraPayouts"), context);
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value) || value.length > CASHFLOW_EXTRA_PAYOUTS_MAX || normalizeCashflowExtraPayouts(value).length !== value.length) {
        throw new Error("existing-payouts-invalid");
      }
      return value;
    };
    const validateExisting = rows => {
      const match = rows.find(row => row.id === id);
      if (match && JSON.stringify(normalizeCashflowExtraPayouts([match])[0]) !== JSON.stringify(payout)) throw new Error("payout-id-conflict");
      if (!match && rows.length >= CASHFLOW_EXTRA_PAYOUTS_MAX) throw new Error("payout-limit");
      return Boolean(match);
    };
    const before = readRows(await ref.get());
    const alreadyRecorded = validateExisting(before);
    const [{ computeCashflow }, { buildCashflowView }] = await Promise.all([
      jiti.import("../src/app/cashflow/computeCashflow.ts"),
      jiti.import("../src/app/cashflow/buildCashflowView.ts"),
    ]);
    const [payoutYear, payoutMonth] = payout.payoutMonthKey.split("-").map(Number);
    const monthKey = `${payoutYear}-${payoutMonth}`;
    const statementSnapshot = await ref.collection("commissionStatements")
      .where("payoutMonthKey", "==", monthKey).limit(100)
      .select("payoutMonthKey", "payoutTotal", "statementNumber", "period", "statementDate", "advisorNumber").get();
    const statements = statementSnapshot.docs.map(doc => ({
      id: doc.id, fileName: "", ...doc.data(),
    }));
    const asOf = new Date();
    const calculationOptions = { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
      showPastYears: true, intelligentPredictionEnabled: false, contractNumberQuery: "" };
    const calculateMonth = rows => {
      const snapshot = { email, myPosition: null, myCommissionMode: null, hasAnyTeam: false,
        ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [],
        extraPayouts: normalizeCashflowExtraPayouts(rows) };
      return buildCashflowView(computeCashflow(snapshot, { ...calculationOptions, asOf }), statements, calculationOptions, asOf)
        .find(month => month.key === monthKey)?.total ?? 0;
    };
    const baselineTotal = calculateMonth(before);
    const plannedDelta = Math.round((calculateMonth(alreadyRecorded ? before : [...before, payout]) - baselineTotal) * 100) / 100;
    if (plannedDelta !== (alreadyRecorded ? 0 : payout.amountCzk)) throw new Error("payout-calculation-failed");
    const summary = { month: payout.payoutMonthKey, title: payout.title, amountCzk: payout.amountCzk, alreadyRecorded };
    if (!apply) {
      console.log(JSON.stringify({ ok: true, mode: "dry-run", targetMatched: true, ...summary, wouldAdd: !alreadyRecorded, verifiedCashflowDeltaCzk: plannedDelta }));
      return;
    }
    const added = await trackCashflowScriptWrite(() => adminDb.runTransaction(async tx => {
      const rows = readRows(await tx.get(ref));
      if (validateExisting(rows)) return false;
      const now = Date.now();
      const next = [...rows, { ...payout, recordedAtMs: now, source: "explicit-user-request" }];
      tx.set(ref, {
        cashflowExtraPayouts: sealPrivateValue(next, context), cashflowExtraPayoutsUpdatedAtMs: now,
      }, { mergeFields: ["cashflowExtraPayouts", "cashflowExtraPayoutsUpdatedAtMs"] });
      return true;
    }), adminDb);
    const after = readRows(await ref.get());
    const normalized = normalizeCashflowExtraPayouts(after);
    if (!validateExisting(after) || after.length !== before.length + (added ? 1 : 0)) throw new Error("payout-verification-failed");
    const beforeMonth = normalizeCashflowExtraPayouts(before).filter(row => row.payoutMonthKey === payout.payoutMonthKey).reduce((sum, row) => sum + row.amountCzk, 0);
    const afterMonth = normalized.filter(row => row.payoutMonthKey === payout.payoutMonthKey).reduce((sum, row) => sum + row.amountCzk, 0);
    const delta = Math.round((afterMonth - beforeMonth) * 100) / 100;
    if (delta !== (added ? payout.amountCzk : 0)) throw new Error("payout-total-verification-failed");
    const verifiedCashflowDelta = Math.round((calculateMonth(after) - baselineTotal) * 100) / 100;
    if (verifiedCashflowDelta !== delta) throw new Error("payout-calculation-failed");
    console.log(JSON.stringify({ ok: true, mode: "applied", ...summary, added, verified: true, extraPayoutMonthDeltaCzk: delta, verifiedCashflowDeltaCzk: verifiedCashflowDelta }));
  });
}

// This process-local setting fences operator writes even if the local web
// rollout is disabled. Dry runs perform no mutation or deployed configuration change.
if (apply) process.env.CASHFLOW_CACHE_TRACK_WRITES = "1";

main().catch(error => {
  const known = new Set(["invalid-target", "invalid-payout", "admin-unavailable", "target-unavailable", "target-profile-missing", "target-profile-conflict", "existing-payouts-invalid", "payout-id-conflict", "payout-limit", "payout-verification-failed", "payout-total-verification-failed", "payout-calculation-failed"]);
  console.error(JSON.stringify({ ok: false, errorCode: known.has(error?.message) ? error.message : "operation-failed" }));
  process.exitCode = 1;
});
