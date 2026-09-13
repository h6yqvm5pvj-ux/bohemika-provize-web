import { isInheritedContract } from "@/app/lib/inheritedContracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { summarizeProductionPremiums, type ProductionPremiums } from "./productionPremiums";

import { auth } from "@/app/firebase";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
  type MaxCizinKomplexVariant,
} from "@/app/types/domain";
import {
  entrySignedDate,
} from "./homeUtils";
import { sumImmediateCommissionItems } from "@/app/lib/commissionTotals";
import {
  clearPersistedHomeCache,
  readPersistedHomeCache,
  writePersistedHomeCache,
} from "./homeCacheStorage";

export type EntryDoc = {
  acquisitionType?: "inherited" | null;
  id: string;
  userEmail?: string | null;
  adviserName?: string | null;
  createdAt?: any;
  contractSignedDate?: any;
  items?: CommissionResultItemDTO[];
  managerOverrides?: ManagerOverrideSnapshot[];
  managerChain?: { email?: string | null; position?: Position | null; commissionMode?: CommissionMode | null }[];
  managerModeSnapshot?: CommissionMode | null;

  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: PaymentFrequency | null;
  durationYears?: number | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
  commissionMode?: CommissionMode | null;
  position?: Position | null;
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
  comfortTargetAmount?: number | null;
};

export type UserMeta = {
  position?: Position;
  commissionMode?: CommissionMode | null;
  monthlyGoal?: number | null;
  managerEmail?: string | null;
};

export type ManagerOverrideSnapshot = {
  email?: string | null;
  position?: Position | null;
  commissionMode?: CommissionMode | null;
  items?: CommissionResultItemDTO[];
  total?: number | null;
};

type HomeCachePayload = {
  userMeta: UserMeta | null;
  myEntries: EntryDoc[];
  teamEntries: EntryDoc[];
  hasTeam: boolean;
  myPremiums: ProductionPremiums;
  teamPremiums: ProductionPremiums;
  myContractsCount: number;
  myImmediateSum: number;
  myImmediatePrevSum: number;
  myTipContractsCount: number;
  myTipImmediateSum: number;
  myTipImmediatePrevSum: number;
  teamContractsCount: number;
  teamImmediateSum: number;
  teamImmediatePrevSum: number;
};

export type HomeDataState = {
  userMeta: UserMeta | null;
  setUserMeta: React.Dispatch<React.SetStateAction<UserMeta | null>>;
  myEntries: EntryDoc[];
  teamEntries: EntryDoc[];
  hasTeam: boolean;
  myPremiums: ProductionPremiums;
  teamPremiums: ProductionPremiums;
  myContractsCount: number;
  myImmediateSum: number;
  myImmediatePrevSum: number;
  myTipContractsCount: number;
  myTipImmediateSum: number;
  myTipImmediatePrevSum: number;
  teamContractsCount: number;
  teamImmediateSum: number;
  teamImmediatePrevSum: number;
  summaryLoading: boolean;
  tipSummaryLoading: boolean;
  tipSummaryError: string | null;
  historyLoading: boolean;
  loading: boolean;
};

type UseHomeDataOptions = {
  email: string | null;
  loadPersonalHistory: boolean;
  /** Zero keeps the initial request to the current/previous-month summary. */
  teamHistoryMonths: number;
  /** The profile request that opens the page already knows this for managers. */
  initialHasTeam?: boolean;
  reloadKey?: number;
};

