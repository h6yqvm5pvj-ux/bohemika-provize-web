#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
} from "../src/app/types/domain";
import {
  calculateAllianzAuto,
  calculateAxaCestovko,
  calculateComfortCC,
  calculateCppAuto,
  calculateCppCestovko,
  calculateCppHafan,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateCsobAuto,
  calculateDomex,
  calculateFlexi,
  calculateAllianzMujDomov,
  calculateKoopMajetekObcan,
  calculateKoopOdzam,
  calculateKoopPmop,
  calculateKooperativaAuto,
  calculateMaxEfekt,
  calculateMaxdomov,
  calculateNeon,
  calculatePillowAuto,
  calculatePillowInjury,
  calculatePillowMajetek,
  calculateSlaviaAuto,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  calculateZamex,
} from "../src/app/lib/productFormulas";
import { totalWithMultipliers } from "../src/app/lib/commissionTotals";

loadEnvConfig(process.cwd());

const POSITION_ORDER: Position[] = [
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

const PRODUCT_SET = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
  "zamex",
  "domex",
  "cpphafan",
  "pillowmajetek",
  "koopmajetekobcan",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "allianzmujdomov",
  "cppsimplex",
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "cppcestovko",
  "axacestovko",
  "comfortcc",
  "cppPPRs",
  "cppPPRbez",
]);

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type PositionTimelineEntry = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
};

type ManagerChainSnapshotEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

type ManagerOverrideSnapshot = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
  items: CommissionResultItemDTO[];
  total: number;
};

type UserRecord = {
  email: string;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
  positionTimeline: unknown;
  docIds: string[];
};

type EntryRecord = {
  entryType?: unknown;
  productKey?: unknown;
  position?: unknown;
  commissionMode?: unknown;
  contractNumber?: unknown;
  contractSignedDate?: unknown;
  policyStartDate?: unknown;
  createdAt?: unknown;
  durationYears?: unknown;
  frequencyRaw?: unknown;
  inputAmount?: unknown;
  calculationInputAmount?: unknown;
  effectiveInputAmount?: unknown;
  comfortPayment?: unknown;
  comfortGradual?: unknown;
  comfortTargetAmount?: unknown;
  managerEmailSnapshot?: unknown;
  managerPositionSnapshot?: unknown;
  managerModeSnapshot?: unknown;
  managerChain?: unknown;
  managerOverrides?: unknown;
  allowedEmails?: unknown;
};

type PlannedUpdate = {
  ref: DocumentReference;
  ownerEmail: string;
  ownerDocId: string;
  entryId: string;
  contractNumber: string;
  entryType: string;
  signedDateIso: string | null;
  next: {
    managerEmailSnapshot: string | null;
    managerPositionSnapshot: Position | null;
    managerModeSnapshot: CommissionMode | null;
    managerChain: ManagerChainSnapshotEntry[];
    managerOverrides: ManagerOverrideSnapshot[];
    allowedEmails: string[];
  };
};

function loadCredentials() {
  const rawJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
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

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

function normalizeMode(value: unknown): CommissionMode | null {
  if (value === "accelerated" || value === "standard") return value;
  return null;
}

function normalizePosition(value: unknown): Position | null {
  if (typeof value !== "string") return null;
  if (POSITION_ORDER.includes(value as Position)) return value as Position;
  return null;
}

function normalizeProduct(value: unknown): Product | null {
  if (typeof value !== "string") return null;
  if (PRODUCT_SET.has(value as Product)) return value as Product;
  return null;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function toNonNegativeNumber(value: unknown): number {
  return Math.max(0, toNumber(value));
}

function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "object" && value !== null) {
    const maybeTs = value as { toDate?: () => Date };
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

function toIsoDay(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isIsoDay(trimmed)) return trimmed;
  }
  const d = toDate(value);
  if (!d) return null;

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePositionTimeline(raw: unknown): PositionTimelineEntry[] {
  if (!Array.isArray(raw)) return [];

  const rows: PositionTimelineEntry[] = [];

  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const position = normalizePosition(row.position);
    if (!position) return;

    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || null;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : `timeline_${index}`,
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
}

function resolvePositionTimelineMatch(
  signedDate: string,
  timeline: PositionTimelineEntry[]
): PositionTimelineEntry | null {
  if (!isIsoDay(signedDate) || timeline.length === 0) return null;

  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDate) return false;
    if (row.validTo && signedDate >= row.validTo) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return bTo.localeCompare(aTo);
  });

  return candidates[0] ?? null;
}

