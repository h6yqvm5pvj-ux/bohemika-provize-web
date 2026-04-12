"use client";

import { useEffect, useState } from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
} from "../types/domain";
import {
  calculateAllianzAuto,
  calculateAxaCestovko,
  calculateComfortCC,
  calculateCppAuto,
  calculateCppCestovko,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateCsobAuto,
  calculateDomex,
  calculateFlexi,
  calculateKoopMajetekObcan,
  calculateKooperativaAuto,
  calculateMaxEfekt,
  calculateMaxdomov,
  calculateNeon,
  calculatePillowAuto,
  calculatePillowInjury,
  calculateUniqaAuto,
  calculateZamex,
} from "../lib/productFormulas";
import { totalWithMultipliers } from "../lib/commissionTotals";
import {
  buildChildrenByManager,
  collectSubordinateHierarchy,
} from "../lib/teamHierarchy";
import { generateCashflow } from "./generator";
import {
  normalizeTitleKey,
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

type UserDoc = {
  email?: string | null;
  managerEmail?: string | null;
  position?: Position | null;
};

type CanonicalUser = {
  email: string;
  managerEmail: string | null;
  position: Position | null;
  docId: string;
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

function commissionItemsForPosition(
  entry: EntryDoc,
  position: Position,
  forcedMode?: CommissionMode | null
): CommissionResultItemDTO[] {
  const product = entry.productKey;
  const amount = entry.inputAmount ?? 0;
  const frequency = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
  const duration =
    typeof entry.durationYears === "number" && !Number.isNaN(entry.durationYears)
      ? entry.durationYears
      : 15;
  const mode = (forcedMode ??
    entry.commissionMode ??
    entry.mode ??
    "accelerated") as CommissionMode;

  switch (product) {
    case "neon":
      return calculateNeon(amount, position, duration, mode).items;
    case "flexi":
      return calculateFlexi(amount, position, mode).items;
    case "maximaMaxEfekt":
      return calculateMaxEfekt(amount, duration, position, mode).items;
    case "pillowInjury":
      return calculatePillowInjury(amount, position, mode).items;
    case "domex":
      return calculateDomex(amount, frequency, position).items;
    case "koopmajetekobcan":
      return calculateKoopMajetekObcan(amount, frequency, position).items;
    case "cppPPRbez":
      return calculateCppPPRbez(amount, frequency, position).items;
    case "maxdomov":
      return calculateMaxdomov(amount, frequency, position).items;
    case "cppAuto":
      return calculateCppAuto(amount, frequency, position).items;
    case "cppsimplex":
      return calculateCppSimplex(amount, frequency, position).items;
    case "allianzAuto":
      return calculateAllianzAuto(amount, frequency, position).items;
    case "csobAuto":
      return calculateCsobAuto(amount, frequency, position).items;
    case "uniqaAuto":
      return calculateUniqaAuto(amount, frequency, position).items;
    case "cppPPRs":
      return calculateCppPPRs(amount, frequency, position).items;
    case "pillowAuto":
      return calculatePillowAuto(amount, frequency, position).items;
    case "kooperativaAuto":
      return calculateKooperativaAuto(amount, frequency, position).items;
    case "zamex":
      return calculateZamex(amount, frequency, position).items;
    case "cppcestovko":
      return calculateCppCestovko(amount, position).items;
    case "axacestovko":
      return calculateAxaCestovko(amount, position).items;
    case "comfortcc":
      return calculateComfortCC({
        fee: amount,
        payment: entry.comfortPayment ?? 0,
        targetAmount: !!entry.comfortGradual ? entry.comfortTargetAmount ?? 0 : 0,
        isSavings: !!entry.comfortGradual,
        isGradualFee: !!entry.comfortGradual,
        position,
      }).items;
    default:
      return [];
  }
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

        let meSnap = await getDocFromServer(doc(db, "users", email));
        if (!meSnap.exists() && emailRaw && emailRaw !== email) {
          meSnap = await getDocFromServer(doc(db, "users", emailRaw));
        }
        let myPosition = (meSnap.data() as UserDoc | undefined)?.position ?? null;

        const usersCollection = collection(db, "users");
        const subordinatePositions: Record<string, Position | null> = {};

        // Case-insensitive strom uživatelů (managerEmail může být v DB uložený s různým casingem).
        const allUsersSnap = await getDocsFromServer(usersCollection);
        const candidatesByEmail = new Map<string, CanonicalUser[]>();
        allUsersSnap.forEach((docSnap) => {
          const data = docSnap.data() as UserDoc;
          const userEmail = ((data.email ?? docSnap.id ?? "") as string).trim().toLowerCase();
          if (!userEmail) return;
          const managerEmail = ((data.managerEmail ?? "") as string).trim().toLowerCase() || null;
          const current = candidatesByEmail.get(userEmail) ?? [];
          current.push({
            email: userEmail,
            managerEmail,
            position: data.position ?? null,
            docId: String(docSnap.id ?? ""),
          });
          candidatesByEmail.set(userEmail, current);
        });

        const usersByEmail = new Map<string, CanonicalUser>();
        const pickBestCandidate = (items: CanonicalUser[], emailKey: string): CanonicalUser => {
          return [...items].sort((a, b) => {
            const aDoc = (a.docId ?? "").trim().toLowerCase();
            const bDoc = (b.docId ?? "").trim().toLowerCase();
            const aCanonical = aDoc === emailKey ? 0 : 1;
            const bCanonical = bDoc === emailKey ? 0 : 1;
            if (aCanonical !== bCanonical) return aCanonical - bCanonical;

            const aHasPosition = a.position ? 0 : 1;
            const bHasPosition = b.position ? 0 : 1;
            if (aHasPosition !== bHasPosition) return aHasPosition - bHasPosition;

            const aHasManager = a.managerEmail ? 0 : 1;
            const bHasManager = b.managerEmail ? 0 : 1;
            if (aHasManager !== bHasManager) return aHasManager - bHasManager;

            return aDoc.localeCompare(bDoc, "cs");
          })[0];
        };

        candidatesByEmail.forEach((items, emailKey) => {
          usersByEmail.set(emailKey, pickBestCandidate(items, emailKey));
        });

        if (!myPosition) {
          myPosition = usersByEmail.get(email)?.position ?? null;
        }

        const childrenByManager = buildChildrenByManager(usersByEmail.values());
        const hierarchy = collectSubordinateHierarchy(email, childrenByManager);
        hierarchy.subordinateByEmail.forEach((subordinate, subordinateEmail) => {
          subordinatePositions[subordinateEmail] = subordinate.position ?? null;
        });
        const subordinateEmails = hierarchy.subordinateEmails;
        const entriesGroup = collectionGroup(db, "entries");
        let managerLinkedDocs: Array<{
          id: string;
          ownerEmail: string | null;
          data: Record<string, unknown>;
        }> = [];
        let managerLinkedOwnerEmails: string[] = [];
        try {
          const teamByManagerSnap = await getDocsFromServer(
            query(entriesGroup, where("managerEmailSnapshot", "==", email))
          );
          managerLinkedDocs = teamByManagerSnap.docs.map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const ownerEmail =
              docSnap.ref.parent.parent?.id ??
              (typeof data.userEmail === "string" ? data.userEmail : null) ??
              null;
            return { id: docSnap.id, ownerEmail, data };
          });
          managerLinkedOwnerEmails = Array.from(
            new Set(
              managerLinkedDocs
                .map((item) => (item.ownerEmail ?? "").trim().toLowerCase())
                .filter(Boolean)
            )
          );
        } catch {
          // Optional path: continue with hierarchy-derived team when this query/index is unavailable.
        }

        if (cancelled) return;
        setUserPosition(myPosition ?? null);

        const hasAnyTeam =
          subordinateEmails.length > 0 || managerLinkedOwnerEmails.length > 0;
        setHasTeam(hasAnyTeam);

        const allowedEmails = Array.from(
          new Set([email, ...subordinateEmails, ...managerLinkedOwnerEmails])
        );
        const allowedEmailSet = new Set(allowedEmails);
        const chunks: string[][] = [];

        for (let index = 0; index < allowedEmails.length; index += 10) {
          chunks.push(allowedEmails.slice(index, index + 10));
        }

        const allEntriesByKey = new Map<string, EntryDoc>();
        const pushEntry = (
          docId: string,
          ownerEmailRaw: string | null | undefined,
          data: Record<string, unknown>,
          options?: { allowOutsideAllowed?: boolean }
        ) => {
          const ownerEmail = (ownerEmailRaw ?? "").trim().toLowerCase();
          if (!ownerEmail) return;
          if (!options?.allowOutsideAllowed && !allowedEmailSet.has(ownerEmail)) return;
          const key = `${ownerEmail}___${docId}`;
          if (allEntriesByKey.has(key)) return;
          const persistedUserEmail =
            typeof data.userEmail === "string" ? data.userEmail.trim().toLowerCase() : null;
          allEntriesByKey.set(key, {
            id: docId,
            ...(data as any),
            userEmail: persistedUserEmail || ownerEmail,
          });
        };

        // Fast path: modern records with userEmail.
        for (const chunk of chunks) {
          const snap = await getDocsFromServer(
            query(entriesGroup, where("userEmail", "in", chunk))
          );

          snap.docs.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const ownerEmail =
              docSnap.ref.parent.parent?.id ??
              (typeof data.userEmail === "string" ? data.userEmail : null) ??
              null;
            pushEntry(docSnap.id, ownerEmail, data);
          });
        }

        // Fallback: historical records where userEmail is missing.
        for (const ownerEmail of allowedEmails) {
          const ownerEntriesRef = collection(db, "users", ownerEmail, "entries");
          const ownerSnap = await getDocsFromServer(ownerEntriesRef);
          ownerSnap.docs.forEach((docSnap) => {
            pushEntry(docSnap.id, ownerEmail, docSnap.data() as Record<string, unknown>);
          });
        }

        // Include entries explicitly linked to me as manager (already fetched above).
        managerLinkedDocs.forEach((item) => {
          pushEntry(item.id, item.ownerEmail, item.data, { allowOutsideAllowed: true });
        });

        const allEntries = Array.from(allEntriesByKey.values());

        const ownEntries = allEntries
          .filter((entry) => (entry.userEmail ?? "").toLowerCase() === email)
          .map((entry) => ({ ...entry, source: "own" as const }));

        const isManagedByCurrentUser = (entry: EntryDoc): boolean => {
          const owner = (entry.userEmail ?? "").toLowerCase();
          if (owner && subordinateEmails.includes(owner)) return true;

          const managerSnapshot = (entry.managerEmailSnapshot ?? "").toLowerCase();
          if (managerSnapshot === email) return true;

          const chain = (entry.managerChain as EntryDoc["managerChain"]) ?? [];
          if (chain.some((node) => (node.email ?? "").toLowerCase() === email)) return true;

          const managerOverrides =
            (entry.managerOverrides as EntryDoc["managerOverrides"]) ?? [];
          return managerOverrides.some(
            (override) => (override.email ?? "").toLowerCase() === email
          );
        };

        const teamRaw = allEntries.filter((entry) =>
          isManagedByCurrentUser(entry)
        );

        const overrides: EntryDoc[] = [];
        if (teamRaw.length > 0) {
          for (const entry of teamRaw) {
            const ownerEmail = (entry.userEmail ?? "").toLowerCase();
            const chain =
              (entry.managerChain as EntryDoc["managerChain"]) ?? [];
            const managerIndex = chain.findIndex(
              (node) => (node.email ?? "").toLowerCase() === email
            );
            const chainSubordinatePosition =
              managerIndex > 0
                ? (chain[managerIndex - 1]?.position as Position | null | undefined) ??
                  null
                : null;
            const subordinatePosition =
              (entry.position as Position | undefined) ??
              subordinatePositions[ownerEmail] ??
              chainSubordinatePosition ??
              null;
            if (!subordinatePosition) continue;

            const storedOverride =
              (entry.managerOverrides as EntryDoc["managerOverrides"])?.find(
                (override) => (override.email ?? "").toLowerCase() === email
              ) ?? null;

            if (storedOverride) {
              const storedOverrideItems = stripTotalRows(storedOverride.items ?? []);
              const storedOverrideTotal = totalWithMultipliers(storedOverrideItems);

              overrides.push({
                ...entry,
                originalEntryId: entry.id,
                id: `${entry.id}-override`,
                items: storedOverrideItems,
                total: storedOverrideTotal,
                source: "manager",
                position: storedOverride.position ?? myPosition,
                managerPositionSnapshot: storedOverride.position ?? myPosition,
                managerModeSnapshot:
                  storedOverride.commissionMode ??
                  entry.managerModeSnapshot ??
                  entry.commissionMode ??
                  entry.mode ??
                  null,
                clientName: entry.clientName ?? null,
              });
              continue;
            }

            const managerSnapshot = managerIndex >= 0 ? chain[managerIndex] : null;
            const childSnapshot =
              managerIndex > 0
                ? chain[managerIndex - 1]
                : {
                    email: ownerEmail,
                    position: subordinatePosition,
                    commissionMode:
                      (entry.commissionMode as CommissionMode | null | undefined) ??
                      (entry.mode as CommissionMode | null | undefined) ??
                      null,
                  };

            const effectiveManagerPosition =
              (managerSnapshot?.position as Position | null | undefined) ??
              myPosition;
            if (!effectiveManagerPosition) continue;

            const effectiveManagerMode =
              (managerSnapshot?.commissionMode as
                | CommissionMode
                | null
                | undefined) ??
              (entry.managerModeSnapshot as
                | CommissionMode
                | null
                | undefined) ??
              (entry.commissionMode as CommissionMode | null | undefined) ??
              (entry.mode as CommissionMode | null | undefined) ??
              null;
            const managerModeForOverride =
              (effectiveManagerMode as CommissionMode | null) ?? "standard";

            const baselinePosition = childSnapshot?.position ?? subordinatePosition;

            const managerItems = stripTotalRows(
              commissionItemsForPosition(
                entry,
                effectiveManagerPosition,
                managerModeForOverride
              )
            );
            const baselineItems = stripTotalRows(
              commissionItemsForPosition(
                entry,
                baselinePosition as Position,
                managerModeForOverride
              )
            );

            const managerMap = new Map<string, { title: string; amount: number }>();
            managerItems.forEach((item) => {
              const key = normalizeTitleKey(item.title ?? "");
              const previous = managerMap.get(key);
              managerMap.set(key, {
                title: item.title ?? previous?.title ?? key,
                amount: (previous?.amount ?? 0) + (item.amount ?? 0),
              });
            });

            const diffItems: CommissionResultItemDTO[] = [];

            baselineItems.forEach((item) => {
              const key = normalizeTitleKey(item.title ?? "");
              const managerItem = managerMap.get(key);
              const managerAmount = managerItem?.amount ?? 0;
              const subordinateAmount = item.amount ?? 0;
              const remaining = managerAmount - subordinateAmount;

              if (remaining > 0) {
                diffItems.push({
                  title: managerItem?.title ?? item.title,
                  amount: remaining,
                });
              }

              managerMap.delete(key);
            });

            managerMap.forEach((value) => {
              if (value.amount > 0) {
                diffItems.push({ title: value.title, amount: value.amount });
              }
            });

            const diffTotalWithMultipliers = totalWithMultipliers(diffItems);
            if (diffItems.length === 0 || diffTotalWithMultipliers <= 0) continue;

            overrides.push({
              ...entry,
              originalEntryId: entry.id,
              id: `${entry.id}-override`,
              items: diffItems,
              total: diffTotalWithMultipliers,
              source: "manager",
              position: effectiveManagerPosition,
              managerPositionSnapshot: effectiveManagerPosition,
              managerModeSnapshot: effectiveManagerMode,
              managerChain: chain,
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
                product === "allianzAuto" ||
                product === "csobAuto" ||
                product === "uniqaAuto" ||
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
            subordinateEmails: subordinateEmails.length,
            managerLinkedOwnerEmails: managerLinkedOwnerEmails.length,
            allowedEmails: allowedEmails.length,
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
