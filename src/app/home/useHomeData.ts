import { useEffect, useState } from "react";

import { db } from "@/app/firebase";
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
  collectionGroup,
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

        const meSnap = await getDoc(doc(usersRef, email));
        let position: Position | undefined;
        let monthlyGoal: number | null | undefined;
        let myMode: CommissionMode | null = null;
        if (meSnap.exists()) {
          const d = meSnap.data() as any;
          position = d.position as Position | undefined;
          monthlyGoal = (d.monthlyGoal as number | undefined) ?? null;
          myMode = (d.commissionMode as CommissionMode | undefined) ?? null;
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

        const personalQueryBase = query(
          collectionGroup(db, "entries"),
          where("userEmail", "==", email)
        );

        const personalEntriesRef = collection(db, "users", email, "entries");
        const [
          myGroupContractSnap,
          myGroupCreatedSnap,
          myPathContractSnap,
          myPathCreatedSnap,
        ] = await Promise.all([
          getDocs(
            query(
              personalQueryBase,
              where("contractSignedDate", ">=", personalRangeStart),
              where("contractSignedDate", "<", personalRangeEnd)
            )
          ),
          getDocs(
            query(
              personalQueryBase,
              where("createdAt", ">=", personalRangeStart),
              where("createdAt", "<", personalRangeEnd)
            )
          ),
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
        myGroupContractSnap.forEach(collectPersonalEntry);
        myGroupCreatedSnap.forEach(collectPersonalEntry);
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

        // Načíst všechny uživatele a postavit strom case-insensitive (managerEmail může být uložen s velkými písmeny)
        const allUsersSnap = await getDocs(usersRef);
        type UserNode = { email: string; managerEmail: string | null; position?: Position };
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
        const subEmails = hierarchy.subordinateEmails;

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

        const chunks: string[][] = [];
        for (let i = 0; i < subEmails.length; i += 10) {
          chunks.push(subEmails.slice(i, i + 10));
        }

        await Promise.all(
          chunks.map(async (chunk) => {
            const chunkBase = query(
              collectionGroup(db, "entries"),
              where("userEmail", "in", chunk)
            );

            const [teamContractSnap, teamCreatedSnap] = await Promise.all([
              getDocs(
                query(
                  chunkBase,
                  where("contractSignedDate", ">=", teamRangeStart),
                  where("contractSignedDate", "<", teamRangeEnd)
                )
              ),
              getDocs(
                query(
                  chunkBase,
                  where("createdAt", ">=", teamRangeStart),
                  where("createdAt", "<", teamRangeEnd)
                )
              ),
            ]);

            teamContractSnap.forEach((docSnap) => {
              const data = docSnap.data() as any as EntryDoc;
              const ownerEmail = (
                (data.userEmail as string | undefined) ??
                docSnap.ref.parent.parent?.id ??
                ""
              ).toLowerCase();
              collectTeamEntry(docSnap, ownerEmail);
            });

            teamCreatedSnap.forEach((docSnap) => {
              const data = docSnap.data() as any as EntryDoc;
              const ownerEmail = (
                (data.userEmail as string | undefined) ??
                docSnap.ref.parent.parent?.id ??
                ""
              ).toLowerCase();
              collectTeamEntry(docSnap, ownerEmail);
            });
          })
        );

        await Promise.all(
          subEmails.map(async (sub) => {
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
