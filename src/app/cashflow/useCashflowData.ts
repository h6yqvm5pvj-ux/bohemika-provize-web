"use client";

import { useEffect, useMemo, useState } from "react";

import { auth } from "../firebase";
import {
  type CommissionMode,
  type PaymentFrequency,
  type Position,
  type Product,
} from "../types/domain";
import { totalWithMultipliers } from "../lib/commissionTotals";
import { computeLegacyFrequencyOverrideTotal } from "../lib/managerOverrideTotals";
import { generateCashflow } from "./generator";
import {
  initialCashflowLoadingProgress,
  ownContractsLoadingPercent,
  type CashflowLoadingProgress,
} from "./loadingProgress";
import {
  CASHFLOW_FORECAST_YEARS,
  matchesProductFilter,
  stripTotalRows,
} from "./helpers";
import {
  addSubscriptionMonths,
  formatSubscriptionIsoDay,
  isCashflowSubscriptionPlan,
  isSubscriptionCashflowOwner,
  parseSubscriptionIsoDay,
  subscriptionIntervalMonths,
  subscriptionPeriodUntilIso,
  subscriptionPlanLabel,
  type CashflowSubscriptionPlan,
} from "./subscriptionCashflow";
import type {
  CashflowItem,
  EntryDoc,
  ProductFilter,
  ScopeFilter,
} from "./types";

type UseCashflowDataParams = {
  userEmail: string | null | undefined;
  scopeFilter: ScopeFilter;
  productFilter: ProductFilter;
  tipsterMode?: boolean;
  enabled?: boolean;
  reloadKey?: number;
};

type UseCashflowDataResult = {
  loading: boolean;
  ready: boolean;
  cashflowItems: CashflowItem[];
  hasTeam: boolean;
  loadingProgress: CashflowLoadingProgress;
};

