#!/usr/bin/env node

import { createHash } from "node:crypto";

import nextEnv from "@next/env";
import { createJiti } from "jiti";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const jiti = createJiti(import.meta.url);
const { isAllianzAutoHistoricalPeriod } = jiti(
  "../src/app/lib/productFormulas/allianzAuto.ts"
);

const PROCESSED_BY = "jakub.rauscher@bohemika.eu";
const TARGET_STATEMENT_NUMBERS = new Set(["57", "74"]);
const COMMISSION_DIFFERENCE_TOLERANCE = 10;

const hasArg = (name) => process.argv.includes(name);
const APPLY = hasArg("--apply");

const compactHash = (value, length = 24) =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeCode = (value) =>
  String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

const normalizeContractNumber = (value) =>
  String(value ?? "").replace(/\s+/g, "").trim();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(
      trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const toIsoDay = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

const loadCredentials = () => {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    } catch {}
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (projectId && clientEmail && privateKeyRaw) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }
  return null;
};

const isAutoSubsequentCode = (code) => {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  if (/^(?:B30|B70|B03|B36|B42)\d*$/.test(normalized)) return false;
  return /^BC\d+/.test(normalized) || /^B\d+/.test(normalized);
};

const normalizedTitle = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isSubsequentItem = (item) =>
  normalizeCode(item?.code) === "B101" || normalizedTitle(item?.title).includes("nasledna");

const isImmediateItem = (item) =>
  normalizeCode(item?.code) === "A101" ||
  normalizedTitle(item?.title).includes("okamzita") ||
  normalizedTitle(item?.title).includes("ziskatelska");

const amountFromItems = (items, predicate) => {
  if (!Array.isArray(items)) return null;
  const item = items.find(predicate);
  if (!item) return null;
  const amount = Number(item.amount);
  return Number.isFinite(amount) ? roundMoney(amount) : null;
};

const normalizeStatementNumber = (value) =>
  String(value ?? "").trim().replace(/^0+/, "") || String(value ?? "").trim();

const statementIsTarget = (payout) =>
  TARGET_STATEMENT_NUMBERS.has(normalizeStatementNumber(payout?.statementNumber));

const repairDraftRef = (db, payout, contractPath) => {
  const repairId = compactHash(
    `${payout.statementId}:commission-difference:${contractPath}:${payout.key}`,
    32
  );
  return db
    .collection("usersPrivate")
    .doc(PROCESSED_BY)
    .collection("accountingRepairDrafts")
    .doc(repairId);
};

