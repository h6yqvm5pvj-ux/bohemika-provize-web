"use client";

import { useEffect, useMemo, useState } from "react";

import { auth } from "../firebase";
import {
  type PaymentFrequency,
  type Position,
  type Product,
} from "../types/domain";
import { totalWithMultipliers } from "../lib/commissionTotals";
import { generateCashflow } from "./generator";
import {
  stripTotalRows,
} from "./helpers";
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
  enabled?: boolean;
};

type UseCashflowDataResult = {
  loading: boolean;
  cashflowItems: CashflowItem[];
  hasTeam: boolean;
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

type TipPayoutApiItem = {
  id?: string;
  payoutDate?: number | null;
  amount?: number;
  note?: string | null;
  productKey?: Product | null;
  frequencyRaw?: PaymentFrequency | null;
  tipsterPercent?: number | null;
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

type RawContractsSnapshot = {
  email: string;
  myPosition: Position | null;
  hasAnyTeam: boolean;
  ownEntries: EntryDoc[];
  teamEntriesRaw: EntryDoc[];
  tipPayouts: TipPayoutApiItem[];
};

const CONTRACTS_PAGE_LIMIT = 50;
const CONTRACTS_MAX_PAGES = 400;
const TIP_PAYOUTS_PAGE_LIMIT = 100;
const TIP_PAYOUTS_MAX_PAGES = 200;
const CONTRACTS_CACHE_TTL_MS = 2 * 60 * 1000;
const CONTRACTS_UPDATED_KEY = "contracts_last_updated";
const contractsSnapshotCache: Record<
  string,
  { ts: number; payload: RawContractsSnapshot }
> = {};
const contractsSnapshotInFlight: Partial<Record<string, Promise<RawContractsSnapshot>>> = {};

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

async function fetchContractsSnapshot(
  email: string
): Promise<RawContractsSnapshot> {
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

  type ScopeResult = {
    entries: EntryDoc[];
    positionHint: Position | null;
    hasTeamHint: boolean;
    teamEmailsHint: string[];
  };

  const collectScope = async (scope: "my" | "team"): Promise<ScopeResult> => {
    const entries: EntryDoc[] = [];
    const seen = new Set<string>();
    const seenCursorTokens = new Set<string>();
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;
    let positionHint: Position | null = null;
    let hasTeamHint = false;
    let teamEmailsHint: string[] = [];

    while (hasMore && pages < CONTRACTS_MAX_PAGES) {
      const response = await requestContracts(scope, cursor);
      if (pages === 0) {
        positionHint = (response.position as Position | null | undefined) ?? null;
        hasTeamHint = Boolean(response.hasTeam);
        teamEmailsHint = Array.isArray(response.teamEmails)
          ? response.teamEmails.map((item) => normalizeEmail(item)).filter(Boolean)
          : [];
      }
      pages += 1;

      const chunk = (response.contracts ?? []) as (EntryDoc & {
        adviserEmail?: string | null;
      })[];
      if (chunk.length === 0) break;

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
    }

    if (pages >= CONTRACTS_MAX_PAGES && hasMore) {
      console.warn(
        `[cashflow] scope=${scope} reached pagination safety cap (${CONTRACTS_MAX_PAGES} pages).`
      );
    }

    return {
      entries,
      positionHint,
      hasTeamHint,
      teamEmailsHint,
    };
  };

  const ownResult = await collectScope("my");
  const myPosition = ownResult.positionHint ?? null;
  let teamEntriesRaw: EntryDoc[] = [];
  let hasAnyTeam =
    ownResult.hasTeamHint || (ownResult.teamEmailsHint?.length ?? 0) > 0;

  if (hasAnyTeam) {
    try {
      const teamResult = await collectScope("team");
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

  const tipPayouts: TipPayoutApiItem[] = [];
  try {
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
  } catch (tipErr) {
    console.warn("[cashflow] načtení TIP výplat selhalo, pokračuji bez nich.", tipErr);
  }

  return {
    email,
    myPosition,
    hasAnyTeam,
    ownEntries: ownResult.entries,
    teamEntriesRaw,
    tipPayouts,
  };
}

async function getContractsSnapshot(
  email: string
): Promise<RawContractsSnapshot> {
  const cached = contractsSnapshotCache[email];
  const updatedAtMs = getContractsUpdatedAtMs();
  if (cached && isSnapshotFresh(cached.ts, updatedAtMs)) {
    return cached.payload;
  }
  if (cached && !isSnapshotFresh(cached.ts, updatedAtMs)) {
    delete contractsSnapshotCache[email];
  }

  if (contractsSnapshotInFlight[email]) {
    return contractsSnapshotInFlight[email];
  }

  contractsSnapshotInFlight[email] = fetchContractsSnapshot(email)
    .then((payload) => {
      contractsSnapshotCache[email] = { ts: Date.now(), payload };
      return payload;
    })
    .finally(() => {
      delete contractsSnapshotInFlight[email];
    });

  return contractsSnapshotInFlight[email];
}

export function useCashflowData({
  userEmail,
  scopeFilter,
  productFilter,
  enabled = true,
}: UseCashflowDataParams): UseCashflowDataResult {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<RawContractsSnapshot | null>(null);
  const [hasTeam, setHasTeam] = useState(false);

  useEffect(() => {
    if (!enabled || !userEmail) {
      setSnapshot(null);
      setHasTeam(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const normalized = normalizeEmail(userEmail);
      const cachedRaw = contractsSnapshotCache[normalized];
      const updatedAtMs = getContractsUpdatedAtMs();
      const cached =
        cachedRaw && isSnapshotFresh(cachedRaw.ts, updatedAtMs)
          ? cachedRaw
          : undefined;
      if (cachedRaw && !cached) {
        delete contractsSnapshotCache[normalized];
      }
      const hasCachedPayload = Boolean(cached?.payload);
      if (cached?.payload) {
        setSnapshot(cached.payload);
        setHasTeam(cached.payload.hasAnyTeam);
      }
      setLoading(!hasCachedPayload);

      try {
        const emailRaw = userEmail.trim();
        const email = emailRaw.toLowerCase();
        if (!email) throw new Error("Chybí e-mail uživatele");
        const payload = await getContractsSnapshot(email);
        if (cancelled) return;
        setSnapshot(payload);
        setHasTeam(payload.hasAnyTeam);
      } catch (error) {
        console.error("Chyba při načítání cashflow:", error);
        if (!hasCachedPayload) {
          setSnapshot(null);
          setHasTeam(false);
        }
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userEmail, enabled]);

  const cashflowItems = useMemo<CashflowItem[]>(() => {
    if (!enabled || !snapshot) return [];

    const email = snapshot.email;
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
      .map((entry) => ({ ...entry, source: "own" as const }));
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
        const storedOverrideTotal = totalWithMultipliers(storedOverrideItems);
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

    if (productFilter === "tip") {
      entriesForCashflow = [];
    } else if (productFilter !== "all") {
      entriesForCashflow = entriesForCashflow.filter((entry) => {
        const product = entry.productKey;
        if (!product) return false;
        if (productFilter === "life") {
          return (
            product === "neon" ||
            product === "flexi" ||
            product === "maximaMaxEfekt" ||
            product === "pillowInjury"
          );
        }
        if (productFilter === "auto") {
          return (
            product === "cppAuto" ||
            product === "slaviaauto" ||
            product === "allianzAuto" ||
            product === "csobAuto" ||
            product === "uniqaAuto" ||
            product === "uniqaflotila" ||
            product === "pillowAuto" ||
            product === "kooperativaAuto"
          );
        }
        if (productFilter === "property") {
          return (
            product === "domex" ||
            product === "pillowmajetek" ||
            product === "koopmajetekobcan" ||
            product === "maxdomov" ||
            product === "allianzmujdomov" ||
            product === "cppsimplex" ||
            product === "cppPPRs" ||
            product === "cppPPRbez" ||
            product === "cppcestovko" ||
            product === "axacestovko" ||
            product === "koopcestovko" ||
            product === "maxcizinkomplex" ||
            product === "zamex"
          );
        }
        if (productFilter === "other") {
          return !(
            product === "neon" ||
            product === "flexi" ||
            product === "maximaMaxEfekt" ||
            product === "pillowInjury"
          );
        }
        if (productFilter === "gold") {
          return product === "comfortcc";
        }
        return true;
      });
    }

    const generatedCashflow = generateCashflow(entriesForCashflow, 10);
    const includeTipPayouts = productFilter === "all" || productFilter === "tip";
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
            clientName: null,
            ownerEmail: null,
            entryId: null,
            isTipPayout: true,
            tipSourceAdviserEmail,
          });
          return acc;
        }, [])
      : [];
    const cashflow = [...generatedCashflow, ...tipCashflowItems].sort(
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
        myPosition: snapshot.myPosition,
        hasAnyTeam: snapshot.hasAnyTeam,
        allEntries: allEntries.length,
        ownEntries: ownEntries.length,
        teamRaw: teamRaw.length,
        overrides: overrides.length,
        entriesForCashflow: entriesForCashflow.length,
        tipPayouts: snapshot.tipPayouts.length,
        tipCashflowItems: tipCashflowItems.length,
        cashflowItems: cashflow.length,
        total,
        entryFingerprint,
      });
    }

    return cashflow;
  }, [enabled, snapshot, scopeFilter, productFilter]);

  return {
    loading,
    cashflowItems,
    hasTeam,
  };
}
