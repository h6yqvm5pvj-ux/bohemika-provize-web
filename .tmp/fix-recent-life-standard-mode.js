const { loadEnvConfig } = require("@next/env");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const formulas = require("./backfill-build/src/app/lib/productFormulas.js");
const { totalWithMultipliers } = require("./backfill-build/src/app/lib/commissionTotals.js");

loadEnvConfig(process.cwd());

const DEFAULT_OWNER_EMAIL = "jakub.rauscher@bohemika.eu";
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);
const POSITION_ORDER = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];
const POSITION_SET = new Set(POSITION_ORDER);
const NEON_IMMEDIATE_A101_COEFFICIENTS = {
  poradce1: 1.2,
  poradce2: 1.38,
  poradce3: 1.502,
  poradce4: 2.16,
  poradce5: 2.4,
  poradce6: 2.58,
  poradce7: 2.702,
  poradce8: 2.881,
  poradce9: 3.002,
  poradce10: 3.122,
  manazer4: 2.404,
  manazer5: 2.683,
  manazer6: 2.962,
  manazer7: 3.243,
  manazer8: 3.522,
  manazer9: 3.802,
  manazer10: 4.083,
};
const NEON_IMMEDIATE_B0301_COEFFICIENTS = {
  poradce1: 0.444,
  poradce2: 0.489,
  poradce3: 0.533,
  poradce4: 0.622,
  poradce5: 0.645,
  poradce6: 0.665,
  poradce7: 0.687,
  poradce8: 0.71,
  poradce9: 0.73,
  poradce10: 0.752,
  manazer4: 0.633,
  manazer5: 0.69,
  manazer6: 0.747,
  manazer7: 0.807,
  manazer8: 0.863,
  manazer9: 0.92,
  manazer10: 0.987,
};
const NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS = {
  poradce1: 0.4445,
  poradce2: 0.489,
  poradce3: 0.5335,
  poradce4: 0.689,
  poradce5: 0.761,
  poradce6: 0.8,
  poradce7: 0.8385,
  poradce8: 0.877,
  poradce9: 0.9165,
  poradce10: 0.955,
  manazer4: 0.7575,
  manazer5: 0.8395,
  manazer6: 0.9205,
  manazer7: 1.0015,
  manazer8: 1.083,
  manazer9: 1.1633,
  manazer10: 1.2445,
};

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

