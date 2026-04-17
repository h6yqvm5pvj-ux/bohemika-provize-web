#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("@next/env");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const productFormulas_1 = require("../src/app/lib/productFormulas");
const commissionTotals_1 = require("../src/app/lib/commissionTotals");
(0, env_1.loadEnvConfig)(process.cwd());
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
const PRODUCT_SET = new Set([
    "neon",
    "flexi",
    "maximaMaxEfekt",
    "pillowInjury",
    "zamex",
    "domex",
    "koopmajetekobcan",
    "maxdomov",
    "cppsimplex",
    "cppAuto",
    "slaviaauto",
    "allianzAuto",
    "csobAuto",
    "uniqaAuto",
    "pillowAuto",
    "kooperativaAuto",
    "cppcestovko",
    "axacestovko",
    "comfortcc",
    "cppPPRs",
    "cppPPRbez",
]);
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
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
        }
        catch {
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
    if (typeof value !== "string")
        return null;
    const v = value.trim().toLowerCase();
    return v.length > 0 ? v : null;
}
function normalizeMode(value) {
    if (value === "accelerated" || value === "standard")
        return value;
    return null;
}
function normalizePosition(value) {
    if (typeof value !== "string")
        return null;
    if (POSITION_ORDER.includes(value))
        return value;
    return null;
}
function normalizeProduct(value) {
    if (typeof value !== "string")
        return null;
    if (PRODUCT_SET.has(value))
        return value;
    return null;
}
function toNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    return n;
}
function toNonNegativeNumber(value) {
    return Math.max(0, toNumber(value));
}
function isIsoDay(value) {
    if (!ISO_DAY_RE.test(value))
        return false;
    const d = new Date(`${value}T00:00:00`);
    return !Number.isNaN(d.getTime());
}
function toDate(value) {
    if (!value)
        return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "object" && value !== null) {
        const maybeTs = value;
        if (typeof maybeTs.toDate === "function") {
            const d = maybeTs.toDate();
            return Number.isNaN(d.getTime()) ? null : d;
        }
    }
    if (typeof value === "number" || typeof value === "string") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}