function resolvePositionForSignedDate(
  userData: UserRecord | null | undefined,
  signedDateIso: string | null,
  fallbackPosition: Position | null
): Position | null {
  const timeline = parsePositionTimeline(userData?.positionTimeline);
  const timelineMatch =
    signedDateIso && isIsoDay(signedDateIso)
      ? resolvePositionTimelineMatch(signedDateIso, timeline)
      : null;

  return timelineMatch?.position ?? userData?.position ?? fallbackPosition ?? null;
}

function durationRange(product: Product): [number, number] {
  switch (product) {
    case "neon":
      return [1, 99];
    case "flexi":
      return [1, 80];
    case "maximaMaxEfekt":
      return [1, 80];
    default:
      return [1, 1];
  }
}

function durationFallback(product: Product): number {
  switch (product) {
    case "neon":
      return 15;
    case "flexi":
      return 30;
    case "maximaMaxEfekt":
      return 30;
    default:
      return 1;
  }
}

function normalizedDurationYears(
  product: Product,
  years: number | null | undefined
): number {
  const [min, max] = durationRange(product);
  const raw =
    typeof years === "number" && Number.isFinite(years)
      ? years
      : durationFallback(product);
  const wholeYears = Math.floor(raw);
  return Math.min(max, Math.max(min, wholeYears));
}

function paymentsPerYear(f: PaymentFrequency): number {
  if (f === "monthly") return 12;
  if (f === "quarterly") return 4;
  if (f === "semiannual") return 2;
  return 1;
}

function paymentBasedTotals(
  items: CommissionResultItemDTO[],
  multiplier: number
): { immediate: number; subsequent: number } {
  let immediate = 0;
  let subsequent = 0;

  items.forEach((it) => {
    const t = (it.title ?? "").toLowerCase();
    if (t.includes("okamžitá")) {
      immediate += it.amount ?? 0;
    } else if (t.includes("následná")) {
      subsequent += it.amount ?? 0;
    }
  });

  return {
    immediate: immediate * multiplier,
    subsequent: subsequent * multiplier,
  };
}

function allowedFrequencies(product: Product): PaymentFrequency[] {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return ["monthly"];
    case "domex":
    case "cpphafan":
      return ["quarterly", "semiannual", "annual"];
    case "pillowmajetek":
    case "koopmajetekobcan":
    case "koopodzam":
    case "kooppmop":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "pillowAuto":
    case "maxdomov":
    case "allianzmujdomov":
    case "kooperativaAuto":
    case "allianzAuto":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "cppAuto":
    case "slaviaauto":
    case "csobAuto":
    case "uniqaAuto":
    case "uniqaflotila":
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

function normalizeTitleKey(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("z platby")) return `payment-${t}`;
  if (t.includes("za rok")) return `annual-${t}`;
  if (t.includes("okamžitá")) return "immediate";
  if (t.includes("po 3")) return "po3";
  if (t.includes("po 4")) return "po4";
  if (t.includes("2.–5.")) return "nasl25";
  if (t.includes("5.–10.")) return "nasl510";
  if (t.includes("od 6.")) return "nasl6plus";
  if (t.includes("z platby")) return "subsequentByPayment";
  return t;
}

