"use client";

import { useEffect, useState } from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
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
  position?: Position | null;
};

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
    if (!userEmail) return;

    const load = async () => {
      setLoading(true);
      try {
        const email = userEmail.toLowerCase();
        if (!email) throw new Error("Chybí e-mail uživatele");

        const meSnap = await getDoc(doc(db, "users", email));
        const myPosition = (meSnap.data() as UserDoc | undefined)?.position ?? null;
        setUserPosition(myPosition ?? null);

        const usersCollection = collection(db, "users");
        const visited = new Set<string>();
        const subordinatePositions: Record<string, Position | null> = {};
        const managerOf: Record<string, string | null> = {};
        const queue: string[] = [email];

        while (queue.length > 0) {
          const managerEmail = queue.shift()!;

          const subsSnap = await getDocs(
            query(usersCollection, where("managerEmail", "==", managerEmail))
          );

          subsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data() as UserDoc;
            const subordinateEmail = data.email?.toLowerCase();
            if (!subordinateEmail || visited.has(subordinateEmail)) return;

            visited.add(subordinateEmail);
            subordinatePositions[subordinateEmail] = data.position ?? null;
            managerOf[subordinateEmail] = managerEmail;
            queue.push(subordinateEmail);
          });
        }

        const subordinateEmails = Array.from(visited);
        setHasTeam(subordinateEmails.length > 0);

        const entriesGroup = collectionGroup(db, "entries");
        const allowedEmails = [email, ...subordinateEmails];
        const chunks: string[][] = [];

        for (let index = 0; index < allowedEmails.length; index += 10) {
          chunks.push(allowedEmails.slice(index, index + 10));
        }

        const allEntries: EntryDoc[] = [];
        for (const chunk of chunks) {
          const snap = await getDocs(
            query(entriesGroup, where("userEmail", "in", chunk))
          );

          snap.docs.forEach((docSnap) => {
            allEntries.push({
              id: docSnap.id,
              ...(docSnap.data() as any),
            });
          });
        }

        const ownEntries = allEntries
          .filter((entry) => (entry.userEmail ?? "").toLowerCase() === email)
          .map((entry) => ({ ...entry, source: "own" as const }));

        const teamRaw =
          subordinateEmails.length > 0
            ? allEntries.filter((entry) =>
                subordinateEmails.includes((entry.userEmail ?? "").toLowerCase())
              )
            : [];

        const overrides: EntryDoc[] = [];
        if (myPosition && teamRaw.length > 0) {
          for (const entry of teamRaw) {
            const ownerEmail = (entry.userEmail ?? "").toLowerCase();
            const subordinatePosition =
              (entry.position as Position | undefined) ??
              subordinatePositions[ownerEmail] ??
              null;
            if (!subordinatePosition) continue;

            const chain =
              (entry.managerChain as EntryDoc["managerChain"]) ?? [];
            const managerIndex = chain.findIndex(
              (node) => (node.email ?? "").toLowerCase() === email
            );

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
        setCashflowItems(cashflow);
      } catch (error) {
        console.error("Chyba při načítání cashflow:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userEmail, scopeFilter, productFilter]);

  return {
    loading,
    cashflowItems,
    hasTeam,
  };
}
