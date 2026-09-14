"use client";

import { useEffect, useMemo, useState } from "react";

import { auth } from "../firebase";
import {
  type CommissionMode,
  type Position,
} from "../types/domain";
import {
  computeCashflow,
  type CashflowSnapshot,
  type SubscriptionPaymentApiItem,
  type TipPayoutApiItem,
} from "./computeCashflow";
import {
  initialCashflowLoadingProgress,
  ownContractsLoadingPercent,
  type CashflowLoadingProgress,
} from "./loadingProgress";
import { isSubscriptionCashflowOwner } from "./subscriptionCashflow";
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
  deferCalculation?: boolean;
};

type UseCashflowDataResult = {
  rawSnapshot: CashflowSnapshot | null;
  calculationDeferred: boolean;
  loading: boolean;
  ready: boolean;
  cashflowItems: CashflowItem[];
  verificationInput: { snapshot: CashflowSnapshot; asOf: Date } | null;
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

type TipPayoutsApiResponse = {
  ok: boolean;
  error?: string;
  payouts?: TipPayoutApiItem[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

type SubscriptionPaymentsApiResponse = {
  ok: boolean;
  error?: string;
  payments?: SubscriptionPaymentApiItem[];
  hasMore?: boolean;
};

const CONTRACTS_PAGE_LIMIT = 100;
const CONTRACTS_MAX_PAGES = 400;
const TIP_PAYOUTS_PAGE_LIMIT = 100;
const TIP_PAYOUTS_MAX_PAGES = 200;
const SUBSCRIPTION_PAYMENTS_PAGE_LIMIT = 5000;
const CONTRACTS_CACHE_TTL_MS = 5 * 60 * 1000;
const CONTRACTS_UPDATED_KEY = "contracts_last_updated";
type SnapshotMode = "standard" | "tipster";
type SnapshotProgressListener = (progress: CashflowLoadingProgress) => void;
const contractsSnapshotCache: Record<
  string,
  { ts: number; payload: CashflowSnapshot }
> = {};
const contractsSnapshotInFlight: Partial<Record<string, Promise<CashflowSnapshot>>> = {};
const contractsSnapshotProgressListeners = new Map<
  string,
  Set<SnapshotProgressListener>
>();

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

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

async function fetchContractsSnapshot(
  email: string,
  mode: SnapshotMode,
  onProgress: SnapshotProgressListener
): Promise<CashflowSnapshot> {
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
): Promise<CashflowSnapshot> {
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
  deferCalculation = false,
}: UseCashflowDataParams): UseCashflowDataResult {
  const snapshotMode: SnapshotMode = tipsterMode ? "tipster" : "standard";
  const [loading, setLoading] = useState(() => {
    if (!enabled || !userEmail) return false;
    const normalized = normalizeEmail(userEmail);
    const cachedRaw = contractsSnapshotCache[snapshotCacheKey(normalized, snapshotMode)];
    if (!cachedRaw) return true;
    return !isSnapshotFresh(cachedRaw.ts, getContractsUpdatedAtMs());
  });
  const [snapshot, setSnapshot] = useState<CashflowSnapshot | null>(null);
  const [hasTeam, setHasTeam] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<CashflowLoadingProgress>(
    initialCashflowLoadingProgress
  );

  useEffect(() => {
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
        if (cancelled) return;
        console.error("Chyba při načítání cashflow:", error);
        if (!hasCachedPayload) {
          setSnapshot(null);
          setHasTeam(false);
        }
        setReady(true);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userEmail, enabled, snapshotMode, reloadKey]);

  const currentEmail = normalizeEmail(userEmail);
  const snapshotMatchesCurrentUser = Boolean(
    snapshot && currentEmail && normalizeEmail(snapshot.email) === currentEmail
  );
  const dataReady = ready && (!snapshot || snapshotMatchesCurrentUser);
  const rawSnapshot = enabled && snapshotMatchesCurrentUser ? snapshot : null;
  // Small portfolios keep their existing synchronous display path.
  const calculationDeferred = Boolean(deferCalculation && rawSnapshot &&
    rawSnapshot.ownEntries.length + rawSnapshot.teamEntriesRaw.length >= 200);
  const { cashflowItems, verificationInput } = useMemo(() => {
    if (calculationDeferred || !enabled || !snapshot || !snapshotMatchesCurrentUser) {
      return { cashflowItems: [], verificationInput: null };
    }

    const asOf = new Date();
    const items = computeCashflow(snapshot, { scopeFilter, productFilter, tipsterMode, asOf });
    if (process.env.NODE_ENV !== "production") {
      console.info("[cashflow-debug]", {
        email: snapshot.email,
        scopeFilter,
        productFilter,
        tipsterMode,
        myPosition: snapshot.myPosition,
        hasAnyTeam: snapshot.hasAnyTeam,
        ownEntries: snapshot.ownEntries.length,
        teamRaw: snapshot.teamEntriesRaw.length,
        tipPayouts: snapshot.tipPayouts.length,
        subscriptionPayments: snapshot.subscriptionPayments.length,
        cashflowItems: items.length,
        total: items.reduce((sum, item) => sum + item.amount, 0),
      });
    }
    return { cashflowItems: items, verificationInput: { snapshot, asOf } };
  }, [calculationDeferred, enabled, productFilter, scopeFilter, snapshot, snapshotMatchesCurrentUser, tipsterMode]);

  return {
    loading,
    ready: dataReady,
    rawSnapshot,
    calculationDeferred,
    cashflowItems,
    verificationInput,
    hasTeam: snapshotMatchesCurrentUser ? hasTeam : false,
    loadingProgress,
  };
}