function normalizeCommissionCodeKey(code: unknown): string {
  if (typeof code !== "string") return "";
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function commissionItemDiffKey(item: CommissionResultItemDTO): string {
  const code = normalizeCommissionCodeKey(item.code);
  return code ? `code:${code}` : normalizeTitleKey(item.title ?? "");
}

function stripTotalRows(items: CommissionResultItemDTO[] = []): CommissionResultItemDTO[] {
  return items.filter((it) => {
    const code = normalizeCommissionCodeKey(it.code);
    return code !== "TOTAL" && !normalizeTitleKey(it.title ?? "").includes("celkem");
  });
}

function normalizeAmount(value: unknown): number {
  const n = toNumber(value);
  return Math.round(n * 1_000_000) / 1_000_000;
}

function normalizeResultItems(items: CommissionResultItemDTO[]): CommissionResultItemDTO[] {
  return items.map((item) => ({
    title: String(item.title ?? "").trim(),
    amount: normalizeAmount(item.amount ?? 0),
    ...(normalizeCommissionCodeKey(item.code)
      ? { code: normalizeCommissionCodeKey(item.code) }
      : {}),
    ...(typeof item.note === "string" && item.note.trim()
      ? { note: item.note.trim() }
      : {}),
  }));
}

function entryCalculationAmount(entry: EntryRecord): number {
  const fromCalculation = toNumber(entry.calculationInputAmount);
  if (fromCalculation > 0) return fromCalculation;
  const fromInput = toNumber(entry.inputAmount);
  if (fromInput > 0) return fromInput;
  const fromEffective = toNumber(entry.effectiveInputAmount);
  if (fromEffective > 0) return fromEffective;
  return 0;
}

function computeItemsForEntry(
  entry: EntryRecord,
  pos: Position | null,
  customMode?: CommissionMode | null,
  amountOverride?: number | null
): { items: CommissionResultItemDTO[]; total: number } | null {
  if (!pos) return null;
  const product = normalizeProduct(entry.productKey);
  if (!product) return null;

  const allowed = allowedFrequencies(product);
  const rawFreq = entry.frequencyRaw;
  const freq: PaymentFrequency =
    typeof rawFreq === "string" &&
    allowed.includes(rawFreq as PaymentFrequency)
      ? (rawFreq as PaymentFrequency)
      : allowed[0];

  const years =
    typeof entry.durationYears === "number" && Number.isFinite(entry.durationYears)
      ? entry.durationYears
      : null;

  const usedMode = (customMode ?? normalizeMode(entry.commissionMode) ?? "standard") as CommissionMode;
  const val =
    amountOverride == null
      ? toNonNegativeNumber(entryCalculationAmount(entry))
      : toNonNegativeNumber(amountOverride);
  const contractSignedDateIso = toIsoDay(entry.contractSignedDate);

  switch (product) {
    case "neon": {
      const y = Math.min(15, normalizedDurationYears("neon", years));
      return calculateNeon(val, pos, y, usedMode);
    }
    case "flexi": {
      const y = normalizedDurationYears("flexi", years);
      return calculateFlexi(val, pos, usedMode, y);
    }
    case "maximaMaxEfekt": {
      const y = normalizedDurationYears("maximaMaxEfekt", years);
      return calculateMaxEfekt(val, y, pos, usedMode, contractSignedDateIso);
    }
    case "pillowInjury":
      return calculatePillowInjury(val, pos, usedMode);
    case "domex":
    case "cpphafan":
    case "koopmajetekobcan":
    case "koopodzam":
    case "kooppmop":
    case "zamex": {
      const dto =
        product === "domex"
          ? calculateDomex(val, freq, pos, contractSignedDateIso)
          : product === "cpphafan"
          ? calculateCppHafan(val, freq, pos)
          : product === "koopodzam"
          ? calculateKoopOdzam(val, freq, pos)
          : product === "kooppmop"
          ? calculateKoopPmop(val, freq, pos)
          : product === "zamex"
          ? calculateZamex(val, freq, pos)
          : calculateKoopMajetekObcan(val, freq, pos);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return {
        items: filtered,
        total: totals.immediate,
      };
    }
    case "pillowmajetek":
      return calculatePillowMajetek(val, freq, pos);
    case "maxdomov": {
      const dto = calculateMaxdomov(val, freq, pos);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate };
    }
    case "allianzmujdomov":
      return calculateAllianzMujDomov(val, freq, pos);
    case "cppAuto":
      return calculateCppAuto(val, freq, pos, contractSignedDateIso);
    case "slaviaauto":
      return calculateSlaviaAuto(val, freq, pos);
    case "cppPPRbez": {
      const dto = calculateCppPPRbez(val, freq, pos);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate };
    }
    case "cppPPRs": {
      const dto = calculateCppPPRs(val, freq, pos);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate };
    }
    case "cppsimplex": {
      const dto = calculateCppSimplex(val, freq, pos);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
      return { items: filtered, total: totals.immediate };
    }
    case "allianzAuto":
      return calculateAllianzAuto(val, freq, pos, contractSignedDateIso);
    case "csobAuto":
      return calculateCsobAuto(val, freq, pos, contractSignedDateIso);
    case "uniqaAuto":
      return calculateUniqaAuto(val, freq, pos, contractSignedDateIso);
    case "uniqaflotila":
      return calculateUniqaFlotila(val, freq, pos, contractSignedDateIso);
    case "pillowAuto":
      return calculatePillowAuto(val, freq, pos, contractSignedDateIso);
    case "kooperativaAuto":
      return calculateKooperativaAuto(val, freq, pos, contractSignedDateIso);
    case "cppcestovko":
      return calculateCppCestovko(val, pos);
    case "axacestovko":
      return calculateAxaCestovko(val, pos);
    case "comfortcc":
      return calculateComfortCC({
        fee: val,
        payment: toNonNegativeNumber(entry.comfortPayment),
        targetAmount:
          entry.comfortGradual === true
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

function normalizeManagerChain(raw: unknown): ManagerChainSnapshotEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ManagerChainSnapshotEntry[] = [];
  raw.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    out.push({
      email: normalizeEmail(row.email),
      position: normalizePosition(row.position),
      commissionMode: normalizeMode(row.commissionMode),
    });
  });
  return out.filter((row) => !!row.email);
}

