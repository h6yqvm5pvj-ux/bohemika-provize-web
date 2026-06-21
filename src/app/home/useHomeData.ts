import { useEffect, useState } from "react";

import { auth } from "@/app/firebase";
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

export type EntryDoc = {
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
  historyLoading: boolean;
  loading: boolean;
};

type UseHomeDataOptions = {
  email: string | null;
  loadPersonalHistory: boolean;
  loadTeamHistory: boolean;
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
const HOME_CACHE_STORAGE_PREFIX = "home.cache:";
const homeDataCache: Record<string, { ts: number; payload: HomeCachePayload }> = {};

export const invalidateHomeCache = (email?: string | null) => {
  if (!email) return;
  const prefix = `${email.toLowerCase()}|`;
  Object.keys(homeDataCache).forEach((key) => {
    if (key.startsWith(prefix)) {
      delete homeDataCache[key];
    }
  });

  if (typeof window !== "undefined") {
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(HOME_CACHE_STORAGE_PREFIX)) {
        const val = k.slice(HOME_CACHE_STORAGE_PREFIX.length);
        if (val.startsWith(prefix)) {
          toDelete.push(k);
        }
      }
    }
    toDelete.forEach((k) => window.localStorage.removeItem(k));
  }
};

const readPersistedHomeCache = (
  cacheKey: string
): { ts: number; payload: HomeCachePayload } | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${HOME_CACHE_STORAGE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; payload?: HomeCachePayload };
    if (typeof parsed.ts !== "number" || !parsed.payload) return null;
    return { ts: parsed.ts, payload: parsed.payload };
  } catch {
    return null;
  }
};