function parseArgValue(args, key, defaultValue = null) {
  const prefix = `${key}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(key);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return defaultValue;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizePosition(value) {
  if (typeof value !== "string") return null;
  return POSITION_SET.has(value) ? value : null;
}

function normalizeMode(value) {
  return value === "standard" || value === "accelerated" ? value : null;
}

function normalizeContractNumber(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseContracts(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value && typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIsoDay(value) {
  const date = toDate(value);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pragueDayRange(dayIso) {
  return {
    start: new Date(`${dayIso}T00:00:00+02:00`),
    end: new Date(`${dayIso}T23:59:59.999+02:00`),
  };
}

function inRange(date, start, end) {
  return date && date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function toCents(value) {
  return Math.round(toNumber(value) * 100);
}

function fromCents(value) {
  return value / 100;
}

function amountForEntry(entry) {
  const calculated = toNumber(entry.calculationInputAmount);
  if (calculated > 0) return calculated;
  const input = toNumber(entry.inputAmount);
  if (input > 0) return input;
  const effective = toNumber(entry.effectiveInputAmount);
  return effective > 0 ? effective : 0;
}

function normalizedDurationYears(product, years) {
  const fallback =
    product === "neon" ? 15 : product === "flexi" ? 30 : product === "maximaMaxEfekt" ? 20 : 1;
  const max =
    product === "neon" ? 99 : product === "flexi" ? 80 : product === "maximaMaxEfekt" ? 20 : 1;
  const raw = typeof years === "number" && Number.isFinite(years) ? years : fallback;
  return Math.min(max, Math.max(1, Math.floor(raw)));
}

function computeItemsForEntry(entry, position, mode) {
  if (!position || !LIFE_PRODUCTS.has(entry.productKey)) return null;
  const amount = Math.max(0, amountForEntry(entry));
  switch (entry.productKey) {
    case "neon":
      return formulas.calculateNeon(
        amount,
        position,
        Math.min(15, normalizedDurationYears("neon", entry.durationYears)),
        mode
      );
    case "flexi":
      return formulas.calculateFlexi(
        amount,
        position,
        mode,
        normalizedDurationYears("flexi", entry.durationYears)
      );
    case "maximaMaxEfekt":
      return formulas.calculateMaxEfekt(
        amount,
        normalizedDurationYears("maximaMaxEfekt", entry.durationYears),
        position,
        mode
      );
    case "pillowInjury":
      return formulas.calculatePillowInjury(amount, position, mode);
    default:
      return null;
  }
}

function normalizeTitleKey(title) {
  const normalized = String(title ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.includes("z platby")) return `payment-${normalized}`;
  if (normalized.includes("za rok")) return `annual-${normalized}`;
  if (normalized.includes("okamžitá")) return "immediate";
  if (normalized.includes("po 3")) return "po3";
  if (normalized.includes("po 4")) return "po4";
  if (normalized.includes("2.–5.")) return "nasl25";
  if (normalized.includes("5.–10.")) return "nasl510";
  if (normalized.includes("od 6.")) return "nasl6plus";
  return normalized;
}

function normalizeCodeKey(code) {
  if (typeof code !== "string") return "";
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function itemDiffKey(item) {
  const code = normalizeCodeKey(item.code);
  return code ? `code:${code}` : normalizeTitleKey(item.title);
}

function stripTotalRows(items = []) {
  return items.filter((item) => {
    const code = normalizeCodeKey(item.code);
    return code !== "TOTAL" && !normalizeTitleKey(item.title).includes("celkem");
  });
}

function normalizeItem(item) {
  return {
    title: String(item.title ?? "").trim(),
    amount: roundMoney(item.amount),
    ...(item.code ? { code: item.code } : {}),
    ...(item.note ? { note: item.note } : {}),
    ...(item.excludeFromTotal ? { excludeFromTotal: true } : {}),
  };
}

function splitNeonImmediateItem(entry, item, position, mode) {
  if (entry.productKey !== "neon") return null;
  if (normalizeTitleKey(item.title) !== "immediate") return null;
  if (item.code) return null;

  const a101 = NEON_IMMEDIATE_A101_COEFFICIENTS[position];
  const b0301 = NEON_IMMEDIATE_B0301_COEFFICIENTS[position];
  const b3601Half =
    mode === "accelerated" ? NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position] : 0;
  const totalCoefficient = a101 + b0301 + b3601Half;
  if (!Number.isFinite(totalCoefficient) || totalCoefficient <= 0) return null;

  const totalCents = toCents(item.amount);
  const parts = [
    {
      title: "💸 Provize A101",
      code: "A101",
      cents: Math.max(0, Math.round((totalCents * a101) / totalCoefficient)),
    },
    {
      title: "💸 Provize B0301",
      code: "B0301",
      cents: Math.max(0, Math.round((totalCents * b0301) / totalCoefficient)),
      note: "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!",
    },
    ...(b3601Half > 0
      ? [
          {
            title: "💸 Provize 50% z B3601",
            code: "B3601_HALF",
            cents: Math.max(0, Math.round((totalCents * b3601Half) / totalCoefficient)),
          },
        ]
      : []),
  ];
  const roundedSum = parts.reduce((sum, part) => sum + part.cents, 0);
  parts[parts.length - 1].cents += totalCents - roundedSum;

  return parts.map((part) => ({
    title: part.title,
    amount: roundMoney(fromCents(part.cents)),
    code: part.code,
    ...(part.note ? { note: part.note } : {}),
  }));
}

function normalizeItems(items = [], entry = null, mode = null, position = null) {
  return items.flatMap((item) => {
    if (entry && mode && position) {
      const split = splitNeonImmediateItem(entry, item, position, mode);
      if (split) return split;
    }
    return [normalizeItem(item)];
  });
}

function computeManagerOverrides(entry, standardManagerChain) {
  const overrides = [];
  let childPosition = normalizePosition(entry.position);

  for (const manager of standardManagerChain) {
    if (!manager.position || !childPosition) {
      childPosition = manager.position ?? childPosition;
      continue;
    }

    const managerResult = computeItemsForEntry(entry, manager.position, "standard");
    const baselineResult = computeItemsForEntry(entry, childPosition, "standard");
    if (!managerResult || !baselineResult) {
      childPosition = manager.position;
      continue;
    }

    const managerMap = new Map();
    stripTotalRows(normalizeItems(managerResult.items, entry, "standard", manager.position)).forEach((item) => {
      const key = itemDiffKey(item);
      const prev = managerMap.get(key);
      managerMap.set(key, {
        title: item.title ?? prev?.title ?? key,
        amount: roundMoney((prev?.amount ?? 0) + (item.amount ?? 0)),
        code: item.code ?? prev?.code ?? null,
        note: item.note ?? prev?.note ?? null,
        excludeFromTotal: Boolean(prev?.excludeFromTotal || item.excludeFromTotal),
      });
    });

    const diffItems = [];
    stripTotalRows(normalizeItems(baselineResult.items, entry, "standard", childPosition)).forEach((item) => {
      const key = itemDiffKey(item);
      const managerValue = managerMap.get(key);
      const remaining = roundMoney((managerValue?.amount ?? 0) - (item.amount ?? 0));
      if (remaining > 0) {
        diffItems.push({
          title: managerValue?.title ?? item.title,
          amount: remaining,
          code: managerValue?.code ?? item.code ?? null,
          ...(managerValue?.note || item.note ? { note: managerValue?.note ?? item.note } : {}),
          ...(managerValue?.excludeFromTotal || item.excludeFromTotal
            ? { excludeFromTotal: true }
            : {}),
        });
      }
      managerMap.delete(key);
    });

    managerMap.forEach((value) => {
      if (value.amount > 0) {
        diffItems.push({
          title: value.title,
          amount: roundMoney(value.amount),
          code: value.code ?? null,
          ...(value.note ? { note: value.note } : {}),
          ...(value.excludeFromTotal ? { excludeFromTotal: true } : {}),
        });
      }
    });

    const normalizedItems = normalizeItems(diffItems);
    const total = roundMoney(totalWithMultipliers(normalizedItems));
    if (normalizedItems.length > 0 && total > 0) {
      overrides.push({
        email: manager.email ?? null,
        position: manager.position,
        commissionMode: "standard",
        items: normalizedItems,
        total,
      });
    }

    childPosition = manager.position;
  }

  return overrides;
}

function hasAcceleratedHalfItem(entry) {
  return (Array.isArray(entry.items) ? entry.items : []).some((item) => {
    const code = normalizeCodeKey(item?.code);
    const title = normalizeTitleKey(item?.title);
    return (
      code === "B36_HALF" ||
      code === "B3601_HALF" ||
      title.includes("50% z b36") ||
      title.includes("50% z b3601")
    );
  });
}

function hasCombinedImmediateItemWithoutCode(entry) {
  return (Array.isArray(entry.items) ? entry.items : []).some(
    (item) => normalizeTitleKey(item?.title) === "immediate" && !item?.code
  );
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const allAccelerated = args.includes("--all-accelerated");
  const allOwners = args.includes("--all-owners");
  const ownerEmail = allOwners
    ? null
    : normalizeEmail(parseArgValue(args, "--email", DEFAULT_OWNER_EMAIL));
  const dayIso = parseArgValue(args, "--day", "2026-07-13");
  const contractNumbers = parseContracts(parseArgValue(args, "--contracts", null));
  if (!allOwners && !ownerEmail) throw new Error("Missing --email.");

  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const { start, end } = pragueDayRange(dayIso);

  const usersSnap = await db.collection("users").get();
  const ownerDocIds = usersSnap.docs
    .filter((docSnap) =>
      allOwners ? true : normalizeEmail(docSnap.data()?.email ?? docSnap.id) === ownerEmail
    )
    .map((docSnap) => docSnap.id);

  const planned = [];
  let scanned = 0;

  for (const ownerDocId of ownerDocIds) {
    const entriesSnap = await db.collection("users").doc(ownerDocId).collection("entries").get();
    for (const entrySnap of entriesSnap.docs) {
      const entry = entrySnap.data() || {};
      if ((entry.entryType ?? "contract") !== "contract") continue;
      if (!LIFE_PRODUCTS.has(entry.productKey)) continue;
      scanned += 1;

      const contractNumber = normalizeContractNumber(entry.contractNumber);
      if (contractNumbers && !contractNumbers.has(contractNumber)) continue;

      const createdAt = toDate(entry.createdAt);
      if (!contractNumbers && !inRange(createdAt, start, end)) continue;
      const storedMode = normalizeMode(entry.commissionMode);
      const repairSplitOnly =
        contractNumbers && storedMode === "standard" && hasCombinedImmediateItemWithoutCode(entry);
      if (!repairSplitOnly) {
        if (storedMode !== "accelerated") continue;
        if (!allAccelerated && !hasAcceleratedHalfItem(entry)) continue;
      }

      const position = normalizePosition(entry.position);
      const standardResult = computeItemsForEntry(entry, position, "standard");
      if (!position || !standardResult) continue;

      const standardItems = normalizeItems(standardResult.items, entry, "standard", position);
      const standardTotal = roundMoney(standardResult.total);
      const standardManagerChain = (Array.isArray(entry.managerChain) ? entry.managerChain : [])
        .map((row) => ({
          ...row,
          email: normalizeEmail(row?.email),
          position: normalizePosition(row?.position),
          commissionMode: "standard",
        }))
        .filter((row) => row.email || row.position);
      const managerOverrides = computeManagerOverrides(entry, standardManagerChain);

      planned.push({
        ref: entrySnap.ref,
        path: entrySnap.ref.path,
        contractNumber,
        clientName: entry.clientName ?? null,
        productKey: entry.productKey,
        signedIso: toIsoDay(entry.contractSignedDate),
        createdIso: createdAt ? createdAt.toISOString() : null,
        beforeTotal: roundMoney(entry.total),
        afterTotal: standardTotal,
        update: {
          commissionMode: "standard",
          items: standardItems,
          total: standardTotal,
          result: {
            items: standardItems,
            total: standardTotal,
          },
          managerChain: standardManagerChain,
          managerModeSnapshot: standardManagerChain[0]?.email ? "standard" : entry.managerModeSnapshot ?? null,
          managerOverrides,
        },
      });
    }
  }

  planned.sort((a, b) => (a.createdIso ?? "").localeCompare(b.createdIso ?? ""));

  console.log(`owner=${allOwners ? "ALL" : ownerEmail}`);
  console.log(`day=${dayIso}`);
  console.log(`profile_docs=${ownerDocIds.join(",") || "none"}`);
  console.log(`scanned_life_contracts=${scanned}`);
  console.log(`contracts_to_update=${planned.length}`);
  planned.forEach((row) => {
    console.log(
      [
        row.contractNumber || "bez_cisla",
        row.productKey,
        row.clientName || "bez_klienta",
        `signed=${row.signedIso ?? "—"}`,
        `created=${row.createdIso ?? "—"}`,
        `total=${row.beforeTotal}->${row.afterTotal}`,
        row.path,
      ].join(" | ")
    );
  });

  if (!apply) {
    console.log("DRY_RUN_ONLY");
    return;
  }

  let batch = db.batch();
  let ops = 0;
  for (const row of planned) {
    batch.set(row.ref, row.update, { merge: true });
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`APPLIED=${planned.length}`);
}

main().catch((error) => {
  console.error(`fix_failed=${error?.message ?? error}`);
  process.exit(1);
});