function normalizeManagerOverrides(raw: unknown): ManagerOverrideSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: ManagerOverrideSnapshot[] = [];
  raw.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const itemsRaw = Array.isArray(row.items) ? row.items : [];
    const items: CommissionResultItemDTO[] = itemsRaw
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const it = x as Record<string, unknown>;
        return {
          title: String(it.title ?? "").trim(),
          amount: normalizeAmount(it.amount ?? 0),
          code: normalizeCommissionCodeKey(it.code) || null,
          note: typeof it.note === "string" ? it.note.trim() : undefined,
        };
      });
    const cleaned = normalizeResultItems(stripTotalRows(items));
    out.push({
      email: normalizeEmail(row.email),
      position: normalizePosition(row.position),
      commissionMode: normalizeMode(row.commissionMode),
      items: cleaned,
      total: normalizeAmount(totalWithMultipliers(cleaned)),
    });
  });
  return out.filter((row) => !!row.email);
}

function collectChainEmailsFromUsers(
  firstManagerEmail: string,
  usersByEmail: Map<string, UserRecord>
): string[] {
  const emails: string[] = [];
  let current: string | null = firstManagerEmail;
  let depth = 0;
  const visited = new Set<string>();

  while (current && depth < 9 && !visited.has(current)) {
    visited.add(current);
    emails.push(current);
    const user = usersByEmail.get(current);
    current = user?.managerEmail ?? null;
    depth += 1;
  }

  return emails;
}