type ContractsApiResponse = {
  ok: boolean;
  error?: string;
  position?: Position | null;
  commissionMode?: CommissionMode | null;
  hasTeam?: boolean;
  teamEmails?: string[];
  contracts?: (EntryDoc & { adviserEmail?: string | null })[];
  totalCount?: number | null;
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

type TipPayoutApiItem = {
  id?: string;
  payoutDate?: number | null;
  amount?: number;
  note?: string | null;
  productKey?: Product | null;
  frequencyRaw?: PaymentFrequency | null;
  tipsterPercent?: number | null;
  clientName?: string | null;
  sourceOwnerName?: string | null;
  sourceOwnerEmail?: string | null;
  adviserEmail?: string | null;
};

type TipPayoutsApiResponse = {
  ok: boolean;
  error?: string;
  payouts?: TipPayoutApiItem[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

type SubscriptionPaymentApiItem = {
  id?: string;
  userEmail?: string | null;
  userName?: string | null;
  plan?: CashflowSubscriptionPlan | string | null;
  amountCzk?: number | null;
  periodFrom?: string | null;
  periodUntil?: string | null;
  createdAtMs?: number | null;
  paymentDateMs?: number | null;
  note?: string | null;
};

type SubscriptionPaymentsApiResponse = {
  ok: boolean;
  error?: string;
  payments?: SubscriptionPaymentApiItem[];
  hasMore?: boolean;
};

type RawContractsSnapshot = {
  email: string;
  myPosition: Position | null;
  myCommissionMode: CommissionMode | null;
  hasAnyTeam: boolean;
  ownEntries: EntryDoc[];
  teamEntriesRaw: EntryDoc[];
  tipPayouts: TipPayoutApiItem[];
  subscriptionPayments: SubscriptionPaymentApiItem[];
};

const CONTRACTS_PAGE_LIMIT = 100;
const CONTRACTS_MAX_PAGES = 400;
const TIP_PAYOUTS_PAGE_LIMIT = 100;
const TIP_PAYOUTS_MAX_PAGES = 200;
const SUBSCRIPTION_PAYMENTS_PAGE_LIMIT = 5000;
const SUBSCRIPTION_FORECAST_YEARS = 10;
const CONTRACTS_CACHE_TTL_MS = 5 * 60 * 1000;
const CASHFLOW_MIN_LOADING_MS = 250;
const CONTRACTS_UPDATED_KEY = "contracts_last_updated";
type SnapshotMode = "standard" | "tipster";
type SnapshotProgressListener = (progress: CashflowLoadingProgress) => void;
const contractsSnapshotCache: Record<
  string,
  { ts: number; payload: RawContractsSnapshot }
> = {};
const contractsSnapshotInFlight: Partial<Record<string, Promise<RawContractsSnapshot>>> = {};
const contractsSnapshotProgressListeners = new Map<
  string,
  Set<SnapshotProgressListener>
>();

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const nameFromEmail = (email: string | null | undefined): string | null => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const local = normalized.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const normalizeCursorToken = (
  token: string | null | undefined,
  legacyCursor: number | null | undefined
): string | null => {
  if (typeof token === "string") {
    const trimmed = token.trim();
    if (trimmed) return trimmed;
  }
  if (typeof legacyCursor === "number" && Number.isFinite(legacyCursor)) {
    return String(legacyCursor);
  }
  return null;
};

const getContractsUpdatedAtMs = (): number => {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(CONTRACTS_UPDATED_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const snapshotCacheKey = (email: string, mode: SnapshotMode): string => `${email}::${mode}`;

const emitSnapshotProgress = (
  cacheKey: string,
  progress: CashflowLoadingProgress
): void => {
  contractsSnapshotProgressListeners
    .get(cacheKey)
    ?.forEach((listener) => listener(progress));
};

const formatLoadedCount = (value: number): string =>
  Math.max(0, value).toLocaleString("cs-CZ");

const isSnapshotFresh = (
  snapshotTs: number,
  updatedAtMs: number
): boolean =>
  Date.now() - snapshotTs < CONTRACTS_CACHE_TTL_MS &&
  snapshotTs >= updatedAtMs;

function stableHash(parts: string[]): string {
  let hash = 2166136261;
  const joined = parts.join("|");
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

type NormalizedSubscriptionPayment = {
  sourceId: string;
  plan: CashflowSubscriptionPlan;
  amount: number;
  paymentDate: Date;
  anchorDate: Date;
  userEmail: string | null;
  userName: string;
  periodFrom: string | null;
  periodUntil: string | null;
  note: string | null;
};

const subscriptionOccurrenceKey = (
  userKey: string,
  plan: CashflowSubscriptionPlan,
  periodFrom: string
): string => `${userKey}|${plan}|${periodFrom}`;

const validTimestampDate = (value: unknown): Date | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeSubscriptionPaymentForCashflow = (
  payment: SubscriptionPaymentApiItem,
  index: number
): NormalizedSubscriptionPayment | null => {
  const plan = isCashflowSubscriptionPlan(payment.plan) ? payment.plan : null;
  if (!plan) return null;

  const amount =
    typeof payment.amountCzk === "number" && Number.isFinite(payment.amountCzk)
      ? payment.amountCzk
      : 0;
  if (!(amount > 0)) return null;

  const periodFromDate = parseSubscriptionIsoDay(payment.periodFrom);
  const paymentDate =
    validTimestampDate(payment.paymentDateMs) ??
    validTimestampDate(payment.createdAtMs) ??
    periodFromDate;
  if (!paymentDate) return null;

  const anchorDate = periodFromDate ?? paymentDate;
  const periodFrom = periodFromDate ? formatSubscriptionIsoDay(periodFromDate) : null;
  const periodUntil =
    typeof payment.periodUntil === "string" && payment.periodUntil.trim()
      ? payment.periodUntil.trim()
      : null;
  const userEmail = normalizeEmail(payment.userEmail) || null;
  const userName =
    typeof payment.userName === "string" && payment.userName.trim()
      ? payment.userName.trim()
      : nameFromEmail(userEmail) ?? userEmail ?? "Uživatel";
  const sourceId =
    String(payment.id ?? "").trim() ||
    `subscription-${userEmail ?? "user"}-${anchorDate.getTime()}-${index}`;
  const note =
    typeof payment.note === "string" && payment.note.trim()
      ? payment.note.trim()
      : null;

  return {
    sourceId,
    plan,
    amount,
    paymentDate,
    anchorDate,
    userEmail,
    userName,
    periodFrom,
    periodUntil,
    note,
  };
};

async function fetchContractsSnapshot(
  email: string,
  mode: SnapshotMode,
  onProgress: SnapshotProgressListener
): Promise<RawContractsSnapshot> {
  onProgress({
    percent: 4,
    label: "Ověřuji přístup k datům",
    detail: null,
  });
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Nejsi přihlášený.");

  let bearerToken = await currentUser.getIdToken();

  const requestContracts = async (
    scope: "my" | "team",
    cursor?: string | null
  ): Promise<ContractsApiResponse> => {
    const params = new URLSearchParams({
      scope,
      limit: String(CONTRACTS_PAGE_LIMIT),
      shape: "cashflow",
    });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const requestWithToken = async (token: string) =>
      fetch(`/api/contracts/list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

    let res = await requestWithToken(bearerToken);
    if (res.status === 401) {
      bearerToken = await currentUser.getIdToken(true);
      res = await requestWithToken(bearerToken);
    }

    const data = (await res.json()) as ContractsApiResponse;
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || "Nepodařilo se načíst smlouvy.") as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return data;
  };

  const requestTipPayouts = async (
    cursor?: string | null
  ): Promise<TipPayoutsApiResponse> => {
    const params = new URLSearchParams({
      limit: String(TIP_PAYOUTS_PAGE_LIMIT),
    });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const requestWithToken = async (token: string) =>
      fetch(`/api/tip-payouts/list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

    let res = await requestWithToken(bearerToken);
    if (res.status === 401) {
      bearerToken = await currentUser.getIdToken(true);
      res = await requestWithToken(bearerToken);
    }

    const data = (await res.json()) as TipPayoutsApiResponse;
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || "Nepodařilo se načíst TIP výplaty.") as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return data;
  };

  const requestSubscriptionPayments = async (): Promise<SubscriptionPaymentsApiResponse> => {
    const params = new URLSearchParams({
      limit: String(SUBSCRIPTION_PAYMENTS_PAGE_LIMIT),
    });

    const requestWithToken = async (token: string) =>
      fetch(`/api/subscription-payments/list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

    let res = await requestWithToken(bearerToken);
    if (res.status === 401) {
      bearerToken = await currentUser.getIdToken(true);
      res = await requestWithToken(bearerToken);
    }

    const data = (await res.json()) as SubscriptionPaymentsApiResponse;
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || "Nepodařilo se načíst platby předplatného.") as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return data;
  };

  const collectTipPayouts = async (): Promise<TipPayoutApiItem[]> => {
    const tipPayouts: TipPayoutApiItem[] = [];
    const seenTipPayoutIds = new Set<string>();
    const seenCursorTokens = new Set<string>();
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;

    while (hasMore && pages < TIP_PAYOUTS_MAX_PAGES) {
      const response = await requestTipPayouts(cursor);
      pages += 1;

      const chunk = Array.isArray(response.payouts) ? response.payouts : [];
      if (chunk.length === 0) break;

      chunk.forEach((item) => {
        const id = String(item.id ?? "").trim();
        if (!id) return;
        if (seenTipPayoutIds.has(id)) return;
        seenTipPayoutIds.add(id);
        tipPayouts.push(item);
      });

      const nextCursor = normalizeCursorToken(
        response.nextCursorToken,
        response.nextCursor
      );
      if (nextCursor && seenCursorTokens.has(nextCursor)) {
        console.warn(
          "[cashflow] tip-payouts/list returned repeated cursor token, stopping pagination."
        );
        hasMore = false;
        break;
      }
      if (nextCursor) {
        seenCursorTokens.add(nextCursor);
      }
      cursor = nextCursor;
      hasMore = Boolean(response.hasMore) && Boolean(nextCursor);
    }

    return tipPayouts;
  };

  const collectSubscriptionPayments = async (): Promise<SubscriptionPaymentApiItem[]> => {
    if (mode === "tipster" || !isSubscriptionCashflowOwner(email)) return [];
    const response = await requestSubscriptionPayments();
    return Array.isArray(response.payments) ? response.payments : [];
  };

  type ScopeResult = {
    entries: EntryDoc[];
    positionHint: Position | null;
    commissionModeHint: CommissionMode | null;
    hasTeamHint: boolean;
    teamEmailsHint: string[];
  };

  type ScopeFirstPageHint = Pick<
    ScopeResult,
    "positionHint" | "commissionModeHint" | "hasTeamHint" | "teamEmailsHint"
  >;

  const collectScope = async (
    scope: "my" | "team",
    onFirstPage?: (hint: ScopeFirstPageHint) => void,
    onPage?: (progress: {
      loaded: number;
      total: number | null;
      done: boolean;
    }) => void
  ): Promise<ScopeResult> => {
    const entries: EntryDoc[] = [];
    const seen = new Set<string>();
    const seenCursorTokens = new Set<string>();
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;
    let positionHint: Position | null = null;
    let commissionModeHint: CommissionMode | null = null;
    let hasTeamHint = false;
    let teamEmailsHint: string[] = [];
    let totalHint: number | null = null;

    while (hasMore && pages < CONTRACTS_MAX_PAGES) {
      const response = await requestContracts(scope, cursor);
      if (pages === 0) {
        positionHint = (response.position as Position | null | undefined) ?? null;
        commissionModeHint =
          (response.commissionMode as CommissionMode | null | undefined) ?? null;
        hasTeamHint = Boolean(response.hasTeam);
        teamEmailsHint = Array.isArray(response.teamEmails)
          ? response.teamEmails.map((item) => normalizeEmail(item)).filter(Boolean)
          : [];
        totalHint =
          typeof response.totalCount === "number" &&
          Number.isFinite(response.totalCount) &&
          response.totalCount >= 0
            ? response.totalCount
            : null;
        onFirstPage?.({
          positionHint,
          commissionModeHint,
          hasTeamHint,
          teamEmailsHint,
        });
      }
      pages += 1;

      const chunk = (response.contracts ?? []) as (EntryDoc & {
        adviserEmail?: string | null;
      })[];
      if (chunk.length === 0) {
        onPage?.({ loaded: entries.length, total: totalHint, done: true });
        break;
      }

      chunk.forEach((item) => {
        const ownerEmail = normalizeEmail(
          (item.adviserEmail as string | undefined) ??
            (item.userEmail as string | undefined) ??
            email
        );
        const id = String(item.id ?? "").trim();
        if (!ownerEmail || !id) return;

        const key = `${ownerEmail}___${id}`;
        if (seen.has(key)) return;
        seen.add(key);

        entries.push({
          ...(item as any),
          id,
          userEmail: ownerEmail,
        });
      });

      const nextCursor = normalizeCursorToken(
        response.nextCursorToken,
        response.nextCursor
      );
      if (nextCursor && seenCursorTokens.has(nextCursor)) {
        console.warn(
          `[cashflow] scope=${scope} returned repeated cursor token, stopping pagination to prevent loop.`
        );
        hasMore = false;
        break;
      }
      if (nextCursor) {
        seenCursorTokens.add(nextCursor);
      }
      cursor = nextCursor;
      hasMore = Boolean(response.hasMore) && Boolean(nextCursor);
      onPage?.({
        loaded: entries.length,
        total: totalHint,
        done: !hasMore,
      });
    }

    if (pages >= CONTRACTS_MAX_PAGES && hasMore) {
      console.warn(
        `[cashflow] scope=${scope} reached pagination safety cap (${CONTRACTS_MAX_PAGES} pages).`
      );
    }

    return {
      entries,
      positionHint,
      commissionModeHint,
      hasTeamHint,
      teamEmailsHint,
    };
  };

  let teamScopePromise: Promise<ScopeResult> | null = null;
  let ownScopeComplete = false;
  let latestTeamPage: { loaded: number; total: number | null; done: boolean } | null = null;
  const reportTeamPage = (page: {
    loaded: number;
    total: number | null;
    done: boolean;
  }) => {
    latestTeamPage = page;
    if (!ownScopeComplete) return;
    const ratio =
      page.done
        ? 1
        : page.total != null && page.total > 0
          ? Math.min(0.99, page.loaded / page.total)
          : Math.min(0.9, page.loaded / 1_000);
    onProgress({
      percent: Math.round(78 + ratio * 9),
      label: "Načítám týmové provize",
      detail:
        page.total != null
          ? `${formatLoadedCount(page.loaded)} z ${formatLoadedCount(page.total)}`
          : `${formatLoadedCount(page.loaded)} načteno`,
    });
  };
  const startTeamScopePromise = (): Promise<ScopeResult> => {
    if (!teamScopePromise) {
      teamScopePromise = collectScope("team", undefined, reportTeamPage);
      teamScopePromise.catch(() => undefined);
    }
    return teamScopePromise;
  };

  const tipPayoutsPromise = collectTipPayouts().catch((tipErr) => {
    console.warn("[cashflow] načtení TIP výplat selhalo, pokračuji bez nich.", tipErr);
    return [] as TipPayoutApiItem[];
  });
  const subscriptionPaymentsPromise = collectSubscriptionPayments().catch((subscriptionErr) => {
    console.warn(
      "[cashflow] načtení plateb předplatného selhalo, pokračuji bez nich.",
      subscriptionErr
    );
    return [] as SubscriptionPaymentApiItem[];
  });

  if (mode === "tipster") {
    onProgress({
      percent: 18,
      label: "Načítám TIP provize",
      detail: null,
    });
    const tipPayouts = await tipPayoutsPromise;
    onProgress({
      percent: 96,
      label: "Počítám očekávané cashflow",
      detail: `${formatLoadedCount(tipPayouts.length)} TIP výplat`,
    });
    return {
      email,
      myPosition: null,
      myCommissionMode: null,
      hasAnyTeam: false,
      ownEntries: [],
      teamEntriesRaw: [],
      tipPayouts,
      subscriptionPayments: [],
    };
  }

  const ownResult = await collectScope(
    "my",
    (hint) => {
      if (hint.hasTeamHint || hint.teamEmailsHint.length > 0) {
        void startTeamScopePromise();
      }
    },
    ({ loaded, total, done }) => {
      onProgress({
        percent: ownContractsLoadingPercent({ loaded, total, done }),
        label: "Načítám smlouvy",
        detail:
          total != null
            ? `${formatLoadedCount(loaded)} z ${formatLoadedCount(total)}`
            : `${formatLoadedCount(loaded)} načteno`,
      });
    }
  );
  const myPosition = ownResult.positionHint ?? null;
  const myCommissionMode = ownResult.commissionModeHint ?? null;
  ownScopeComplete = true;
  onProgress({
    percent: 76,
    label: "Vlastní smlouvy načteny",
    detail: `${formatLoadedCount(ownResult.entries.length)} záznamů`,
  });
  let teamEntriesRaw: EntryDoc[] = [];
  let hasAnyTeam =
    ownResult.hasTeamHint || (ownResult.teamEmailsHint?.length ?? 0) > 0;

  if (hasAnyTeam) {
    if (latestTeamPage) {
      reportTeamPage(latestTeamPage);
    } else {
      onProgress({
        percent: 78,
        label: "Načítám týmové provize",
        detail: null,
      });
    }
    try {
      const teamResult = await (teamScopePromise ?? startTeamScopePromise());
      teamEntriesRaw = teamResult.entries;
      hasAnyTeam = hasAnyTeam || teamEntriesRaw.length > 0;
    } catch (teamError) {
      if ((teamError as { status?: number } | null)?.status === 403) {
        hasAnyTeam = false;
        teamEntriesRaw = [];
      } else {
        throw teamError;
      }
    }
  }

  onProgress({
    percent: 88,
    label: "Páruji výpisy s výplatami",
    detail: null,
  });
  const tipPayouts = await tipPayoutsPromise;
  const subscriptionPayments = await subscriptionPaymentsPromise;
  onProgress({
    percent: 96,
    label: "Počítám čisté cashflow",
    detail: `${formatLoadedCount(
      ownResult.entries.length + teamEntriesRaw.length
    )} smluvních záznamů`,
  });

  return {
    email,
    myPosition,
    myCommissionMode,
    hasAnyTeam,
    ownEntries: ownResult.entries,
    teamEntriesRaw,
    tipPayouts,
    subscriptionPayments,
  };
}

async function getContractsSnapshot(
  email: string,
  mode: SnapshotMode,
  onProgress: SnapshotProgressListener
): Promise<RawContractsSnapshot> {
  const cacheKey = snapshotCacheKey(email, mode);
  const listeners = contractsSnapshotProgressListeners.get(cacheKey) ?? new Set();
  listeners.add(onProgress);
  contractsSnapshotProgressListeners.set(cacheKey, listeners);

  try {
    const cached = contractsSnapshotCache[cacheKey];
    const updatedAtMs = getContractsUpdatedAtMs();
    if (cached && isSnapshotFresh(cached.ts, updatedAtMs)) {
      onProgress({
        percent: 96,
        label: "Používám načtená data",
        detail: null,
      });
      return cached.payload;
    }
    if (cached && !isSnapshotFresh(cached.ts, updatedAtMs)) {
      delete contractsSnapshotCache[cacheKey];
    }

    if (!contractsSnapshotInFlight[cacheKey]) {
      contractsSnapshotInFlight[cacheKey] = fetchContractsSnapshot(
        email,
        mode,
        (progress) => emitSnapshotProgress(cacheKey, progress)
      )
        .then((payload) => {
          contractsSnapshotCache[cacheKey] = { ts: Date.now(), payload };
          return payload;
        })
        .finally(() => {
          delete contractsSnapshotInFlight[cacheKey];
        });
    }

    return await contractsSnapshotInFlight[cacheKey];
  } finally {
    const currentListeners = contractsSnapshotProgressListeners.get(cacheKey);
    currentListeners?.delete(onProgress);
    if (currentListeners?.size === 0) {
      contractsSnapshotProgressListeners.delete(cacheKey);
    }
  }
}

export function useCashflowData({
  userEmail,
  scopeFilter,
  productFilter,
  tipsterMode = false,
  enabled = true,
  reloadKey = 0,
}: UseCashflowDataParams): UseCashflowDataResult {
  const snapshotMode: SnapshotMode = tipsterMode ? "tipster" : "standard";
  const [loading, setLoading] = useState(() => {
    if (!enabled || !userEmail) return false;
    const normalized = normalizeEmail(userEmail);
    const cachedRaw = contractsSnapshotCache[snapshotCacheKey(normalized, snapshotMode)];
    if (!cachedRaw) return true;
    return !isSnapshotFresh(cachedRaw.ts, getContractsUpdatedAtMs());
  });
  const [snapshot, setSnapshot] = useState<RawContractsSnapshot | null>(null);
  const [hasTeam, setHasTeam] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<CashflowLoadingProgress>(
    initialCashflowLoadingProgress
  );

  useEffect(() => {
    let finishLoadingTimer: number | null = null;
    if (!enabled || !userEmail) {
      setSnapshot(null);
      setHasTeam(false);
      setLoading(false);
      setReady(false);
      setLoadingProgress(initialCashflowLoadingProgress());
      return;
    }

    let cancelled = false;

    const load = async () => {
      const normalized = normalizeEmail(userEmail);
      const cacheKey = snapshotCacheKey(normalized, snapshotMode);
      const forceReload = reloadKey > 0;
      if (forceReload) {
        delete contractsSnapshotCache[cacheKey];
      }
      const cachedRaw = contractsSnapshotCache[cacheKey];
      const updatedAtMs = getContractsUpdatedAtMs();
      const cached =
        cachedRaw && !forceReload && isSnapshotFresh(cachedRaw.ts, updatedAtMs)
          ? cachedRaw
          : undefined;
      if (cachedRaw && !cached) {
        delete contractsSnapshotCache[cacheKey];
      }
      const hasCachedPayload = Boolean(cached?.payload);
      const loadingStartedAt = hasCachedPayload ? 0 : Date.now();
      if (cached?.payload) {
        setSnapshot(cached.payload);
        setHasTeam(cached.payload.hasAnyTeam);
        setReady(true);
      }
      setLoading(!hasCachedPayload);
      if (!hasCachedPayload) {
        setReady(false);
        setLoadingProgress(initialCashflowLoadingProgress());
      }

      try {
        const emailRaw = userEmail.trim();
        const email = emailRaw.toLowerCase();
        if (!email) throw new Error("Chybí e-mail uživatele");
        const payload = await getContractsSnapshot(email, snapshotMode, (progress) => {
          if (cancelled) return;
          setLoadingProgress((current) =>
            progress.percent >= current.percent ? progress : current
          );
        });
        if (cancelled) return;
        setLoadingProgress({
          percent: 98,
          label: "Skládám provize do měsíců",
          detail: null,
        });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        if (cancelled) return;
        setSnapshot(payload);
        setHasTeam(payload.hasAnyTeam);
        setReady(true);
      } catch (error) {
        console.error("Chyba při načítání cashflow:", error);
        if (!hasCachedPayload) {
          setSnapshot(null);
          setHasTeam(false);
        }
        setReady(true);
      } finally {
        if (cancelled) return;
        if (hasCachedPayload) {
          setLoading(false);
          return;
        }
        const elapsed = Date.now() - loadingStartedAt;
        const remaining = Math.max(0, CASHFLOW_MIN_LOADING_MS - elapsed);
        if (remaining > 0) {
          finishLoadingTimer = window.setTimeout(() => {
            if (cancelled) return;
            setLoading(false);
          }, remaining);
          return;
        }
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (finishLoadingTimer != null) {
        window.clearTimeout(finishLoadingTimer);
      }
    };
  }, [userEmail, enabled, snapshotMode, reloadKey]);

  const currentEmail = normalizeEmail(userEmail);
  const snapshotMatchesCurrentUser = Boolean(
    snapshot && currentEmail && normalizeEmail(snapshot.email) === currentEmail
  );
  const dataReady = ready && (!snapshot || snapshotMatchesCurrentUser);
  const cashflowItems = useMemo<CashflowItem[]>(() => {
    if (!enabled || !snapshot || !snapshotMatchesCurrentUser) return [];

    const email = snapshot.email;
    const entryWasTransferred = (entry: EntryDoc): boolean => {
      const originalOwner = normalizeEmail(entry.originalAdviserEmail);
      const currentOwner = normalizeEmail(
        entry.servicingOwnerEmail ?? entry.commissionOwnerEmail ?? entry.userEmail
      );
      return Boolean(
        originalOwner && currentOwner && originalOwner !== currentOwner
      );
    };
    const transferredContractPosition = (entry: EntryDoc): Position | null =>
      (entry.originalPosition as Position | null | undefined) ??
      (entry.position as Position | null | undefined) ??
      null;
    const predictionModeForEntry = (
      entry: EntryDoc,
      source: "own" | "manager"
    ): CommissionMode =>
      source === "manager" && matchesProductFilter(entry.productKey, "life")
        ? "standard"
        : (entryWasTransferred(entry)
            ? (entry.commissionMode as CommissionMode | null | undefined) ??
              (entry.mode as CommissionMode | null | undefined)
            : snapshot.myCommissionMode) ??
          (entry.commissionMode as CommissionMode | null | undefined) ??
          (entry.mode as CommissionMode | null | undefined) ??
          "standard";
    const currentOwnerPosition = (entry: EntryDoc): Position | null =>
      (entry.ownerCurrentPosition as Position | null | undefined) ??
      (entry.effectivePosition as Position | null | undefined) ??
      (entry.timelinePosition as Position | null | undefined) ??
      (entry.position as Position | null | undefined) ??
      null;
    const allEntriesByKey = new Map<string, EntryDoc>();
    const pushEntry = (entry: EntryDoc) => {
      const ownerEmail = normalizeEmail(entry.userEmail);
      const docId = String(entry.id ?? "").trim();
      if (!ownerEmail || !docId) return;
      const key = `${ownerEmail}___${docId}`;
      if (allEntriesByKey.has(key)) return;
      allEntriesByKey.set(key, {
        ...(entry as any),
        id: docId,
        userEmail: ownerEmail,
      });
    };

    snapshot.ownEntries.forEach(pushEntry);
    snapshot.teamEntriesRaw.forEach(pushEntry);

    const allEntries = Array.from(allEntriesByKey.values());
    const ownEntries = allEntries
      .filter((entry) => (entry.userEmail ?? "").toLowerCase() === email)
      .map((entry) => ({
        ...entry,
        source: "own" as const,
        predictionPosition:
          (entryWasTransferred(entry)
            ? transferredContractPosition(entry)
            : snapshot.myPosition) ??
          (entry.effectivePosition as Position | null | undefined) ??
          (entry.timelinePosition as Position | null | undefined) ??
          (entry.position as Position | null | undefined) ??
          null,
        predictionBaselinePosition: null,
        predictionCommissionMode: predictionModeForEntry(entry, "own"),
      }));
    const teamRaw = snapshot.teamEntriesRaw;

    const overrides: EntryDoc[] = [];
    if (teamRaw.length > 0) {
      for (const entry of teamRaw) {
        const storedOverride =
          (entry.managerOverrides as EntryDoc["managerOverrides"])?.find(
            (override) => (override.email ?? "").toLowerCase() === email
          ) ?? null;

        if (!storedOverride) continue;

        const storedOverrideItems = stripTotalRows(storedOverride.items ?? []);
        const storedOverrideTotal = computeLegacyFrequencyOverrideTotal({
          productKey: (entry.productKey as Product | null | undefined) ?? null,
          frequencyRaw: (entry.frequencyRaw as PaymentFrequency | null | undefined) ?? null,
          items: storedOverrideItems,
          fallbackTotal: totalWithMultipliers(storedOverrideItems),
        });
        if (storedOverrideItems.length === 0 || storedOverrideTotal <= 0) continue;

        const storedOverridePosition =
          (storedOverride.position as Position | null | undefined) ??
          (entry.managerPositionSnapshot as Position | null | undefined) ??
          null;

        overrides.push({
          ...entry,
          originalEntryId: entry.id,
          id: `${entry.id}-override`,
          items: storedOverrideItems,
          total: storedOverrideTotal,
          source: "manager",
          position: storedOverridePosition ?? null,
          predictionPosition: snapshot.myPosition ?? storedOverridePosition ?? null,
          predictionBaselinePosition: currentOwnerPosition(entry),
          predictionCommissionMode: predictionModeForEntry(entry, "manager"),
          managerPositionSnapshot: storedOverridePosition ?? null,
          managerModeSnapshot:
            (storedOverride.commissionMode as EntryDoc["managerModeSnapshot"]) ??
            (entry.managerModeSnapshot as EntryDoc["managerModeSnapshot"]) ??
            null,
          clientName: entry.clientName ?? null,
        });
      }
    }

    let entriesForCashflow: EntryDoc[] = [];
    if (scopeFilter === "own") {
      entriesForCashflow = ownEntries;
    } else if (scopeFilter === "team") {
      entriesForCashflow = overrides;
    } else {
      entriesForCashflow = [...ownEntries, ...overrides];
    }

    if (tipsterMode || productFilter === "tip") {
      entriesForCashflow = [];
    } else if (productFilter !== "all") {
      entriesForCashflow = entriesForCashflow.filter((entry) => {
        return matchesProductFilter(entry.productKey, productFilter);
      });
    }

    const generatedCashflow = generateCashflow(
      entriesForCashflow,
      CASHFLOW_FORECAST_YEARS,
      email
    );
    const includeTipPayouts =
      tipsterMode ||
      productFilter === "tip" ||
      (productFilter === "all" && scopeFilter !== "team");
    const tipCashflowItems: CashflowItem[] = includeTipPayouts
      ? snapshot.tipPayouts.reduce<CashflowItem[]>((acc, payout, index) => {
          const payoutTs =
            typeof payout.payoutDate === "number" && Number.isFinite(payout.payoutDate)
              ? payout.payoutDate
              : null;
          if (payoutTs == null) return acc;
          const payoutDate = new Date(payoutTs);
          if (Number.isNaN(payoutDate.getTime())) return acc;

          const amount =
            typeof payout.amount === "number" && Number.isFinite(payout.amount)
              ? payout.amount
              : 0;
          if (!(amount > 0)) return acc;

          const productKey =
            typeof payout.productKey === "string" && payout.productKey.trim()
              ? (payout.productKey as Product)
              : "unknown";
          const tipSourceAdviserEmail =
            normalizeEmail(payout.sourceOwnerEmail ?? payout.adviserEmail) || null;
          const tipSourceAdviserName =
            typeof payout.sourceOwnerName === "string" && payout.sourceOwnerName.trim()
              ? payout.sourceOwnerName.trim()
              : nameFromEmail(tipSourceAdviserEmail);
          const clientName =
            typeof payout.clientName === "string" && payout.clientName.trim()
              ? payout.clientName.trim()
              : null;
          const note =
            typeof payout.note === "string" && payout.note.trim()
              ? payout.note.trim()
              : "TIP provize";
          const id = String(payout.id ?? "").trim() || `tip-${payoutTs}-${index}`;

          acc.push({
            id: `tip-${id}`,
            date: payoutDate,
            amount,
            productKey,
            note,
            frequency: (payout.frequencyRaw as PaymentFrequency | null | undefined) ?? null,
            source: "own",
            contractNumber: null,
            clientName,
            ownerEmail: null,
            entryId: null,
            isTipPayout: true,
            tipSourceAdviserEmail,
            tipSourceAdviserName,
          });
          return acc;
        }, [])
      : [];
    const includeSubscriptionPayments =
      isSubscriptionCashflowOwner(email) &&
      !tipsterMode &&
      scopeFilter !== "team" &&
      (productFilter === "all" || productFilter === "subscription");
    const subscriptionCashflowItems: CashflowItem[] = includeSubscriptionPayments
      ? (() => {
          const normalizedPayments = snapshot.subscriptionPayments
            .map((payment, index) =>
              normalizeSubscriptionPaymentForCashflow(payment, index)
            )
            .filter((payment): payment is NormalizedSubscriptionPayment =>
              Boolean(payment)
            );

          const actualOccurrenceKeys = new Set<string>();
          const latestPaymentByUser = new Map<string, NormalizedSubscriptionPayment>();
          const items: CashflowItem[] = [];

          normalizedPayments.forEach((payment) => {
            const userKey = payment.userEmail ?? payment.sourceId;
            const actualPeriodFrom =
              payment.periodFrom ?? formatSubscriptionIsoDay(payment.anchorDate);
            actualOccurrenceKeys.add(
              subscriptionOccurrenceKey(userKey, payment.plan, actualPeriodFrom)
            );

            const existingLatest = latestPaymentByUser.get(userKey);
            if (
              !existingLatest ||
              payment.anchorDate.getTime() > existingLatest.anchorDate.getTime() ||
              (
                payment.anchorDate.getTime() === existingLatest.anchorDate.getTime() &&
                payment.paymentDate.getTime() > existingLatest.paymentDate.getTime()
              )
            ) {
              latestPaymentByUser.set(userKey, payment);
            }

            const periodLabel =
              payment.periodFrom && payment.periodUntil
                ? ` (${payment.periodFrom} - ${payment.periodUntil})`
                : "";
            const note =
              payment.note ??
              `${subscriptionPlanLabel(payment.plan)} předplatné${periodLabel}`;

            items.push({
              id: `subscription-${payment.sourceId}`,
              date: payment.paymentDate,
              amount: payment.amount,
              productKey: "subscription",
              note,
              frequency: null,
              source: "own",
              contractNumber: null,
              clientName: payment.userName,
              ownerEmail: null,
              entryId: null,
              commissionLabel: "Platba předplatného",
              isSubscriptionPayment: true,
              subscriptionPlan: payment.plan,
              subscriptionUserEmail: payment.userEmail,
              subscriptionUserName: payment.userName,
              subscriptionPeriodFrom: payment.periodFrom,
              subscriptionPeriodUntil: payment.periodUntil,
              payoutStatus: "paid",
            });
          });

          const forecastHorizonEnd = new Date();
          forecastHorizonEnd.setFullYear(
            forecastHorizonEnd.getFullYear() + SUBSCRIPTION_FORECAST_YEARS
          );

          latestPaymentByUser.forEach((payment, userKey) => {
            const intervalMonths = subscriptionIntervalMonths(payment.plan);
            let occurrenceDate = addSubscriptionMonths(payment.anchorDate, intervalMonths);

            for (let guard = 0; guard < SUBSCRIPTION_FORECAST_YEARS * 12; guard += 1) {
              if (occurrenceDate > forecastHorizonEnd) break;

              const periodFrom = formatSubscriptionIsoDay(occurrenceDate);
              const occurrenceKey = subscriptionOccurrenceKey(
                userKey,
                payment.plan,
                periodFrom
              );
              const periodUntil = subscriptionPeriodUntilIso(
                occurrenceDate,
                payment.plan
              );

              if (!actualOccurrenceKeys.has(occurrenceKey)) {
                items.push({
                  id: `subscription-${payment.sourceId}-forecast-${periodFrom}`,
                  date: occurrenceDate,
                  amount: payment.amount,
                  productKey: "subscription",
                  note: `${subscriptionPlanLabel(payment.plan)} předplatné (${periodFrom} - ${periodUntil})`,
                  frequency: null,
                  source: "own",
                  contractNumber: null,
                  clientName: payment.userName,
                  ownerEmail: null,
                  entryId: null,
                  commissionLabel: "Platba předplatného",
                  isSubscriptionPayment: true,
                  subscriptionPlan: payment.plan,
                  subscriptionUserEmail: payment.userEmail,
                  subscriptionUserName: payment.userName,
                  subscriptionPeriodFrom: periodFrom,
                  subscriptionPeriodUntil: periodUntil,
                  payoutStatus: "predicted",
                });
              }

              occurrenceDate = addSubscriptionMonths(occurrenceDate, intervalMonths);
            }
          });

          return items;
        })()
      : [];
    const cashflow = [...generatedCashflow, ...tipCashflowItems, ...subscriptionCashflowItems].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    if (process.env.NODE_ENV !== "production") {
      const total = cashflow.reduce((sum, item) => sum + item.amount, 0);
      const entryFingerprint = stableHash(
        entriesForCashflow
          .map((entry) =>
            `${entry.source ?? "na"}:${(entry.userEmail ?? "").toLowerCase()}:${
              entry.originalEntryId ?? entry.id
            }`
          )
          .sort((a, b) => a.localeCompare(b, "cs"))
      );
      console.info("[cashflow-debug]", {
        email,
        scopeFilter,
        productFilter,
        tipsterMode,
        myPosition: snapshot.myPosition,
        hasAnyTeam: snapshot.hasAnyTeam,
        allEntries: allEntries.length,
        ownEntries: ownEntries.length,
        teamRaw: teamRaw.length,
        overrides: overrides.length,
        entriesForCashflow: entriesForCashflow.length,
        tipPayouts: snapshot.tipPayouts.length,
        tipCashflowItems: tipCashflowItems.length,
        subscriptionPayments: snapshot.subscriptionPayments.length,
        subscriptionCashflowItems: subscriptionCashflowItems.length,
        cashflowItems: cashflow.length,
        total,
        entryFingerprint,
      });
    }

    return cashflow;
  }, [enabled, productFilter, scopeFilter, snapshot, snapshotMatchesCurrentUser, tipsterMode]);

  return {
    loading,
    ready: dataReady,
    cashflowItems,
    hasTeam: snapshotMatchesCurrentUser ? hasTeam : false,
    loadingProgress,
  };
}