const buildRepairDraft = ({
  existing,
  contract,
  contractPath,
  entryId,
  payout,
  nowMs,
}) => ({
  kind: "commission_difference",
  status: existing?.status ?? "draft",
  ownerEmail: normalizeEmail(contract.userEmail),
  entryId,
  entryPath: contractPath,
  contractNumber: normalizeContractNumber(contract.contractNumber),
  clientName:
    typeof contract.clientName === "string" && contract.clientName.trim()
      ? contract.clientName.trim()
      : null,
  productKey: contract.productKey ?? null,
  statementId: payout.statementId,
  statementNumber: payout.statementNumber ?? null,
  statementPeriod: payout.statementPeriod ?? null,
  statementDate: payout.statementDate ?? null,
  payoutMonthKey: payout.payoutMonthKey ?? null,
  commissionCode: payout.code ?? null,
  paidAmount: payout.amount,
  expectedAmount: payout.expectedAmount,
  difference: payout.difference,
  correctionAmount: roundMoney((payout.expectedAmount ?? 0) - payout.amount),
  createdAtMs: existing?.createdAtMs ?? nowMs,
  createdBy: existing?.createdBy ?? PROCESSED_BY,
  updatedAtMs: nowMs,
  updatedBy: PROCESSED_BY,
});

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const nowMs = Date.now();

  const statementsSnap = await db
    .collection("usersPrivate")
    .doc(PROCESSED_BY)
    .collection("commissionStatements")
    .get();
  const processedStatementIds = new Set(
    statementsSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() ?? {} }))
      .filter(({ data }) => data.processedAtMs != null || data.processedBy != null)
      .filter(({ data }) =>
        TARGET_STATEMENT_NUMBERS.has(normalizeStatementNumber(data.statementNumber))
      )
      .map(({ id }) => id)
  );

  const contractsSnap = await db
    .collectionGroup("entries")
    .where("productKey", "==", "allianzAuto")
    .get();

  const changes = [];
  const batch = db.batch();
  let contractWrites = 0;
  let repairDraftWrites = 0;

  for (const docSnap of contractsSnap.docs) {
    const contract = docSnap.data() ?? {};
    const signedIso = toIsoDay(contract.contractSignedDate);
    if (!isAllianzAutoHistoricalPeriod(signedIso)) continue;

    const payouts = Array.isArray(contract.commissionPayouts)
      ? contract.commissionPayouts
      : [];
    if (payouts.length === 0) continue;

    const expected =
      amountFromItems(contract.items, isSubsequentItem) ??
      amountFromItems(contract.items, isImmediateItem);
    if (expected == null) continue;

    let changed = false;
    const updatedPayouts = [];
    const contractChanges = [];

    for (const payout of payouts) {
      if (
        normalizeEmail(payout?.writtenBy) !== PROCESSED_BY ||
        !statementIsTarget(payout) ||
        (payout?.statementId && !processedStatementIds.has(String(payout.statementId))) ||
        !isAutoSubsequentCode(payout?.code) ||
        payout?.status === "storno"
      ) {
        updatedPayouts.push(payout);
        continue;
      }

      const amount = roundMoney(Math.abs(toNumber(payout.amount)));
      if (amount <= 0) {
        updatedPayouts.push(payout);
        continue;
      }

      const difference = roundMoney(amount - expected);
      const status =
        Math.abs(difference) > COMMISSION_DIFFERENCE_TOLERANCE
          ? "difference"
          : "paid";
      const updated = {
        ...payout,
        amount,
        expectedAmount: expected,
        difference,
        status,
      };

      const payoutChanged =
        payout.expectedAmount !== updated.expectedAmount ||
        payout.difference !== updated.difference ||
        payout.status !== updated.status ||
        payout.amount !== updated.amount;

      updatedPayouts.push(payoutChanged ? updated : payout);

      if (!payoutChanged) continue;
      changed = true;
      contractChanges.push({ before: payout, after: updated });
    }

    if (!changed) continue;

    contractWrites += 1;
    if (APPLY) {
      batch.set(
        docSnap.ref,
        {
          commissionPayouts: updatedPayouts,
          commissionStatementProcessedAtMs: nowMs,
          updatedAt: new Date(nowMs),
        },
        { merge: true }
      );
    }

    for (const change of contractChanges) {
      const contractNumber = normalizeContractNumber(contract.contractNumber);
      changes.push({
        path: docSnap.ref.path,
        contractNumber,
        clientName:
          typeof contract.clientName === "string" && contract.clientName.trim()
            ? contract.clientName.trim()
            : "-",
        signedIso,
        statementNumber: change.after.statementNumber ?? null,
        statementPeriod: change.after.statementPeriod ?? null,
        code: change.after.code ?? null,
        oldExpected: change.before.expectedAmount ?? null,
        newExpected: change.after.expectedAmount,
        oldDifference: change.before.difference ?? null,
        newDifference: change.after.difference,
        oldStatus: change.before.status ?? null,
        newStatus: change.after.status,
      });

      const draftRef = repairDraftRef(db, change.after, docSnap.ref.path);
      const draftSnap = await draftRef.get();
      const existingDraft = draftSnap.exists ? draftSnap.data() ?? {} : null;
      if (change.after.status === "difference") {
        repairDraftWrites += 1;
        if (APPLY) {
          batch.set(
            draftRef,
            buildRepairDraft({
              existing: existingDraft,
              contract,
              contractPath: docSnap.ref.path,
              entryId: docSnap.id,
              payout: change.after,
              nowMs,
            }),
            { merge: true }
          );
        }
      } else if (existingDraft?.kind === "commission_difference") {
        changes.at(-1).staleRepairDraft = draftRef.path;
      }
    }
  }

  changes.sort((a, b) =>
    `${a.statementNumber ?? ""}${a.contractNumber}`.localeCompare(
      `${b.statementNumber ?? ""}${b.contractNumber}`,
      "cs"
    )
  );

  for (const change of changes) {
    console.log(
      `${APPLY ? "UPDATED" : "DRY"} ${change.contractNumber} | ${change.clientName} | statement=${change.statementNumber ?? "-"} ${change.statementPeriod ?? ""} | ${change.code ?? "-"} | expected ${change.oldExpected ?? "-"} -> ${change.newExpected} | diff ${change.oldDifference ?? "-"} -> ${change.newDifference} | status ${change.oldStatus ?? "-"} -> ${change.newStatus}${change.staleRepairDraft ? ` | staleDraft=${change.staleRepairDraft}` : ""}`
    );
  }

  if (APPLY && changes.length > 0) {
    await batch.commit();
  }

  console.log("\nsummary");
  console.log(`mode=${APPLY ? "apply" : "dry-run"}`);
  console.log(`processed_by=${PROCESSED_BY}`);
  console.log(`target_statement_numbers=${[...TARGET_STATEMENT_NUMBERS].join(",")}`);
  console.log(`processed_target_statement_docs=${processedStatementIds.size}`);
  console.log(`payout_rows_changed=${changes.length}`);
  console.log(`contract_writes=${contractWrites}`);
  console.log(`repair_draft_writes=${repairDraftWrites}`);
}

main().catch((error) => {
  console.error("Fix failed:", error?.stack ?? error);
  process.exit(1);
});