function resolveChainEmailsForEntry(
  entry: EntryRecord,
  ownerEmail: string,
  usersByEmail: Map<string, UserRecord>
): string[] {
  const chainFromEntry = normalizeManagerChain(entry.managerChain).map(
    (row) => row.email as string
  );
  if (chainFromEntry.length > 0) return chainFromEntry;

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

function buildManagerChainForEntry(
  entry: EntryRecord,
  ownerEmail: string,
  usersByEmail: Map<string, UserRecord>,
  signedDateIso: string | null
): ManagerChainSnapshotEntry[] {
  const existingChain = normalizeManagerChain(entry.managerChain);
  const chainEmails = resolveChainEmailsForEntry(entry, ownerEmail, usersByEmail);

  return chainEmails.map((email, idx) => {
    const existingNode =
      existingChain.find((node) => node.email === email) ?? existingChain[idx] ?? null;
    const userData = usersByEmail.get(email);
    const resolvedPosition = resolvePositionForSignedDate(
      userData,
      signedDateIso,
      existingNode?.position ?? null
    );
    const resolvedMode =
      existingNode?.commissionMode ??
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

function computeManagerOverridesForEntry(
  entry: EntryRecord,
  managerChain: ManagerChainSnapshotEntry[]
): ManagerOverrideSnapshot[] {
  const calculationAmount = entryCalculationAmount(entry);
  const diffs: ManagerOverrideSnapshot[] = [];
  let childPositionForBaseline: Position | null = normalizePosition(entry.position);
  const ownerMode = normalizeMode(entry.commissionMode);

  managerChain.forEach((mgr) => {
    if (!mgr.position) return;
    const mgrMode = mgr.commissionMode ?? ownerMode ?? "standard";

    const mgrRes = computeItemsForEntry(
      entry,
      mgr.position,
      mgrMode,
      calculationAmount
    );
    const baselineRes = childPositionForBaseline
      ? computeItemsForEntry(
          entry,
          childPositionForBaseline,
          mgrMode,
          calculationAmount
        )
      : null;

    if (!mgrRes || !baselineRes) {
      childPositionForBaseline = mgr.position;
      return;
    }

    const mgrItems = stripTotalRows(mgrRes.items);
    const baselineItems = stripTotalRows(baselineRes.items);

    const mgrMap = new Map<
      string,
      { title: string; amount: number; code?: string | null; note?: string | null }
    >();
    mgrItems.forEach((it) => {
      const key = commissionItemDiffKey(it);
      const prev = mgrMap.get(key);
      mgrMap.set(key, {
        title: it.title ?? prev?.title ?? key,
        amount: normalizeAmount((prev?.amount ?? 0) + (it.amount ?? 0)),
        code: it.code ?? prev?.code ?? null,
        note: it.note ?? prev?.note ?? null,
      });
    });

    const diffItems: CommissionResultItemDTO[] = [];

    baselineItems.forEach((it) => {
      const key = commissionItemDiffKey(it);
      const mgrVal = mgrMap.get(key);
      const mgrAmt = mgrVal?.amount ?? 0;
      const subAmt = it.amount ?? 0;
      const rem = normalizeAmount(mgrAmt - subAmt);
      if (rem > 0) {
        diffItems.push({
          title: mgrVal?.title ?? it.title,
          amount: rem,
          code: mgrVal?.code ?? it.code ?? null,
          ...(mgrVal?.note || it.note ? { note: mgrVal?.note ?? it.note } : {}),
        });
      }
      mgrMap.delete(key);
    });

    mgrMap.forEach((val) => {
      if (val.amount > 0) {
        diffItems.push({
          title: val.title,
          amount: normalizeAmount(val.amount),
          code: val.code ?? null,
          ...(val.note ? { note: val.note } : {}),
        });
      }
    });

    const normalizedItems = normalizeResultItems(diffItems);
    const diffTotal = normalizeAmount(totalWithMultipliers(normalizedItems));

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

function normalizeAllowedEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<string>();
  raw.forEach((item) => {
    const email = normalizeEmail(item);
    if (email) set.add(email);
  });
  return Array.from(set).sort();
}

function buildAllowedEmails(
  ownerEmail: string,
  managerEmail: string | null,
  chain: ManagerChainSnapshotEntry[],
  overrides: ManagerOverrideSnapshot[]
): string[] {
  const set = new Set<string>();
  const push = (value: unknown) => {
    const email = normalizeEmail(value);
    if (email) set.add(email);
  };

  push(ownerEmail);
  push(managerEmail);
  chain.forEach((node) => push(node.email));
  overrides.forEach((ov) => push(ov.email));

  return Array.from(set).sort();
}

function deepEqualViaJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseArgValue(args: string[], key: string): string | null {
  const pref = `${key}=`;
  const inline = args.find((arg) => arg.startsWith(pref));
  if (inline) return inline.slice(pref.length);
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

function collectSubordinates(
  managerEmail: string,
  childrenByManager: Map<string, string[]>
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const queue: string[] = [...(childrenByManager.get(managerEmail) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (visited.has(current)) continue;
    visited.add(current);
    result.push(current);
    const children = childrenByManager.get(current) ?? [];
    children.forEach((child) => {
      if (!visited.has(child)) queue.push(child);
    });
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  const managerEmail = normalizeEmail(
    parseArgValue(args, "--manager") ?? "jakub.rauscher@bohemika.eu"
  );
  if (!managerEmail) {
    throw new Error("Missing --manager email.");
  }

  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("Missing FIREBASE_ADMIN_* credentials in environment.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(credentials),
    });
  const db = getFirestore(app);

  const usersSnap = await db.collection("users").get();
  const usersByEmail = new Map<string, UserRecord>();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const normalized = normalizeEmail(data.email ?? docSnap.id);
    if (!normalized) return;

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

  const childrenByManager = new Map<string, string[]>();
  usersByEmail.forEach((user) => {
    const mgr = user.managerEmail;
    if (!mgr) return;
    const arr = childrenByManager.get(mgr) ?? [];
    arr.push(user.email);
    childrenByManager.set(mgr, Array.from(new Set(arr)));
  });

  const subordinateEmails = collectSubordinates(managerEmail, childrenByManager);
  if (subordinateEmails.length === 0) {
    console.log(`No subordinates found for ${managerEmail}.`);
    return;
  }

  console.log(
    `Manager ${managerEmail}: ${subordinateEmails.length} subordinate users found.`
  );

  const plannedUpdates: PlannedUpdate[] = [];
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
        const entry = entrySnap.data() as EntryRecord;
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

        const managerChain = buildManagerChainForEntry(
          entry,
          ownerEmail,
          usersByEmail,
          signedDateIso
        );
        const managerOverrides = computeManagerOverridesForEntry(entry, managerChain);
        const managerEmailSnapshot = managerChain[0]?.email ?? null;
        const managerPositionSnapshot = managerChain[0]?.position ?? null;
        const managerModeSnapshot = managerChain[0]?.commissionMode ?? null;
        const allowedEmails = buildAllowedEmails(
          ownerEmail,
          managerEmailSnapshot,
          managerChain,
          managerOverrides
        );

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
          plannedUpdates.push({
            ref: entrySnap.ref,
            ownerEmail,
            ownerDocId,
            entryId: entrySnap.id,
            contractNumber:
              typeof entry.contractNumber === "string"
                ? entry.contractNumber.trim()
                : "",
            entryType:
              typeof entry.entryType === "string" ? entry.entryType : "contract",
            signedDateIso,
            next: nextComparable,
          });
        }
      }
    }
  }

  console.log(
    `Scanned entries: ${scannedEntries} | updates needed: ${plannedUpdates.length} | skipped missing signed date: ${skippedMissingSignedDate} | skipped unsupported product: ${skippedUnsupportedProduct}`
  );

  const preview = plannedUpdates.slice(0, 25);
  if (preview.length > 0) {
    console.log("Preview of updates (max 25):");
    preview.forEach((item) => {
      const mgrPos = item.next.managerPositionSnapshot ?? "null";
      const mgrEmail = item.next.managerEmailSnapshot ?? "null";
      console.log(
        `- users/${item.ownerDocId}/entries/${item.entryId} | contract=${item.contractNumber || "—"} | type=${item.entryType} | signed=${item.signedDateIso} | manager=${mgrEmail} (${mgrPos})`
      );
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
    batch.set(
      update.ref,
      {
        managerEmailSnapshot: update.next.managerEmailSnapshot,
        managerPositionSnapshot: update.next.managerPositionSnapshot,
        managerModeSnapshot: update.next.managerModeSnapshot,
        managerChain: update.next.managerChain,
        managerOverrides: update.next.managerOverrides,
        allowedEmails: update.next.allowedEmails,
      },
      { merge: true }
    );

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