const writePersistedHomeCache = (cacheKey: string, payload: HomeCachePayload) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${HOME_CACHE_STORAGE_PREFIX}${cacheKey}`,
      JSON.stringify({ ts: Date.now(), payload })
    );
  } catch {
    // ignore storage errors
  }
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

export function useHomeData({
  email,
  loadPersonalHistory,
  loadTeamHistory,
}: UseHomeDataOptions): HomeDataState {
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);
  const [myEntries, setMyEntries] = useState<EntryDoc[]>([]);
  const [teamEntries, setTeamEntries] = useState<EntryDoc[]>([]);
  const [hasTeam, setHasTeam] = useState(false);
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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    const applyCachedHomeState = (payload: HomeCachePayload) => {
      if (cancelled) return;
      setUserMeta(payload.userMeta);
      setMyEntries(payload.myEntries);
      setTeamEntries(payload.teamEntries);
      setHasTeam(payload.hasTeam);
      setMyContractsCount(payload.myContractsCount);
      setMyImmediateSum(payload.myImmediateSum);
      setMyImmediatePrevSum(payload.myImmediatePrevSum ?? 0);
      setMyTipContractsCount(payload.myTipContractsCount ?? 0);
      setMyTipImmediateSum(payload.myTipImmediateSum ?? 0);
      setMyTipImmediatePrevSum(payload.myTipImmediatePrevSum ?? 0);
      setTeamContractsCount(payload.teamContractsCount);
      setTeamImmediateSum(payload.teamImmediateSum);
      setTeamImmediatePrevSum(payload.teamImmediatePrevSum ?? 0);
    };

    const load = async () => {
      let fallbackPayload: HomeCachePayload | null = null;
      let position: Position | undefined;
      let monthlyGoal: number | null | undefined;
      let myMode: CommissionMode | null = null;

      const loadViaContractsApi = async (
        cacheKey: string
      ): Promise<HomeCachePayload> => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Nejsi přihlášený.");
        }

        let bearerToken = await currentUser.getIdToken();
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthStart = new Date(currentYear, currentMonth, 1);
        const previousMonthStart = new Date(currentYear, currentMonth - 1, 1);
        const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
        const personalRangeStart = loadPersonalHistory
          ? new Date(currentYear, currentMonth - 11, 1)
          : monthStart;
        const teamRangeStart = loadTeamHistory
          ? new Date(currentYear, currentMonth - 11, 1)
          : monthStart;
        const summaryRangeStartMs = previousMonthStart.getTime();
        const personalRangeStartMs = personalRangeStart.getTime();
        const teamRangeStartMs = teamRangeStart.getTime();

        const requestContracts = async (
          scope: "my" | "team",
          cursor?: string | null,
          signedFromMs?: number
        ): Promise<ContractsApiResponse> => {
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
          const params = new URLSearchParams({ limit: "100" });
          params.set("payoutFrom", String(summaryRangeStartMs));
          if (cursor) params.set("cursor", cursor);

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
            const err = new Error(
              data.error || "Nepodařilo se načíst TIP výplaty."
            ) as Error & { status?: number };
            err.status = res.status;
            throw err;
          }
          return data;
        };

        const collectTipSummaryForRecentMonths = async (): Promise<{
          tipContractsCount: number;
          tipImmediateSum: number;
          tipImmediatePrevSum: number;
        }> => {
          const tipSourcesInCurrentMonth = new Set<string>();
          let tipImmediateSum = 0;
          let tipImmediatePrevSum = 0;
          let cursor: string | null = null;
          let hasMore = true;
          let pages = 0;

          while (hasMore && pages < 60) {
            const response = await requestTipPayouts(cursor);
            pages += 1;
            const chunk = Array.isArray(response.payouts) ? response.payouts : [];
            if (chunk.length === 0) break;

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
            hasMore = Boolean(response.hasMore) && Boolean(cursor);
          }

          return {
            tipContractsCount: tipSourcesInCurrentMonth.size,
            tipImmediateSum,
            tipImmediatePrevSum,
          };
        };

        const tipSummaryPromise = collectTipSummaryForRecentMonths().catch(
          (tipErr) => {
            console.warn(
              "[home] načtení TIP výplat selhalo, pokračuji bez nich.",
              tipErr
            );
            return {
              tipContractsCount: 0,
              tipImmediateSum: 0,
              tipImmediatePrevSum: 0,
            };
          }
        );

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
            const signed = entrySignedDate(data);
            if (!signed) return;
            if (signed < rangeStart || signed >= rangeEnd) return;
            count += 1;

            const items = (data.items ?? []) as CommissionResultItemDTO[];
            const immediateItem = items.find((it) =>
              (it.title ?? "").toLowerCase().includes("okamžitá provize")
            );
            immediate += immediateItem?.amount ?? 0;
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
            const signed = entrySignedDate(data);
            if (!signed) return;
            if (!(signed >= rangeStart && signed < rangeEnd)) return;
            count += 1;

            const override = (data.managerOverrides as ManagerOverrideSnapshot[] | undefined)?.find(
              (o) => (o.email ?? "").toLowerCase() === email
            );
            if (!override) return;
            const overrideItems = (override.items ?? []) as CommissionResultItemDTO[];
            const overrideImmediate =
              overrideItems.find((it) =>
                (it.title ?? "").toLowerCase().includes("okamžitá")
              )?.amount ?? (Number.isFinite(override.total) ? (override.total as number) : null);
            if (overrideImmediate != null) {
              immediate += overrideImmediate;
            }
          });
          return { count, immediate };
        };

        // Fáze 1: rychlé souhrny za aktuální měsíc (UI dostane čísla co nejdřív)
        const ownSummaryResult = await collectScope("my", summaryRangeStartMs);
        if (!position && ownSummaryResult.positionHint) {
          position = ownSummaryResult.positionHint;
        }

        let hasTeamValue =
          ownSummaryResult.hasTeamHint || (ownSummaryResult.teamEmailsHint?.length ?? 0) > 0;
        let teamSummaryEntries: EntryDoc[] = [];
        if (hasTeamValue) {
          try {
            const teamSummaryResult = await collectScope("team", summaryRangeStartMs);
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
        const tipSummary = await tipSummaryPromise;

        if (!cancelled) {
          setHasTeam(hasTeamValue);
          setMyContractsCount(ownMonth.count);
          setMyImmediateSum(ownMonth.immediate);
          setMyImmediatePrevSum(ownPrevMonth.immediate);
          setMyTipContractsCount(tipSummary.tipContractsCount);
          setMyTipImmediateSum(tipSummary.tipImmediateSum);
          setMyTipImmediatePrevSum(tipSummary.tipImmediatePrevSum);
          setTeamContractsCount(teamMonth.count);
          setTeamImmediateSum(teamMonth.immediate);
          setTeamImmediatePrevSum(teamPrevMonth.immediate);
          setSummaryLoading(false);
          setLoading(false);
        }

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
          : [];

        const payload: HomeCachePayload = {
          userMeta: {
            position,
            commissionMode: myMode,
            monthlyGoal: monthlyGoal ?? null,
          },
          myEntries: loadPersonalHistory ? ownHistoryResult.entries : [],
          teamEntries: filteredTeamEntries,
          hasTeam: hasTeamValue,
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

        if (!cancelled) {
          setMyEntries(payload.myEntries);
          setTeamEntries(payload.teamEntries);
          setHasTeam(payload.hasTeam);
          setHistoryLoading(false);
        }

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

        const cacheKey = `${email}|${currentYear}-${currentMonth}|${loadPersonalHistory ? "hist" : "nohist"}|${loadTeamHistory ? "teamhist" : "noteamhist"}`;
        const cached = homeDataCache[cacheKey];
        if (cached?.payload) {
          fallbackPayload = cached.payload;
        }
        const seededFromMemory = Boolean(
          cached && Date.now() - cached.ts < HOME_CACHE_TTL_MS
        );
        if (seededFromMemory && cached) {
          applyCachedHomeState(cached.payload);
        }

        const persisted = readPersistedHomeCache(cacheKey);
        if (persisted?.payload) {
          fallbackPayload = persisted.payload;
        }
        const seededFromPersist = Boolean(
          persisted && Date.now() - persisted.ts < HOME_CACHE_TTL_MS
        );
        if (!seededFromMemory && seededFromPersist && persisted) {
          homeDataCache[cacheKey] = persisted;
          applyCachedHomeState(persisted.payload);
        }

        if (!seededFromMemory && !seededFromPersist) {
          setLoading(true);
          setSummaryLoading(true);
          setHistoryLoading(true);
        } else {
          setLoading(false);
          setSummaryLoading(false);
          setHistoryLoading(false);
        }

        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            let bearerToken = await currentUser.getIdToken();
            const requestWithToken = async (token: string) =>
              fetch("/api/user/profile", {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                cache: "no-store",
              });

            let profileRes = await requestWithToken(bearerToken);
            if (profileRes.status === 401) {
              bearerToken = await currentUser.getIdToken(true);
              profileRes = await requestWithToken(bearerToken);
            }

            const profilePayload = (await profileRes
              .json()
              .catch(() => null)) as UserProfileApiResponse | null;
            if (!profileRes.ok || profilePayload?.ok === false) {
              throw new Error(
                profilePayload?.error ||
                  `API user-profile selhalo (${profileRes.status}).`
              );
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

        if (!cancelled) {
          setUserMeta({
            position,
            commissionMode: myMode,
            monthlyGoal: monthlyGoal ?? null,
          });
        }
        const payload = await loadViaContractsApi(cacheKey);
        if (!cancelled) {
          applyCachedHomeState(payload);
          setSummaryLoading(false);
          setHistoryLoading(false);
        }
      } catch (e) {
        console.error("Chyba při načítání produkce:", e);
        if (!cancelled && fallbackPayload) {
          applyCachedHomeState(fallbackPayload);
          setSummaryLoading(false);
          setHistoryLoading(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSummaryLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [email, loadPersonalHistory, loadTeamHistory]);

  return {
    userMeta,
    setUserMeta,
    myEntries,
    teamEntries,
    hasTeam,
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
    historyLoading,
    loading,
  };
}
