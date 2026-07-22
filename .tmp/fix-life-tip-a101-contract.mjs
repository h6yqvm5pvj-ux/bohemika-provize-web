import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);
const MONEY_TOLERANCE = 0.01;

function loadCredentials() {
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
}

function roundMoney(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function normalizeContractNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCode(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeTitle(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isTotalItem(item) {
  return normalizeCode(item?.code) === "TOTAL" || normalizeTitle(item?.title).includes("celkem");
}

function isA101Item(item) {
  const code = normalizeCode(item?.code);
  return code === "A101" || code === "A102" || normalizeTitle(item?.title).includes("provize a101");
}

function isImmediateNonA101LifeSplitItem(item) {
  const code = normalizeCode(item?.code);
  const title = normalizeTitle(item?.title);
  return (
    code === "B0301" ||
    code === "B3601_HALF" ||
    code === "B36_HALF" ||
    title.includes("provize b0301") ||
    title.includes("50% z b3601") ||
    title.includes("50% z b36")
  );
}

function sumItems(items, predicate) {
  return roundMoney(
    items.reduce((sum, item) => sum + (predicate(item) ? Number(item?.amount ?? 0) : 0), 0)
  );
}

function asItems(data) {
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.result?.items)) return data.result.items;
  return [];
}

function computeLifeTipA101Correction(data) {
  const productKey = String(data?.productKey ?? "");
  const items = asItems(data);
  const tipsterPercent = Number(data?.tipContractTipsterPercent);
  const storedTipAmount = Number(data?.tipContractTipsterAmountFirstYear);
  const storedGrossBase = Number(data?.tipContractImmediateFirstYearGross);
  const storedTotal = Number(data?.total ?? data?.result?.total);

  if (!LIFE_PRODUCTS.has(productKey)) {
    return { ok: false, reason: `Product ${productKey || "(empty)"} is not a life product.` };
  }
  if (!items.some(isA101Item)) {
    return { ok: false, reason: "Contract has no explicit A101 item." };
  }
  if (
    !Number.isFinite(tipsterPercent) ||
    tipsterPercent <= 0 ||
    tipsterPercent >= 100
  ) {
    return {
      ok: false,
      reason: "This script can safely recover adjusted split rows only for tip percent > 0 and < 100.",
    };
  }
  if (!Number.isFinite(storedTipAmount) || !Number.isFinite(storedTotal)) {
    return { ok: false, reason: "Missing stored tip amount or total." };
  }

  const ratio = 1 - tipsterPercent / 100;
  const currentA101Net = sumItems(items, isA101Item);
  const originalA101Gross = roundMoney(currentA101Net / ratio);
  const correctTipAmount = roundMoney(originalA101Gross * (tipsterPercent / 100));
  const correctNetBase = roundMoney(originalA101Gross - correctTipAmount);

  const needsCorrection =
    Math.abs(storedTipAmount - correctTipAmount) > MONEY_TOLERANCE ||
    (Number.isFinite(storedGrossBase) &&
      storedGrossBase - originalA101Gross > MONEY_TOLERANCE);

  if (!needsCorrection) {
    return {
      ok: true,
      changed: false,
      reason: "Already matches A101-only tip basis.",
      items,
      currentA101Net,
      originalA101Gross,
      correctTipAmount,
      correctNetBase,
      newTotal: storedTotal,
    };
  }

  const correctedItems = items.map((item) => {
    if (!item || typeof item !== "object" || isTotalItem(item) || isA101Item(item)) {
      return item;
    }
    if (!isImmediateNonA101LifeSplitItem(item)) return item;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) return item;
    return {
      ...item,
      amount: roundMoney(amount / ratio),
    };
  });

  const newTotal = roundMoney(storedTotal + storedTipAmount - correctTipAmount);

  return {
    ok: true,
    changed: true,
    items,
    correctedItems,
    currentA101Net,
    originalA101Gross,
    correctTipAmount,
    correctNetBase,
    oldTipAmount: storedTipAmount,
    oldGrossBase: Number.isFinite(storedGrossBase) ? storedGrossBase : null,
    oldTotal: storedTotal,
    newTotal,
    adviserIncrease: roundMoney(newTotal - storedTotal),
  };
}

async function findContracts(db, contractNumber) {
  const normalized = normalizeContractNumber(contractNumber);
  try {
    const snap = await db
      .collectionGroup("entries")
      .where("contractNumber", "==", normalized)
      .get();
    return snap.docs;
  } catch (err) {
    const message = String(err?.message ?? err);
    if (!message.includes("requires a") && !message.includes("FAILED_PRECONDITION")) {
      throw err;
    }
    const snap = await db.collectionGroup("entries").get();
    return snap.docs.filter(
      (docSnap) => normalizeContractNumber(docSnap.data()?.contractNumber) === normalized
    );
  }
}

async function findAllEntryDocs(db) {
  const snap = await db.collectionGroup("entries").get();
  return snap.docs;
}

function payoutDistribution(total, count) {
  const safeCount = Math.max(1, count);
  const amounts = [];
  let allocated = 0;
  for (let index = 0; index < safeCount; index += 1) {
    const amount =
      index === safeCount - 1
        ? roundMoney(total - allocated)
        : roundMoney(total / safeCount);
    allocated = roundMoney(allocated + amount);
    amounts.push(amount);
  }
  return amounts;
}

