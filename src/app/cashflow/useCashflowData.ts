"use client";

import { useEffect, useState } from "react";

import { auth } from "../firebase";
import {
  type Position,
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

const CONTRACTS_PAGE_LIMIT = 50;
const CONTRACTS_MAX_PAGES = 100;

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

export function useCashflowData({
  userEmail,
  scopeFilter,
  productFilter,
}: UseCashflowDataParams): UseCashflowDataResult {
  const [loading, setLoading] = useState(true);
  const [cashflowItems, setCashflowItems] = useState<CashflowItem[]>([]);
  const [, setUserPosition] = useState<Position | null>(null);
  const [hasTeam, setHasTeam] = useState(false);

  useEffect(() => {
    if (!userEmail) {
      setCashflowItems([]);
      setHasTeam(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const emailRaw = userEmail.trim();
        const email = emailRaw.toLowerCase();
        if (!email) throw new Error("Chybí e-mail uživatele");
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

        type ScopeResult = {
          entries: EntryDoc[];
          positionHint: Position | null;
          hasTeamHint: boolean;
          teamEmailsHint: string[];
        };

        const collectScope = async (scope: "my" | "team"): Promise<ScopeResult> => {
          const entries: EntryDoc[] = [];
          const seen = new Set<string>();
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

            cursor = normalizeCursorToken(response.nextCursorToken, response.nextCursor);
            hasMore = Boolean(response.hasMore) && Boolean(cursor);
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

        if (cancelled) return;
        setUserPosition(myPosition ?? null);
        setHasTeam(hasAnyTeam);

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

        ownResult.entries.forEach(pushEntry);
        teamEntriesRaw.forEach(pushEntry);

        const allEntries = Array.from(allEntriesByKey.values());

        const ownEntries = allEntries
          .filter((entry) => (entry.userEmail ?? "").toLowerCase() === email)
          .map((entry) => ({ ...entry, source: "own" as const }));
        const teamRaw = teamEntriesRaw;

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

        if (productFilter !== "all") {
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
                product === "koopmajetekobcan" ||
                product === "maxdomov" ||
                product === "cppsimplex" ||
                product === "cppPPRs" ||
                product === "cppPPRbez" ||
                product === "cppcestovko" ||
                product === "axacestovko" ||
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

        const cashflow = generateCashflow(entriesForCashflow, 10);
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
            myPosition,
            hasAnyTeam,
            allEntries: allEntries.length,
            ownEntries: ownEntries.length,
            teamRaw: teamRaw.length,
            overrides: overrides.length,
            entriesForCashflow: entriesForCashflow.length,
            cashflowItems: cashflow.length,
            total,
            entryFingerprint,
          });
        }
        if (cancelled) return;
        setCashflowItems(cashflow);
      } catch (error) {
        console.error("Chyba při načítání cashflow:", error);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userEmail, scopeFilter, productFilter]);

  return {
    loading,
    cashflowItems,
    hasTeam,
  };
}