type ContractsApiResponse = {
  ok: boolean;
  error?: string;
  position?: Position | null;
  hasTeam?: boolean;
  teamEmails?: string[];
  contracts?: (EntryDoc & { adviserEmail?: string | null; adviserName?: string | null })[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

type TipPayoutApiItem = {
  id?: string;
  payoutDate?: number | null;
  amount?: number;
  sourceToken?: string | null;
  sourceContractSignedDate?: number | null;
};

type TipPayoutsApiResponse = {
  ok: boolean;
  error?: string;
  payouts?: TipPayoutApiItem[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};
type TipSummary = { tipContractsCount: number; tipImmediateSum: number; tipImmediatePrevSum: number };

type UserProfileApiResponse = {
  ok?: boolean;
  error?: string;
  profile?: {
    position?: Position | null;
    commissionMode?: CommissionMode | null;
    monthlyGoal?: number | null;
  };
};

const HOME_CACHE_TTL_MS = 5 * 60 * 1000;
// v5 could persist an apparent TIP zero after a failed request.
const HOME_CACHE_VERSION = "v6-complete-tip-production";
const homeDataCache: Record<string, { ts: number; payload: HomeCachePayload }> = {};
const TEAM_HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const teamHistoryRangeCache = new Map<
  string,
  { ts: number; entries: EntryDoc[] }
>();

export const invalidateHomeCache = (email?: string | null) => {
  if (!email) return;
  const normalizedEmail = email.toLowerCase();
  const keyPart = `|${normalizedEmail}|`;
  Object.keys(homeDataCache).forEach((key) => {
    if (key.includes(keyPart)) {
      delete homeDataCache[key];
    }
  });
  Array.from(teamHistoryRangeCache.keys()).forEach((key) => {
    if (key.startsWith(`${normalizedEmail}|`)) {
      teamHistoryRangeCache.delete(key);
    }
  });

  clearPersistedHomeCache(normalizedEmail);
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

const normalizeTeamHistoryMonths = (months: number): number =>
  Math.max(0, Math.min(12, Math.floor(months)));

const teamHistoryRangeCacheKey = (email: string, months: number, uid: string): string => {
  const now = new Date();
  return `${email.toLowerCase()}|${uid}|${now.getFullYear()}-${now.getMonth()}|${normalizeTeamHistoryMonths(months)}`;
};

const fetchTeamHistoryRange = async (
  email: string,
  months: number,
  signal: AbortSignal
): Promise<EntryDoc[]> => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Nejsi přihlášený.");

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const safeMonths = normalizeTeamHistoryMonths(months);
  const rangeStart =
    safeMonths > 0
      ? new Date(currentYear, currentMonth - safeMonths, 1)
      : new Date(currentYear, currentMonth - 1, 1);
  const rangeEnd = new Date(currentYear, currentMonth + 1, 1);
  const rangeStartMs = rangeStart.getTime();
  let bearerToken = await currentUser.getIdToken();
  const entries: EntryDoc[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let hasMore = true;
  let pages = 0;

  while (hasMore && pages < 60) {
    if (signal.aborted) throw new DOMException("Home request cancelled", "AbortError");
    const params = new URLSearchParams({
      scope: "team",
      shape: "home",
      limit: "50",
      signedFrom: String(rangeStartMs),
    });
    if (cursor) params.set("cursor", cursor);

    const requestWithToken = async (token: string) =>
      fetch(`/api/contracts/list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal,
      });

    let response = await requestWithToken(bearerToken);
    if (response.status === 401) {
      bearerToken = await currentUser.getIdToken(true);
      response = await requestWithToken(bearerToken);
    }

    const payload = (await response.json()) as ContractsApiResponse;
    if (!response.ok || payload.ok === false) {
      const error = new Error(
        payload.error || "Nepodařilo se načíst historii týmové produkce."
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    pages += 1;
    const chunk = payload.contracts ?? [];
    if (chunk.length === 0) break;

    let oldestTsOnPage: number | null = null;
    chunk.forEach((item) => {
      const owner = (
        item.adviserEmail ?? item.userEmail ?? email
      ).toLowerCase();
      const id = String(item.id ?? "").trim();
      if (!owner || !id) return;

      const key = `${owner}___${id}`;
      if (seen.has(key)) return;
      seen.add(key);

      const mapped: EntryDoc = {
        ...item,
        id,
        userEmail: owner,
      };
      const signed = entrySignedDate(mapped);
      if (!signed || signed < rangeStart || signed >= rangeEnd) return;

      entries.push(mapped);
      const signedTs = signed.getTime();
      if (oldestTsOnPage == null || signedTs < oldestTsOnPage) {
        oldestTsOnPage = signedTs;
      }
    });

    cursor = normalizeCursorToken(payload.nextCursorToken, payload.nextCursor);
    hasMore = Boolean(payload.hasMore) && Boolean(cursor);
    if (oldestTsOnPage != null && oldestTsOnPage < rangeStartMs) break;
  }

  return entries;
};

export function useHomeData({
  email,
  loadPersonalHistory,
  teamHistoryMonths,
  initialHasTeam = false,
  reloadKey = 0,
}: UseHomeDataOptions): HomeDataState {
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);
  const [myEntries, setMyEntries] = useState<EntryDoc[]>([]);
  const [teamEntries, setTeamEntries] = useState<EntryDoc[]>([]);
  const [hasTeam, setHasTeam] = useState(false);
  const [myPremiums, setMyPremiums] = useState<ProductionPremiums>({ lifeMonthly: 0, otherAnnual: 0 });
  const [teamPremiums, setTeamPremiums] = useState<ProductionPremiums>({ lifeMonthly: 0, otherAnnual: 0 });
  const [myContractsCount, setMyContractsCount] = useState(0);
  const [myImmediateSum, setMyImmediateSum] = useState(0);
  const [myImmediatePrevSum, setMyImmediatePrevSum] = useState(0);
  const [myTipContractsCount, setMyTipContractsCount] = useState(0);
  const [myTipImmediateSum, setMyTipImmediateSum] = useState(0);
  const [myTipImmediatePrevSum, setMyTipImmediatePrevSum] = useState(0);
  const [teamContractsCount, setTeamContractsCount] = useState(0);
  const [teamImmediateSum, setTeamImmediateSum] = useState(0);
  const [teamImmediatePrevSum, setTeamImmediatePrevSum] = useState(0);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [tipSummaryLoading, setTipSummaryLoading] = useState(true);
  const [tipSummaryError, setTipSummaryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const baseLoadKeyRef = useRef<string | null>(null);
  const baseLoadCompletedRef = useRef(false);
  const uid = auth.currentUser?.uid ?? "";
  const identity = email ? `${uid}|${email.toLowerCase()}` : null;
  const [stateIdentity, setStateIdentity] = useState(identity);
  const activeIdentity = useRef<string | null>(null);
  if (stateIdentity !== identity) {
    setStateIdentity(identity);
    setUserMeta(null);
    setMyEntries([]);
    setTeamEntries([]);
    setHasTeam(false);
    setMyPremiums({ lifeMonthly: 0, otherAnnual: 0 });
    setTeamPremiums({ lifeMonthly: 0, otherAnnual: 0 });
    setMyContractsCount(0);
    setMyImmediateSum(0);
    setMyImmediatePrevSum(0);
    setMyTipContractsCount(0);
    setMyTipImmediateSum(0);
    setMyTipImmediatePrevSum(0);
    setTeamContractsCount(0);
    setTeamImmediateSum(0);
    setTeamImmediatePrevSum(0);
    setSummaryLoading(Boolean(identity));
    setTipSummaryLoading(Boolean(identity));
    setTipSummaryError(null);
    setHistoryLoading(Boolean(identity));
    setLoading(Boolean(identity));
  }
  useLayoutEffect(() => {
    activeIdentity.current = identity;
    return () => { if (activeIdentity.current === identity) activeIdentity.current = null; };
  }, [identity]);

  useEffect(() => {
    if (!email) {
      baseLoadKeyRef.current = null;
      baseLoadCompletedRef.current = false;
      return;
    }

    const baseLoadKey = `${identity}|${initialHasTeam ? "team" : "solo"}|${
      loadPersonalHistory ? "history" : "summary"
    }|${reloadKey}`;
    const rangeOnlyChange =
      baseLoadKeyRef.current === baseLoadKey && baseLoadCompletedRef.current;

    if (rangeOnlyChange) {
      let rangeCancelled = false;
      const rangeController = new AbortController();
      const rangeIsCurrent = () => !rangeCancelled && activeIdentity.current === identity && (auth.currentUser?.uid ?? "") === uid;
      const safeMonths = normalizeTeamHistoryMonths(teamHistoryMonths);
      const cacheKey = teamHistoryRangeCacheKey(email, safeMonths, uid);
      const cached = teamHistoryRangeCache.get(cacheKey);

      if (cached && Date.now() - cached.ts < TEAM_HISTORY_CACHE_TTL_MS) {
        setTeamEntries(cached.entries);
        setHistoryLoading(false);
        return () => {
          rangeCancelled = true;
          rangeController.abort();
        };
      }

      setHistoryLoading(true);
      void fetchTeamHistoryRange(email, safeMonths, rangeController.signal)
        .then((entries) => {
          if (!rangeIsCurrent()) return;
          teamHistoryRangeCache.set(cacheKey, { ts: Date.now(), entries });
          setTeamEntries(entries);
        })
        .catch((error) => {
          if (!rangeIsCurrent()) return;
          if ((error as { status?: number } | null)?.status === 403) {
            setTeamEntries([]);
          } else {
            console.error("Chyba při načítání historie týmové produkce:", error);
          }
        })
        .finally(() => {
          if (rangeIsCurrent()) setHistoryLoading(false);
        });

      return () => {
        rangeCancelled = true;
        rangeController.abort();
      };
    }

    baseLoadKeyRef.current = baseLoadKey;
    baseLoadCompletedRef.current = false;
    let cancelled = false;
    const controller = new AbortController();
    let tipUpdatesAllowed = true;
    let tipSettled = false;
    const isCurrent = () => !cancelled && activeIdentity.current === identity && (auth.currentUser?.uid ?? "") === uid;
    const assertCurrent = () => { if (!isCurrent()) throw new DOMException("Home request cancelled", "AbortError"); };

    const applyCachedHomeState = (payload: HomeCachePayload) => {
      if (!isCurrent()) return;
      setUserMeta(payload.userMeta);
      setMyEntries(payload.myEntries);
      setTeamEntries(payload.teamEntries);
      setHasTeam(payload.hasTeam);
      setMyPremiums(payload.myPremiums);
      setTeamPremiums(payload.teamPremiums);
      setMyContractsCount(payload.myContractsCount);
      setMyImmediateSum(payload.myImmediateSum);
      setMyImmediatePrevSum(payload.myImmediatePrevSum ?? 0);
      setMyTipContractsCount(payload.myTipContractsCount ?? 0);
      setMyTipImmediateSum(payload.myTipImmediateSum ?? 0);
      setMyTipImmediatePrevSum(payload.myTipImmediatePrevSum ?? 0);
      setTeamContractsCount(payload.teamContractsCount);
      setTeamImmediateSum(payload.teamImmediateSum);
      setTeamImmediatePrevSum(payload.teamImmediatePrevSum ?? 0);
      setTipSummaryLoading(false);
      setTipSummaryError(null);
    };

    const load = async () => {
      let fallbackPayload: HomeCachePayload | null = null;
      let position: Position | undefined;
      let monthlyGoal: number | null | undefined;
      let myMode: CommissionMode | null = null;

      const loadViaContractsApi = async (
        cacheKey: string
      ): Promise<HomeCachePayload | null> => {
        assertCurrent();
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Nejsi přihlášený.");
        }

        let bearerToken = await currentUser.getIdToken();
        assertCurrent();
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthStart = new Date(currentYear, currentMonth, 1);
        const previousMonthStart = new Date(currentYear, currentMonth - 1, 1);
        const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
        const personalRangeStart = loadPersonalHistory
          ? new Date(currentYear, currentMonth - 11, 1)
          : monthStart;
        const safeTeamHistoryMonths = normalizeTeamHistoryMonths(teamHistoryMonths);
        const loadTeamHistory = safeTeamHistoryMonths > 0;
        const teamRangeStart = loadTeamHistory
          ? new Date(currentYear, currentMonth - safeTeamHistoryMonths, 1)
          : monthStart;
        const summaryRangeStartMs = previousMonthStart.getTime();
        const personalRangeStartMs = personalRangeStart.getTime();
        const teamRangeStartMs = teamRangeStart.getTime();

        const requestContracts = async (
          scope: "my" | "team",
          cursor?: string | null,
          signedFromMs?: number
        ): Promise<ContractsApiResponse> => {
          assertCurrent();
          const params = new URLSearchParams({ scope, limit: "50" });
          params.set("shape", "home");
          if (Number.isFinite(signedFromMs)) {
            params.set("signedFrom", String(signedFromMs));
          }
          if (cursor) params.set("cursor", cursor);

          const requestWithToken = async (token: string) =>
            fetch(`/api/contracts/list?${params.toString()}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
              signal: controller.signal,
            });

          let res = await requestWithToken(bearerToken);
          if (res.status === 401) {
            bearerToken = await currentUser.getIdToken(true);
            res = await requestWithToken(bearerToken);
          }

          const data = (await res.json()) as ContractsApiResponse;
          assertCurrent();
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
          assertCurrent();
          const params = new URLSearchParams({ limit: "100", shape: "home", payoutFrom: String(summaryRangeStartMs),
            productionFrom: String(summaryRangeStartMs), productionTo: String(nextMonthStart.getTime()) });
          if (cursor) params.set("cursor", cursor);

          const requestWithToken = async (token: string) =>
            fetch(`/api/tip-payouts/list?${params.toString()}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
              signal: controller.signal,
            });

          let res = await requestWithToken(bearerToken);
          if (res.status === 401) {
            bearerToken = await currentUser.getIdToken(true);
            res = await requestWithToken(bearerToken);
          }

          const data = (await res.json()) as TipPayoutsApiResponse;
          assertCurrent();
          if (!res.ok || data.ok !== true || !Array.isArray(data.payouts) || typeof data.hasMore !== "boolean") {
            const err = new Error(
              data.error || "Nepodařilo se načíst TIP výplaty."
            ) as Error & { status?: number };
            err.status = res.status;
            throw err;
          }
          return data;
        };

        const collectTipSummaryForRecentMonths = async (): Promise<TipSummary> => {
          const tipSourcesInCurrentMonth = new Set<string>();
          let tipImmediateSum = 0;
          let tipImmediatePrevSum = 0;
          let cursor: string | null = null;
          let hasMore = true;
          let pages = 0;
          const seenCursors = new Set<string>();

          while (hasMore && pages < 60) {
            const response = await requestTipPayouts(cursor);
            pages += 1;
            const chunk = Array.isArray(response.payouts) ? response.payouts : [];

            chunk.forEach((item) => {
              const signedTs =
                typeof item.sourceContractSignedDate === "number" &&
                Number.isFinite(item.sourceContractSignedDate)
                  ? item.sourceContractSignedDate
                  : null;
              const payoutTs =
                typeof item.payoutDate === "number" && Number.isFinite(item.payoutDate)
                  ? item.payoutDate
                  : null;
              const productionTs = signedTs ?? payoutTs;
              if (productionTs == null) return;
              if (productionTs < previousMonthStart.getTime()) {
                return;
              }
              const amount =
                typeof item.amount === "number" && Number.isFinite(item.amount)
                  ? item.amount
                  : 0;
              if (!(amount > 0)) return;
              if (
                productionTs >= previousMonthStart.getTime() &&
                productionTs < monthStart.getTime()
              ) {
                tipImmediatePrevSum += amount;
                return;
              }
              if (
                productionTs < monthStart.getTime() ||
                productionTs >= nextMonthStart.getTime()
              ) {
                return;
              }
              const sourceToken =
                typeof item.sourceToken === "string" && item.sourceToken.trim()
                  ? item.sourceToken.trim()
                  : `payout:${String(item.id ?? "").trim() || String(payoutTs ?? "")}`;
              tipSourcesInCurrentMonth.add(sourceToken);
              tipImmediateSum += amount;
            });

            cursor = normalizeCursorToken(
              response.nextCursorToken,
              response.nextCursor
            );
            hasMore = response.hasMore === true;
            if (hasMore && (!cursor || seenCursors.has(cursor))) throw new Error("Neúplné stránkování TIP produkce.");
            if (cursor) seenCursors.add(cursor);
          }
          if (hasMore) throw new Error("Načtení TIP produkce není úplné.");

          return {
            tipContractsCount: tipSourcesInCurrentMonth.size,
            tipImmediateSum,
            tipImmediatePrevSum,
          };
        };

        let freshSummaryReady = false;
        let stagedTipSummary: TipSummary | null = null;
        const publishTipState = () => {
          if (!isCurrent() || !tipUpdatesAllowed) return;
          if (!tipSettled) {
            setTipSummaryLoading(true);
            setTipSummaryError(null);
          } else if (stagedTipSummary) {
            setMyTipContractsCount(stagedTipSummary.tipContractsCount);
            setMyTipImmediateSum(stagedTipSummary.tipImmediateSum);
            setMyTipImmediatePrevSum(stagedTipSummary.tipImmediatePrevSum);
            setTipSummaryLoading(false);
            setTipSummaryError(null);
          } else {
            setTipSummaryLoading(false);
            setTipSummaryError("TIP produkci se nepodařilo načíst. Obnovte prosím stránku.");
          }
        };
        // A seeded result stays coherent until the fresh regular summary is
        // ready. Never combine a new TIP amount with cached own/team amounts.
        const tipSummaryPromise = collectTipSummaryForRecentMonths().then(value => {
          tipSettled = true;
          stagedTipSummary = value;
          if (freshSummaryReady) publishTipState();
          return value;
        }, () => {
          tipSettled = true;
          if (freshSummaryReady) publishTipState();
          return null;
        });

        type ScopeCollection = {
          entries: EntryDoc[];
          hasTeamHint: boolean;
          teamEmailsHint: string[];
          positionHint: Position | null;
        };

        const collectScope = async (
          scope: "my" | "team",
          rangeStartMs: number
        ): Promise<ScopeCollection> => {
          const entries: EntryDoc[] = [];
          const seen = new Set<string>();
          let cursor: string | null = null;
          let hasMore = true;
          let pages = 0;
          let hasTeamHint = false;
          let teamEmailsHint: string[] = [];
          let positionHint: Position | null = null;

          while (hasMore && pages < 60) {
            const response = await requestContracts(scope, cursor, rangeStartMs);
            if (pages === 0) {
              hasTeamHint = Boolean(response.hasTeam);
              teamEmailsHint = Array.isArray(response.teamEmails)
                ? response.teamEmails.map((it) => (it ?? "").toLowerCase()).filter(Boolean)
                : [];
              positionHint = (response.position as Position | null | undefined) ?? null;
            }
            pages += 1;

            const chunk = (response.contracts ?? []) as (EntryDoc & {
              adviserEmail?: string | null;
              adviserName?: string | null;
            })[];
            if (chunk.length === 0) break;

            let oldestTsOnPage: number | null = null;
            chunk.forEach((item) => {
              const owner = (
                (item.adviserEmail as string | undefined) ??
                (item.userEmail as string | undefined) ??
                email ??
                ""
              )
                .toString()
                .toLowerCase();
              const id = String(item.id ?? "").trim();
              if (!owner || !id) return;

              const key = `${owner}___${id}`;
              if (seen.has(key)) return;
              seen.add(key);

              const mapped: EntryDoc = {
                ...(item as any),
                id,
                userEmail: owner,
              };
              entries.push(mapped);

              const signed = entrySignedDate(mapped);
              if (!signed) return;
              const ts = signed.getTime();
              if (!Number.isFinite(ts)) return;
              if (oldestTsOnPage == null || ts < oldestTsOnPage) {
                oldestTsOnPage = ts;
              }
            });

            cursor = normalizeCursorToken(response.nextCursorToken, response.nextCursor);
            hasMore = Boolean(response.hasMore) && Boolean(cursor);

            if (!hasMore) break;
            if (oldestTsOnPage != null && oldestTsOnPage < rangeStartMs) break;
          }

          return { entries, hasTeamHint, teamEmailsHint, positionHint };
        };

        const summarizeOwnRange = (
          entries: EntryDoc[],
          rangeStart: Date,
          rangeEnd: Date
        ) => {
          let count = 0;
          let immediate = 0;
          entries.forEach((data) => {
            if (isInheritedContract(data)) return;
            const signed = entrySignedDate(data);
            if (!signed) return;
            if (signed < rangeStart || signed >= rangeEnd) return;
            count += 1;

            immediate += sumImmediateCommissionItems(
              (data.items ?? []) as CommissionResultItemDTO[]
            );
          });
          return { count, immediate };
        };

        const summarizeTeamRange = (
          entries: EntryDoc[],
          rangeStart: Date,
          rangeEnd: Date
        ) => {
          let count = 0;
          let immediate = 0;
          entries.forEach((data) => {
            if (isInheritedContract(data)) return;
            const signed = entrySignedDate(data);
            if (!signed) return;
            if (!(signed >= rangeStart && signed < rangeEnd)) return;
            count += 1;

            const override = (data.managerOverrides as ManagerOverrideSnapshot[] | undefined)?.find(
              (o) => (o.email ?? "").toLowerCase() === email
            );
            if (!override) return;
            const overrideItems = (override.items ?? []) as CommissionResultItemDTO[];
            const overrideImmediate = sumImmediateCommissionItems(overrideItems);
            if (overrideItems.length > 0) {
              immediate += overrideImmediate;
            } else if (Number.isFinite(override.total)) {
              immediate += override.total as number;
            }
          });
          return { count, immediate };
        };

        // Fáze 1: rychlé souhrny za aktuální měsíc (UI dostane čísla co nejdřív).
        // U manažera známe existenci týmu už z profilu, proto jsou obě
        // nezávislá čtení souběžná. U staršího profilu zůstává původní postup.
        let teamSummaryPromise: Promise<ScopeCollection> | null = initialHasTeam
          ? collectScope("team", summaryRangeStartMs)
          : null;
        if (teamSummaryPromise) {
          void teamSummaryPromise.catch(() => undefined);
        }
        const loadTeamSummary = () => {
          if (!teamSummaryPromise) {
            teamSummaryPromise = collectScope("team", summaryRangeStartMs);
          }
          return teamSummaryPromise;
        };

        const ownSummaryResult = await collectScope("my", summaryRangeStartMs);
        if (!position && ownSummaryResult.positionHint) {
          position = ownSummaryResult.positionHint;
        }

        let hasTeamValue =
          ownSummaryResult.hasTeamHint || (ownSummaryResult.teamEmailsHint?.length ?? 0) > 0;
        let teamSummaryEntries: EntryDoc[] = [];
        if (hasTeamValue) {
          try {
            const teamSummaryResult = await loadTeamSummary();
            teamSummaryEntries = teamSummaryResult.entries;
            hasTeamValue = hasTeamValue || teamSummaryEntries.length > 0;
          } catch (teamErr) {
            if ((teamErr as { status?: number } | null)?.status === 403) {
              hasTeamValue = false;
              teamSummaryEntries = [];
            } else {
              throw teamErr;
            }
          }
        }

        const ownMonth = summarizeOwnRange(
          ownSummaryResult.entries,
          monthStart,
          nextMonthStart
        );
        const ownPrevMonth = summarizeOwnRange(
          ownSummaryResult.entries,
          previousMonthStart,
          monthStart
        );
        const teamMonth = summarizeTeamRange(
          teamSummaryEntries,
          monthStart,
          nextMonthStart
        );
        const teamPrevMonth = summarizeTeamRange(
          teamSummaryEntries,
          previousMonthStart,
          monthStart
        );
        const ownPremiums = summarizeProductionPremiums(ownSummaryResult.entries, monthStart, nextMonthStart);
        const teamPremiums = summarizeProductionPremiums(teamSummaryEntries, monthStart, nextMonthStart);
        if (isCurrent()) {
          freshSummaryReady = true;
          setHasTeam(hasTeamValue);
          setMyPremiums(ownPremiums);
          setTeamPremiums(teamPremiums);
          setMyContractsCount(ownMonth.count);
          setMyImmediateSum(ownMonth.immediate);
          setMyImmediatePrevSum(ownPrevMonth.immediate);
          setTeamContractsCount(teamMonth.count);
          setTeamImmediateSum(teamMonth.immediate);
          setTeamImmediatePrevSum(teamPrevMonth.immediate);
          setSummaryLoading(false);
          setLoading(false);
          publishTipState();
        }
        assertCurrent();

        // Fáze 2: historie pro graf/leaderboard (může doběhnout později)
        const ownHistoryResult =
          loadPersonalHistory && personalRangeStartMs < summaryRangeStartMs
            ? await collectScope("my", personalRangeStartMs)
            : ownSummaryResult;

        let teamHistoryEntriesAll: EntryDoc[] = teamSummaryEntries;
        if (hasTeamValue && loadTeamHistory && teamRangeStartMs < summaryRangeStartMs) {
          try {
            const teamHistoryResult = await collectScope("team", teamRangeStartMs);
            teamHistoryEntriesAll = teamHistoryResult.entries;
          } catch (teamErr) {
            if ((teamErr as { status?: number } | null)?.status === 403) {
              hasTeamValue = false;
              teamHistoryEntriesAll = [];
            } else {
              throw teamErr;
            }
          }
        }

        const filteredTeamEntries = loadTeamHistory
          ? teamHistoryEntriesAll.filter((data) => {
              const signed = entrySignedDate(data);
              if (!signed) return false;
              return signed >= teamRangeStart && signed < nextMonthStart;
            })
          : teamSummaryEntries;

        assertCurrent();
        const ownHistoryEntries = loadPersonalHistory ? ownHistoryResult.entries : [];
        setMyEntries(ownHistoryEntries);
        setTeamEntries(filteredTeamEntries);
        setHasTeam(hasTeamValue);
        setHistoryLoading(false);
        teamHistoryRangeCache.set(
          teamHistoryRangeCacheKey(email, safeTeamHistoryMonths, uid),
          { ts: Date.now(), entries: filteredTeamEntries }
        );
        // History and regular production are usable while TIP is still loading.
        // Only the complete result may become the shared/persisted home cache.
        const tipSummary = await tipSummaryPromise;
        assertCurrent();
        if (!tipSummary) return null;

        const payload: HomeCachePayload = {
          userMeta: {
            position,
            commissionMode: myMode,
            monthlyGoal: monthlyGoal ?? null,
          },
          myEntries: ownHistoryEntries,
          teamEntries: filteredTeamEntries,
          hasTeam: hasTeamValue,
          myPremiums: ownPremiums,
          teamPremiums,
          myContractsCount: ownMonth.count,
          myImmediateSum: ownMonth.immediate,
          myImmediatePrevSum: ownPrevMonth.immediate,
          myTipContractsCount: tipSummary.tipContractsCount,
          myTipImmediateSum: tipSummary.tipImmediateSum,
          myTipImmediatePrevSum: tipSummary.tipImmediatePrevSum,
          teamContractsCount: teamMonth.count,
          teamImmediateSum: teamMonth.immediate,
          teamImmediatePrevSum: teamPrevMonth.immediate,
        };

        homeDataCache[cacheKey] = {
          ts: Date.now(),
          payload,
        };
        writePersistedHomeCache(cacheKey, payload);
        return payload;
      };

      try {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const forceReload = reloadKey > 0;

        const safeTeamHistoryMonths = normalizeTeamHistoryMonths(teamHistoryMonths);
        const cacheKey = `${HOME_CACHE_VERSION}|${uid}|${email}|${currentYear}-${currentMonth}|${loadPersonalHistory ? "hist" : "nohist"}|team-${safeTeamHistoryMonths}`;
        const cached = homeDataCache[cacheKey];
        if (cached?.payload) {
          fallbackPayload = cached.payload;
        }
        const seededFromMemory = Boolean(
          !forceReload && cached && Date.now() - cached.ts < HOME_CACHE_TTL_MS
        );
        if (seededFromMemory && cached) {
          applyCachedHomeState(cached.payload);
        }

        const persisted = readPersistedHomeCache<HomeCachePayload>(cacheKey);
        if (persisted?.payload) {
          fallbackPayload = persisted.payload;
        }
        const seededFromPersist = Boolean(
          !forceReload && persisted && Date.now() - persisted.ts < HOME_CACHE_TTL_MS
        );
        if (!seededFromMemory && seededFromPersist && persisted) {
          homeDataCache[cacheKey] = persisted;
          applyCachedHomeState(persisted.payload);
        }

        if (!seededFromMemory && !seededFromPersist) {
          setLoading(true);
          setSummaryLoading(true);
          setHistoryLoading(true);
          setTipSummaryLoading(true);
          setTipSummaryError(null);
        } else {
          setLoading(false);
          setSummaryLoading(false);
          setHistoryLoading(false);
        }

        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            // HomePage profil načítá ještě před spuštěním tohoto hooku. Sdílená
            // cache proto odstraní druhé stejné HTTP/Firebase čtení a pokud
            // cache není k dispozici, bezpečně provede původní načtení.
            const profilePayload = (await getUserProfileCached(currentUser, {
              maxAgeMs: 60 * 1000,
            })) as UserProfileApiResponse;
            if (profilePayload?.ok === false) {
              throw new Error(profilePayload.error || "API user-profile selhalo.");
            }

            const profile = profilePayload?.profile ?? {};
            if (typeof profile.position === "string") {
              position = profile.position as Position;
            }
            if (profile.commissionMode === "accelerated" || profile.commissionMode === "standard") {
              myMode = profile.commissionMode;
            }
            if (typeof profile.monthlyGoal === "number" && Number.isFinite(profile.monthlyGoal)) {
              monthlyGoal = profile.monthlyGoal;
            } else {
              monthlyGoal = null;
            }
          }
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.info("[home] profile read failed", err);
          }
        }

        assertCurrent();
        if (isCurrent()) {
          setUserMeta({
            position,
            commissionMode: myMode,
            monthlyGoal: monthlyGoal ?? null,
          });
        }
        const payload = await loadViaContractsApi(cacheKey);
        if (isCurrent() && payload) {
          applyCachedHomeState(payload);
          setSummaryLoading(false);
          setHistoryLoading(false);
        }
      } catch (e) {
        if (!isCurrent()) return;
        tipUpdatesAllowed = false;
        controller.abort();
        console.error("Chyba při načítání produkce:", e);
        if (fallbackPayload) {
          applyCachedHomeState(fallbackPayload);
          setSummaryLoading(false);
          setHistoryLoading(false);
        } else {
          setTipSummaryLoading(false);
          setTipSummaryError("TIP produkci se nepodařilo načíst. Obnovte prosím stránku.");
        }
      } finally {
        if (isCurrent()) {
          baseLoadCompletedRef.current = true;
          setLoading(false);
          setSummaryLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [email, identity, uid, initialHasTeam, loadPersonalHistory, reloadKey, teamHistoryMonths]);

  return {
    userMeta,
    setUserMeta,
    myEntries,
    teamEntries,
    hasTeam,
    myPremiums,
    teamPremiums,
    myContractsCount,
    myImmediateSum,
    myImmediatePrevSum,
    myTipContractsCount,
    myTipImmediateSum,
    myTipImmediatePrevSum,
    teamContractsCount,
    teamImmediateSum,
    teamImmediatePrevSum,
    summaryLoading,
    tipSummaryLoading,
    tipSummaryError,
    historyLoading,
    loading,
  };
}
