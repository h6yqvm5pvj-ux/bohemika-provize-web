import { useEffect, useState } from "react";

import { auth, db } from "@/app/firebase";
import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  entrySignedDate,
} from "./homeUtils";
import {
  buildChildrenByManager,
  collectSubordinateHierarchy,
} from "@/app/lib/teamHierarchy";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

export type EntryDoc = {
  id: string;
  userEmail?: string | null;
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
  teamContractsCount: number;
  teamImmediateSum: number;
};

export type HomeDataState = {
  userMeta: UserMeta | null;
  setUserMeta: React.Dispatch<React.SetStateAction<UserMeta | null>>;
  myEntries: EntryDoc[];
  teamEntries: EntryDoc[];
  hasTeam: boolean;
  myContractsCount: number;
  myImmediateSum: number;
  teamContractsCount: number;
  teamImmediateSum: number;
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
  contracts?: (EntryDoc & { adviserEmail?: string | null })[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
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

const isFirestorePermissionError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return (
    code === "permission-denied" ||
    message.includes("insufficient permissions") ||
    message.includes("missing or insufficient permissions")
  );
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
  const [teamContractsCount, setTeamContractsCount] = useState(0);
  const [teamImmediateSum, setTeamImmediateSum] = useState(0);
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
      setTeamContractsCount(payload.teamContractsCount);
      setTeamImmediateSum(payload.teamImmediateSum);
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

        const requestContracts = async (
          scope: "my" | "team",
          cursor?: string | null
        ): Promise<ContractsApiResponse> => {
          const params = new URLSearchParams({ scope, limit: "50" });
          if (cursor) params.set("cursor", cursor);

          const requestWithToken = async (token: string) =>
            fetch(`/api/contracts?${params.toString()}`, {
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

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthStart = new Date(currentYear, currentMonth, 1);
        const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
        const personalRangeStart = loadPersonalHistory
          ? new Date(currentYear, currentMonth - 11, 1)
          : monthStart;
        const teamRangeStart = loadTeamHistory
          ? new Date(currentYear, currentMonth - 11, 1)
          : monthStart;
        const personalRangeStartMs = personalRangeStart.getTime();
        const teamRangeStartMs = teamRangeStart.getTime();

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
            const response = await requestContracts(scope, cursor);
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

        const ownResult = await collectScope("my", personalRangeStartMs);

        if (!position && ownResult.positionHint) {
          position = ownResult.positionHint;
        }

        const myEntriesList = ownResult.entries;
        let hasTeamValue =
          ownResult.hasTeamHint || (ownResult.teamEmailsHint?.length ?? 0) > 0;
        let teamEntriesAll: EntryDoc[] = [];

        if (hasTeamValue) {
          try {
            const teamResult = await collectScope("team", teamRangeStartMs);
            teamEntriesAll = teamResult.entries;
            hasTeamValue = hasTeamValue || teamEntriesAll.length > 0;
          } catch (teamErr) {
            if ((teamErr as { status?: number } | null)?.status === 403) {
              hasTeamValue = false;
              teamEntriesAll = [];
            } else {
              throw teamErr;
            }
          }
        }

        let myCount = 0;
        let myImmediate = 0;
        myEntriesList.forEach((data) => {
          const signed = entrySignedDate(data);
          if (!signed) return;
          if (signed < monthStart || signed >= nextMonthStart) return;
          myCount += 1;

          const items = (data.items ?? []) as CommissionResultItemDTO[];
          const immediate = items.find((it) =>
            (it.title ?? "").toLowerCase().includes("okamžitá provize")
          );
          myImmediate += immediate?.amount ?? 0;
        });

        let teamCount = 0;
        let teamImmediate = 0;
        const filteredTeamEntries: EntryDoc[] = [];
        teamEntriesAll.forEach((data) => {
          const signed = entrySignedDate(data);
          if (!signed) return;
          if (signed < teamRangeStart || signed >= nextMonthStart) return;

          if (loadTeamHistory) {
            filteredTeamEntries.push(data);
          }

          if (!(signed >= monthStart && signed < nextMonthStart)) return;
          teamCount += 1;

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
            teamImmediate += overrideImmediate;
          }
        });

        const payload: HomeCachePayload = {
          userMeta: {
            position,
            commissionMode: myMode,
            monthlyGoal: monthlyGoal ?? null,
          },
          myEntries: loadPersonalHistory ? myEntriesList : [],
          teamEntries: loadTeamHistory ? filteredTeamEntries : [],
          hasTeam: hasTeamValue,
          myContractsCount: myCount,
          myImmediateSum: myImmediate,
          teamContractsCount: teamCount,
          teamImmediateSum: teamImmediate,
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
        const monthStart = new Date(currentYear, currentMonth, 1);
        const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
        const personalRangeStart = loadPersonalHistory
          ? new Date(currentYear, currentMonth - 11, 1)
          : monthStart;
        const personalRangeEnd = nextMonthStart;
        const teamRangeStart = loadTeamHistory
          ? new Date(currentYear, currentMonth - 11, 1)
          : monthStart;
        const teamRangeEnd = nextMonthStart;

        const cacheKey = `${email}|${currentYear}-${currentMonth}|${loadPersonalHistory ? "hist" : "nohist"}|${loadTeamHistory ? "teamhist" : "noteamhist"}`;
        const cached = homeDataCache[cacheKey];
        if (cached?.payload) {
          fallbackPayload = cached.payload;
        }
        if (cached && Date.now() - cached.ts < HOME_CACHE_TTL_MS) {
          applyCachedHomeState(cached.payload);
          setLoading(false);
          return;
        }

        const persisted = readPersistedHomeCache(cacheKey);
        if (persisted?.payload) {
          fallbackPayload = persisted.payload;
        }
        const seededFromPersist = !!persisted && Date.now() - persisted.ts < HOME_CACHE_TTL_MS;
        if (seededFromPersist && persisted) {
          homeDataCache[cacheKey] = persisted;
          applyCachedHomeState(persisted.payload);
        }

        if (!seededFromPersist) {
          setLoading(true);
        }

        const usersRef = collection(db, "users");
        const needPersonalHistory = loadPersonalHistory;
        const needTeamHistory = loadTeamHistory;

        try {
          const meSnap = await getDoc(doc(usersRef, email));
          if (meSnap.exists()) {
            const d = meSnap.data() as any;
            position = d.position as Position | undefined;
            monthlyGoal = (d.monthlyGoal as number | undefined) ?? null;
            myMode = (d.commissionMode as CommissionMode | undefined) ?? null;
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

        // 2) moje smlouvy (collectionGroup + fallback na vlastní podkolekci)
        const myEntriesList: EntryDoc[] = [];
        const seenPersonal = new Set<string>();

        const collectPersonalEntry = (docSnap: any) => {
          const key = docSnap.id;
          if (seenPersonal.has(key)) return;
          seenPersonal.add(key);
          const data = docSnap.data() as any as EntryDoc;
          const persistedUserEmail =
            typeof data.userEmail === "string" ? data.userEmail.toLowerCase() : "";
          myEntriesList.push({
            ...data,
            id: docSnap.id,
            userEmail: persistedUserEmail || email,
          });
        };

        const personalEntriesRef = collection(db, "users", email, "entries");
        const [myPathContractSnap, myPathCreatedSnap] = await Promise.all([
          getDocs(
            query(
              personalEntriesRef,
              where("contractSignedDate", ">=", personalRangeStart),
              where("contractSignedDate", "<", personalRangeEnd)
            )
          ),
          getDocs(
            query(
              personalEntriesRef,
              where("createdAt", ">=", personalRangeStart),
              where("createdAt", "<", personalRangeEnd)
            )
          ),
        ]);
        myPathContractSnap.forEach(collectPersonalEntry);
        myPathCreatedSnap.forEach(collectPersonalEntry);

        let myCount = 0;
        let myImmediate = 0;

        myEntriesList.forEach((data) => {
          const signed = entrySignedDate(data);
          if (!signed) return;
          if (signed.getFullYear() !== currentYear || signed.getMonth() !== currentMonth) {
            return;
          }

          myCount += 1;

          const items = (data.items ?? []) as CommissionResultItemDTO[];
          const immediate = items.find((it) =>
            (it.title ?? "").toLowerCase().includes("okamžitá provize")
          );
          const immediateAmount = immediate?.amount ?? 0;
          myImmediate += immediateAmount;
        });

        if (!cancelled) {
          setMyContractsCount(myCount);
          setMyImmediateSum(myImmediate);
          setMyEntries(needPersonalHistory ? myEntriesList : []);
        }

        type UserNode = { email: string; managerEmail: string | null; position?: Position };
        let subEmails: string[] = [];
        try {
          // Načíst všechny uživatele a postavit strom case-insensitive
          // (managerEmail může být uložen s velkými písmeny).
          const allUsersSnap = await getDocs(usersRef);
          const allUsers: UserNode[] = [];
          allUsersSnap.forEach((d) => {
            const data = d.data() as any;
            const em = ((data.email as string | undefined) ?? d.id ?? "").toLowerCase();
            if (!em) return;
            const mgr = (data.managerEmail as string | undefined)?.toLowerCase() ?? null;
            allUsers.push({
              email: em,
              managerEmail: mgr,
              position: (data.position as Position | undefined) ?? undefined,
            });
          });

          const childrenByManager = buildChildrenByManager(allUsers);
          const hierarchy = collectSubordinateHierarchy(email, childrenByManager);
          subEmails = hierarchy.subordinateEmails;
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.info("[home] users hierarchy read failed", err);
          }
          subEmails = [];
        }

        if (!cancelled) {
          setHasTeam(subEmails.length > 0);
        }

        if (subEmails.length === 0) {
          if (!cancelled) {
            setTeamContractsCount(0);
            setTeamImmediateSum(0);
            setTeamEntries([]);
            setLoading(false);
          }
          return;
        }

        let teamCount = 0;
        let teamImmediate = 0;
        const teamEntriesAll: EntryDoc[] = [];
        const seenTeam = new Set<string>();

        const collectTeamEntry = (docSnap: any, ownerEmailRaw: string) => {
          const data = docSnap.data() as any as EntryDoc;
          const ownerEmail = (ownerEmailRaw ?? "").toLowerCase();
          if (!ownerEmail) return;
          const key = `${ownerEmail}___${docSnap.id}`;
          if (seenTeam.has(key)) return;
          seenTeam.add(key);

          const signed = entrySignedDate(data);
          if (!signed) return;
          if (signed < teamRangeStart || signed >= teamRangeEnd) return;

          if (needTeamHistory) {
            teamEntriesAll.push({
              ...(data as any),
              id: docSnap.id,
              userEmail: (data.userEmail ?? ownerEmail) as string,
            } as EntryDoc);
          }

          const isCurrentMonth = signed >= monthStart && signed < nextMonthStart;
          if (!isCurrentMonth) return;

          teamCount += 1;

          const override = (data.managerOverrides as ManagerOverrideSnapshot[] | undefined)?.find(
            (o) => (o.email ?? "").toLowerCase() === email
          );
          if (override) {
            const overrideItems = (override.items ?? []) as CommissionResultItemDTO[];
            const overrideImmediate =
              overrideItems.find((it) =>
                (it.title ?? "").toLowerCase().includes("okamžitá")
              )?.amount ?? (Number.isFinite(override.total) ? (override.total as number) : null);
            if (overrideImmediate != null) {
              teamImmediate += overrideImmediate;
            }
          }
        };

        await Promise.all(
          subEmails.map(async (sub) => {
            try {
              const subEntriesRef = collection(db, "users", sub, "entries");
              const [snapContract, snapCreated] = await Promise.all([
                getDocs(
                  query(
                    subEntriesRef,
                    where("contractSignedDate", ">=", teamRangeStart),
                    where("contractSignedDate", "<", teamRangeEnd)
                  )
                ),
                getDocs(
                  query(
                    subEntriesRef,
                    where("createdAt", ">=", teamRangeStart),
                    where("createdAt", "<", teamRangeEnd)
                  )
                ),
              ]);

              snapContract.forEach((docSnap) => collectTeamEntry(docSnap, sub));
              snapCreated.forEach((docSnap) => collectTeamEntry(docSnap, sub));
            } catch (err) {
              if (process.env.NODE_ENV !== "production") {
                console.info("[home] team entries read failed", { sub, err });
              }
            }
          })
        );

        if (!cancelled) {
          setTeamContractsCount(teamCount);
          setTeamImmediateSum(teamImmediate);
          setTeamEntries(needTeamHistory ? teamEntriesAll : []);
        }

        const payload: HomeCachePayload = {
          userMeta: {
            position,
            commissionMode: myMode,
            monthlyGoal: monthlyGoal ?? null,
          },
          myEntries: needPersonalHistory ? myEntriesList : [],
          teamEntries: needTeamHistory ? teamEntriesAll : [],
          hasTeam: subEmails.length > 0,
          myContractsCount: myCount,
          myImmediateSum: myImmediate,
          teamContractsCount: teamCount,
          teamImmediateSum: teamImmediate,
        };

        homeDataCache[cacheKey] = {
          ts: Date.now(),
          payload,
        };
        writePersistedHomeCache(cacheKey, payload);
      } catch (e) {
        if (isFirestorePermissionError(e)) {
          try {
            const now = new Date();
            const cacheKey = `${email}|${now.getFullYear()}-${now.getMonth()}|${loadPersonalHistory ? "hist" : "nohist"}|${loadTeamHistory ? "teamhist" : "noteamhist"}`;
            const payload = await loadViaContractsApi(cacheKey);
            if (!cancelled) {
              applyCachedHomeState(payload);
            }
            return;
          } catch (apiErr) {
            console.error("Fallback přes /api/contracts selhal:", apiErr);
          }
        }
        console.error("Chyba při načítání produkce:", e);
        if (!cancelled && fallbackPayload) {
          applyCachedHomeState(fallbackPayload);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
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
    teamContractsCount,
    teamImmediateSum,
    loading,
  };
}
