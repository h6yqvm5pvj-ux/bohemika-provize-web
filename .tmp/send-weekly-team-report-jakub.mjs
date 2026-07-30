#!/usr/bin/env node

import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const TARGET_EMAIL = "jakub.rauscher@bohemika.eu";
const APP_ORIGIN = "https://bohemka.app";
const WEEKLY_LOOKBACK_DAYS = 7;
const ENTRY_PAGE_SIZE = 400;
const MAX_TOKENS_PER_USER = 30;
const MAX_TOKENS_PER_MULTICAST = 500;
const BUSINESS_PRODUCTS = new Set(["kooppmop", "cppPPRs", "cppPPRbez"]);
const WEEKLY_REPORT_NOTIFICATION_TITLE = "📊 Týdenní report produkce";
const WEEKLY_REPORT_NOTIFICATION_BODY = "Klikni pro zobrazení!";
const PRODUCT_CATEGORY = {
  neon: "life",
  flexi: "life",
  maximaMaxEfekt: "life",
  pillowInjury: "life",
  zamex: "property",
  domex: "property",
  cpphafan: "property",
  pillowmajetek: "property",
  koopmajetekobcan: "property",
  koopfit: "property",
  koopodzam: "property",
  kooppmop: "property",
  maxdomov: "property",
  allianzmujdomov: "property",
  cppsimplex: "property",
  cppPPRs: "property",
  cppPPRbez: "property",
  cppAuto: "auto",
  slaviaauto: "auto",
  slaviaflotila: "auto",
  allianzAuto: "auto",
  csobAuto: "auto",
  uniqaAuto: "auto",
  uniqaflotila: "auto",
  pillowAuto: "auto",
  kooperativaAuto: "auto",
  koopflotila: "auto",
  koopcestovko: "travel",
  cppcestovko: "travel",
  axacestovko: "travel",
  maxcizinkomplex: "travel",
  comfortcc: "comfort",
};
const CATEGORY_KEYS = ["life", "auto", "property", "business", "foreigners", "travel"];
const TOKEN_ARRAY_KEYS = ["fcmTokens", "pushTokens", "notificationTokens"];
const TOKEN_MAP_KEYS = ["fcmTokensByDevice", "pushTokensByDevice"];
const TOKEN_SINGLE_KEYS = ["fcmToken", "pushToken", "notificationToken"];
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

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
    } catch {
      // fallback to split env vars
    }
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

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function nameFromEmail(email) {
  const local = String(email ?? "").split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email || "Neznámý poradce";
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function displayName(profile) {
  const candidates = [
    profile?.merged?.fullName,
    profile?.merged?.name,
    profile?.merged?.displayName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return nameFromEmail(profile?.email);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function paymentsPerYear(freq) {
  switch (freq) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
}

function productCategory(product) {
  return PRODUCT_CATEGORY[product] ?? null;
}

function isLifeProduct(product) {
  return productCategory(product) === "life";
}

function annualPremiumFromEntry(data, product) {
  const rawAmount = Number(data?.inputAmount ?? 0);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return 0;
  if (isLifeProduct(product)) return rawAmount * 12;
  if (productCategory(product) === "comfort") return rawAmount;
  return rawAmount * paymentsPerYear(data?.frequencyRaw);
}

function reportCategory(product) {
  if (product === "maxcizinkomplex") return "foreigners";
  if (BUSINESS_PRODUCTS.has(product)) return "business";
  const category = productCategory(product);
  if (category === "life" || category === "auto" || category === "property" || category === "travel") {
    return category;
  }
  return null;
}

function emptyMetric() {
  return { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
}

function emptyCategories() {
  return Object.fromEntries(CATEGORY_KEYS.map((key) => [key, emptyMetric()]));
}

function addMetric(target, annualPremium) {
  target.contracts += 1;
  target.annualPremium += annualPremium;
  target.monthlyPremium += annualPremium / 12;
}

function mergeMetric(target, source) {
  target.contracts += source.contracts;
  target.annualPremium += source.annualPremium;
  target.monthlyPremium += source.monthlyPremium;
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(
    Math.max(0, Math.round(value))
  )} Kč`;
}

function normalizeToken(value) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token && token.length <= 4096 ? token : "";
}

function collectPushTokens(data) {
  const out = new Set();
  const push = (value) => {
    const token = normalizeToken(value);
    if (token) out.add(token);
  };
  TOKEN_SINGLE_KEYS.forEach((key) => push(data?.[key]));
  TOKEN_ARRAY_KEYS.forEach((key) => {
    const raw = data?.[key];
    if (Array.isArray(raw)) raw.forEach(push);
  });
  TOKEN_MAP_KEYS.forEach((key) => {
    const raw = data?.[key];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      Object.values(raw).forEach(push);
    }
  });
  return [...out];
}

async function collectAllEntriesFromQuery(query) {
  const out = [];
  let cursor = null;
  while (true) {
    let working = query.limit(ENTRY_PAGE_SIZE);
    if (cursor) working = working.startAfter(cursor);
    const snap = await working.get();
    if (snap.empty) break;
    out.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1] ?? null;
    if (!cursor || snap.size < ENTRY_PAGE_SIZE) break;
  }
  return out;
}

function collectHierarchy(rootEmail, childrenByManager) {
  const root = normalizeEmail(rootEmail);
  const out = [];
  const visited = new Set([root]);
  const queue = [...(childrenByManager.get(root) ?? [])];
  while (queue.length > 0) {
    const email = normalizeEmail(queue.shift());
    if (!email || visited.has(email)) continue;
    visited.add(email);
    out.push(email);
    queue.push(...(childrenByManager.get(email) ?? []));
  }
  return out;
}

async function loadUsers(db) {
  const [usersSnap, privateSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("usersPrivate").get(),
  ]);
  const privateByEmail = new Map();
  privateSnap.docs.forEach((doc) => {
    privateByEmail.set(normalizeEmail(doc.id), doc.data() ?? {});
  });

  return usersSnap.docs
    .map((doc) => {
      const publicData = doc.data() ?? {};
      const email = normalizeEmail(publicData.email ?? doc.id);
      if (!email) return null;
      return {
        email,
        managerEmail: normalizeEmail(publicData.managerEmail) || null,
        merged: { ...publicData, ...(privateByEmail.get(email) ?? {}) },
      };
    })
    .filter(Boolean);
}

async function loadOwnerTotals(db, ownerEmails, sinceMs, untilMs) {
  const totalsByOwner = new Map();
  const sinceDate = new Date(sinceMs);
  await Promise.all(
    [...new Set(ownerEmails)].map(async (ownerEmail) => {
      const entriesRef = db.collection("users").doc(ownerEmail).collection("entries");
      const [bySigned, byCreated] = await Promise.all([
        collectAllEntriesFromQuery(
          entriesRef
            .where("contractSignedDate", ">=", sinceDate)
            .orderBy("contractSignedDate", "desc")
        ),
        collectAllEntriesFromQuery(
          entriesRef.where("createdAt", ">=", sinceDate).orderBy("createdAt", "desc")
        ),
      ]);

      const docsByPath = new Map();
      bySigned.forEach((doc) => docsByPath.set(doc.ref.path, doc));
      byCreated.forEach((doc) => docsByPath.set(doc.ref.path, doc));

      docsByPath.forEach((doc) => {
        const data = doc.data() ?? {};
        const effectiveDate = toDate(data.contractSignedDate ?? data.createdAt);
        const effectiveMs = effectiveDate?.getTime() ?? null;
        if (effectiveMs == null || effectiveMs < sinceMs || effectiveMs > untilMs) return;

        const product = typeof data.productKey === "string" ? data.productKey : null;
        const category = reportCategory(product);
        if (!category) return;

        const annualPremium = annualPremiumFromEntry(data, product);
        const current =
          totalsByOwner.get(ownerEmail) ?? {
            categories: emptyCategories(),
            totalContracts: 0,
            totalAnnualPremium: 0,
          };
        addMetric(current.categories[category], annualPremium);
        current.totalContracts += 1;
        current.totalAnnualPremium += annualPremium;
        totalsByOwner.set(ownerEmail, current);
      });
    })
  );
  return totalsByOwner;
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) throw new Error("Missing FIREBASE_ADMIN_* credentials.");
  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const messaging = getMessaging(app);

  const now = new Date();
  const untilMs = now.getTime();
  const sinceMs = untilMs - WEEKLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const reportId = `weekly-team-report-${new Date(sinceMs).toISOString().slice(0, 10)}`;
  const deepLink = `/muj-tym?source=weekly-report&reportId=${encodeURIComponent(reportId)}`;
  const webPushLink = `${APP_ORIGIN}${deepLink}`;

  const users = await loadUsers(db);
  const usersByEmail = new Map(users.map((user) => [user.email, user]));
  const target = usersByEmail.get(TARGET_EMAIL);
  if (!target) throw new Error(`User not found: ${TARGET_EMAIL}`);

  const childrenByManager = new Map();
  users.forEach((user) => {
    if (!user.managerEmail) return;
    const existing = childrenByManager.get(user.managerEmail) ?? [];
    existing.push(user.email);
    childrenByManager.set(user.managerEmail, existing);
  });

  const subordinateEmails = collectHierarchy(TARGET_EMAIL, childrenByManager);
  const ownerTotals = await loadOwnerTotals(db, subordinateEmails, sinceMs, untilMs);
  const categories = emptyCategories();
  let topAdvisor = null;

  subordinateEmails.forEach((email) => {
    const totals = ownerTotals.get(email);
    if (!totals) return;
    CATEGORY_KEYS.forEach((key) => mergeMetric(categories[key], totals.categories[key]));
    if (
      totals.totalContracts > 0 &&
      (!topAdvisor ||
        totals.totalContracts > topAdvisor.contracts ||
        (totals.totalContracts === topAdvisor.contracts &&
          totals.totalAnnualPremium > topAdvisor.annualPremium))
    ) {
      topAdvisor = {
        email,
        name: displayName(usersByEmail.get(email)),
        contracts: totals.totalContracts,
        annualPremium: totals.totalAnnualPremium,
      };
    }
  });

  const nonLifeContracts =
    categories.auto.contracts +
    categories.property.contracts +
    categories.business.contracts +
    categories.foreigners.contracts +
    categories.travel.contracts;
  const nonLifeAnnualPremium =
    categories.auto.annualPremium +
    categories.property.annualPremium +
    categories.business.annualPremium +
    categories.foreigners.annualPremium +
    categories.travel.annualPremium;
  const metadata = {
    reportId,
    periodStart: new Date(sinceMs).toISOString(),
    periodEnd: new Date(untilMs).toISOString(),
    lifeContracts: categories.life.contracts,
    lifeMonthlyPremium: Math.round(categories.life.monthlyPremium),
    lifeAnnualPremium: Math.round(categories.life.annualPremium),
    autoContracts: categories.auto.contracts,
    autoAnnualPremium: Math.round(categories.auto.annualPremium),
    propertyContracts: categories.property.contracts,
    propertyAnnualPremium: Math.round(categories.property.annualPremium),
    businessContracts: categories.business.contracts,
    businessAnnualPremium: Math.round(categories.business.annualPremium),
    foreignersContracts: categories.foreigners.contracts,
    foreignersAnnualPremium: Math.round(categories.foreigners.annualPremium),
    travelContracts: categories.travel.contracts,
    travelAnnualPremium: Math.round(categories.travel.annualPremium),
    topAdvisorEmail: topAdvisor?.email ?? null,
    topAdvisorName: topAdvisor?.name ?? null,
    topAdvisorContracts: topAdvisor?.contracts ?? 0,
    topAdvisorAnnualPremium: Math.round(topAdvisor?.annualPremium ?? 0),
  };

  const mailboxRef = db
    .collection("usersPrivate")
    .doc(TARGET_EMAIL)
    .collection("mailbox")
    .doc();
  await mailboxRef.set({
    recipientEmail: TARGET_EMAIL,
    type: "weekly_team_report",
    title: WEEKLY_REPORT_NOTIFICATION_TITLE,
    body: WEEKLY_REPORT_NOTIFICATION_BODY,
    deepLink,
    read: false,
    readAtMs: null,
    readAt: null,
    createdAtMs: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
    metadata,
  });

  const tokens = collectPushTokens(target.merged).slice(0, MAX_TOKENS_PER_USER);
  if (tokens.length === 0) {
    console.log(JSON.stringify({ ok: false, error: "no_push_tokens", mailboxId: mailboxRef.id, metadata }, null, 2));
    return;
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens = [];
  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(i, i + MAX_TOKENS_PER_MULTICAST);
    const multicast = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: WEEKLY_REPORT_NOTIFICATION_TITLE,
        body: WEEKLY_REPORT_NOTIFICATION_BODY,
      },
      data: {
        type: "weekly_team_report",
        deepLink,
        reportId,
        periodStart: metadata.periodStart,
        periodEnd: metadata.periodEnd,
        lifeContracts: String(metadata.lifeContracts),
        lifeMonthlyPremium: String(metadata.lifeMonthlyPremium),
        nonLifeContracts: String(nonLifeContracts),
        nonLifeAnnualPremium: String(Math.round(nonLifeAnnualPremium)),
        topAdvisorName: topAdvisor?.name ?? "",
      },
      webpush: {
        fcmOptions: {
          link: webPushLink,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: `bohemika-${reportId}`,
          requireInteraction: false,
        },
      },
    });
    sent += multicast.successCount;
    failed += multicast.failureCount;
    multicast.responses.forEach((row, index) => {
      if (row.success) return;
      const code = row.error?.code ?? "";
      if (INVALID_TOKEN_CODES.has(code) && chunk[index]) {
        invalidTokens.push(chunk[index]);
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: sent > 0,
        targetEmail: TARGET_EMAIL,
        mailboxId: mailboxRef.id,
        reportId,
        sent,
        failed,
        invalidTokens: invalidTokens.length,
        subordinateCount: subordinateEmails.length,
        summary: metadata,
        body,
        deepLink,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