function toIsoDay(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (isIsoDay(trimmed))
            return trimmed;
    }
    const d = toDate(value);
    if (!d)
        return null;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function parsePositionTimeline(raw) {
    if (!Array.isArray(raw))
        return [];
    const rows = [];
    raw.forEach((item, index) => {
        if (!item || typeof item !== "object")
            return;
        const row = item;
        const position = normalizePosition(row.position);
        if (!position)
            return;
        const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
        const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
        const validTo = validToRaw || null;
        if (!isIsoDay(validFrom))
            return;
        if (validTo && !isIsoDay(validTo))
            return;
        if (validTo && validTo < validFrom)
            return;
        rows.push({
            id: typeof row.id === "string" && row.id.trim().length > 0
                ? row.id.trim()
                : `timeline_${index}`,
            position,
            validFrom,
            validTo,
        });
    });
    rows.sort((a, b) => {
        if (a.validFrom !== b.validFrom)
            return a.validFrom.localeCompare(b.validFrom);
        const aTo = a.validTo ?? "9999-12-31";
        const bTo = b.validTo ?? "9999-12-31";
        return aTo.localeCompare(bTo);
    });
    return rows;
}
function resolvePositionTimelineMatch(signedDate, timeline) {
    if (!isIsoDay(signedDate) || timeline.length === 0)
        return null;
    const candidates = timeline.filter((row) => {
        if (row.validFrom > signedDate)
            return false;
        if (row.validTo && signedDate >= row.validTo)
            return false;
        return true;
    });
    if (candidates.length === 0)
        return null;
    candidates.sort((a, b) => {
        if (a.validFrom !== b.validFrom)
            return b.validFrom.localeCompare(a.validFrom);
        const aTo = a.validTo ?? "9999-12-31";
        const bTo = b.validTo ?? "9999-12-31";
        return bTo.localeCompare(aTo);
    });
    return candidates[0] ?? null;
}
function resolvePositionForSignedDate(userData, signedDateIso, fallbackPosition) {
    const timeline = parsePositionTimeline(userData?.positionTimeline);
    const timelineMatch = signedDateIso && isIsoDay(signedDateIso)
        ? resolvePositionTimelineMatch(signedDateIso, timeline)
        : null;
    return timelineMatch?.position ?? userData?.position ?? fallbackPosition ?? null;
}
function durationRange(product) {
    switch (product) {
        case "neon":
            return [1, 99];
        case "flexi":
            return [1, 80];
        case "maximaMaxEfekt":
            return [1, 20];
        default:
            return [1, 1];
    }
}
function durationFallback(product) {
    switch (product) {
        case "neon":
            return 15;
        case "flexi":
            return 30;
        case "maximaMaxEfekt":
            return 20;
        default:
            return 1;
    }
}
function normalizedDurationYears(product, years) {
    const [min, max] = durationRange(product);
    const raw = typeof years === "number" && Number.isFinite(years)
        ? years
        : durationFallback(product);
    const wholeYears = Math.floor(raw);
    return Math.min(max, Math.max(min, wholeYears));
}
function paymentsPerYear(f) {
    if (f === "monthly")
        return 12;
    if (f === "quarterly")
        return 4;
    if (f === "semiannual")
        return 2;
    return 1;
}
function paymentBasedTotals(items, multiplier) {
    let immediate = 0;
    let subsequent = 0;
    items.forEach((it) => {
        const t = (it.title ?? "").toLowerCase();
        if (t.includes("okamžitá")) {
            immediate += it.amount ?? 0;
        }
        else if (t.includes("následná")) {
            subsequent += it.amount ?? 0;
        }
    });
    return {
        immediate: immediate * multiplier,
        subsequent: subsequent * multiplier,
    };
}
function allowedFrequencies(product) {
    switch (product) {
        case "neon":
        case "flexi":
        case "pillowInjury":
        case "maximaMaxEfekt":
            return ["monthly"];
        case "domex":
            return ["quarterly", "semiannual", "annual"];
        case "koopmajetekobcan":
            return ["monthly", "quarterly", "semiannual", "annual"];
        case "pillowAuto":
        case "maxdomov":
        case "kooperativaAuto":
        case "allianzAuto":
            return ["monthly", "quarterly", "semiannual", "annual"];
        case "cppAuto":
        case "slaviaauto":
        case "csobAuto":
        case "uniqaAuto":
        case "zamex":
        case "cppsimplex":
        case "cppPPRbez":
        case "cppPPRs":
            return ["quarterly", "semiannual", "annual"];
        case "cppcestovko":
        case "axacestovko":
        case "comfortcc":
            return ["annual"];
    }
}
function normalizeTitleKey(title) {
    const t = title.toLowerCase();
    if (t.includes("z platby"))
        return `payment-${t}`;
    if (t.includes("za rok"))
        return `annual-${t}`;
    if (t.includes("okamžitá"))
        return "immediate";
    if (t.includes("po 3"))
        return "po3";
    if (t.includes("po 4"))
        return "po4";
    if (t.includes("2.–5."))
        return "nasl25";
    if (t.includes("5.–10."))
        return "nasl510";
    if (t.includes("od 6."))
        return "nasl6plus";
    if (t.includes("z platby"))
        return "subsequentByPayment";
    return t;
}
function stripTotalRows(items = []) {
    return items.filter((it) => !normalizeTitleKey(it.title ?? "").includes("celkem"));
}
function normalizeAmount(value) {
    const n = toNumber(value);
    return Math.round(n * 1000000) / 1000000;
}
function normalizeResultItems(items) {
    return items.map((item) => ({
        title: String(item.title ?? "").trim(),
        amount: normalizeAmount(item.amount ?? 0),
    }));
}
function entryCalculationAmount(entry) {
    const fromCalculation = toNumber(entry.calculationInputAmount);
    if (fromCalculation > 0)
        return fromCalculation;
    const fromInput = toNumber(entry.inputAmount);
    if (fromInput > 0)
        return fromInput;
    const fromEffective = toNumber(entry.effectiveInputAmount);
    if (fromEffective > 0)
        return fromEffective;
    return 0;
}
function computeItemsForEntry(entry, pos, customMode, amountOverride) {
    if (!pos)
        return null;
    const product = normalizeProduct(entry.productKey);
    if (!product)
        return null;
    const allowed = allowedFrequencies(product);
    const rawFreq = entry.frequencyRaw;
    const freq = typeof rawFreq === "string" &&
        allowed.includes(rawFreq)
        ? rawFreq
        : allowed[0];
    const years = typeof entry.durationYears === "number" && Number.isFinite(entry.durationYears)
        ? entry.durationYears
        : null;
    const usedMode = (customMode ?? normalizeMode(entry.commissionMode) ?? "standard");
    const val = amountOverride == null
        ? toNonNegativeNumber(entryCalculationAmount(entry))
        : toNonNegativeNumber(amountOverride);
    switch (product) {
        case "neon": {
            const y = Math.min(15, normalizedDurationYears("neon", years));
            return (0, productFormulas_1.calculateNeon)(val, pos, y, usedMode);
        }
        case "flexi": {
            const y = normalizedDurationYears("flexi", years);
            return (0, productFormulas_1.calculateFlexi)(val, pos, usedMode, y);
        }
        case "maximaMaxEfekt": {
            const y = normalizedDurationYears("maximaMaxEfekt", years);
            return (0, productFormulas_1.calculateMaxEfekt)(val, y, pos, usedMode);
        }
        case "pillowInjury":
            return (0, productFormulas_1.calculatePillowInjury)(val, pos, usedMode);
        case "domex":
        case "koopmajetekobcan": {
            const dto = product === "domex"
                ? (0, productFormulas_1.calculateDomex)(val, freq, pos)
                : (0, productFormulas_1.calculateKoopMajetekObcan)(val, freq, pos);
            const filtered = dto.items.filter((i) => (i.title ?? "").toLowerCase().includes("(z platby)"));
            const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
            return { items: filtered, total: totals.immediate + totals.subsequent };
        }
        case "maxdomov": {
            const dto = (0, productFormulas_1.calculateMaxdomov)(val, freq, pos);
            const filtered = dto.items.filter((i) => (i.title ?? "").toLowerCase().includes("(z platby)"));
            const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
            return { items: filtered, total: totals.immediate + totals.subsequent };
        }
        case "cppAuto":
            return (0, productFormulas_1.calculateCppAuto)(val, freq, pos);
        case "slaviaauto":
            return (0, productFormulas_1.calculateSlaviaAuto)(val, freq, pos);
        case "cppPPRbez": {
            const dto = (0, productFormulas_1.calculateCppPPRbez)(val, freq, pos);
            const filtered = dto.items.filter((i) => (i.title ?? "").toLowerCase().includes("(z platby)"));
            const sum = filtered.reduce((s, i) => s + (i.amount ?? 0), 0);
            return { items: filtered, total: sum };
        }
        case "cppPPRs":
            return (0, productFormulas_1.calculateCppPPRs)(val, freq, pos);
        case "cppsimplex":
            return (0, productFormulas_1.calculateCppSimplex)(val, freq, pos);
        case "allianzAuto":
            return (0, productFormulas_1.calculateAllianzAuto)(val, freq, pos);
        case "csobAuto":
            return (0, productFormulas_1.calculateCsobAuto)(val, freq, pos);
        case "uniqaAuto":
            return (0, productFormulas_1.calculateUniqaAuto)(val, freq, pos);
        case "pillowAuto":
            return (0, productFormulas_1.calculatePillowAuto)(val, freq, pos);
        case "kooperativaAuto":
            return (0, productFormulas_1.calculateKooperativaAuto)(val, freq, pos);
        case "zamex":
            return (0, productFormulas_1.calculateZamex)(val, freq, pos);
        case "cppcestovko":
            return (0, productFormulas_1.calculateCppCestovko)(val, pos);
        case "axacestovko":
            return (0, productFormulas_1.calculateAxaCestovko)(val, pos);
        case "comfortcc":
            return (0, productFormulas_1.calculateComfortCC)({
                fee: val,
                payment: toNonNegativeNumber(entry.comfortPayment),
                targetAmount: entry.comfortGradual === true
                    ? toNonNegativeNumber(entry.comfortTargetAmount)
                    : 0,
                isSavings: entry.comfortGradual === true,
                isGradualFee: entry.comfortGradual === true,
                position: pos,
            });
        default:
            return null;
    }
}
function normalizeManagerChain(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    raw.forEach((item) => {
        if (!item || typeof item !== "object")
            return;
        const row = item;
        out.push({
            email: normalizeEmail(row.email),
            position: normalizePosition(row.position),
            commissionMode: normalizeMode(row.commissionMode),
        });
    });
    return out.filter((row) => !!row.email);
}
function normalizeManagerOverrides(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    raw.forEach((item) => {
        if (!item || typeof item !== "object")
            return;
        const row = item;
        const itemsRaw = Array.isArray(row.items) ? row.items : [];
        const items = itemsRaw
            .filter((x) => x && typeof x === "object")
            .map((x) => {
            const it = x;
            return {
                title: String(it.title ?? "").trim(),
                amount: normalizeAmount(it.amount ?? 0),
            };
        });
        const cleaned = normalizeResultItems(stripTotalRows(items));
        out.push({
            email: normalizeEmail(row.email),
            position: normalizePosition(row.position),
            commissionMode: normalizeMode(row.commissionMode),
            items: cleaned,
            total: normalizeAmount((0, commissionTotals_1.totalWithMultipliers)(cleaned)),
        });
    });
    return out.filter((row) => !!row.email);
}
function collectChainEmailsFromUsers(firstManagerEmail, usersByEmail) {
    const emails = [];
    let current = firstManagerEmail;
    let depth = 0;
    const visited = new Set();
    while (current && depth < 9 && !visited.has(current)) {
        visited.add(current);
        emails.push(current);
        const user = usersByEmail.get(current);
        current = user?.managerEmail ?? null;
        depth += 1;
    }
    return emails;
}
function resolveChainEmailsForEntry(entry, ownerEmail, usersByEmail) {
    const chainFromEntry = normalizeManagerChain(entry.managerChain).map((row) => row.email);
    if (chainFromEntry.length > 0)
        return chainFromEntry;
    const snapshotManager = normalizeEmail(entry.managerEmailSnapshot);
    if (snapshotManager) {
        return collectChainEmailsFromUsers(snapshotManager, usersByEmail);
    }
    const owner = usersByEmail.get(ownerEmail);
    if (owner?.managerEmail) {
        return collectChainEmailsFromUsers(owner.managerEmail, usersByEmail);
    }
    return [];
}
function buildManagerChainForEntry(entry, ownerEmail, usersByEmail, signedDateIso) {
    const existingChain = normalizeManagerChain(entry.managerChain);
    const chainEmails = resolveChainEmailsForEntry(entry, ownerEmail, usersByEmail);
    return chainEmails.map((email, idx) => {
        const existingNode = existingChain.find((node) => node.email === email) ?? existingChain[idx] ?? null;
        const userData = usersByEmail.get(email);
        const resolvedPosition = resolvePositionForSignedDate(userData, signedDateIso, existingNode?.position ?? null);
        const resolvedMode = existingNode?.commissionMode ??
            (idx === 0 ? normalizeMode(entry.managerModeSnapshot) : null) ??
            userData?.commissionMode ??
            null;
        return {
            email,
            position: resolvedPosition,
            commissionMode: resolvedMode,
        };
    });
}
function computeManagerOverridesForEntry(entry, managerChain) {
    const calculationAmount = entryCalculationAmount(entry);
    const diffs = [];
    let childPositionForBaseline = normalizePosition(entry.position);
    const ownerMode = normalizeMode(entry.commissionMode);
    managerChain.forEach((mgr) => {
        if (!mgr.position)
            return;
        const mgrMode = mgr.commissionMode ?? ownerMode ?? "standard";
        const mgrRes = computeItemsForEntry(entry, mgr.position, mgrMode, calculationAmount);
        const baselineRes = childPositionForBaseline
            ? computeItemsForEntry(entry, childPositionForBaseline, mgrMode, calculationAmount)
            : null;
        if (!mgrRes || !baselineRes) {
            childPositionForBaseline = mgr.position;
            return;
        }
        const mgrItems = stripTotalRows(mgrRes.items);
        const baselineItems = stripTotalRows(baselineRes.items);
        const mgrMap = new Map();
        mgrItems.forEach((it) => {
            const key = normalizeTitleKey(it.title ?? "");
            const prev = mgrMap.get(key);
            mgrMap.set(key, {
                title: it.title ?? prev?.title ?? key,
                amount: normalizeAmount((prev?.amount ?? 0) + (it.amount ?? 0)),
            });
        });
        const diffItems = [];
        baselineItems.forEach((it) => {
            const key = normalizeTitleKey(it.title ?? "");
            const mgrVal = mgrMap.get(key);
            const mgrAmt = mgrVal?.amount ?? 0;
            const subAmt = it.amount ?? 0;
            const rem = normalizeAmount(mgrAmt - subAmt);
            if (rem > 0) {
                diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
            }
            mgrMap.delete(key);
        });
        mgrMap.forEach((val) => {
            if (val.amount > 0) {
                diffItems.push({ title: val.title, amount: normalizeAmount(val.amount) });
            }
        });
        const normalizedItems = normalizeResultItems(diffItems);
        const diffTotal = normalizeAmount((0, commissionTotals_1.totalWithMultipliers)(normalizedItems));
        if (normalizedItems.length > 0 && diffTotal > 0) {
            diffs.push({
                email: mgr.email ?? null,
                position: mgr.position,
                commissionMode: mgrMode,
                items: normalizedItems,
                total: diffTotal,
            });
        }
        childPositionForBaseline = mgr.position;
    });
    return diffs;
}
function normalizeAllowedEmails(raw) {
    if (!Array.isArray(raw))
        return [];
    const set = new Set();
    raw.forEach((item) => {
        const email = normalizeEmail(item);
        if (email)
            set.add(email);
    });
    return Array.from(set).sort();
}
function buildAllowedEmails(ownerEmail, managerEmail, chain, overrides) {
    const set = new Set();
    const push = (value) => {
        const email = normalizeEmail(value);
        if (email)
            set.add(email);
    };
    push(ownerEmail);
    push(managerEmail);
    chain.forEach((node) => push(node.email));
    overrides.forEach((ov) => push(ov.email));
    return Array.from(set).sort();
}
function deepEqualViaJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
function parseArgValue(args, key) {
    const pref = `${key}=`;
    const inline = args.find((arg) => arg.startsWith(pref));
    if (inline)
        return inline.slice(pref.length);
    const idx = args.indexOf(key);
    if (idx >= 0 && idx + 1 < args.length)
        return args[idx + 1];
    return null;
}
function collectSubordinates(managerEmail, childrenByManager) {
    const visited = new Set();
    const result = [];
    const queue = [...(childrenByManager.get(managerEmail) ?? [])];
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current))
            continue;
        visited.add(current);
        result.push(current);
        const children = childrenByManager.get(current) ?? [];
        children.forEach((child) => {
            if (!visited.has(child))
                queue.push(child);
        });
    }
    return result;
}
async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes("--apply");
    const managerEmail = normalizeEmail(parseArgValue(args, "--manager") ?? "jakub.rauscher@bohemika.eu");
    if (!managerEmail) {
        throw new Error("Missing --manager email.");
    }
    const credentials = loadCredentials();
    if (!credentials) {
        throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");
    }
    const app = (0, app_1.getApps)()[0] ??
        (0, app_1.initializeApp)({
            credential: (0, app_1.cert)(credentials),
        });
    const db = (0, firestore_1.getFirestore)(app);
    const usersSnap = await db.collection("users").get();
    const usersByEmail = new Map();
    usersSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const normalized = normalizeEmail(data.email ?? docSnap.id);
        if (!normalized)
            return;
        const candidateTimeline = data.positionTimeline;
        const candidate = {
            managerEmail: normalizeEmail(data.managerEmail),
            position: normalizePosition(data.position),
            commissionMode: normalizeMode(data.commissionMode),
            positionTimeline: candidateTimeline,
            docId: docSnap.id,
        };
        const existing = usersByEmail.get(normalized);
        if (!existing) {
            usersByEmail.set(normalized, {
                email: normalized,
                managerEmail: candidate.managerEmail,
                position: candidate.position,
                commissionMode: candidate.commissionMode,
                positionTimeline: candidate.positionTimeline,
                docIds: [candidate.docId],
            });
            return;
        }
        if (!existing.docIds.includes(candidate.docId)) {
            existing.docIds.push(candidate.docId);
        }
        const isCanonicalDoc = candidate.docId.toLowerCase() === normalized;
        const existingHasTimeline = parsePositionTimeline(existing.positionTimeline).length > 0;
        const candidateHasTimeline = parsePositionTimeline(candidate.positionTimeline).length > 0;
        if (isCanonicalDoc || (!existing.managerEmail && candidate.managerEmail)) {
            existing.managerEmail = candidate.managerEmail;
        }
        if (isCanonicalDoc || (!existing.position && candidate.position)) {
            existing.position = candidate.position;
        }
        if (isCanonicalDoc || (!existing.commissionMode && candidate.commissionMode)) {
            existing.commissionMode = candidate.commissionMode;
        }
        if (candidateHasTimeline && (isCanonicalDoc || !existingHasTimeline)) {
            existing.positionTimeline = candidate.positionTimeline;
        }
    });
    const childrenByManager = new Map();
    usersByEmail.forEach((user) => {
        const mgr = user.managerEmail;
        if (!mgr)
            return;
        const arr = childrenByManager.get(mgr) ?? [];
        arr.push(user.email);
        childrenByManager.set(mgr, Array.from(new Set(arr)));
    });
    const subordinateEmails = collectSubordinates(managerEmail, childrenByManager);
    if (subordinateEmails.length === 0) {
        console.log(`No subordinates found for ${managerEmail}.`);
        return;
    }
    console.log(`Manager ${managerEmail}: ${subordinateEmails.length} subordinate users found.`);
    const plannedUpdates = [];
    let scannedEntries = 0;
    let skippedUnsupportedProduct = 0;
    let skippedMissingSignedDate = 0;
    for (const ownerEmail of subordinateEmails) {
        const ownerRecord = usersByEmail.get(ownerEmail);
        const ownerDocIds = ownerRecord?.docIds?.length ? ownerRecord.docIds : [ownerEmail];
        for (const ownerDocId of ownerDocIds) {
            const entriesSnap = await db
                .collection("users")
                .doc(ownerDocId)
                .collection("entries")
                .get();
            scannedEntries += entriesSnap.size;
            for (const entrySnap of entriesSnap.docs) {
                const entry = entrySnap.data();
                const product = normalizeProduct(entry.productKey);
                if (!product) {
                    skippedUnsupportedProduct += 1;
                    continue;
                }
                const signedDateIso = toIsoDay(entry.contractSignedDate);
                if (!signedDateIso) {
                    skippedMissingSignedDate += 1;
                    continue;
                }
                const managerChain = buildManagerChainForEntry(entry, ownerEmail, usersByEmail, signedDateIso);
                const managerOverrides = computeManagerOverridesForEntry(entry, managerChain);
                const managerEmailSnapshot = managerChain[0]?.email ?? null;
                const managerPositionSnapshot = managerChain[0]?.position ?? null;
                const managerModeSnapshot = managerChain[0]?.commissionMode ?? null;
                const allowedEmails = buildAllowedEmails(ownerEmail, managerEmailSnapshot, managerChain, managerOverrides);
                const previousComparable = {
                    managerEmailSnapshot: normalizeEmail(entry.managerEmailSnapshot),
                    managerPositionSnapshot: normalizePosition(entry.managerPositionSnapshot),
                    managerModeSnapshot: normalizeMode(entry.managerModeSnapshot),
                    managerChain: normalizeManagerChain(entry.managerChain),
                    managerOverrides: normalizeManagerOverrides(entry.managerOverrides),
                    allowedEmails: normalizeAllowedEmails(entry.allowedEmails),
                };
                const nextComparable = {
                    managerEmailSnapshot,
                    managerPositionSnapshot,
                    managerModeSnapshot,
                    managerChain,
                    managerOverrides,
                    allowedEmails,
                };
                if (!deepEqualViaJson(previousComparable, nextComparable)) {
                    const diffFields = [];
                    if (!deepEqualViaJson(previousComparable.managerEmailSnapshot, nextComparable.managerEmailSnapshot)) {
                        diffFields.push("managerEmailSnapshot");
                    }
                    if (!deepEqualViaJson(previousComparable.managerPositionSnapshot, nextComparable.managerPositionSnapshot)) {
                        diffFields.push("managerPositionSnapshot");
                    }
                    if (!deepEqualViaJson(previousComparable.managerModeSnapshot, nextComparable.managerModeSnapshot)) {
                        diffFields.push("managerModeSnapshot");
                    }
                    if (!deepEqualViaJson(previousComparable.managerChain, nextComparable.managerChain)) {
                        diffFields.push("managerChain");
                    }
                    if (!deepEqualViaJson(previousComparable.managerOverrides, nextComparable.managerOverrides)) {
                        diffFields.push("managerOverrides");
                    }
                    if (!deepEqualViaJson(previousComparable.allowedEmails, nextComparable.allowedEmails)) {
                        diffFields.push("allowedEmails");
                    }
                    plannedUpdates.push({
                        ref: entrySnap.ref,
                        ownerEmail,
                        ownerDocId,
                        entryId: entrySnap.id,
                        contractNumber: typeof entry.contractNumber === "string"
                            ? entry.contractNumber.trim()
                            : "",
                        entryType: typeof entry.entryType === "string" ? entry.entryType : "contract",
                        signedDateIso,
                        diffFields,
                        previous: previousComparable,
                        next: nextComparable,
                    });
                }
            }
        }
    }
    console.log(`Scanned entries: ${scannedEntries} | updates needed: ${plannedUpdates.length} | skipped missing signed date: ${skippedMissingSignedDate} | skipped unsupported product: ${skippedUnsupportedProduct}`);
    if (plannedUpdates.length > 0) {
        const diffCounts = new Map();
        plannedUpdates.forEach((item) => {
            const fields = Array.isArray(item.diffFields) ? item.diffFields : [];
            fields.forEach((field) => {
                diffCounts.set(field, (diffCounts.get(field) ?? 0) + 1);
            });
        });
        console.log("Diff field counts:");
        [
            "managerEmailSnapshot",
            "managerPositionSnapshot",
            "managerModeSnapshot",
            "managerChain",
            "managerOverrides",
            "allowedEmails",
        ].forEach((field) => {
            console.log(`- ${field}: ${diffCounts.get(field) ?? 0}`);
        });
        const allowedSample = plannedUpdates
            .filter((item) => Array.isArray(item.diffFields) && item.diffFields.includes("allowedEmails"))
            .slice(0, 5);
        if (allowedSample.length > 0) {
            console.log("AllowedEmails diff sample:");
            allowedSample.forEach((item) => {
                const prev = Array.isArray(item.previous?.allowedEmails) ? item.previous.allowedEmails : [];
                const next = Array.isArray(item.next?.allowedEmails) ? item.next.allowedEmails : [];
                const added = next.filter((email) => !prev.includes(email));
                const removed = prev.filter((email) => !next.includes(email));
                console.log(`- users/${item.ownerDocId}/entries/${item.entryId} | contract=${item.contractNumber || "—"} | added=[${added.join(",")}] | removed=[${removed.join(",")}]`);
            });
        }
        const overridesSample = plannedUpdates
            .filter((item) => Array.isArray(item.diffFields) && item.diffFields.includes("managerOverrides"))
            .slice(0, 5);
        if (overridesSample.length > 0) {
            console.log("ManagerOverrides diff sample:");
            overridesSample.forEach((item) => {
                const prev = Array.isArray(item.previous?.managerOverrides) ? item.previous.managerOverrides : [];
                const next = Array.isArray(item.next?.managerOverrides) ? item.next.managerOverrides : [];
                const prevSummary = prev
                    .map((ov) => `${ov.email ?? "null"}:${ov.total ?? 0}`)
                    .join(" | ");
                const nextSummary = next
                    .map((ov) => `${ov.email ?? "null"}:${ov.total ?? 0}`)
                    .join(" | ");
                console.log(`- users/${item.ownerDocId}/entries/${item.entryId} | contract=${item.contractNumber || "—"} | prev=${prevSummary || "none"} | next=${nextSummary || "none"}`);
            });
        }
        const chainSample = plannedUpdates
            .filter((item) => Array.isArray(item.diffFields) && (item.diffFields.includes("managerChain") || item.diffFields.includes("managerPositionSnapshot")))
            .slice(0, 5);
        if (chainSample.length > 0) {
            console.log("ManagerChain/Position diff sample:");
            chainSample.forEach((item) => {
                const prevTop = Array.isArray(item.previous?.managerChain) ? item.previous.managerChain[0] : null;
                const nextTop = Array.isArray(item.next?.managerChain) ? item.next.managerChain[0] : null;
                console.log(`- users/${item.ownerDocId}/entries/${item.entryId} | contract=${item.contractNumber || "—"} | prevPos=${item.previous?.managerPositionSnapshot ?? "null"} prevTop=${prevTop?.email ?? "null"}:${prevTop?.position ?? "null"} | nextPos=${item.next?.managerPositionSnapshot ?? "null"} nextTop=${nextTop?.email ?? "null"}:${nextTop?.position ?? "null"}`);
            });
        }
    }
    const preview = plannedUpdates.slice(0, 25);
    if (preview.length > 0) {
        console.log("Preview of updates (max 25):");
        preview.forEach((item) => {
            const mgrPos = item.next.managerPositionSnapshot ?? "null";
            const mgrEmail = item.next.managerEmailSnapshot ?? "null";
            const prevMgr = item.previous?.managerEmailSnapshot ?? "null";
            const prevPos = item.previous?.managerPositionSnapshot ?? "null";
            const prevMode = item.previous?.managerModeSnapshot ?? "null";
            const prevChainLen = Array.isArray(item.previous?.managerChain)
                ? item.previous.managerChain.length
                : 0;
            const nextChainLen = Array.isArray(item.next?.managerChain)
                ? item.next.managerChain.length
                : 0;
            const prevOverridesLen = Array.isArray(item.previous?.managerOverrides)
                ? item.previous.managerOverrides.length
                : 0;
            const nextOverridesLen = Array.isArray(item.next?.managerOverrides)
                ? item.next.managerOverrides.length
                : 0;
            const diffText = Array.isArray(item.diffFields) && item.diffFields.length > 0
                ? item.diffFields.join(",")
                : "unknown";
            console.log(`- users/${item.ownerDocId}/entries/${item.entryId} | contract=${item.contractNumber || "—"} | type=${item.entryType} | signed=${item.signedDateIso} | diffs=${diffText} | manager=${prevMgr} (${prevPos},${prevMode}) -> ${mgrEmail} (${mgrPos},${item.next?.managerModeSnapshot ?? "null"}) | chain=${prevChainLen}->${nextChainLen} | overrides=${prevOverridesLen}->${nextOverridesLen}`);
        });
    }
    if (!apply) {
        console.log("Dry run only. Re-run with --apply to write updates.");
        return;
    }
    if (plannedUpdates.length === 0) {
        console.log("No updates to apply.");
        return;
    }
    let batch = db.batch();
    let opsInBatch = 0;
    let committed = 0;
    for (const update of plannedUpdates) {
        batch.set(update.ref, {
            managerEmailSnapshot: update.next.managerEmailSnapshot,
            managerPositionSnapshot: update.next.managerPositionSnapshot,
            managerModeSnapshot: update.next.managerModeSnapshot,
            managerChain: update.next.managerChain,
            managerOverrides: update.next.managerOverrides,
            allowedEmails: update.next.allowedEmails,
        }, { merge: true });
        opsInBatch += 1;
        if (opsInBatch >= 400) {
            await batch.commit();
            committed += opsInBatch;
            batch = db.batch();
            opsInBatch = 0;
        }
    }
    if (opsInBatch > 0) {
        await batch.commit();
        committed += opsInBatch;
    }
    console.log(`Applied updates: ${committed}`);
}
main().catch((error) => {
    console.error("Backfill failed:", error?.message ?? error);
    process.exit(1);
});