async function updateTipPayouts({ db, sourceKey, correctTipAmount, write }) {
  let docs;
  try {
    const snap = await db
      .collectionGroup("tipPayouts")
      .where("sourceKey", "==", sourceKey)
      .get();
    docs = snap.docs;
  } catch (err) {
    const message = String(err?.message ?? err);
    if (!message.includes("requires a") && !message.includes("FAILED_PRECONDITION")) {
      throw err;
    }
    const snap = await db.collectionGroup("tipPayouts").get();
    docs = snap.docs.filter((docSnap) => String(docSnap.data()?.sourceKey ?? "") === sourceKey);
  }
  docs = [...docs].sort((a, b) => a.ref.path.localeCompare(b.ref.path));
  const amounts = payoutDistribution(correctTipAmount, docs.length || 1);

  if (!write || docs.length === 0) {
    return docs.map((docSnap, index) => ({
      path: docSnap.ref.path,
      oldAmount: Number(docSnap.data()?.amount ?? 0),
      newAmount: amounts[index] ?? correctTipAmount,
    }));
  }

  const batch = db.batch();
  docs.forEach((docSnap, index) => {
    batch.set(
      docSnap.ref,
      {
        amount: amounts[index] ?? correctTipAmount,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });
  await batch.commit();

  return docs.map((docSnap, index) => ({
    path: docSnap.ref.path,
    oldAmount: Number(docSnap.data()?.amount ?? 0),
    newAmount: amounts[index] ?? correctTipAmount,
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const all = args.includes("--all");
  const verbose = args.includes("--verbose");
  const contractNumber = args.find((arg) => !arg.startsWith("--"));
  if (!all && !contractNumber) {
    throw new Error(
      "Usage: node .tmp/fix-life-tip-a101-contract.mjs <contractNumber>|--all [--write] [--verbose]"
    );
  }

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");
  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  const hits = all ? await findAllEntryDocs(db) : await findContracts(db, contractNumber);
  console.log(
    `mode=${write ? "write" : "dry-run"} ${all ? "scope=all" : `contract=${contractNumber}`} hits=${hits.length}`
  );
  if (hits.length === 0) return;

  let changedCount = 0;
  let eligibleCount = 0;
  let skippedCount = 0;

  for (const docSnap of hits) {
    const data = docSnap.data() ?? {};
    const correction = computeLifeTipA101Correction(data);
    if (!correction.ok) {
      skippedCount += 1;
      if (!all || verbose) {
        console.log(`\n${docSnap.ref.path}`);
        console.log(`skip=${correction.reason}`);
      }
      continue;
    }
    eligibleCount += 1;
    if (correction.changed) changedCount += 1;
    if (all && !verbose && !correction.changed) {
      continue;
    }

    console.log(`\n${docSnap.ref.path}`);
    console.log(
      JSON.stringify(
        {
          changed: correction.changed,
          productKey: data.productKey ?? null,
          tipsterPercent: data.tipContractTipsterPercent ?? null,
          oldGrossBase: correction.oldGrossBase ?? data.tipContractImmediateFirstYearGross ?? null,
          newGrossBase: correction.originalA101Gross,
          oldTipAmount: correction.oldTipAmount ?? data.tipContractTipsterAmountFirstYear ?? null,
          newTipAmount: correction.correctTipAmount,
          oldTotal: correction.oldTotal ?? data.total ?? null,
          newTotal: correction.newTotal,
          adviserIncrease: correction.adviserIncrease ?? 0,
        },
        null,
        2
      )
    );

    const sourceOwnerEmail = docSnap.ref.parent.parent?.id ?? normalizeEmail(data.userEmail);
    const sourceKey = `${normalizeEmail(sourceOwnerEmail)}___${docSnap.id}`;
    if (all && !write && !verbose) {
      console.log("tipPayouts: skipped in --all dry-run");
    } else {
      const payoutChanges = await updateTipPayouts({
        db,
        sourceKey,
        correctTipAmount: correction.correctTipAmount,
        write: write && correction.changed,
      });
      if (payoutChanges.length > 0) {
        console.log("tipPayouts:");
        for (const change of payoutChanges) {
          console.log(
            `- ${change.path}: ${roundMoney(change.oldAmount)} -> ${roundMoney(change.newAmount)}`
          );
        }
      } else {
        console.log("tipPayouts: none found");
      }
    }

    if (!write || !correction.changed) continue;

    await docSnap.ref.set(
      {
        items: correction.correctedItems,
        total: correction.newTotal,
        result: {
          ...(data.result && typeof data.result === "object" ? data.result : {}),
          items: correction.correctedItems,
          total: correction.newTotal,
        },
        tipContractImmediateFirstYearGross: correction.originalA101Gross,
        tipContractImmediateFirstYearNet: correction.correctNetBase,
        tipContractTipsterAmountFirstYear: correction.correctTipAmount,
        updatedAt: new Date(),
      },
      { merge: true }
    );
    console.log("written=true");
  }

  console.log(
    `\nsummary eligible=${eligibleCount} changed=${changedCount} skipped=${skippedCount}`
  );
}

main().catch((err) => {
  console.error("Fix failed:", err?.message ?? err);
  process.exit(1);
});
