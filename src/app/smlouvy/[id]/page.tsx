// src/app/smlouvy/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileText,
  Package,
  PencilLine,
  StickyNote,
  UserRound,
} from "lucide-react";

import { auth } from "../../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import {
  type Product,
  type PaymentFrequency,
  type Position,
  type CommissionResultItemDTO,
  type CommissionMode,
} from "../../types/domain";
import Image from "next/image";

import type { DomexFields } from "../components/DomexDetailPanel";
import type { AutoFields } from "../components/AutoDetailPanel";
import type { NeonFields } from "../components/NeonDetailPanel";
import type { FlexiFields } from "../components/FlexiDetailPanel";
import {
  AutoDetailPanel,
  DomexDetailPanel,
  FlexiDetailPanel,
  NeonDetailPanel,
} from "./ContractDetailPanels";
import { Spinner, Skeleton, Toasts } from "./ContractDetailUi";
import { type ContractDoc } from "./contractDetailTypes";
import {
  cleanResultTitle,
  computeTotalWithMultipliers,
  formatDate,
  formatMoney,
  frequencyText,
  isAutoProduct,
  isEmailInChain,
  isManagerPosition,
  nameFromEmail,
  normalizeEmail,
  normalizeTitleForCompare,
  paymentBasedTotals,
  paymentsPerYear,
  positionLabel,
  preloadFormulaModule,
  productIcon,
  productLabel,
  resultIconForTitle,
  stripTotalRows,
  toDate,
  toDateInputValue,
} from "./contractDetailHelpers";
import { useToasts } from "./useToasts";
import {
  contractLifecycleStatus,
  contractMaturityDate,
} from "@/app/lib/contractLifecycle";

const LIFE_PRODUCT_KEYS = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
]);

const ALLIANZ_PAYMENT_CHECK_URL =
  "https://www.allianz.cz/cs_CZ/apps/zaplacenost-pojistky.html";
const SLAVIA_PAYMENT_CHECK_URL = "https://www.slavia-pojistovna.cz/over-ps/";
const CPP_PAYMENT_CHECK_URL =
  "https://insure.cpp.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml#kotva";
const KOOPERATIVA_PAYMENT_CHECK_URL =
  "https://insure.koop.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml";
const CPP_PAYMENT_CHECK_PRODUCTS = new Set<Product>([
  "neon",
  "zamex",
  "domex",
  "cppsimplex",
  "cppAuto",
  "cppPPRs",
  "cppPPRbez",
  "cppcestovko",
]);
const KOOPERATIVA_PAYMENT_CHECK_PRODUCTS = new Set<Product>([
  "flexi",
  "koopmajetekobcan",
  "kooperativaAuto",
  "koopcestovko",
]);

type ContractsApiError = Error & { status?: number };

type ContractsApiResponseBase = {
  ok?: boolean;
  error?: string;
};

type ContractOwnerMetaApi = {
  position?: Position | null;
  managerEmail?: string | null;
  managerPosition?: Position | null;
  currentChainEmails?: string[];
};

type ContractDetailApiResponse = ContractsApiResponseBase & {
  mode?: "detail";
  position?: Position | null;
  hasTeam?: boolean;
  teamEmails?: string[];
  contract?: ContractDoc;
  timeline?: ContractDoc[];
  ownerMeta?: ContractOwnerMetaApi | null;
};

type NeonImmediateBreakdownPart = {
  label: string;
  amount: number;
};

type NeonImmediateBreakdown = {
  position: Position;
  totalCoefficient: number;
  a101Coefficient: number;
  b0301Coefficient: number;
  b3601HalfCoefficient: number;
  includeB3601: boolean;
  parts: NeonImmediateBreakdownPart[];
  total: number;
};

const NEON_IMMEDIATE_TOTAL_COEFFICIENTS: Record<Position, number> = {
  poradce1: 1.2,
  poradce2: 1.38,
  poradce3: 1.502,
  poradce4: 2.16,
  poradce5: 2.4,
  poradce6: 2.58,
  poradce7: 2.702,
  poradce8: 2.881,
  poradce9: 3.002,
  poradce10: 3.122,
  manazer4: 2.404,
  manazer5: 2.683,
  manazer6: 2.962,
  manazer7: 3.243,
  manazer8: 3.522,
  manazer9: 3.802,
  manazer10: 4.083,
};

const NEON_IMMEDIATE_B0301_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.444,
  poradce2: 0.489,
  poradce3: 0.533,
  poradce4: 0.622,
  poradce5: 0.645,
  poradce6: 0.665,
  poradce7: 0.687,
  poradce8: 0.71,
  poradce9: 0.73,
  poradce10: 0.752,
  manazer4: 0.633,
  manazer5: 0.69,
  manazer6: 0.747,
  manazer7: 0.807,
  manazer8: 0.863,
  manazer9: 0.92,
  manazer10: 0.987,
};

const NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.4445,
  poradce2: 0.489,
  poradce3: 0.5335,
  poradce4: 0.689,
  poradce5: 0.761,
  poradce6: 0.8,
  poradce7: 0.8385,
  poradce8: 0.877,
  poradce9: 0.9165,
  poradce10: 0.955,
  manazer4: 0.7575,
  manazer5: 0.8395,
  manazer6: 0.9205,
  manazer7: 1.0015,
  manazer8: 1.083,
  manazer9: 1.1635,
  manazer10: 1.2445,
};

const roundToCents = (value: number): number => Math.round(value * 100) / 100;
const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (value: number): number => value / 100;
const toCommissionMode = (value: unknown): CommissionMode | null =>
  value === "accelerated" || value === "standard" ? value : null;
const isAcceleratedMode = (mode: CommissionMode | null | undefined): boolean =>
  mode === "accelerated";

const isImmediateCommissionTitle = (title: string): boolean =>
  normalizeTitleForCompare(title).includes("okamžitá provize");

const hasNeonImmediateCoefficient = (
  position: Position | null | undefined
): position is Position =>
  !!position &&
  Number.isFinite(NEON_IMMEDIATE_TOTAL_COEFFICIENTS[position]) &&
  Number.isFinite(NEON_IMMEDIATE_B0301_COEFFICIENTS[position]) &&
  Number.isFinite(NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position]);

const buildNeonImmediateBreakdown = (
  amount: number,
  position: Position | null | undefined,
  mode: CommissionMode | null | undefined
): NeonImmediateBreakdown | null => {
  if (!hasNeonImmediateCoefficient(position)) return null;

  const includeB3601 = isAcceleratedMode(mode);
  const totalCoefficient = NEON_IMMEDIATE_TOTAL_COEFFICIENTS[position];
  const b0301Coefficient = NEON_IMMEDIATE_B0301_COEFFICIENTS[position];
  const b3601HalfCoefficient = includeB3601
    ? NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position]
    : 0;
  const a101Coefficient =
    totalCoefficient - b0301Coefficient - b3601HalfCoefficient;
  if (!Number.isFinite(totalCoefficient) || totalCoefficient <= 0) return null;
  if (!Number.isFinite(b0301Coefficient) || b0301Coefficient < 0) return null;
  if (!Number.isFinite(b3601HalfCoefficient) || b3601HalfCoefficient < 0) return null;
  if (a101Coefficient < -0.000001) return null;

  const total = Number(amount);
  if (!Number.isFinite(total) || total <= 0) return null;

  const baseAmount = total / totalCoefficient;
  const partDefs: { label: string; raw: number }[] = [
    { label: "Provize 101A", raw: baseAmount * Math.max(0, a101Coefficient) },
    { label: "Provize B0301", raw: baseAmount * b0301Coefficient },
    ...(includeB3601
      ? [
          {
            label: "Provize 50% z B3601",
            raw: baseAmount * b3601HalfCoefficient,
          },
        ]
      : []),
  ];
  if (partDefs.length === 0) return null;

  const partCents = partDefs.map((part) => ({
    label: part.label,
    cents: Math.max(0, toCents(part.raw)),
  }));
  const totalCents = toCents(total);
  const lastIdx = partCents.length - 1;
  const roundedSumCents = partCents.reduce((sum, part) => sum + part.cents, 0);
  partCents[lastIdx].cents += totalCents - roundedSumCents;

  if (partCents[lastIdx].cents < 0) {
    let deficit = -partCents[lastIdx].cents;
    partCents[lastIdx].cents = 0;
    for (let idx = lastIdx - 1; idx >= 0 && deficit > 0; idx -= 1) {
      const reduceBy = Math.min(partCents[idx].cents, deficit);
      partCents[idx].cents -= reduceBy;
      deficit -= reduceBy;
    }
    if (deficit > 0) return null;
  }

  return {
    position,
    totalCoefficient,
    a101Coefficient: Math.max(0, a101Coefficient),
    b0301Coefficient,
    b3601HalfCoefficient,
    includeB3601,
    total,
    parts: partCents.map((part) => ({
      label: part.label,
      amount: roundToCents(fromCents(part.cents)),
    })),
  };
};

export default function ContractDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const backToContractsHref =
    searchParams?.get("from") === "list" ? "/smlouvy?restore=1" : "/smlouvy";
  const fromListSuffix = searchParams?.get("from") === "list" ? "?from=list" : "";

  // slug: email___entryId
  let ownerEmail: string | null = null;
  let entryId: string | null = null;

  if (typeof rawId === "string") {
    const decoded = decodeURIComponent(rawId);
    const parts = decoded.split("___");
    if (parts.length === 2) {
      ownerEmail = parts[0];
      entryId = parts[1];
    }
  }

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [managerPosition, setManagerPosition] = useState<Position | null>(
    null
  );

  const [contract, setContract] = useState<ContractDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractTimeline, setContractTimeline] = useState<ContractDoc[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const [overrideItems, setOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [overrideTotal, setOverrideTotal] = useState<number | null>(null);
  const [overrideMode, setOverrideMode] = useState<CommissionMode | null>(null);
  const [childOverrideItems, setChildOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [childOverrideTotal, setChildOverrideTotal] = useState<number | null>(null);
  const [childOverrideMode, setChildOverrideMode] = useState<CommissionMode | null>(null);
  const [childOverrideLabel, setChildOverrideLabel] = useState<string | null>(null);
  const [childOverrideName, setChildOverrideName] = useState<string | null>(null);
  const [childOverridePosition, setChildOverridePosition] = useState<Position | null>(null);
  const [showProductPanel, setShowProductPanel] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showAdvisorDetails, setShowAdvisorDetails] = useState(false);
  const [ownerPosition, setOwnerPosition] = useState<Position | null>(null);
  const [ownerManagerEmail, setOwnerManagerEmail] = useState<string | null>(null);
  const [ownerManagerPosition, setOwnerManagerPosition] = useState<Position | null>(null);
  const [currentChainEmails, setCurrentChainEmails] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [updatingPaid, setUpdatingPaid] = useState(false);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [updatingStorno, setUpdatingStorno] = useState(false);
  const [stornoError, setStornoError] = useState<string | null>(null);
  const [stornoDateInput, setStornoDateInput] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStornoModal, setShowStornoModal] = useState(false);
  const [showPaymentVerificationModal, setShowPaymentVerificationModal] =
    useState(false);
  const [neonImmediateBreakdown, setNeonImmediateBreakdown] =
    useState<NeonImmediateBreakdown | null>(null);
  const [canOpenRefreshReplacement, setCanOpenRefreshReplacement] = useState(false);
  const { toasts, pushToast, dismissToast } = useToasts();
  const [unauthorized, setUnauthorized] = useState(false);
  const cppStatusSyncKeyRef = useRef<string | null>(null);
  const isNeonImmediateBreakdownOpen = neonImmediateBreakdown != null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDeleteModal(false);
        setShowStornoModal(false);
        setShowPaymentVerificationModal(false);
        setNeonImmediateBreakdown(null);
      }
    };
    if (
      showDeleteModal ||
      showStornoModal ||
      showPaymentVerificationModal ||
      isNeonImmediateBreakdownOpen
    ) {
      window.addEventListener("keydown", onKey);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [
    showDeleteModal,
    showStornoModal,
    showPaymentVerificationModal,
    isNeonImmediateBreakdownOpen,
  ]);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const requestContractsApi = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!user) {
        const err = new Error("Nejsi přihlášený.") as ContractsApiError;
        err.status = 401;
        throw err;
      }

      const doRequest = async (token: string) => {
        const headers = new Headers(init?.headers ?? {});
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(path, {
          ...(init ?? {}),
          headers,
          cache: init?.cache ?? "no-store",
        });
      };

      let token = await user.getIdToken();
      let res = await doRequest(token);
      if (res.status === 401) {
        token = await user.getIdToken(true);
        res = await doRequest(token);
      }

      const payload = (await res.json().catch(() => ({}))) as ContractsApiResponseBase;
      if (!res.ok || payload?.ok === false) {
        const err = new Error(
          payload?.error || "Požadavek na API smluv selhal."
        ) as ContractsApiError;
        err.status = res.status;
        throw err;
      }

      return payload as T;
    },
    [user]
  );

  useEffect(() => {
    preloadFormulaModule(contract?.productKey ?? null);
  }, [contract?.productKey]);

  useEffect(() => {
    const existing = toDateInputValue(contract?.stornoDate ?? null);
    if (existing) {
      setStornoDateInput(existing);
      return;
    }
    setStornoDateInput(toDateInputValue(new Date()) ?? "");
  }, [contract?.stornoDate]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!ownerEmail || !entryId) {
        setError("Neplatný odkaz na smlouvu.");
        setLoading(false);
        setTimelineLoading(false);
        return;
      }
      if (!user) return;

      setLoading(true);
      setTimelineLoading(true);
      setError(null);
      setTimelineError(null);
      setUnauthorized(false);

      try {
        const params = new URLSearchParams({
          ownerEmail,
          entryId,
        });
        const payload = await requestContractsApi<ContractDetailApiResponse>(
          `/api/contracts/detail?${params.toString()}`
        );
        if (cancelled) return;

        if (!payload.contract) {
          setError("Smlouva nebyla nalezena.");
          setContract(null);
          setContractTimeline([]);
          setOwnerPosition(null);
          setOwnerManagerEmail(null);
          setOwnerManagerPosition(null);
          setCurrentChainEmails([]);
          setManagerPosition(null);
          return;
        }

        setContract(payload.contract);
        setNoteDraft((payload.contract.note as string | undefined) ?? "");
        const timeline =
          Array.isArray(payload.timeline) && payload.timeline.length > 0
            ? payload.timeline
            : [payload.contract];
        setContractTimeline(timeline);
        setOwnerPosition((payload.ownerMeta?.position as Position | null | undefined) ?? null);
        setOwnerManagerEmail(
          normalizeEmail(payload.ownerMeta?.managerEmail ?? null) || null
        );
        setOwnerManagerPosition(
          (payload.ownerMeta?.managerPosition as Position | null | undefined) ?? null
        );
        setCurrentChainEmails(
          Array.isArray(payload.ownerMeta?.currentChainEmails)
            ? payload.ownerMeta?.currentChainEmails
                .map((item) => normalizeEmail(item))
                .filter((item): item is string => Boolean(item))
            : []
        );
        setManagerPosition((payload.position as Position | null | undefined) ?? null);
      } catch (e) {
        console.error("Chyba při načítání detailu smlouvy:", e);
        if (cancelled) return;

        const status = (e as ContractsApiError).status;
        if (status === 403) {
          setUnauthorized(true);
          setError("Nemáš oprávnění zobrazit tuto smlouvu.");
        } else if (status === 404) {
          setError("Smlouva nebyla nalezena.");
        } else if (status === 401) {
          setUnauthorized(true);
          setError("Přihlášení vypršelo. Přihlas se prosím znovu.");
        } else {
          setError("Při načítání smlouvy došlo k chybě.");
        }
        setContract(null);
        setContractTimeline([]);
        setOwnerPosition(null);
        setOwnerManagerEmail(null);
        setOwnerManagerPosition(null);
        setCurrentChainEmails([]);
        setTimelineError("Timeline změn se nepodařilo načíst.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTimelineLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [entryId, ownerEmail, requestContractsApi, user]);

  const isEndorsement = contract?.entryType === "endorsement";
  const lifecycleInput = {
    status: contract?.status,
    productKey: contract?.productKey,
    policyStartDate: contract?.policyStartDate,
    durationYears:
      typeof contract?.durationYears === "number" && !Number.isNaN(contract.durationYears)
        ? contract.durationYears
        : null,
  };
  const lifecycleStatus = contractLifecycleStatus(lifecycleInput);
  const isStornoContract = lifecycleStatus === "storno";
  const isDozitaContract = lifecycleStatus === "dozita";
  const stornoDateLabel = contract?.stornoDate
    ? formatDate(contract.stornoDate)
    : "—";
  const maturityDate = contractMaturityDate(lifecycleInput);
  const maturityDateLabel = maturityDate ? formatDate(maturityDate) : "—";
  const refreshOriginalContractNumber =
    typeof contract?.refreshOriginalContractNumber === "string"
      ? contract.refreshOriginalContractNumber.trim()
      : "";
  const isRefreshContract =
    contract?.isRefresh === true || refreshOriginalContractNumber.length > 0;
  const refreshReplacementEntryId =
    typeof contract?.refreshReplacedByEntryId === "string"
      ? contract.refreshReplacedByEntryId.trim()
      : "";
  const refreshReplacementOwnerEmail =
    normalizeEmail(contract?.refreshReplacedByOwnerEmail ?? null) ?? "";
  const hasRefreshReplacement =
    refreshReplacementEntryId.length > 0 && refreshReplacementOwnerEmail.length > 0;
  const refreshReplacementSignedLabel = contract?.refreshReplacedBySignedDate
    ? formatDate(contract.refreshReplacedBySignedDate)
    : "—";
  const refreshReplacementHref = hasRefreshReplacement
    ? `/smlouvy/${encodeURIComponent(
        `${refreshReplacementOwnerEmail}___${refreshReplacementEntryId}`
      )}${fromListSuffix}`
    : null;
  const premium = isEndorsement
    ? Number(
        contract?.newInputAmount ??
          contract?.effectiveInputAmount ??
          contract?.inputAmount ??
          0
      )
    : Number(contract?.inputAmount ?? 0);
  const endorsementDelta = (() => {
    if (!isEndorsement) return null;
    const explicit = Number(contract?.premiumDelta ?? Number.NaN);
    if (Number.isFinite(explicit)) return explicit;
    const prev = Number(contract?.previousInputAmount ?? Number.NaN);
    const next = Number(
      contract?.newInputAmount ??
        contract?.effectiveInputAmount ??
        contract?.inputAmount ??
        Number.NaN
    );
    if (Number.isFinite(prev) && Number.isFinite(next)) return next - prev;
    return null;
  })();
  const modeLabel = (value?: CommissionMode | null) => {
    if (value === "accelerated") return "Zrychlený";
    if (value === "standard") return "Běžný";
    return "—";
  };
  const timelineRows = useMemo(() => {
    const normalizedOwner = normalizeEmail(ownerEmail);
    const encodedFromList =
      searchParams?.get("from") === "list" ? "?from=list" : "";

    const premiumForEntry = (entry: ContractDoc): number => {
      const isEntryEndorsement = entry.entryType === "endorsement";
      const value = isEntryEndorsement
        ? Number(
            entry.newInputAmount ??
              entry.effectiveInputAmount ??
              entry.inputAmount ??
              0
          )
        : Number(entry.inputAmount ?? 0);
      return Number.isFinite(value) ? value : 0;
    };

    const deltaForEntry = (entry: ContractDoc): number | null => {
      if (entry.entryType !== "endorsement") return null;
      const explicit = Number(entry.premiumDelta ?? Number.NaN);
      if (Number.isFinite(explicit)) return explicit;
      const prev = Number(entry.previousInputAmount ?? Number.NaN);
      const next = Number(
        entry.newInputAmount ??
          entry.effectiveInputAmount ??
          entry.inputAmount ??
          Number.NaN
      );
      if (Number.isFinite(prev) && Number.isFinite(next)) return next - prev;
      return null;
    };

    return contractTimeline.map((entry, index) => {
      const isCurrent = entry.id === contract?.id;
      const isEntryEndorsement = entry.entryType === "endorsement";
      const delta = deltaForEntry(entry);
      const premiumAmount = premiumForEntry(entry);
      const dateForOrder =
        toDate(entry.policyStartDate) ??
        toDate(entry.contractSignedDate) ??
        toDate(entry.createdAt) ??
        null;

      return {
        id: entry.id,
        href: normalizedOwner
          ? `/smlouvy/${encodeURIComponent(`${normalizedOwner}___${entry.id}`)}${encodedFromList}`
          : null,
        isCurrent,
        step: index + 1,
        label: isEntryEndorsement ? "Dodatek" : "Původní smlouva",
        premiumAmount,
        delta,
        contractSignedText: formatDate(entry.contractSignedDate ?? entry.createdAt),
        policyStartText: formatDate(entry.policyStartDate),
        positionText: positionLabel(entry.position ?? null),
        modeText: modeLabel(entry.commissionMode ?? null),
        total: Number(entry.total ?? 0),
        orderDateText: dateForOrder ? dateForOrder.toLocaleDateString("cs-CZ") : "—",
      };
    });
  }, [contract?.id, contractTimeline, ownerEmail, searchParams]);
  const hasTimelineChange = useMemo(() => {
    if (isEndorsement) return true;
    return contractTimeline.some((entry) => entry.entryType === "endorsement");
  }, [contractTimeline, isEndorsement]);
  const contractTotal = contract?.total ?? 0;
  const freq = (contract?.frequencyRaw as PaymentFrequency | null | undefined) ?? null;
  const prod = contract?.productKey as Product | undefined;
  const paymentVerificationUrl =
    prod === "allianzAuto" || prod === "allianzmujdomov"
      ? ALLIANZ_PAYMENT_CHECK_URL
      : prod === "slaviaauto"
      ? SLAVIA_PAYMENT_CHECK_URL
      : prod && CPP_PAYMENT_CHECK_PRODUCTS.has(prod)
      ? CPP_PAYMENT_CHECK_URL
      : prod && KOOPERATIVA_PAYMENT_CHECK_PRODUCTS.has(prod)
      ? KOOPERATIVA_PAYMENT_CHECK_URL
      : null;
  const canEmbedPaymentVerification =
    paymentVerificationUrl === KOOPERATIVA_PAYMENT_CHECK_URL ||
    paymentVerificationUrl === CPP_PAYMENT_CHECK_URL;
  const isLifeInsuranceContract = Boolean(prod && LIFE_PRODUCT_KEYS.has(prod));
  const showTimelineSection = isLifeInsuranceContract && hasTimelineChange;
  const isPaymentBasedProduct =
    prod === "domex" || prod === "koopmajetekobcan" || prod === "maxdomov";
  const paymentMultiplier = isPaymentBasedProduct ? paymentsPerYear(freq) : 1;
  const durationYears =
    typeof contract?.durationYears === "number" && !Number.isNaN(contract.durationYears)
      ? contract.durationYears
      : null;
  const durationBounds: [number, number] | null =
    prod === "neon"
      ? [1, 99]
      : prod === "maximaMaxEfekt"
      ? [1, 20]
      : prod === "flexi"
      ? [1, 80]
      : null;
  const showDurationForProduct = durationBounds != null;
  const normalizedUserEmail = useMemo(
    () => normalizeEmail(user?.email ?? null),
    [user?.email]
  );
  const normalizedOwnerEmail = useMemo(
    () => normalizeEmail(contract?.userEmail ?? null),
    [contract?.userEmail]
  );
  const isOwnContract = useMemo(() => {
    if (!normalizedUserEmail || !normalizedOwnerEmail) return false;
    return normalizedUserEmail === normalizedOwnerEmail;
  }, [normalizedOwnerEmail, normalizedUserEmail]);

  const isManagerOnChain = useMemo(() => {
    if (!contract || !normalizedUserEmail || !normalizedOwnerEmail) return false;
    if (normalizedUserEmail === normalizedOwnerEmail) return false;
    if (normalizeEmail(contract.managerEmailSnapshot) === normalizedUserEmail) return true;
    if (isEmailInChain(normalizedUserEmail, contract.managerChain ?? null)) return true;
    if (isEmailInChain(normalizedUserEmail, contract.managerOverrides ?? null)) return true;
    return false;
  }, [contract, normalizedOwnerEmail, normalizedUserEmail]);

  const isManagerOnCurrentChain = useMemo(() => {
    if (!normalizedUserEmail || !currentChainEmails.length) return false;
    if (normalizedOwnerEmail && normalizedUserEmail === normalizedOwnerEmail) return false;
    return currentChainEmails.includes(normalizedUserEmail);
  }, [currentChainEmails, normalizedOwnerEmail, normalizedUserEmail]);

  const isManagerViewingSubordinate = useMemo(() => {
    if (!isManagerPosition(managerPosition)) return false;
    return isManagerOnChain || isManagerOnCurrentChain;
  }, [managerPosition, isManagerOnChain, isManagerOnCurrentChain]);
  const canViewContract = isOwnContract || isManagerOnChain || isManagerOnCurrentChain;

  useEffect(() => {
    const owner = normalizeEmail(ownerEmail);
    const entryKey = contract?.id ?? "";
    const contractNumber = (contract?.contractNumber ?? "").trim();
    const product = contract?.productKey as Product | undefined;

    if (!user || !owner || !entryKey || !contractNumber || !product) return;
    if (!CPP_PAYMENT_CHECK_PRODUCTS.has(product)) return;
    if (!canViewContract) return;

    const syncKey = `${owner}___${entryKey}`;
    if (cppStatusSyncKeyRef.current === syncKey) return;
    cppStatusSyncKeyRef.current = syncKey;

    let cancelled = false;

    const requestWithToken = async (token: string) =>
      fetch("/api/contracts/sync-cpp-status", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail: owner,
          entryId: entryKey,
        }),
      });

    const syncCppStatus = async () => {
      try {
        let token = await user.getIdToken();
        let res = await requestWithToken(token);
        let data = (await res.json()) as any;

        if (res.status === 401) {
          token = await user.getIdToken(true);
          res = await requestWithToken(token);
          data = (await res.json()) as any;
        }

        if (!res.ok || data?.ok === false) {
          console.warn("ČPP sync status selhal:", data?.error ?? res.statusText);
          return;
        }

        if (cancelled) return;
        const appliedStatus =
          data?.appliedStatus === "storno"
            ? "storno"
            : data?.appliedStatus === "active"
            ? "active"
            : null;
        if (!appliedStatus) return;

        const stornoDateMs = Number(data?.stornoDateMs);
        const stornoDate =
          appliedStatus === "storno"
            ? Number.isFinite(stornoDateMs)
              ? new Date(stornoDateMs)
              : toDate(contract?.stornoDate ?? null)
            : null;

        setContract((prev) =>
          prev
            ? {
                ...prev,
                status: appliedStatus,
                stornoDate,
              }
            : prev
        );
        setContractTimeline((prev) =>
          prev.map((entry) => ({
            ...entry,
            status: appliedStatus,
            stornoDate,
          }))
        );

        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem("contracts_cache_v2");
            localStorage.setItem("contracts_last_updated", String(Date.now()));
            window.dispatchEvent(new Event("contracts:updated"));
          } catch {
            // best effort cache invalidation
          }
        }
      } catch (err) {
        console.warn("Automatická synchronizace ČPP stavu selhala:", err);
      }
    };

    void syncCppStatus();
    return () => {
      cancelled = true;
    };
  }, [
    canViewContract,
    contract?.contractNumber,
    contract?.id,
    contract?.productKey,
    contract?.stornoDate,
    ownerEmail,
    user,
  ]);

  useEffect(() => {
    let cancelled = false;

    const checkRefreshReplacementAccess = async () => {
      if (!hasRefreshReplacement || !normalizedUserEmail) {
        setCanOpenRefreshReplacement(false);
        return;
      }

      if (normalizedUserEmail === refreshReplacementOwnerEmail) {
        setCanOpenRefreshReplacement(true);
        return;
      }

      try {
        const params = new URLSearchParams({
          ownerEmail: refreshReplacementOwnerEmail,
          entryId: refreshReplacementEntryId,
          includeTimeline: "0",
        });
        await requestContractsApi<ContractDetailApiResponse>(
          `/api/contracts/detail?${params.toString()}`
        );
        if (!cancelled) setCanOpenRefreshReplacement(true);
      } catch (refreshAccessErr) {
        const status = (refreshAccessErr as ContractsApiError).status;
        if (status !== 403 && status !== 404) {
          console.error(
            "Chyba při ověřování přístupu na refresh smlouvu:",
            refreshAccessErr
          );
        }
        if (!cancelled) setCanOpenRefreshReplacement(false);
      }
    };

    void checkRefreshReplacementAccess();
    return () => {
      cancelled = true;
    };
  }, [
    hasRefreshReplacement,
    normalizedUserEmail,
    requestContractsApi,
    refreshReplacementOwnerEmail,
    refreshReplacementEntryId,
  ]);

  const effectiveManagerPosition = useMemo(() => {
    if (!contract) return managerPosition ?? null;

    const snapshotPosition =
      (contract.managerPositionSnapshot as Position | null | undefined) ?? null;
    const viewerEmail = normalizedUserEmail;
    if (!viewerEmail) return snapshotPosition ?? managerPosition ?? null;

    const overrides = (contract.managerOverrides as ContractDoc["managerOverrides"]) ?? [];
    const overridePosition =
      overrides.find((o) => normalizeEmail(o.email) === viewerEmail)?.position ?? null;
    if (overridePosition) return overridePosition;

    const chain = (contract.managerChain as ContractDoc["managerChain"]) ?? [];
    const chainPosition =
      chain.find((node) => normalizeEmail(node.email) === viewerEmail)?.position ?? null;
    if (chainPosition) return chainPosition;

    const snapshotManagerEmail = normalizeEmail(contract.managerEmailSnapshot ?? null);
    if (snapshotManagerEmail === viewerEmail && snapshotPosition) {
      return snapshotPosition;
    }

    return snapshotPosition ?? managerPosition ?? null;
  }, [contract, managerPosition, normalizedUserEmail]);

  const [editMode, setEditMode] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientAddress, setEditClientAddress] = useState("");
  const [editContractNumber, setEditContractNumber] = useState("");
  const [editContractSigned, setEditContractSigned] = useState("");
  const [editPolicyStart, setEditPolicyStart] = useState("");
  const [editDuration, setEditDuration] = useState<number | null>(null);
  const [editCarMake, setEditCarMake] = useState("");
  const [editCarPlate, setEditCarPlate] = useState("");
  const [editCarVin, setEditCarVin] = useState("");
  const [editCarTp, setEditCarTp] = useState("");
  const [editCarLiabilityLimit, setEditCarLiabilityLimit] = useState("");
  const [editCarHullSumInsured, setEditCarHullSumInsured] = useState("");
  const [editCarHullDeductible, setEditCarHullDeductible] = useState("");
  const [editCarAssistancePlan, setEditCarAssistancePlan] = useState("");
  const [editCarAddonGlass, setEditCarAddonGlass] = useState(false);
  const [editCarAddonAnimalCollision, setEditCarAddonAnimalCollision] = useState(false);
  const [editCarAddonAnimalDamage, setEditCarAddonAnimalDamage] = useState(false);
  const [editCarAddonVandalism, setEditCarAddonVandalism] = useState(false);
  const [editCarAddonTheft, setEditCarAddonTheft] = useState(false);
  const [editCarAddonNatural, setEditCarAddonNatural] = useState(false);
  const [editCarAddonOwnDamage, setEditCarAddonOwnDamage] = useState(false);
  const [editCarAddonGap, setEditCarAddonGap] = useState(false);
  const [editCarAddonSmartGap, setEditCarAddonSmartGap] = useState(false);
  const [editCarAddonServisPro, setEditCarAddonServisPro] = useState(false);
  const [editCarAddonReplacementCar, setEditCarAddonReplacementCar] = useState(false);
  const [editCarAddonLuggage, setEditCarAddonLuggage] = useState(false);
  const [editCarAddonPassengerInjury, setEditCarAddonPassengerInjury] = useState(false);
  const [editNeonVersion, setEditNeonVersion] = useState("");
  const [editNeonDeathType, setEditNeonDeathType] = useState("");
  const [editNeonDeathAmount, setEditNeonDeathAmount] = useState("");
  const [editNeonDeath2Type, setEditNeonDeath2Type] = useState("");
  const [editNeonDeath2Amount, setEditNeonDeath2Amount] = useState("");
  const [editNeonDeathTerminalAmount, setEditNeonDeathTerminalAmount] = useState("");
  const [editNeonWaiverInvalidity, setEditNeonWaiverInvalidity] = useState(false);
  const [editNeonWaiverUnemployment, setEditNeonWaiverUnemployment] = useState(false);
  const [editNeonInvalidityAType, setEditNeonInvalidityAType] = useState("");
  const [editNeonInvalidityA1, setEditNeonInvalidityA1] = useState("");
  const [editNeonInvalidityA2, setEditNeonInvalidityA2] = useState("");
  const [editNeonInvalidityA3, setEditNeonInvalidityA3] = useState("");
  const [editNeonInvalidityBType, setEditNeonInvalidityBType] = useState("");
  const [editNeonInvalidityB1, setEditNeonInvalidityB1] = useState("");
  const [editNeonInvalidityB2, setEditNeonInvalidityB2] = useState("");
  const [editNeonInvalidityB3, setEditNeonInvalidityB3] = useState("");
  const [editNeonInvalidityPension, setEditNeonInvalidityPension] = useState(false);
  const [editNeonCriticalType, setEditNeonCriticalType] = useState("");
  const [editNeonCriticalAmount, setEditNeonCriticalAmount] = useState("");
  const [editNeonChildSurgeryAmount, setEditNeonChildSurgeryAmount] = useState("");
  const [editNeonVaccinationCompAmount, setEditNeonVaccinationCompAmount] = useState("");
  const [editNeonDiabetesAmount, setEditNeonDiabetesAmount] = useState("");
  const [editNeonDeathAccidentAmount, setEditNeonDeathAccidentAmount] = useState("");
  const [editNeonInjuryPermanentAmount, setEditNeonInjuryPermanentAmount] = useState("");
  const [editNeonHospitalizationAmount, setEditNeonHospitalizationAmount] = useState("");
  const [editNeonHospitalizationIllnessAmount, setEditNeonHospitalizationIllnessAmount] = useState("");
  const [editNeonHospitalizationInjuryAmount, setEditNeonHospitalizationInjuryAmount] = useState("");
  const [editNeonWorkIncapacityStart, setEditNeonWorkIncapacityStart] = useState("");
  const [editNeonWorkIncapacityBackpay, setEditNeonWorkIncapacityBackpay] = useState("");
  const [editNeonWorkIncapacityAmount, setEditNeonWorkIncapacityAmount] = useState("");
  const [editNeonWorkIncapacityInjury, setEditNeonWorkIncapacityInjury] = useState(false);
  const [editNeonWorkIncapacityIllness, setEditNeonWorkIncapacityIllness] = useState(false);
  const [editNeonCareDependencyAmount, setEditNeonCareDependencyAmount] = useState("");
  const [editNeonSpecialAidAmount, setEditNeonSpecialAidAmount] = useState("");
  const [editNeonCaregivingAmount, setEditNeonCaregivingAmount] = useState("");
  const [editNeonReproductionCostAmount, setEditNeonReproductionCostAmount] = useState("");
  const [editNeonCppHelp, setEditNeonCppHelp] = useState(false);
  const [editNeonLiabilityCitizenLimit, setEditNeonLiabilityCitizenLimit] = useState("");
  const [editNeonLiabilityEmployeeLimit, setEditNeonLiabilityEmployeeLimit] = useState("");
  const [editNeonTravelInsurance, setEditNeonTravelInsurance] = useState(false);
  const [editNeonAccidentDailyBenefit, setEditNeonAccidentDailyBenefit] = useState("");
  const [editFlexiDeathAmount, setEditFlexiDeathAmount] = useState("");
  const [editFlexiDeathTypedType, setEditFlexiDeathTypedType] = useState("");
  const [editFlexiDeathTypedAmount, setEditFlexiDeathTypedAmount] = useState("");
  const [editFlexiDeathAccidentAmount, setEditFlexiDeathAccidentAmount] = useState("");
  const [editFlexiSeriousIllnessType, setEditFlexiSeriousIllnessType] = useState("");
  const [editFlexiSeriousIllnessAmount, setEditFlexiSeriousIllnessAmount] = useState("");
  const [editFlexiIllnessForHim, setEditFlexiIllnessForHim] = useState("");
  const [editFlexiIllnessForHer, setEditFlexiIllnessForHer] = useState("");
  const [editFlexiPermanentIllnessAmount, setEditFlexiPermanentIllnessAmount] = useState("");
  const [editFlexiInvalidityIllnessType, setEditFlexiInvalidityIllnessType] = useState("");
  const [editFlexiInvalidityIllness1, setEditFlexiInvalidityIllness1] = useState("");
  const [editFlexiInvalidityIllness2, setEditFlexiInvalidityIllness2] = useState("");
  const [editFlexiInvalidityIllness3, setEditFlexiInvalidityIllness3] = useState("");
  const [editFlexiHospitalGeneralAmount, setEditFlexiHospitalGeneralAmount] = useState("");
  const [editFlexiWorkIncapacityStart, setEditFlexiWorkIncapacityStart] = useState("");
  const [editFlexiWorkIncapacityBackpay, setEditFlexiWorkIncapacityBackpay] = useState("");
  const [editFlexiWorkIncapacityAmount, setEditFlexiWorkIncapacityAmount] = useState("");
  const [editFlexiCaregivingAmount, setEditFlexiCaregivingAmount] = useState("");
  const [editFlexiPermanentAccidentAmount, setEditFlexiPermanentAccidentAmount] = useState("");
  const [editFlexiInjuryDamageAmount, setEditFlexiInjuryDamageAmount] = useState("");
  const [editFlexiAccidentDailyBenefit, setEditFlexiAccidentDailyBenefit] = useState("");
  const [editFlexiHospitalAccidentAmount, setEditFlexiHospitalAccidentAmount] = useState("");
  const [editFlexiInvalidityAccidentType, setEditFlexiInvalidityAccidentType] = useState("");
  const [editFlexiInvalidityAccident1, setEditFlexiInvalidityAccident1] = useState("");
  const [editFlexiInvalidityAccident2, setEditFlexiInvalidityAccident2] = useState("");
  const [editFlexiInvalidityAccident3, setEditFlexiInvalidityAccident3] = useState("");
  const [editFlexiTrafficDeathAccidentAmount, setEditFlexiTrafficDeathAccidentAmount] = useState("");
  const [editFlexiTrafficPermanentAccidentAmount, setEditFlexiTrafficPermanentAccidentAmount] = useState("");
  const [editFlexiTrafficInjuryDamageAmount, setEditFlexiTrafficInjuryDamageAmount] = useState("");
  const [editFlexiTrafficAccidentDailyBenefit, setEditFlexiTrafficAccidentDailyBenefit] = useState("");
  const [editFlexiTrafficHospitalAccidentAmount, setEditFlexiTrafficHospitalAccidentAmount] = useState("");
  const [editFlexiTrafficWorkIncapacityAmount, setEditFlexiTrafficWorkIncapacityAmount] = useState("");
  const [editFlexiTrafficInvalidityAmount, setEditFlexiTrafficInvalidityAmount] = useState("");
  const [editFlexiLoanDeathAmount, setEditFlexiLoanDeathAmount] = useState("");
  const [editFlexiLoanInvalidityType, setEditFlexiLoanInvalidityType] = useState("");
  const [editFlexiLoanInvalidity1, setEditFlexiLoanInvalidity1] = useState("");
  const [editFlexiLoanInvalidity2, setEditFlexiLoanInvalidity2] = useState("");
  const [editFlexiLoanInvalidity3, setEditFlexiLoanInvalidity3] = useState("");
  const [editFlexiLoanIllnessAmount, setEditFlexiLoanIllnessAmount] = useState("");
  const [editFlexiLoanWorkIncapacityAmount, setEditFlexiLoanWorkIncapacityAmount] = useState("");
  const [editFlexiAddonMajakBasic, setEditFlexiAddonMajakBasic] = useState(false);
  const [editFlexiAddonMajakPlus, setEditFlexiAddonMajakPlus] = useState(false);
  const [editFlexiAddonLiabilityCitizen, setEditFlexiAddonLiabilityCitizen] = useState("");
  const [editFlexiAddonTravel, setEditFlexiAddonTravel] = useState(false);
  const [editDomexAddress, setEditDomexAddress] = useState("");
  const [editDomexPropertyType, setEditDomexPropertyType] = useState("");
  const [editDomexPropertyCoverage, setEditDomexPropertyCoverage] = useState("");
  const [editDomexSumInsured, setEditDomexSumInsured] = useState("");
  const [editDomexDeductible, setEditDomexDeductible] = useState("");
  const [editDomexHouseholdType, setEditDomexHouseholdType] = useState("");
  const [editDomexHouseholdCoverage, setEditDomexHouseholdCoverage] = useState("");
  const [editDomexHouseholdSumInsured, setEditDomexHouseholdSumInsured] = useState("");
  const [editDomexHouseholdDeductible, setEditDomexHouseholdDeductible] = useState("");
  const [editDomexOutbuildingSumInsured, setEditDomexOutbuildingSumInsured] = useState("");
  const [editDomexLiabilitySumInsured, setEditDomexLiabilitySumInsured] = useState("");
  const [editDomexLiabilityDeductible, setEditDomexLiabilityDeductible] = useState("");
  const [editDomexLiabilityMobile, setEditDomexLiabilityMobile] = useState(false);
  const [editDomexLiabilityTenant, setEditDomexLiabilityTenant] = useState(false);
  const [editDomexLiabilityLandlord, setEditDomexLiabilityLandlord] = useState(false);
  const [editDomexAssistancePlus, setEditDomexAssistancePlus] = useState(false);
  const [editDomexNote, setEditDomexNote] = useState("");

  const autoFields: AutoFields = {
    carMake: editCarMake,
    carPlate: editCarPlate,
    carVin: editCarVin,
    carTp: editCarTp,
    carLiabilityLimit: editCarLiabilityLimit,
    carHullSumInsured: editCarHullSumInsured,
    carHullDeductible: editCarHullDeductible,
    carAssistancePlan: editCarAssistancePlan,
    carAddonGlass: editCarAddonGlass,
    carAddonAnimalCollision: editCarAddonAnimalCollision,
    carAddonAnimalDamage: editCarAddonAnimalDamage,
    carAddonVandalism: editCarAddonVandalism,
    carAddonTheft: editCarAddonTheft,
    carAddonNatural: editCarAddonNatural,
    carAddonOwnDamage: editCarAddonOwnDamage,
    carAddonGap: editCarAddonGap,
    carAddonSmartGap: editCarAddonSmartGap,
    carAddonServisPro: editCarAddonServisPro,
    carAddonReplacementCar: editCarAddonReplacementCar,
    carAddonLuggage: editCarAddonLuggage,
    carAddonPassengerInjury: editCarAddonPassengerInjury,
  };

  const neonFields: NeonFields = {
    version: editNeonVersion,
    deathType: editNeonDeathType,
    deathAmount: editNeonDeathAmount,
    death2Type: editNeonDeath2Type,
    death2Amount: editNeonDeath2Amount,
    deathTerminalAmount: editNeonDeathTerminalAmount,
    waiverInvalidity: editNeonWaiverInvalidity,
    waiverUnemployment: editNeonWaiverUnemployment,
    invalidityAType: editNeonInvalidityAType,
    invalidityA1: editNeonInvalidityA1,
    invalidityA2: editNeonInvalidityA2,
    invalidityA3: editNeonInvalidityA3,
    invalidityBType: editNeonInvalidityBType,
    invalidityB1: editNeonInvalidityB1,
    invalidityB2: editNeonInvalidityB2,
    invalidityB3: editNeonInvalidityB3,
    invalidityPension: editNeonInvalidityPension,
    criticalType: editNeonCriticalType,
    criticalAmount: editNeonCriticalAmount,
    childSurgeryAmount: editNeonChildSurgeryAmount,
    vaccinationCompAmount: editNeonVaccinationCompAmount,
    accidentDailyBenefit: editNeonAccidentDailyBenefit,
    diabetesAmount: editNeonDiabetesAmount,
    deathAccidentAmount: editNeonDeathAccidentAmount,
    injuryPermanentAmount: editNeonInjuryPermanentAmount,
    hospitalizationAmount: editNeonHospitalizationAmount,
    hospitalizationIllnessAmount: editNeonHospitalizationIllnessAmount,
    hospitalizationInjuryAmount: editNeonHospitalizationInjuryAmount,
    workIncapacityStart: editNeonWorkIncapacityStart,
    workIncapacityBackpay: editNeonWorkIncapacityBackpay,
    workIncapacityAmount: editNeonWorkIncapacityAmount,
    workIncapacityInjury: editNeonWorkIncapacityInjury,
    workIncapacityIllness: editNeonWorkIncapacityIllness,
    careDependencyAmount: editNeonCareDependencyAmount,
    specialAidAmount: editNeonSpecialAidAmount,
    caregivingAmount: editNeonCaregivingAmount,
    reproductionCostAmount: editNeonReproductionCostAmount,
    cppHelp: editNeonCppHelp,
    liabilityCitizenLimit: editNeonLiabilityCitizenLimit,
    liabilityEmployeeLimit: editNeonLiabilityEmployeeLimit,
    travelInsurance: editNeonTravelInsurance,
  };

  const flexiFields: FlexiFields = {
    deathAmount: editFlexiDeathAmount,
    deathTypedType: editFlexiDeathTypedType,
    deathTypedAmount: editFlexiDeathTypedAmount,
    deathAccidentAmount: editFlexiDeathAccidentAmount,
    seriousIllnessType: editFlexiSeriousIllnessType,
    seriousIllnessAmount: editFlexiSeriousIllnessAmount,
    seriousIllnessForHim: editFlexiIllnessForHim,
    seriousIllnessForHer: editFlexiIllnessForHer,
    permanentIllnessAmount: editFlexiPermanentIllnessAmount,
    invalidityIllnessType: editFlexiInvalidityIllnessType,
    invalidityIllness1: editFlexiInvalidityIllness1,
    invalidityIllness2: editFlexiInvalidityIllness2,
    invalidityIllness3: editFlexiInvalidityIllness3,
    hospitalGeneralAmount: editFlexiHospitalGeneralAmount,
    workIncapacityStart: editFlexiWorkIncapacityStart,
    workIncapacityBackpay: editFlexiWorkIncapacityBackpay,
    workIncapacityAmount: editFlexiWorkIncapacityAmount,
    caregivingAmount: editFlexiCaregivingAmount,
    permanentAccidentAmount: editFlexiPermanentAccidentAmount,
    injuryDamageAmount: editFlexiInjuryDamageAmount,
    accidentDailyBenefit: editFlexiAccidentDailyBenefit,
    hospitalAccidentAmount: editFlexiHospitalAccidentAmount,
    invalidityAccidentType: editFlexiInvalidityAccidentType,
    invalidityAccident1: editFlexiInvalidityAccident1,
    invalidityAccident2: editFlexiInvalidityAccident2,
    invalidityAccident3: editFlexiInvalidityAccident3,
    trafficDeathAccidentAmount: editFlexiTrafficDeathAccidentAmount,
    trafficPermanentAccidentAmount: editFlexiTrafficPermanentAccidentAmount,
    trafficInjuryDamageAmount: editFlexiTrafficInjuryDamageAmount,
    trafficAccidentDailyBenefit: editFlexiTrafficAccidentDailyBenefit,
    trafficHospitalAccidentAmount: editFlexiTrafficHospitalAccidentAmount,
    trafficWorkIncapacityAmount: editFlexiTrafficWorkIncapacityAmount,
    trafficInvalidityAmount: editFlexiTrafficInvalidityAmount,
    loanDeathAmount: editFlexiLoanDeathAmount,
    loanInvalidityType: editFlexiLoanInvalidityType,
    loanInvalidity1: editFlexiLoanInvalidity1,
    loanInvalidity2: editFlexiLoanInvalidity2,
    loanInvalidity3: editFlexiLoanInvalidity3,
    loanIllnessAmount: editFlexiLoanIllnessAmount,
    loanWorkIncapacityAmount: editFlexiLoanWorkIncapacityAmount,
    addonMajakBasic: editFlexiAddonMajakBasic,
    addonMajakPlus: editFlexiAddonMajakPlus,
    addonLiabilityCitizen: editFlexiAddonLiabilityCitizen,
    addonTravel: editFlexiAddonTravel,
  };

  const domexFields: DomexFields = {
    address: editDomexAddress,
    propertyType: editDomexPropertyType,
    propertyCoverage: editDomexPropertyCoverage,
    sumInsured: editDomexSumInsured,
    deductible: editDomexDeductible,
    outbuildingSumInsured: editDomexOutbuildingSumInsured,
    householdType: editDomexHouseholdType,
    householdCoverage: editDomexHouseholdCoverage,
    householdSumInsured: editDomexHouseholdSumInsured,
    householdDeductible: editDomexHouseholdDeductible,
    liabilitySumInsured: editDomexLiabilitySumInsured,
    liabilityDeductible: editDomexLiabilityDeductible,
    liabilityMobile: editDomexLiabilityMobile,
    liabilityTenant: editDomexLiabilityTenant,
    liabilityLandlord: editDomexLiabilityLandlord,
    assistancePlus: editDomexAssistancePlus,
    note: editDomexNote,
  };

  const handleAutoFieldChange = useCallback(
    (key: keyof AutoFields, value: string | boolean) => {
      switch (key) {
        case "carMake":
          setEditCarMake(String(value));
          break;
        case "carPlate":
          setEditCarPlate(String(value));
          break;
        case "carVin":
          setEditCarVin(String(value));
          break;
        case "carTp":
          setEditCarTp(String(value));
          break;
        case "carLiabilityLimit":
          setEditCarLiabilityLimit(String(value));
          break;
        case "carHullSumInsured":
          setEditCarHullSumInsured(String(value));
          break;
        case "carHullDeductible":
          setEditCarHullDeductible(String(value));
          break;
        case "carAssistancePlan":
          setEditCarAssistancePlan(String(value));
          break;
        case "carAddonGlass":
          setEditCarAddonGlass(Boolean(value));
          break;
        case "carAddonAnimalCollision":
          setEditCarAddonAnimalCollision(Boolean(value));
          break;
        case "carAddonAnimalDamage":
          setEditCarAddonAnimalDamage(Boolean(value));
          break;
        case "carAddonVandalism":
          setEditCarAddonVandalism(Boolean(value));
          break;
        case "carAddonTheft":
          setEditCarAddonTheft(Boolean(value));
          break;
        case "carAddonNatural":
          setEditCarAddonNatural(Boolean(value));
          break;
        case "carAddonOwnDamage":
          setEditCarAddonOwnDamage(Boolean(value));
          break;
        case "carAddonGap":
          setEditCarAddonGap(Boolean(value));
          break;
        case "carAddonSmartGap":
          setEditCarAddonSmartGap(Boolean(value));
          break;
        case "carAddonServisPro":
          setEditCarAddonServisPro(Boolean(value));
          break;
        case "carAddonReplacementCar":
          setEditCarAddonReplacementCar(Boolean(value));
          break;
        case "carAddonLuggage":
          setEditCarAddonLuggage(Boolean(value));
          break;
        case "carAddonPassengerInjury":
          setEditCarAddonPassengerInjury(Boolean(value));
          break;
        default:
          break;
      }
    },
    []
  );

  const handleNeonFieldChange = useCallback(
    (key: keyof NeonFields, value: string | boolean) => {
      switch (key) {
        case "version":
          setEditNeonVersion(String(value));
          break;
        case "deathType":
          setEditNeonDeathType(String(value));
          break;
        case "deathAmount":
          setEditNeonDeathAmount(String(value));
          break;
        case "death2Type":
          setEditNeonDeath2Type(String(value));
          break;
        case "death2Amount":
          setEditNeonDeath2Amount(String(value));
          break;
        case "deathTerminalAmount":
          setEditNeonDeathTerminalAmount(String(value));
          break;
        case "waiverInvalidity":
          setEditNeonWaiverInvalidity(Boolean(value));
          break;
        case "waiverUnemployment":
          setEditNeonWaiverUnemployment(Boolean(value));
          break;
        case "invalidityAType":
          setEditNeonInvalidityAType(String(value));
          break;
        case "invalidityA1":
          setEditNeonInvalidityA1(String(value));
          break;
        case "invalidityA2":
          setEditNeonInvalidityA2(String(value));
          break;
        case "invalidityA3":
          setEditNeonInvalidityA3(String(value));
          break;
        case "invalidityBType":
          setEditNeonInvalidityBType(String(value));
          break;
        case "invalidityB1":
          setEditNeonInvalidityB1(String(value));
          break;
        case "invalidityB2":
          setEditNeonInvalidityB2(String(value));
          break;
        case "invalidityB3":
          setEditNeonInvalidityB3(String(value));
          break;
        case "invalidityPension":
          setEditNeonInvalidityPension(Boolean(value));
          break;
        case "criticalType":
          setEditNeonCriticalType(String(value));
          break;
        case "criticalAmount":
          setEditNeonCriticalAmount(String(value));
          break;
        case "childSurgeryAmount":
          setEditNeonChildSurgeryAmount(String(value));
          break;
        case "vaccinationCompAmount":
          setEditNeonVaccinationCompAmount(String(value));
          break;
        case "diabetesAmount":
          setEditNeonDiabetesAmount(String(value));
          break;
        case "deathAccidentAmount":
          setEditNeonDeathAccidentAmount(String(value));
          break;
        case "injuryPermanentAmount":
          setEditNeonInjuryPermanentAmount(String(value));
          break;
        case "hospitalizationAmount":
          setEditNeonHospitalizationAmount(String(value));
          break;
        case "hospitalizationIllnessAmount":
          setEditNeonHospitalizationIllnessAmount(String(value));
          break;
        case "hospitalizationInjuryAmount":
          setEditNeonHospitalizationInjuryAmount(String(value));
          break;
        case "workIncapacityStart":
          setEditNeonWorkIncapacityStart(String(value));
          break;
        case "workIncapacityBackpay":
          setEditNeonWorkIncapacityBackpay(String(value));
          break;
        case "workIncapacityAmount":
          setEditNeonWorkIncapacityAmount(String(value));
          break;
        case "workIncapacityInjury":
          setEditNeonWorkIncapacityInjury(Boolean(value));
          break;
        case "workIncapacityIllness":
          setEditNeonWorkIncapacityIllness(Boolean(value));
          break;
        case "careDependencyAmount":
          setEditNeonCareDependencyAmount(String(value));
          break;
        case "specialAidAmount":
          setEditNeonSpecialAidAmount(String(value));
          break;
        case "caregivingAmount":
          setEditNeonCaregivingAmount(String(value));
          break;
        case "reproductionCostAmount":
          setEditNeonReproductionCostAmount(String(value));
          break;
        case "cppHelp":
          setEditNeonCppHelp(Boolean(value));
          break;
        case "liabilityCitizenLimit":
          setEditNeonLiabilityCitizenLimit(String(value));
          break;
        case "liabilityEmployeeLimit":
          setEditNeonLiabilityEmployeeLimit(String(value));
          break;
        case "travelInsurance":
          setEditNeonTravelInsurance(Boolean(value));
          break;
        case "accidentDailyBenefit":
          setEditNeonAccidentDailyBenefit(String(value));
          break;
        default:
          break;
      }
    },
    []
  );

  const handleFlexiFieldChange = useCallback(
    (key: keyof FlexiFields, value: string | boolean) => {
      switch (key) {
        case "deathAmount":
          setEditFlexiDeathAmount(String(value));
          break;
        case "deathTypedType":
          setEditFlexiDeathTypedType(String(value));
          break;
        case "deathTypedAmount":
          setEditFlexiDeathTypedAmount(String(value));
          break;
        case "deathAccidentAmount":
          setEditFlexiDeathAccidentAmount(String(value));
          break;
        case "seriousIllnessType":
          setEditFlexiSeriousIllnessType(String(value));
          break;
        case "seriousIllnessAmount":
          setEditFlexiSeriousIllnessAmount(String(value));
          break;
        case "seriousIllnessForHim":
          setEditFlexiIllnessForHim(String(value));
          break;
        case "seriousIllnessForHer":
          setEditFlexiIllnessForHer(String(value));
          break;
        case "permanentIllnessAmount":
          setEditFlexiPermanentIllnessAmount(String(value));
          break;
        case "invalidityIllnessType":
          setEditFlexiInvalidityIllnessType(String(value));
          break;
        case "invalidityIllness1":
          setEditFlexiInvalidityIllness1(String(value));
          break;
        case "invalidityIllness2":
          setEditFlexiInvalidityIllness2(String(value));
          break;
        case "invalidityIllness3":
          setEditFlexiInvalidityIllness3(String(value));
          break;
        case "hospitalGeneralAmount":
          setEditFlexiHospitalGeneralAmount(String(value));
          break;
        case "workIncapacityStart":
          setEditFlexiWorkIncapacityStart(String(value));
          break;
        case "workIncapacityBackpay":
          setEditFlexiWorkIncapacityBackpay(String(value));
          break;
        case "workIncapacityAmount":
          setEditFlexiWorkIncapacityAmount(String(value));
          break;
        case "caregivingAmount":
          setEditFlexiCaregivingAmount(String(value));
          break;
        case "permanentAccidentAmount":
          setEditFlexiPermanentAccidentAmount(String(value));
          break;
        case "injuryDamageAmount":
          setEditFlexiInjuryDamageAmount(String(value));
          break;
        case "accidentDailyBenefit":
          setEditFlexiAccidentDailyBenefit(String(value));
          break;
        case "hospitalAccidentAmount":
          setEditFlexiHospitalAccidentAmount(String(value));
          break;
        case "invalidityAccidentType":
          setEditFlexiInvalidityAccidentType(String(value));
          break;
        case "invalidityAccident1":
          setEditFlexiInvalidityAccident1(String(value));
          break;
        case "invalidityAccident2":
          setEditFlexiInvalidityAccident2(String(value));
          break;
        case "invalidityAccident3":
          setEditFlexiInvalidityAccident3(String(value));
          break;
        case "trafficDeathAccidentAmount":
          setEditFlexiTrafficDeathAccidentAmount(String(value));
          break;
        case "trafficPermanentAccidentAmount":
          setEditFlexiTrafficPermanentAccidentAmount(String(value));
          break;
        case "trafficInjuryDamageAmount":
          setEditFlexiTrafficInjuryDamageAmount(String(value));
          break;
        case "trafficAccidentDailyBenefit":
          setEditFlexiTrafficAccidentDailyBenefit(String(value));
          break;
        case "trafficHospitalAccidentAmount":
          setEditFlexiTrafficHospitalAccidentAmount(String(value));
          break;
        case "trafficWorkIncapacityAmount":
          setEditFlexiTrafficWorkIncapacityAmount(String(value));
          break;
        case "trafficInvalidityAmount":
          setEditFlexiTrafficInvalidityAmount(String(value));
          break;
        case "loanDeathAmount":
          setEditFlexiLoanDeathAmount(String(value));
          break;
        case "loanInvalidityType":
          setEditFlexiLoanInvalidityType(String(value));
          break;
        case "loanInvalidity1":
          setEditFlexiLoanInvalidity1(String(value));
          break;
        case "loanInvalidity2":
          setEditFlexiLoanInvalidity2(String(value));
          break;
        case "loanInvalidity3":
          setEditFlexiLoanInvalidity3(String(value));
          break;
        case "loanIllnessAmount":
          setEditFlexiLoanIllnessAmount(String(value));
          break;
        case "loanWorkIncapacityAmount":
          setEditFlexiLoanWorkIncapacityAmount(String(value));
          break;
        case "addonMajakBasic":
          setEditFlexiAddonMajakBasic(Boolean(value));
          break;
        case "addonMajakPlus":
          setEditFlexiAddonMajakPlus(Boolean(value));
          break;
        case "addonLiabilityCitizen":
          setEditFlexiAddonLiabilityCitizen(String(value));
          break;
        case "addonTravel":
          setEditFlexiAddonTravel(Boolean(value));
          break;
        default:
          break;
      }
    },
    []
  );

  const handleDomexFieldChange = useCallback(
    (key: keyof DomexFields, value: string | boolean) => {
      switch (key) {
        case "address":
          setEditDomexAddress(String(value));
          break;
        case "propertyType":
          setEditDomexPropertyType(String(value));
          break;
        case "propertyCoverage":
          setEditDomexPropertyCoverage(String(value));
          break;
        case "sumInsured":
          setEditDomexSumInsured(String(value));
          break;
        case "deductible":
          setEditDomexDeductible(String(value));
          break;
        case "outbuildingSumInsured":
          setEditDomexOutbuildingSumInsured(String(value));
          break;
        case "householdType":
          setEditDomexHouseholdType(String(value));
          break;
        case "householdCoverage":
          setEditDomexHouseholdCoverage(String(value));
          break;
        case "householdSumInsured":
          setEditDomexHouseholdSumInsured(String(value));
          break;
        case "householdDeductible":
          setEditDomexHouseholdDeductible(String(value));
          break;
        case "liabilitySumInsured":
          setEditDomexLiabilitySumInsured(String(value));
          break;
        case "liabilityDeductible":
          setEditDomexLiabilityDeductible(String(value));
          break;
        case "liabilityMobile":
          setEditDomexLiabilityMobile(Boolean(value));
          break;
        case "liabilityTenant":
          setEditDomexLiabilityTenant(Boolean(value));
          break;
        case "liabilityLandlord":
          setEditDomexLiabilityLandlord(Boolean(value));
          break;
        case "assistancePlus":
          setEditDomexAssistancePlus(Boolean(value));
          break;
        case "note":
          setEditDomexNote(String(value));
          break;
        default:
          break;
      }
    },
    []
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const resetEditFields = useCallback(() => {
    if (!contract) return;
    setEditClientName(contract.clientName ?? "");
    setEditClientEmail(contract.clientEmail ?? "");
    setEditClientPhone(contract.clientPhone ?? "");
    setEditClientAddress(contract.clientAddress ?? "");
    setEditContractNumber(contract.contractNumber ?? "");
    setEditContractSigned(toDateInputValue(contract.contractSignedDate ?? contract.createdAt));
    setEditPolicyStart(toDateInputValue(contract.policyStartDate));
    setEditDuration(
      typeof contract.durationYears === "number" && !Number.isNaN(contract.durationYears)
        ? contract.durationYears
        : null
    );
    setEditCarMake(contract.carMake ?? "");
    setEditCarPlate(contract.carPlate ?? "");
    setEditCarVin(contract.carVin ?? "");
    setEditCarTp(contract.carTp ?? "");
    setEditCarLiabilityLimit(
      contract.carLiabilityLimit != null && Number.isFinite(contract.carLiabilityLimit)
        ? String(contract.carLiabilityLimit)
        : ""
    );
    setEditCarHullSumInsured(
      contract.carHullSumInsured != null && Number.isFinite(contract.carHullSumInsured)
        ? String(contract.carHullSumInsured)
        : ""
    );
    setEditCarHullDeductible(
      contract.carHullDeductible != null && Number.isFinite(contract.carHullDeductible)
        ? String(contract.carHullDeductible)
        : ""
    );
    setEditCarAssistancePlan(contract.carAssistancePlan ?? "");
    setEditCarAddonGlass(!!contract.carAddonGlass);
    setEditCarAddonAnimalCollision(!!contract.carAddonAnimalCollision);
    setEditCarAddonAnimalDamage(!!contract.carAddonAnimalDamage);
    setEditCarAddonVandalism(!!contract.carAddonVandalism);
    setEditCarAddonTheft(!!contract.carAddonTheft);
    setEditCarAddonNatural(!!contract.carAddonNatural);
    setEditCarAddonOwnDamage(!!contract.carAddonOwnDamage);
    setEditCarAddonGap(!!contract.carAddonGap);
    setEditCarAddonSmartGap(!!contract.carAddonSmartGap);
    setEditCarAddonServisPro(!!contract.carAddonServisPro);
    setEditCarAddonReplacementCar(!!contract.carAddonReplacementCar);
    setEditCarAddonLuggage(!!contract.carAddonLuggage);
    setEditCarAddonPassengerInjury(!!contract.carAddonPassengerInjury);
    setEditNeonVersion(contract.neonDetail?.version ?? "");
    setEditNeonDeathType(contract.neonDetail?.deathType ?? "");
    setEditNeonDeathAmount(
      contract.neonDetail?.deathAmount != null && Number.isFinite(contract.neonDetail.deathAmount)
        ? String(contract.neonDetail.deathAmount)
        : ""
    );
    setEditNeonDeath2Type(contract.neonDetail?.death2Type ?? "");
    setEditNeonDeath2Amount(
      contract.neonDetail?.death2Amount != null && Number.isFinite(contract.neonDetail.death2Amount)
        ? String(contract.neonDetail.death2Amount)
        : ""
    );
    setEditNeonDeathTerminalAmount(
      contract.neonDetail?.deathTerminalAmount != null &&
      Number.isFinite(contract.neonDetail.deathTerminalAmount)
        ? String(contract.neonDetail.deathTerminalAmount)
        : ""
    );
    setEditNeonWaiverInvalidity(!!contract.neonDetail?.waiverInvalidity);
    setEditNeonWaiverUnemployment(!!contract.neonDetail?.waiverUnemployment);
    setEditNeonInvalidityAType(contract.neonDetail?.invalidityAType ?? "");
    setEditNeonInvalidityA1(
      contract.neonDetail?.invalidityA1 != null && Number.isFinite(contract.neonDetail.invalidityA1)
        ? String(contract.neonDetail.invalidityA1)
        : ""
    );
    setEditNeonInvalidityA2(
      contract.neonDetail?.invalidityA2 != null && Number.isFinite(contract.neonDetail.invalidityA2)
        ? String(contract.neonDetail.invalidityA2)
        : ""
    );
    setEditNeonInvalidityA3(
      contract.neonDetail?.invalidityA3 != null && Number.isFinite(contract.neonDetail.invalidityA3)
        ? String(contract.neonDetail.invalidityA3)
        : ""
    );
    setEditNeonInvalidityBType(contract.neonDetail?.invalidityBType ?? "");
    setEditNeonInvalidityB1(
      contract.neonDetail?.invalidityB1 != null && Number.isFinite(contract.neonDetail.invalidityB1)
        ? String(contract.neonDetail.invalidityB1)
        : ""
    );
    setEditNeonInvalidityB2(
      contract.neonDetail?.invalidityB2 != null && Number.isFinite(contract.neonDetail.invalidityB2)
        ? String(contract.neonDetail.invalidityB2)
        : ""
    );
    setEditNeonInvalidityB3(
      contract.neonDetail?.invalidityB3 != null && Number.isFinite(contract.neonDetail.invalidityB3)
        ? String(contract.neonDetail.invalidityB3)
        : ""
    );
    setEditNeonInvalidityPension(!!contract.neonDetail?.invalidityPension);
    setEditNeonCriticalType(contract.neonDetail?.criticalIllnessType ?? "");
    setEditNeonCriticalAmount(
      contract.neonDetail?.criticalIllnessAmount != null &&
      Number.isFinite(contract.neonDetail.criticalIllnessAmount)
        ? String(contract.neonDetail.criticalIllnessAmount)
        : ""
    );
    setEditNeonChildSurgeryAmount(
      contract.neonDetail?.childSurgeryAmount != null &&
      Number.isFinite(contract.neonDetail.childSurgeryAmount)
        ? String(contract.neonDetail.childSurgeryAmount)
        : ""
    );
    setEditNeonVaccinationCompAmount(
      contract.neonDetail?.vaccinationCompAmount != null &&
      Number.isFinite(contract.neonDetail.vaccinationCompAmount)
        ? String(contract.neonDetail.vaccinationCompAmount)
        : ""
    );
    setEditNeonDiabetesAmount(
      contract.neonDetail?.diabetesAmount != null && Number.isFinite(contract.neonDetail.diabetesAmount)
        ? String(contract.neonDetail.diabetesAmount)
        : ""
    );
    setEditNeonDeathAccidentAmount(
      contract.neonDetail?.deathAccidentAmount != null &&
      Number.isFinite(contract.neonDetail.deathAccidentAmount)
        ? String(contract.neonDetail.deathAccidentAmount)
        : ""
    );
    setEditNeonInjuryPermanentAmount(
      contract.neonDetail?.injuryPermanentAmount != null &&
      Number.isFinite(contract.neonDetail.injuryPermanentAmount)
        ? String(contract.neonDetail.injuryPermanentAmount)
        : ""
    );
    setEditNeonHospitalizationAmount(
      contract.neonDetail?.hospitalizationAmount != null &&
      Number.isFinite(contract.neonDetail.hospitalizationAmount)
        ? String(contract.neonDetail.hospitalizationAmount)
        : ""
    );
    setEditNeonHospitalizationIllnessAmount(
      contract.neonDetail?.hospitalizationIllnessAmount != null &&
      Number.isFinite(contract.neonDetail.hospitalizationIllnessAmount)
        ? String(contract.neonDetail.hospitalizationIllnessAmount)
        : ""
    );
    setEditNeonHospitalizationInjuryAmount(
      contract.neonDetail?.hospitalizationInjuryAmount != null &&
      Number.isFinite(contract.neonDetail.hospitalizationInjuryAmount)
        ? String(contract.neonDetail.hospitalizationInjuryAmount)
        : ""
    );
    setEditNeonWorkIncapacityStart(contract.neonDetail?.workIncapacityStart ?? "");
    setEditNeonWorkIncapacityBackpay(contract.neonDetail?.workIncapacityBackpay ?? "");
    setEditNeonWorkIncapacityAmount(
      contract.neonDetail?.workIncapacityAmount != null &&
      Number.isFinite(contract.neonDetail.workIncapacityAmount)
        ? String(contract.neonDetail.workIncapacityAmount)
        : ""
    );
    setEditNeonWorkIncapacityInjury(contract.neonDetail?.workIncapacityInjury ?? false);
    setEditNeonWorkIncapacityIllness(contract.neonDetail?.workIncapacityIllness ?? false);
    setEditNeonCareDependencyAmount(
      contract.neonDetail?.careDependencyAmount != null &&
      Number.isFinite(contract.neonDetail.careDependencyAmount)
        ? String(contract.neonDetail.careDependencyAmount)
        : ""
    );
    setEditNeonSpecialAidAmount(
      contract.neonDetail?.specialAidAmount != null &&
      Number.isFinite(contract.neonDetail.specialAidAmount)
        ? String(contract.neonDetail.specialAidAmount)
        : ""
    );
    setEditNeonCaregivingAmount(
      contract.neonDetail?.caregivingAmount != null &&
      Number.isFinite(contract.neonDetail.caregivingAmount)
        ? String(contract.neonDetail.caregivingAmount)
        : ""
    );
    setEditNeonReproductionCostAmount(
      contract.neonDetail?.reproductionCostAmount != null &&
      Number.isFinite(contract.neonDetail.reproductionCostAmount)
        ? String(contract.neonDetail.reproductionCostAmount)
        : ""
    );
    setEditNeonCppHelp(!!contract.neonDetail?.cppHelp);
    setEditNeonLiabilityCitizenLimit(
      contract.neonDetail?.liabilityCitizenLimit != null &&
      Number.isFinite(contract.neonDetail.liabilityCitizenLimit)
        ? String(contract.neonDetail.liabilityCitizenLimit)
        : ""
    );
    setEditNeonLiabilityEmployeeLimit(
      contract.neonDetail?.liabilityEmployeeLimit != null &&
      Number.isFinite(contract.neonDetail.liabilityEmployeeLimit)
        ? String(contract.neonDetail.liabilityEmployeeLimit)
        : ""
    );
    setEditNeonTravelInsurance(!!contract.neonDetail?.travelInsurance);
    setEditNeonAccidentDailyBenefit(
      contract.neonDetail?.accidentDailyBenefit != null &&
      Number.isFinite(contract.neonDetail.accidentDailyBenefit)
        ? String(contract.neonDetail.accidentDailyBenefit)
        : ""
    );
    setEditFlexiDeathAmount(
      contract.flexiDetail?.deathAmount != null && Number.isFinite(contract.flexiDetail.deathAmount)
        ? String(contract.flexiDetail.deathAmount)
        : ""
    );
    setEditFlexiDeathTypedType(contract.flexiDetail?.deathTypedType ?? "");
    setEditFlexiDeathTypedAmount(
      contract.flexiDetail?.deathTypedAmount != null && Number.isFinite(contract.flexiDetail.deathTypedAmount)
        ? String(contract.flexiDetail.deathTypedAmount)
        : ""
    );
    setEditFlexiDeathAccidentAmount(
      contract.flexiDetail?.deathAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.deathAccidentAmount)
        ? String(contract.flexiDetail.deathAccidentAmount)
        : ""
    );
    setEditFlexiSeriousIllnessType(contract.flexiDetail?.seriousIllnessType ?? "");
    setEditFlexiSeriousIllnessAmount(
      contract.flexiDetail?.seriousIllnessAmount != null &&
      Number.isFinite(contract.flexiDetail.seriousIllnessAmount)
        ? String(contract.flexiDetail.seriousIllnessAmount)
        : ""
    );
    setEditFlexiIllnessForHim(
      contract.flexiDetail?.seriousIllnessForHim != null &&
      Number.isFinite(contract.flexiDetail.seriousIllnessForHim)
        ? String(contract.flexiDetail.seriousIllnessForHim)
        : ""
    );
    setEditFlexiIllnessForHer(
      contract.flexiDetail?.seriousIllnessForHer != null &&
      Number.isFinite(contract.flexiDetail.seriousIllnessForHer)
        ? String(contract.flexiDetail.seriousIllnessForHer)
        : ""
    );
    setEditFlexiPermanentIllnessAmount(
      contract.flexiDetail?.permanentIllnessAmount != null &&
      Number.isFinite(contract.flexiDetail.permanentIllnessAmount)
        ? String(contract.flexiDetail.permanentIllnessAmount)
        : ""
    );
    setEditFlexiInvalidityIllnessType(contract.flexiDetail?.invalidityIllnessType ?? "");
    setEditFlexiInvalidityIllness1(
      contract.flexiDetail?.invalidityIllness1 != null &&
      Number.isFinite(contract.flexiDetail.invalidityIllness1)
        ? String(contract.flexiDetail.invalidityIllness1)
        : ""
    );
    setEditFlexiInvalidityIllness2(
      contract.flexiDetail?.invalidityIllness2 != null &&
      Number.isFinite(contract.flexiDetail.invalidityIllness2)
        ? String(contract.flexiDetail.invalidityIllness2)
        : ""
    );
    setEditFlexiInvalidityIllness3(
      contract.flexiDetail?.invalidityIllness3 != null &&
      Number.isFinite(contract.flexiDetail.invalidityIllness3)
        ? String(contract.flexiDetail.invalidityIllness3)
        : ""
    );
    setEditFlexiHospitalGeneralAmount(
      contract.flexiDetail?.hospitalGeneralAmount != null &&
      Number.isFinite(contract.flexiDetail.hospitalGeneralAmount)
        ? String(contract.flexiDetail.hospitalGeneralAmount)
        : ""
    );
    setEditFlexiWorkIncapacityStart(contract.flexiDetail?.workIncapacityStart ?? "");
    setEditFlexiWorkIncapacityBackpay(contract.flexiDetail?.workIncapacityBackpay ?? "");
    setEditFlexiWorkIncapacityAmount(
      contract.flexiDetail?.workIncapacityAmount != null &&
      Number.isFinite(contract.flexiDetail.workIncapacityAmount)
        ? String(contract.flexiDetail.workIncapacityAmount)
        : ""
    );
    setEditFlexiCaregivingAmount(
      contract.flexiDetail?.caregivingAmount != null &&
      Number.isFinite(contract.flexiDetail.caregivingAmount)
        ? String(contract.flexiDetail.caregivingAmount)
        : ""
    );
    setEditFlexiPermanentAccidentAmount(
      contract.flexiDetail?.permanentAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.permanentAccidentAmount)
        ? String(contract.flexiDetail.permanentAccidentAmount)
        : ""
    );
    setEditFlexiInjuryDamageAmount(
      contract.flexiDetail?.injuryDamageAmount != null &&
      Number.isFinite(contract.flexiDetail.injuryDamageAmount)
        ? String(contract.flexiDetail.injuryDamageAmount)
        : ""
    );
    setEditFlexiAccidentDailyBenefit(
      contract.flexiDetail?.accidentDailyBenefit != null &&
      Number.isFinite(contract.flexiDetail.accidentDailyBenefit)
        ? String(contract.flexiDetail.accidentDailyBenefit)
        : ""
    );
    setEditFlexiHospitalAccidentAmount(
      contract.flexiDetail?.hospitalAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.hospitalAccidentAmount)
        ? String(contract.flexiDetail.hospitalAccidentAmount)
        : ""
    );
    setEditFlexiInvalidityAccidentType(contract.flexiDetail?.invalidityAccidentType ?? "");
    setEditFlexiInvalidityAccident1(
      contract.flexiDetail?.invalidityAccident1 != null &&
      Number.isFinite(contract.flexiDetail.invalidityAccident1)
        ? String(contract.flexiDetail.invalidityAccident1)
        : ""
    );
    setEditFlexiInvalidityAccident2(
      contract.flexiDetail?.invalidityAccident2 != null &&
      Number.isFinite(contract.flexiDetail.invalidityAccident2)
        ? String(contract.flexiDetail.invalidityAccident2)
        : ""
    );
    setEditFlexiInvalidityAccident3(
      contract.flexiDetail?.invalidityAccident3 != null &&
      Number.isFinite(contract.flexiDetail.invalidityAccident3)
        ? String(contract.flexiDetail.invalidityAccident3)
        : ""
    );
    setEditFlexiTrafficDeathAccidentAmount(
      contract.flexiDetail?.trafficDeathAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficDeathAccidentAmount)
        ? String(contract.flexiDetail.trafficDeathAccidentAmount)
        : ""
    );
    setEditFlexiTrafficPermanentAccidentAmount(
      contract.flexiDetail?.trafficPermanentAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficPermanentAccidentAmount)
        ? String(contract.flexiDetail.trafficPermanentAccidentAmount)
        : ""
    );
    setEditFlexiTrafficInjuryDamageAmount(
      contract.flexiDetail?.trafficInjuryDamageAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficInjuryDamageAmount)
        ? String(contract.flexiDetail.trafficInjuryDamageAmount)
        : ""
    );
    setEditFlexiTrafficAccidentDailyBenefit(
      contract.flexiDetail?.trafficAccidentDailyBenefit != null &&
      Number.isFinite(contract.flexiDetail.trafficAccidentDailyBenefit)
        ? String(contract.flexiDetail.trafficAccidentDailyBenefit)
        : ""
    );
    setEditFlexiTrafficHospitalAccidentAmount(
      contract.flexiDetail?.trafficHospitalAccidentAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficHospitalAccidentAmount)
        ? String(contract.flexiDetail.trafficHospitalAccidentAmount)
        : ""
    );
    setEditFlexiTrafficWorkIncapacityAmount(
      contract.flexiDetail?.trafficWorkIncapacityAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficWorkIncapacityAmount)
        ? String(contract.flexiDetail.trafficWorkIncapacityAmount)
        : ""
    );
    setEditFlexiTrafficInvalidityAmount(
      contract.flexiDetail?.trafficInvalidityAmount != null &&
      Number.isFinite(contract.flexiDetail.trafficInvalidityAmount)
        ? String(contract.flexiDetail.trafficInvalidityAmount)
        : ""
    );
    setEditFlexiLoanDeathAmount(
      contract.flexiDetail?.loanDeathAmount != null &&
      Number.isFinite(contract.flexiDetail.loanDeathAmount)
        ? String(contract.flexiDetail.loanDeathAmount)
        : ""
    );
    setEditFlexiLoanInvalidityType(contract.flexiDetail?.loanInvalidityType ?? "");
    setEditFlexiLoanInvalidity1(
      contract.flexiDetail?.loanInvalidity1 != null &&
      Number.isFinite(contract.flexiDetail.loanInvalidity1)
        ? String(contract.flexiDetail.loanInvalidity1)
        : ""
    );
    setEditFlexiLoanInvalidity2(
      contract.flexiDetail?.loanInvalidity2 != null &&
      Number.isFinite(contract.flexiDetail.loanInvalidity2)
        ? String(contract.flexiDetail.loanInvalidity2)
        : ""
    );
    setEditFlexiLoanInvalidity3(
      contract.flexiDetail?.loanInvalidity3 != null &&
      Number.isFinite(contract.flexiDetail.loanInvalidity3)
        ? String(contract.flexiDetail.loanInvalidity3)
        : ""
    );
    setEditFlexiLoanIllnessAmount(
      contract.flexiDetail?.loanIllnessAmount != null &&
      Number.isFinite(contract.flexiDetail.loanIllnessAmount)
        ? String(contract.flexiDetail.loanIllnessAmount)
        : ""
    );
    setEditFlexiLoanWorkIncapacityAmount(
      contract.flexiDetail?.loanWorkIncapacityAmount != null &&
      Number.isFinite(contract.flexiDetail.loanWorkIncapacityAmount)
        ? String(contract.flexiDetail.loanWorkIncapacityAmount)
        : ""
    );
    setEditFlexiAddonMajakBasic(!!contract.flexiDetail?.addonMajakBasic);
    setEditFlexiAddonMajakPlus(!!contract.flexiDetail?.addonMajakPlus);
    setEditFlexiAddonLiabilityCitizen(
      contract.flexiDetail?.addonLiabilityCitizen != null &&
      Number.isFinite(contract.flexiDetail.addonLiabilityCitizen)
        ? String(contract.flexiDetail.addonLiabilityCitizen)
        : ""
    );
    setEditFlexiAddonTravel(!!contract.flexiDetail?.addonTravel);
    setEditDomexAddress(contract.domexDetail?.address ?? "");
    setEditDomexPropertyType(contract.domexDetail?.propertyType ?? "");
    setEditDomexPropertyCoverage(contract.domexDetail?.propertyCoverage ?? "");
    setEditDomexSumInsured(
      contract.domexDetail?.sumInsured != null && Number.isFinite(contract.domexDetail.sumInsured)
        ? String(contract.domexDetail.sumInsured)
        : ""
    );
    setEditDomexDeductible(
      contract.domexDetail?.deductible != null && Number.isFinite(contract.domexDetail.deductible)
        ? String(contract.domexDetail.deductible)
        : ""
    );
    setEditDomexHouseholdType(contract.domexDetail?.householdType ?? "");
    setEditDomexHouseholdCoverage(contract.domexDetail?.householdCoverage ?? "");
    setEditDomexHouseholdSumInsured(
      contract.domexDetail?.householdSumInsured != null &&
      Number.isFinite(contract.domexDetail.householdSumInsured)
        ? String(contract.domexDetail.householdSumInsured)
        : ""
    );
    setEditDomexHouseholdDeductible(
      contract.domexDetail?.householdDeductible != null &&
      Number.isFinite(contract.domexDetail.householdDeductible)
        ? String(contract.domexDetail.householdDeductible)
        : ""
    );
    setEditDomexOutbuildingSumInsured(
      contract.domexDetail?.outbuildingSumInsured != null &&
      Number.isFinite(contract.domexDetail.outbuildingSumInsured)
        ? String(contract.domexDetail.outbuildingSumInsured)
        : ""
    );
    setEditDomexLiabilitySumInsured(
      contract.domexDetail?.liabilitySumInsured != null &&
      Number.isFinite(contract.domexDetail.liabilitySumInsured)
        ? String(contract.domexDetail.liabilitySumInsured)
        : ""
    );
    setEditDomexLiabilityDeductible(
      contract.domexDetail?.liabilityDeductible != null &&
      Number.isFinite(contract.domexDetail.liabilityDeductible)
        ? String(contract.domexDetail.liabilityDeductible)
        : ""
    );
    setEditDomexLiabilityMobile(!!contract.domexDetail?.liabilityMobile);
    setEditDomexLiabilityTenant(!!contract.domexDetail?.liabilityTenant);
    setEditDomexLiabilityLandlord(!!contract.domexDetail?.liabilityLandlord);
    setEditDomexAssistancePlus(!!contract.domexDetail?.assistancePlus);
    setEditDomexNote(contract.domexDetail?.note ?? "");
  }, [contract]);

  useEffect(() => {
    if (!contract) return;
    resetEditFields();
    setDetailsSaved(false);
    setDetailsError(null);
  }, [contract, resetEditFields]);

  const handleSaveDetails = async () => {
    if (!isOwnContract || !ownerEmail || !entryId) return;
    setSavingDetails(true);
    setDetailsError(null);
    setDetailsSaved(false);

    try {
      const toNumberOrNull = (txt: string) => {
        const trimmed = txt.trim().replace(",", ".");
        if (!trimmed) return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
      };

      const trimmedName = editClientName.trim();
      const trimmedEmail = editClientEmail.trim();
      const trimmedPhone = editClientPhone.trim();
      const trimmedAddress = editClientAddress.trim();
      const trimmedNumber = editContractNumber.trim();
      const signedDate = editContractSigned ? new Date(editContractSigned) : null;
      const startDate = editPolicyStart ? new Date(editPolicyStart) : null;
      const durationVal =
        durationBounds != null &&
        typeof editDuration === "number" &&
        !Number.isNaN(editDuration)
          ? Math.max(
              durationBounds[0],
              Math.min(durationBounds[1], Math.floor(editDuration))
            )
          : null;

      const autoFields =
        isAutoProduct(prod ?? null)
          ? {
              carMake: editCarMake.trim() || null,
              carPlate: editCarPlate.trim() || null,
              carVin: editCarVin.trim() || null,
              carTp: editCarTp.trim() || null,
              carLiabilityLimit: toNumberOrNull(editCarLiabilityLimit),
              carHullSumInsured: toNumberOrNull(editCarHullSumInsured),
              carHullDeductible: toNumberOrNull(editCarHullDeductible),
              carAssistancePlan: editCarAssistancePlan.trim() || null,
              carAddonGlass: !!editCarAddonGlass,
              carAddonAnimalCollision: !!editCarAddonAnimalCollision,
              carAddonAnimalDamage: !!editCarAddonAnimalDamage,
              carAddonVandalism: !!editCarAddonVandalism,
              carAddonTheft: !!editCarAddonTheft,
              carAddonNatural: !!editCarAddonNatural,
              carAddonOwnDamage: !!editCarAddonOwnDamage,
              carAddonGap: !!editCarAddonGap,
              carAddonSmartGap: !!editCarAddonSmartGap,
              carAddonServisPro: !!editCarAddonServisPro,
              carAddonReplacementCar: !!editCarAddonReplacementCar,
              carAddonLuggage: !!editCarAddonLuggage,
              carAddonPassengerInjury: !!editCarAddonPassengerInjury,
            }
          : {
              carMake: null,
              carPlate: null,
              carVin: null,
              carTp: null,
              carLiabilityLimit: null,
              carHullSumInsured: null,
              carHullDeductible: null,
              carAssistancePlan: null,
              carAddonGlass: null,
              carAddonAnimalCollision: null,
              carAddonAnimalDamage: null,
              carAddonVandalism: null,
              carAddonTheft: null,
              carAddonNatural: null,
              carAddonOwnDamage: null,
              carAddonGap: null,
              carAddonSmartGap: null,
              carAddonServisPro: null,
              carAddonReplacementCar: null,
              carAddonLuggage: null,
              carAddonPassengerInjury: null,
            };

      const domexUpdate =
        prod === "domex"
          ? {
              domexDetail: {
                address: editDomexAddress.trim() || null,
                propertyType: editDomexPropertyType.trim() || null,
                propertyCoverage: editDomexPropertyCoverage.trim() || null,
                sumInsured: toNumberOrNull(editDomexSumInsured),
                deductible: toNumberOrNull(editDomexDeductible),
                householdType: editDomexHouseholdType.trim() || null,
                householdCoverage: editDomexHouseholdCoverage.trim() || null,
                householdSumInsured: toNumberOrNull(editDomexHouseholdSumInsured),
                householdDeductible: toNumberOrNull(editDomexHouseholdDeductible),
                outbuildingSumInsured: toNumberOrNull(editDomexOutbuildingSumInsured),
                liabilitySumInsured: toNumberOrNull(editDomexLiabilitySumInsured),
                liabilityDeductible: toNumberOrNull(editDomexLiabilityDeductible),
                liabilityMobile: !!editDomexLiabilityMobile,
                liabilityTenant: !!editDomexLiabilityTenant,
                liabilityLandlord: !!editDomexLiabilityLandlord,
              assistancePlus: !!editDomexAssistancePlus,
              note: editDomexNote.trim() || null,
            },
          }
        : { domexDetail: null };

      const neonUpdate =
        prod === "neon"
          ? {
              neonDetail: {
                version: editNeonVersion.trim() || null,
                deathType: editNeonDeathType.trim() || null,
                deathAmount: toNumberOrNull(editNeonDeathAmount),
                death2Type: editNeonDeath2Type.trim() || null,
                death2Amount: toNumberOrNull(editNeonDeath2Amount),
                deathTerminalAmount: toNumberOrNull(editNeonDeathTerminalAmount),
                waiverInvalidity: !!editNeonWaiverInvalidity,
                waiverUnemployment: !!editNeonWaiverUnemployment,
                invalidityAType: editNeonInvalidityAType.trim() || null,
                invalidityA1: toNumberOrNull(editNeonInvalidityA1),
                invalidityA2: toNumberOrNull(editNeonInvalidityA2),
                invalidityA3: toNumberOrNull(editNeonInvalidityA3),
                invalidityBType: editNeonInvalidityBType.trim() || null,
                invalidityB1: toNumberOrNull(editNeonInvalidityB1),
                invalidityB2: toNumberOrNull(editNeonInvalidityB2),
                invalidityB3: toNumberOrNull(editNeonInvalidityB3),
                invalidityPension: !!editNeonInvalidityPension,
                criticalIllnessType: editNeonCriticalType.trim() || null,
                criticalIllnessAmount: toNumberOrNull(editNeonCriticalAmount),
                childSurgeryAmount: toNumberOrNull(editNeonChildSurgeryAmount),
                vaccinationCompAmount: toNumberOrNull(editNeonVaccinationCompAmount),
                accidentDailyBenefit: toNumberOrNull(editNeonAccidentDailyBenefit),
                diabetesAmount: toNumberOrNull(editNeonDiabetesAmount),
                deathAccidentAmount: toNumberOrNull(editNeonDeathAccidentAmount),
                injuryPermanentAmount: toNumberOrNull(editNeonInjuryPermanentAmount),
                hospitalizationAmount: toNumberOrNull(editNeonHospitalizationAmount),
                hospitalizationIllnessAmount: toNumberOrNull(editNeonHospitalizationIllnessAmount),
                hospitalizationInjuryAmount: toNumberOrNull(editNeonHospitalizationInjuryAmount),
                workIncapacityStart: editNeonWorkIncapacityStart.trim() || null,
                workIncapacityBackpay: editNeonWorkIncapacityBackpay.trim() || null,
                workIncapacityAmount: toNumberOrNull(editNeonWorkIncapacityAmount),
                workIncapacityInjury: editNeonWorkIncapacityInjury,
                workIncapacityIllness: editNeonWorkIncapacityIllness,
                careDependencyAmount: toNumberOrNull(editNeonCareDependencyAmount),
                specialAidAmount: toNumberOrNull(editNeonSpecialAidAmount),
                caregivingAmount: toNumberOrNull(editNeonCaregivingAmount),
                reproductionCostAmount: toNumberOrNull(editNeonReproductionCostAmount),
                cppHelp: !!editNeonCppHelp,
                liabilityCitizenLimit: toNumberOrNull(editNeonLiabilityCitizenLimit),
                liabilityEmployeeLimit: toNumberOrNull(editNeonLiabilityEmployeeLimit),
                travelInsurance: !!editNeonTravelInsurance,
                neonPdfRisks: null,
              },
            }
          : { neonDetail: null };

      const flexiUpdate =
        prod === "flexi"
          ? {
              flexiDetail: {
                deathAmount: toNumberOrNull(editFlexiDeathAmount),
                deathTypedType: editFlexiDeathTypedType.trim() || null,
                deathTypedAmount: toNumberOrNull(editFlexiDeathTypedAmount),
                deathAccidentAmount: toNumberOrNull(editFlexiDeathAccidentAmount),
                seriousIllnessType: editFlexiSeriousIllnessType.trim() || null,
                seriousIllnessAmount: toNumberOrNull(editFlexiSeriousIllnessAmount),
                seriousIllnessForHim: toNumberOrNull(editFlexiIllnessForHim),
                seriousIllnessForHer: toNumberOrNull(editFlexiIllnessForHer),
                permanentIllnessAmount: toNumberOrNull(editFlexiPermanentIllnessAmount),
                invalidityIllnessType: editFlexiInvalidityIllnessType.trim() || null,
                invalidityIllness1: toNumberOrNull(editFlexiInvalidityIllness1),
                invalidityIllness2: toNumberOrNull(editFlexiInvalidityIllness2),
                invalidityIllness3: toNumberOrNull(editFlexiInvalidityIllness3),
                hospitalGeneralAmount: toNumberOrNull(editFlexiHospitalGeneralAmount),
                workIncapacityStart: editFlexiWorkIncapacityStart.trim() || null,
                workIncapacityBackpay: editFlexiWorkIncapacityBackpay.trim() || null,
                workIncapacityAmount: toNumberOrNull(editFlexiWorkIncapacityAmount),
                caregivingAmount: toNumberOrNull(editFlexiCaregivingAmount),
                permanentAccidentAmount: toNumberOrNull(editFlexiPermanentAccidentAmount),
                injuryDamageAmount: toNumberOrNull(editFlexiInjuryDamageAmount),
                accidentDailyBenefit: toNumberOrNull(editFlexiAccidentDailyBenefit),
                hospitalAccidentAmount: toNumberOrNull(editFlexiHospitalAccidentAmount),
                invalidityAccidentType: editFlexiInvalidityAccidentType.trim() || null,
                invalidityAccident1: toNumberOrNull(editFlexiInvalidityAccident1),
                invalidityAccident2: toNumberOrNull(editFlexiInvalidityAccident2),
                invalidityAccident3: toNumberOrNull(editFlexiInvalidityAccident3),
                trafficDeathAccidentAmount: toNumberOrNull(editFlexiTrafficDeathAccidentAmount),
                trafficPermanentAccidentAmount: toNumberOrNull(editFlexiTrafficPermanentAccidentAmount),
                trafficInjuryDamageAmount: toNumberOrNull(editFlexiTrafficInjuryDamageAmount),
                trafficAccidentDailyBenefit: toNumberOrNull(editFlexiTrafficAccidentDailyBenefit),
                trafficHospitalAccidentAmount: toNumberOrNull(editFlexiTrafficHospitalAccidentAmount),
                trafficWorkIncapacityAmount: toNumberOrNull(editFlexiTrafficWorkIncapacityAmount),
                trafficInvalidityAmount: toNumberOrNull(editFlexiTrafficInvalidityAmount),
                loanDeathAmount: toNumberOrNull(editFlexiLoanDeathAmount),
                loanInvalidityType: editFlexiLoanInvalidityType.trim() || null,
                loanInvalidity1: toNumberOrNull(editFlexiLoanInvalidity1),
                loanInvalidity2: toNumberOrNull(editFlexiLoanInvalidity2),
                loanInvalidity3: toNumberOrNull(editFlexiLoanInvalidity3),
                loanIllnessAmount: toNumberOrNull(editFlexiLoanIllnessAmount),
                loanWorkIncapacityAmount: toNumberOrNull(editFlexiLoanWorkIncapacityAmount),
                addonMajakBasic: !!editFlexiAddonMajakBasic,
                addonMajakPlus: !!editFlexiAddonMajakPlus,
                addonLiabilityCitizen: toNumberOrNull(editFlexiAddonLiabilityCitizen),
                addonTravel: !!editFlexiAddonTravel,
              },
            }
          : { flexiDetail: null };

      const updates: Record<string, any> = {
        clientName: trimmedName || null,
        clientEmail: trimmedEmail || null,
        clientPhone: trimmedPhone || null,
        clientAddress: trimmedAddress || null,
        contractNumber: trimmedNumber || null,
        contractSignedDate: signedDate ?? null,
        policyStartDate: startDate ?? null,
        ...autoFields,
        ...neonUpdate,
        ...flexiUpdate,
        ...domexUpdate,
      };
      if (showDurationForProduct) {
        updates.durationYears = durationVal ?? null;
      }

      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryId,
          updates,
        }),
      });

      setContract((prev) =>
        prev
          ? {
              ...prev,
              clientName: trimmedName || null,
              clientEmail: trimmedEmail || null,
              clientPhone: trimmedPhone || null,
              clientAddress: trimmedAddress || null,
              contractNumber: trimmedNumber || null,
              contractSignedDate: signedDate ?? null,
              policyStartDate: startDate ?? null,
              durationYears:
                showDurationForProduct
                  ? durationVal ?? prev.durationYears ?? null
                  : prev.durationYears ?? null,
              ...(isAutoProduct(prod ?? null)
                ? {
                    carMake: autoFields.carMake,
                    carPlate: autoFields.carPlate,
                    carVin: autoFields.carVin,
                    carTp: autoFields.carTp,
                    carLiabilityLimit: autoFields.carLiabilityLimit,
                    carHullSumInsured: autoFields.carHullSumInsured,
                    carHullDeductible: autoFields.carHullDeductible,
                    carAssistancePlan: autoFields.carAssistancePlan,
                    carAddonGlass: autoFields.carAddonGlass,
                    carAddonAnimalCollision: autoFields.carAddonAnimalCollision,
                    carAddonAnimalDamage: autoFields.carAddonAnimalDamage,
                    carAddonVandalism: autoFields.carAddonVandalism,
                    carAddonTheft: autoFields.carAddonTheft,
                    carAddonNatural: autoFields.carAddonNatural,
                    carAddonOwnDamage: autoFields.carAddonOwnDamage,
                    carAddonGap: autoFields.carAddonGap,
                    carAddonSmartGap: autoFields.carAddonSmartGap,
                    carAddonServisPro: autoFields.carAddonServisPro,
                    carAddonReplacementCar: autoFields.carAddonReplacementCar,
                    carAddonLuggage: autoFields.carAddonLuggage,
                    carAddonPassengerInjury: autoFields.carAddonPassengerInjury,
                    neonDetail: neonUpdate.neonDetail,
                  }
                : {
                    carMake: null,
                    carPlate: null,
                    carVin: null,
                    carTp: null,
                    carLiabilityLimit: null,
                    carHullSumInsured: null,
                    carHullDeductible: null,
                    carAssistancePlan: null,
                    carAddonGlass: null,
                    carAddonAnimalCollision: null,
                    carAddonAnimalDamage: null,
                    carAddonVandalism: null,
                    carAddonTheft: null,
                    carAddonNatural: null,
                    carAddonOwnDamage: null,
                    carAddonGap: null,
                    carAddonSmartGap: null,
                    carAddonServisPro: null,
                    carAddonReplacementCar: null,
                    carAddonLuggage: null,
                    carAddonPassengerInjury: null,
                    neonDetail: neonUpdate.neonDetail,
                  }),
              ...(prod === "domex"
                ? {
                    domexDetail: domexUpdate.domexDetail,
                  }
                : { domexDetail: null }),
              ...(prod === "flexi"
                ? { flexiDetail: flexiUpdate.flexiDetail }
                : { flexiDetail: null }),
            }
          : prev
      );

      setEditMode(false);
      setDetailsSaved(true);
      pushToast("Detaily smlouvy byly uloženy.", "success");
    } catch (e) {
      console.error("Chyba při ukládání detailů smlouvy:", e);
      setDetailsError("Nepodařilo se uložit změny. Zkus to prosím znovu.");
      pushToast("Nepodařilo se uložit změny. Zkus to prosím znovu.", "error");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveNote = async () => {
    if (!ownerEmail || !entryId || !isOwnContract) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSaved(false);

    try {
      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryId,
          updates: { note: noteDraft.trim() },
        }),
      });
      setContract((prev) => (prev ? { ...prev, note: noteDraft.trim() } : prev));
      setNoteSaved(true);
      pushToast("Poznámka byla uložena.", "success");
    } catch (e) {
      console.error("Chyba při ukládání poznámky:", e);
      setNoteError("Poznámku se nepodařilo uložit. Zkus to prosím znovu.");
      pushToast("Poznámku se nepodařilo uložit. Zkus to prosím znovu.", "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleTogglePaid = async () => {
    if (!ownerEmail || !entryId || !isOwnContract) return;
    const nextValue = !(contract?.paid ?? false);
    setUpdatingPaid(true);
    setPaidError(null);
    try {
      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/set-paid", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entries: [{ ownerEmail, entryId }],
          paid: nextValue,
        }),
      });
      setContract((prev) => (prev ? { ...prev, paid: nextValue } : prev));
      pushToast(
        nextValue ? "Smlouva označena jako zaplacená." : "Platba označena jako neuhrazená.",
        "success"
      );
      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }
    } catch (e) {
      console.error("Chyba při ukládání stavu platby:", e);
      setPaidError("Nepodařilo se uložit stav platby. Zkus to prosím znovu.");
      pushToast("Nepodařilo se uložit stav platby. Zkus to prosím znovu.", "error");
    } finally {
      setUpdatingPaid(false);
    }
  };

  const handleSetStorno = async () => {
    if (!ownerEmail || !entryId || !isOwnContract) return;
    const parsed = stornoDateInput ? new Date(stornoDateInput) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      setStornoError("Zadej platné datum storna.");
      return;
    }

    setUpdatingStorno(true);
    setStornoError(null);

    try {
      const targetIds = Array.from(
        new Set(
          (contractTimeline.length > 0
            ? contractTimeline.map((entry) => entry.id)
            : [entryId]).filter(Boolean)
        )
      ) as string[];

      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryIds: targetIds,
          updates: {
            status: "storno",
            stornoDate: parsed,
          },
        }),
      });

      setContract((prev) =>
        prev ? { ...prev, status: "storno", stornoDate: parsed } : prev
      );
      setContractTimeline((prev) =>
        prev.map((entry) => ({ ...entry, status: "storno", stornoDate: parsed }))
      );
      setShowStornoModal(false);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      pushToast("Smlouva byla označena jako storno.", "success");
    } catch (e) {
      console.error("Chyba při ukládání storna:", e);
      setStornoError("Nepodařilo se uložit storno. Zkus to prosím znovu.");
      pushToast("Nepodařilo se uložit storno. Zkus to prosím znovu.", "error");
    } finally {
      setUpdatingStorno(false);
    }
  };

  const handleClearStorno = async () => {
    if (!ownerEmail || !entryId || !isOwnContract) return;

    setUpdatingStorno(true);
    setStornoError(null);

    try {
      const targetIds = Array.from(
        new Set(
          (contractTimeline.length > 0
            ? contractTimeline.map((entry) => entry.id)
            : [entryId]).filter(Boolean)
        )
      ) as string[];

      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/update-fields", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerEmail,
          entryIds: targetIds,
          updates: {
            status: "active",
            stornoDate: null,
          },
        }),
      });

      setContract((prev) =>
        prev ? { ...prev, status: "active", stornoDate: null } : prev
      );
      setContractTimeline((prev) =>
        prev.map((entry) => ({ ...entry, status: "active", stornoDate: null }))
      );
      setShowStornoModal(false);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      pushToast("Storno bylo zrušeno.", "success");
    } catch (e) {
      console.error("Chyba při rušení storna:", e);
      setStornoError("Nepodařilo se zrušit storno. Zkus to prosím znovu.");
      pushToast("Nepodařilo se zrušit storno. Zkus to prosím znovu.", "error");
    } finally {
      setUpdatingStorno(false);
    }
  };

  // meziprovize: pouze uložený snapshot při sepsání smlouvy (bez live přepočtu)
  useEffect(() => {
    if (!contract || !isManagerViewingSubordinate) {
      setOverrideItems(null);
      setOverrideTotal(null);
      setOverrideMode(null);
      setChildOverrideItems(null);
      setChildOverrideTotal(null);
      setChildOverrideMode(null);
      setChildOverrideLabel(null);
      setChildOverrideName(null);
      setChildOverridePosition(null);
      return;
    }

    const normalizedUserEmail = (user?.email ?? "").toLowerCase();
    const managerOverrides = (contract.managerOverrides as ContractDoc["managerOverrides"]) ?? [];

    const storedOverride =
      managerOverrides.find((o) => (o.email ?? "").toLowerCase() === normalizedUserEmail) ?? null;
    const storedOverrideItems = stripTotalRows(storedOverride?.items);
    const storedOverrideTotal = computeTotalWithMultipliers(storedOverrideItems);
    const hasStoredOverride =
      !!storedOverride && storedOverrideItems.length > 0 && storedOverrideTotal > 0;

    setOverrideItems(hasStoredOverride ? storedOverrideItems : null);
    setOverrideTotal(hasStoredOverride ? storedOverrideTotal : null);
    setOverrideMode(
      hasStoredOverride
        ? toCommissionMode(storedOverride?.commissionMode) ??
            toCommissionMode(contract.managerModeSnapshot) ??
            toCommissionMode(contract.commissionMode)
        : null
    );

    const chain = (contract.managerChain as ContractDoc["managerChain"]) ?? [];
    const idxByEmail = chain.findIndex(
      (c) => (c.email ?? "").toLowerCase() === normalizedUserEmail
    );
    const idxByPosition =
      idxByEmail < 0 && effectiveManagerPosition
        ? chain.findIndex((c) => c.position === effectiveManagerPosition)
        : -1;
    const resolvedIdx = idxByEmail >= 0 ? idxByEmail : idxByPosition;
    const fallbackChild =
      resolvedIdx < 0 && chain.length > 0 ? chain[chain.length - 1] : null;

    const childSnap =
      resolvedIdx > 0
        ? chain[resolvedIdx - 1]
        : resolvedIdx < 0
          ? fallbackChild ??
            (ownerManagerPosition
              ? {
                  email: ownerManagerEmail,
                  position: ownerManagerPosition,
                  commissionMode:
                    (contract.managerModeSnapshot as CommissionMode | null | undefined) ??
                    null,
                }
              : null)
          : null;

    const childEmail =
      (childSnap?.email as string | null | undefined)?.toLowerCase() ?? null;
    const storedChildOverride =
      managerOverrides.find((o) => (o.email ?? "").toLowerCase() === (childEmail ?? "")) ??
      null;
    const storedChildItems = stripTotalRows(storedChildOverride?.items);
    const storedChildTotal = computeTotalWithMultipliers(storedChildItems);
    const hasStoredChildOverride =
      !!storedChildOverride && storedChildItems.length > 0 && storedChildTotal > 0;

    if (childSnap && childEmail && hasStoredChildOverride) {
      setChildOverrideItems(storedChildItems);
      setChildOverrideTotal(storedChildTotal);
      setChildOverrideMode(
        toCommissionMode(storedChildOverride?.commissionMode) ??
          toCommissionMode(childSnap.commissionMode) ??
          toCommissionMode(contract.commissionMode)
      );
      setChildOverrideLabel(
        (childSnap.position as Position | null | undefined) ??
          normalizeTitleForCompare(childSnap.email ?? childEmail)
      );
      setChildOverrideName(nameFromEmail(childSnap.email ?? childEmail));
      setChildOverridePosition((childSnap.position as Position | null | undefined) ?? null);
      return;
    }

    setChildOverrideItems(null);
    setChildOverrideTotal(null);
    setChildOverrideMode(null);
    setChildOverrideLabel(null);
    setChildOverrideName(null);
    setChildOverridePosition(null);
  }, [
    contract,
    effectiveManagerPosition,
    isManagerViewingSubordinate,
    ownerManagerPosition,
    ownerManagerEmail,
    user?.email,
  ]);

  // mazání smlouvy
  const handleDelete = async () => {
    if (!ownerEmail || !entryId || !canDelete) {
      setDeleteError("Nemáš oprávnění tuto smlouvu smazat.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);

    try {
      await requestContractsApi<ContractsApiResponseBase>("/api/contracts/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entries: [{ ownerEmail, entryId }],
        }),
      });
      setShowDeleteModal(false);
      pushToast("Smlouva byla smazána.", "success");
      window.location.href = "/smlouvy";
    } catch (e) {
      console.error("Chyba při mazání smlouvy:", e);
      setDeleteError(
        "Smlouvu se nepodařilo smazat. Zkus to prosím znovu."
      );
      pushToast("Smlouvu se nepodařilo smazat. Zkus to prosím znovu.", "error");
      setDeleting(false);
    }
  };

  // vyfiltrované položky bez řádku "Celkem" a bez ročních součtů u produktů placených dle platby
  const filterPaymentBasedItems = (arr: CommissionResultItemDTO[]) => {
    if (prod === "domex" || prod === "koopmajetekobcan") {
      return arr.filter((it) =>
        (it.title ?? "").toLowerCase().includes("(z platby)")
      );
    }
    if (prod === "maxdomov") {
      return arr.filter(
        (it) => !(it.title ?? "").toLowerCase().includes("získatelská")
      );
    }
    return arr;
  };

  const filterAnnualYearlyDupes = (arr: CommissionResultItemDTO[]) => {
    if (prod !== "cppPPRs" || freq !== "annual") return arr;
    return arr.filter(
      (it) =>
        !normalizeTitleForCompare(it.title).includes("provize za rok")
    );
  };

  const handlePaymentVerificationClick = async () => {
    const contractNo = (contract?.contractNumber ?? "").trim();
    if (!contractNo) {
      pushToast("Číslo smlouvy není k dispozici pro zkopírování.", "error");
      return;
    }

    const pasteShortcut =
      typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? "⌘+V"
        : "Ctrl+V";
    const targetFieldHint =
      prod === "allianzAuto" || prod === "allianzmujdomov"
        ? "v Allianz do pole „Zadejte číslo pojistné smlouvy“"
        : prod && CPP_PAYMENT_CHECK_PRODUCTS.has(prod)
        ? "v ČPP do pole „Číslo pojistné smlouvy“"
        : "do pole čísla smlouvy";
    const copiedMessage = `Číslo smlouvy ${contractNo} bylo zkopírováno. Vlož ho ${targetFieldHint} (${pasteShortcut}).`;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(contractNo);
        pushToast(copiedMessage, "success");
        return;
      }

      if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = contractNo;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (copied) {
          pushToast(copiedMessage, "success");
          return;
        }
      }

      pushToast("Nepodařilo se zkopírovat číslo smlouvy.", "error");
    } catch {
      pushToast("Nepodařilo se zkopírovat číslo smlouvy.", "error");
    }
  };

  const handleOpenEmbeddedPaymentVerification = async () => {
    await handlePaymentVerificationClick();
    setShowPaymentVerificationModal(true);
  };

  const adviserItems =
    filterAnnualYearlyDupes(
      filterPaymentBasedItems(
        (contract?.items ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const managerItems =
    filterAnnualYearlyDupes(
      filterPaymentBasedItems(
        (overrideItems ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const childManagerItems =
    filterAnnualYearlyDupes(
      filterPaymentBasedItems(
        (childOverrideItems ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const showMeziprovision =
    managerItems.length > 0 &&
    overrideTotal != null &&
    isManagerViewingSubordinate;

  const showChildMeziprovision =
    childManagerItems.length > 0 &&
    childOverrideTotal != null &&
    isManagerViewingSubordinate &&
    childOverrideLabel;

  const canDelete = isOwnContract;

  const adviserSum = adviserItems.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  const managerSum = managerItems.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  const childManagerSum = childManagerItems.reduce(
    (sum, it) => sum + (it.amount ?? 0),
    0
  );

  const paymentBasedAdviserTotals = isPaymentBasedProduct
    ? paymentBasedTotals(adviserItems, paymentMultiplier)
    : null;
  const paymentBasedManagerTotals = isPaymentBasedProduct
    ? paymentBasedTotals(managerItems, paymentMultiplier)
    : null;
  const paymentBasedChildManagerTotals = isPaymentBasedProduct
    ? paymentBasedTotals(childManagerItems, paymentMultiplier)
    : null;

  const adviserTotalDisplay =
    isPaymentBasedProduct ? adviserSum * paymentMultiplier : contractTotal;
  const managerTotalDisplay =
    isPaymentBasedProduct ? managerSum * paymentMultiplier : overrideTotal ?? 0;
  const childManagerTotalDisplay =
    isPaymentBasedProduct ? childManagerSum * paymentMultiplier : childOverrideTotal ?? 0;

  // pokud je načtený kontrakt a uživatel nemá oprávnění, schovej data a přesměruj
  useEffect(() => {
    if (loading || !user || !contract) return;
    const canView = canViewContract;
    if (!canView && !unauthorized) {
      setUnauthorized(true);
      setContract(null);
      setError("Nemáš oprávnění tuto smlouvu zobrazit.");
      setShowDeleteModal(false);
      router.replace(backToContractsHref);
    }
  }, [loading, user, contract, canViewContract, unauthorized, router, backToContractsHref]);

  const shellCardClass = "flex-1 space-y-8 px-2 py-2 font-mono";
  const surfaceCardClass =
    "rounded-2xl border border-slate-300 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]";
  const surfaceSoftClass =
    "rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4";
  const successPanelClass =
    "rounded-2xl border border-slate-300 bg-white px-5 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.08)]";
  const commissionPanelClass =
    "rounded-[22px] border border-slate-300 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_100%)] px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]";
  const commissionRowClass =
    "flex items-baseline justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3";
  const commissionTotalClass =
    "mt-4 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3";
  const commissionTotalHighlightClass =
    "mt-4 rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-white shadow-[0_10px_20px_rgba(15,23,42,0.28)]";
  const noteCardClass =
    "rounded-[22px] border border-slate-300 bg-[linear-gradient(165deg,#ffffff_0%,#f8fafc_100%)] px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]";
  const monoHeadingClass = "font-mono tracking-tight text-slate-900";
  const monoChipClass =
    "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-base font-mono tracking-tight text-slate-900";
  const monoChipDarkClass =
    "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-base font-mono tracking-tight text-white";
  const ghostButtonClass =
    "rounded-xl border border-slate-900 bg-slate-900 px-5 py-3 text-base sm:text-lg font-mono tracking-tight text-white transition hover:bg-black disabled:opacity-60";
  const headerActionButtonClass =
    "rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm sm:text-base font-mono tracking-tight text-white transition hover:bg-black disabled:opacity-60";
  const saveButtonClass =
    "inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-5 py-3 text-base sm:text-lg font-semibold font-mono tracking-tight text-white transition hover:bg-black disabled:opacity-60";
  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300";
  const inputCompactClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300";
  const metaLabelClass = "text-sm uppercase tracking-[0.2em] text-slate-600";
  const keyValueLabelClass = "text-lg text-slate-600";
  const keyValueValueClass = "text-lg font-semibold text-right text-slate-900";
  const statusErrorClass = "px-1 text-base text-slate-700";
  const statusSuccessClass = "px-1 text-base text-slate-900";
  const sectionPanelClass = "space-y-4 px-1 py-1";
  const destructiveButtonClass =
    "inline-flex items-center rounded-xl border border-rose-700 bg-rose-700 px-6 py-3 text-base sm:text-lg font-medium font-mono text-white shadow-[0_8px_20px_rgba(190,24,93,0.28)] transition hover:bg-rose-800 disabled:opacity-60 disabled:cursor-not-allowed";
  const productPanelClass = "w-[400px] space-y-4 p-2 font-mono";
  const adviserBreakdownPosition =
    ((contract?.position as Position | null | undefined) ?? ownerPosition ?? null);
  const adviserBreakdownMode = toCommissionMode(contract?.commissionMode);

  const handleOpenNeonImmediateBreakdown = useCallback(
    (
      item: CommissionResultItemDTO,
      position: Position | null | undefined,
      commissionMode: CommissionMode | null | undefined
    ) => {
      const breakdown = buildNeonImmediateBreakdown(
        item.amount ?? 0,
        position,
        commissionMode
      );
      if (!breakdown) {
        pushToast("Rozpad okamžité provize pro tuto pozici zatím není dostupný.", "error");
        return;
      }
      setNeonImmediateBreakdown(breakdown);
    },
    [pushToast]
  );

  const renderCommissionRow = (
    item: CommissionResultItemDTO,
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined,
    key: string
  ) => {
    const icon = resultIconForTitle(item.title);
    const clickable =
      prod === "neon" &&
      isImmediateCommissionTitle(item.title) &&
      hasNeonImmediateCoefficient(position);
    const rowClass = clickable
      ? `${commissionRowClass} w-full text-left transition hover:border-slate-400 hover:bg-slate-100`
      : commissionRowClass;

    const content = (
      <>
        <span className="flex items-center gap-3 text-lg text-slate-900 font-medium">
          {icon && (
            <span className="relative h-5 w-5 flex-shrink-0">
              <Image
                src={icon}
                alt=""
                fill
                className="object-contain"
              />
            </span>
          )}
          <span>{cleanResultTitle(item.title)}</span>
        </span>
        <span className="text-lg font-semibold text-slate-900">
          {formatMoney(item.amount)}
        </span>
      </>
    );

    if (!clickable) {
      return (
        <div key={key} className={rowClass}>
          {content}
        </div>
      );
    }

    return (
      <button
        key={key}
        type="button"
        className={rowClass}
        onClick={() =>
          handleOpenNeonImmediateBreakdown(item, position, commissionMode)
        }
      >
        {content}
      </button>
    );
  };

  const renderLoadingSkeleton = () => (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={surfaceCardClass}>
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-40" />
        </div>
        <div className={surfaceCardClass}>
          <Skeleton className="h-3 w-20 mb-2" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-6 w-36" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={surfaceSoftClass}>
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={`s-basic-${i}`} className="flex justify-between gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className={surfaceSoftClass}>
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={`s-dates-${i}`} className="flex justify-between gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={successPanelClass}>
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="divide-y divide-slate-200">
          {[1, 2, 3].map((i) => (
            <div key={`s-provize-${i}`} className="flex items-center justify-between gap-3 py-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
          <div className="flex items-center justify-between pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </section>

      <section className={surfaceCardClass}>
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-24 w-full" />
      </section>
    </div>
  );

  return (
    <main className="relative min-h-screen overflow-hidden font-mono text-slate-900">
      <div className="fixed inset-0 -z-10 bg-white" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(1200px_520px_at_18%_-10%,rgba(15,23,42,0.06),transparent_60%),radial-gradient(950px_520px_at_100%_0%,rgba(15,23,42,0.04),transparent_55%)]" />

      <Toasts items={toasts} onDismiss={dismissToast} />

      <div className="relative flex min-h-screen items-center justify-center px-5 py-12">
        <div className="w-full max-w-6xl">
          <div className="flex items-stretch gap-4">
            <div className={shellCardClass}>
            {/* HEADER */}
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mb-1 text-base uppercase tracking-[0.18em] text-slate-600">
                  Detail smlouvy
                </p>
                <h1 className="flex flex-wrap items-center gap-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                  <span>
                    {contract?.contractNumber?.trim()
                      ? contract.contractNumber.trim()
                      : "Číslo smlouvy není uvedené"}
                  </span>
                  {isEndorsement && (
                    <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
                      Dodatek
                    </span>
                  )}
                  {isStornoContract ? (
                    <span className="inline-flex items-center rounded-full border border-amber-400 bg-amber-100 px-5 py-2.5 text-base font-semibold uppercase tracking-tight text-amber-800 sm:text-lg">
                      STORNO
                    </span>
                  ) : isDozitaContract ? (
                    <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
                      {maturityDateLabel !== "—" ? `Dožitá od ${maturityDateLabel}` : "Dožitá"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      Aktivní
                    </span>
                  )}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {isOwnContract && (
                  <button
                    type="button"
                    onClick={handleTogglePaid}
                    disabled={updatingPaid}
                    className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-base font-semibold tracking-tight transition sm:text-lg ${
                      contract?.paid
                        ? "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
                        : "border-rose-700 bg-rose-600 text-white hover:bg-rose-700"
                    } ${updatingPaid ? "opacity-60" : ""}`}
                  >
                    {updatingPaid && <Spinner className="h-4 w-4 border-2 border-white/70 border-t-slate-500" />}
                    <span>{contract?.paid ? "Zaplaceno" : "Nezaplaceno"}</span>
                  </button>
                )}

                {isOwnContract && !editMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailsSaved(false);
                      setEditMode(true);
                    }}
                    className={`${headerActionButtonClass} inline-flex items-center gap-2`}
                  >
                    <PencilLine size={16} strokeWidth={2} aria-hidden="true" />
                    <span>Upravit údaje</span>
                  </button>
                )}

                {paymentVerificationUrl && !canEmbedPaymentVerification && (
                  <a
                    href={paymentVerificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handlePaymentVerificationClick}
                    className={`${headerActionButtonClass} inline-flex items-center gap-2`}
                  >
                    <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
                    <span>Ověřit zaplacení</span>
                  </a>
                )}

                {paymentVerificationUrl && canEmbedPaymentVerification && (
                  <button
                    type="button"
                    onClick={handleOpenEmbeddedPaymentVerification}
                    className={`${headerActionButtonClass} inline-flex items-center gap-2`}
                  >
                    <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
                    <span>Ověřit zaplacení</span>
                  </button>
                )}

                {isOwnContract && editMode && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={savingDetails}
                      className={saveButtonClass}
                    >
                      {savingDetails && (
                        <Spinner className="h-3.5 w-3.5 border-black/35 border-t-black" />
                      )}
                      <span>{savingDetails ? "Ukládám…" : "Uložit změny"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetEditFields();
                        setEditMode(false);
                      }}
                      disabled={savingDetails}
                      className={ghostButtonClass}
                    >
                      Zrušit
                    </button>
                  </>
                )}

                <Link
                  href={backToContractsHref}
                  className={`${headerActionButtonClass} inline-flex items-center gap-2`}
                >
                  <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
                  <span>Zpět na smlouvy</span>
                </Link>
              </div>
            </header>

            {detailsError && (
              <div className={statusErrorClass}>
                {detailsError}
              </div>
            )}
            {detailsSaved && (
              <div className={statusSuccessClass}>
                Změny byly uloženy.
              </div>
            )}

            {loading ? (
              renderLoadingSkeleton()
            ) : error ? (
              <div className={statusErrorClass}>
                {error}
              </div>
            ) : contract ? (
              <>
                {/* Klient / Produkt boxy */}
                <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className={sectionPanelClass}>
                    <div className={`${metaLabelClass} inline-flex items-center gap-2`}>
                      <UserRound size={14} strokeWidth={2} aria-hidden="true" />
                      <span>Klient</span>
                    </div>
                    {editMode ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editClientName}
                          onChange={(e) => setEditClientName(e.target.value)}
                          className={`${inputClass} text-2xl font-semibold`}
                          placeholder="Jméno klienta"
                        />
                        <input
                          type="email"
                          value={editClientEmail}
                          onChange={(e) => setEditClientEmail(e.target.value)}
                          className={inputClass}
                          placeholder="E-mail klienta"
                        />
                        <input
                          type="tel"
                          value={editClientPhone}
                          onChange={(e) => setEditClientPhone(e.target.value)}
                          className={inputClass}
                          placeholder="Telefon"
                        />
                        <input
                          type="text"
                          value={editClientAddress}
                          onChange={(e) => setEditClientAddress(e.target.value)}
                          className={inputClass}
                          placeholder="Adresa"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-4xl font-semibold tracking-tight leading-none text-slate-900">
                          {contract?.clientName ?? "—"}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={sectionPanelClass}>
                    <div className={`${metaLabelClass} inline-flex items-center gap-2`}>
                      <Package size={14} strokeWidth={2} aria-hidden="true" />
                      <span>Produkt</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-4xl font-semibold tracking-tight leading-none text-slate-900">
                          {productLabel(prod)}
                        </span>
                        <Image
                          src={productIcon(prod)}
                          alt="Produkt"
                          width={56}
                          height={56}
                          className="h-11 w-auto flex-shrink-0"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Info o poradci – zobraz pouze manažerovi na podřízené smlouvě */}
                {contract && isManagerViewingSubordinate && (
                  <section className={sectionPanelClass}>
                    <h3 className={`mb-2 flex items-center gap-2 text-lg font-semibold ${monoHeadingClass}`}>
                      <span className={monoChipClass}>Poradce</span>
                    </h3>
                    <dl className="space-y-2 text-lg text-slate-800">
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Sjednal</dt>
                        <dd className={keyValueValueClass}>
                          {nameFromEmail(contract.userEmail)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Pozice</dt>
                        <dd className={keyValueValueClass}>
                          {positionLabel(
                            ownerPosition ?? (contract.position as Position | null)
                          )}
                        </dd>
                      </div>
                      {ownerManagerEmail && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Nadřízený</dt>
                          <dd className={keyValueValueClass}>
                            {nameFromEmail(ownerManagerEmail)}
                            {ownerManagerPosition && (
                              <span className="block text-sm text-slate-600">
                                {positionLabel(ownerManagerPosition)}
                              </span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>
                )}

                {paidError && (
                  <div className={statusErrorClass}>
                    {paidError}
                  </div>
                )}
                <div className="space-y-7">
                {/* ZÁKLADNÍ INFO */}
                <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className={sectionPanelClass}>
                    <h3 className={`mb-3 flex items-center gap-2 text-xl font-semibold ${monoHeadingClass}`}>
                      <span className={monoChipDarkClass}>
                        <FileText size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Základní údaje</span>
                      </span>
                    </h3>
                    <dl className="space-y-3 text-lg text-slate-800">
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Sjednána jako</dt>
                        <dd className={keyValueValueClass}>
                          {positionLabel(contract.position)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>
                          {isEndorsement ? "Nové pojistné" : "Pojistné"}
                        </dt>
                        <dd className={keyValueValueClass}>
                          {formatMoney(premium)}
                        </dd>
                      </div>
                      {isEndorsement && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Základ pro provizi dodatku</dt>
                          <dd className={keyValueValueClass}>
                            {formatMoney(contract.inputAmount ?? 0)}
                          </dd>
                        </div>
                      )}
                      {isEndorsement && endorsementDelta != null && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Rozdíl pojistného</dt>
                          <dd
                            className={`${keyValueValueClass} ${
                              endorsementDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {endorsementDelta >= 0 ? "+" : "−"}
                            {formatMoney(Math.abs(endorsementDelta))}
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>
                          Frekvence platby
                        </dt>
                        <dd className={keyValueValueClass}>
                          {frequencyText(freq)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Stav smlouvy</dt>
                        <dd
                          className={`${keyValueValueClass} ${
                            isStornoContract
                              ? "text-amber-700"
                              : isDozitaContract
                              ? "text-sky-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {isStornoContract
                            ? stornoDateLabel !== "—"
                              ? `Storno (${stornoDateLabel})`
                              : "Storno"
                            : isDozitaContract
                            ? maturityDateLabel !== "—"
                              ? `Dožitá (${maturityDateLabel})`
                              : "Dožitá"
                            : "Aktivní"}
                        </dd>
                      </div>
                      {isRefreshContract && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Refresh</dt>
                          <dd className={`${keyValueValueClass} max-w-[70%] text-right text-sm leading-snug`}>
                            <span className="block">Tato smlouva je označena jako Refresh.</span>
                            {refreshOriginalContractNumber && (
                              <span className="mt-1 block text-xs text-slate-500">
                                Původní č. smlouvy: {refreshOriginalContractNumber}
                              </span>
                            )}
                          </dd>
                        </div>
                      )}
                      {(contract?.refreshReplacedBySignedDate || hasRefreshReplacement) && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Navazující refresh</dt>
                          <dd className={`${keyValueValueClass} max-w-[70%] text-right text-sm leading-snug`}>
                            <span className="block">
                              Na tuto smlouvu byl sjednán Refresh dne{" "}
                              {refreshReplacementSignedLabel !== "—"
                                ? refreshReplacementSignedLabel
                                : "—"}
                              .
                            </span>
                            {refreshReplacementHref && canOpenRefreshReplacement ? (
                              <Link
                                href={refreshReplacementHref}
                                className="mt-1 inline-flex items-center rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                Otevřít novou smlouvu
                              </Link>
                            ) : hasRefreshReplacement ? (
                              <span className="mt-1 block text-xs text-slate-500">
                                Na novou smlouvu nemáš oprávnění.
                              </span>
                            ) : null}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* DATA SMLOUVY */}
                  <div className={sectionPanelClass}>
                    <h3 className={`mb-3 flex items-center gap-2 text-xl font-semibold ${monoHeadingClass}`}>
                      <span className={monoChipDarkClass}>
                        <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Data smlouvy</span>
                      </span>
                    </h3>
                    <dl className="space-y-3 text-lg text-slate-800">
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>Datum sjednání</dt>
                        <dd className={keyValueValueClass}>
                          {editMode ? (
                            <input
                              type="date"
                              value={editContractSigned}
                              onChange={(e) => setEditContractSigned(e.target.value)}
                              className={inputCompactClass}
                            />
                          ) : (
                            formatDate(contract.contractSignedDate ?? contract.createdAt)
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className={keyValueLabelClass}>
                          Počátek smlouvy
                        </dt>
                        <dd className={keyValueValueClass}>
                          {editMode ? (
                            <input
                              type="date"
                              value={editPolicyStart}
                              onChange={(e) => setEditPolicyStart(e.target.value)}
                              className={inputCompactClass}
                            />
                          ) : (
                            formatDate(contract.policyStartDate)
                          )}
                        </dd>
                      </div>
                      {showDurationForProduct && (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Doba trvání (provize)</dt>
                          <dd className={keyValueValueClass}>
                            {editMode ? (
                              <input
                                type="number"
                                min={durationBounds?.[0] ?? 1}
                                max={durationBounds?.[1] ?? 80}
                                value={editDuration ?? ""}
                                onChange={(e) =>
                                  setEditDuration(e.target.value ? Number(e.target.value) : null)
                                }
                                className={`w-20 ${inputCompactClass}`}
                              />
                            ) : (
                              durationYears != null
                                ? `${durationYears} ${durationYears === 1 ? "rok" : "let"}`
                                : "—"
                            )}
                          </dd>
                        </div>
                      )}
                      {editMode ? (
                        <div className="flex justify-between gap-2">
                          <dt className={keyValueLabelClass}>Číslo smlouvy</dt>
                          <dd className={`${keyValueValueClass} w-40`}>
                            <input
                              type="text"
                              value={editContractNumber}
                              onChange={(e) => setEditContractNumber(e.target.value)}
                              className={`w-full ${inputCompactClass}`}
                              placeholder="Číslo smlouvy"
                            />
                          </dd>
                        </div>
                      ) : (
                        contract.contractNumber && (
                          <div className="flex justify-between gap-2">
                            <dt className={keyValueLabelClass}>
                              Číslo smlouvy
                            </dt>
                            <dd className={keyValueValueClass}>
                          {contract.contractNumber}
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              </div>
            </section>

            {showTimelineSection && (
              <section className={sectionPanelClass}>
                <h3 className={`mb-3 flex items-center gap-2 text-xl font-semibold ${monoHeadingClass}`}>
                  <span className={monoChipDarkClass}>
                    <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
                    <span>Timeline smlouvy</span>
                  </span>
                </h3>

                {timelineLoading && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Načítám historii změn…
                  </div>
                )}
                {timelineError && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {timelineError}
                  </div>
                )}

                {!timelineLoading && !timelineError && timelineRows.length > 0 && (
                  <div className="space-y-2">
                    {timelineRows.map((row) => {
                      const rowContent = (
                        <div
                          className={`rounded-xl border px-4 py-3 transition ${
                            row.isCurrent
                              ? "border-slate-900 bg-slate-100"
                              : "border-slate-200 bg-slate-50 hover:bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                                Krok {row.step}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  row.label === "Dodatek"
                                    ? "border-sky-300 bg-sky-100 text-sky-800"
                                    : "border-slate-300 bg-slate-200 text-slate-800"
                                }`}
                              >
                                {row.label}
                              </span>
                              {row.isCurrent && (
                                <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                  Otevřeno
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                              {formatMoney(row.total)}
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
                            <p>
                              Počátek: <span className="font-semibold text-slate-800">{row.policyStartText}</span>
                            </p>
                            <p>
                              Sjednáno:{" "}
                              <span className="font-semibold text-slate-800">
                                {row.contractSignedText}
                              </span>
                            </p>
                            <p>
                              Pozice: <span className="font-semibold text-slate-800">{row.positionText}</span>
                            </p>
                            <p>
                              Režim: <span className="font-semibold text-slate-800">{row.modeText}</span>
                            </p>
                            <p>
                              Pojistné:{" "}
                              <span className="font-semibold text-slate-800">
                                {formatMoney(row.premiumAmount)}
                              </span>
                            </p>
                            {row.delta != null ? (
                              <p>
                                Změna:{" "}
                                <span
                                  className={`font-semibold ${
                                    row.delta >= 0 ? "text-emerald-700" : "text-rose-700"
                                  }`}
                                >
                                  {row.delta >= 0 ? "+" : "−"}
                                  {formatMoney(Math.abs(row.delta))}
                                </span>
                              </p>
                            ) : (
                              <p>
                                Datum kroku:{" "}
                                <span className="font-semibold text-slate-800">
                                  {row.orderDateText}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      );

                      if (row.href && !row.isCurrent) {
                        return (
                          <Link key={row.id} href={row.href} className="block">
                            {rowContent}
                          </Link>
                        );
                      }

                      return <div key={row.id}>{rowContent}</div>;
                    })}
                  </div>
                )}
              </section>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
              <div className="space-y-5">
            {/* MEZIPROVIZE – jen když manažer kouká na podřízeného */}
            {showMeziprovision && (
              <section className="space-y-5">
                <div className="space-y-3">
          <h3 className={`text-xl font-semibold ${monoHeadingClass} flex flex-wrap items-center gap-2`}>
            <span className={monoChipClass}>Meziprovize</span>
            <span>pro {nameFromEmail(user?.email)}</span>
            {effectiveManagerPosition && (
              <span className="text-base text-slate-700">
                {positionLabel(effectiveManagerPosition)}
              </span>
            )}
          </h3>
          <div className={commissionPanelClass}>
            <div className="space-y-1">
              {managerItems.map((item, idx) =>
                renderCommissionRow(
                  item,
                  effectiveManagerPosition,
                  overrideMode,
                  `manager-${idx}-${item.title}`
                )
              )}
            </div>

                        <div className={commissionTotalClass}>
                          {isPaymentBasedProduct && paymentBasedManagerTotals ? (
                            <div className="w-full space-y-2 text-lg">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">Celkem v 1. roce</span>
                                <span className="text-2xl font-bold text-slate-900">
                                  {formatMoney(paymentBasedManagerTotals.immediate)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">Celkem ročně následně</span>
                                <span className="text-2xl font-bold text-slate-900">
                                  {formatMoney(paymentBasedManagerTotals.subsequent)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex w-full items-center justify-between gap-4">
                              <span className="text-lg font-semibold">
                                Celkem meziprovize
                              </span>
                              <span className="text-2xl font-bold text-slate-900">
                                {formatMoney(managerTotalDisplay)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {showChildMeziprovision && (
                      <div className="space-y-3">
                        <h4 className={`text-lg font-semibold ${monoHeadingClass} flex flex-wrap items-center gap-2`}>
                          <span className={monoChipClass}>Meziprovize</span>
                          Meziprovize pro podřízeného manažera{" "}
                          {childOverrideName ?? ""}
                          {childOverridePosition && (
                            <span className="ml-1 text-sm text-slate-700">
                              ({positionLabel(childOverridePosition)})
                            </span>
                          )}
                        </h4>
                        <div className={commissionPanelClass}>
                          <div className="space-y-1">
                            {childManagerItems.map((item, idx) =>
                              renderCommissionRow(
                                item,
                                childOverridePosition,
                                childOverrideMode,
                                `child-manager-${idx}-${item.title}`
                              )
                            )}
                          </div>

                          <div className={commissionTotalClass}>
                            {isPaymentBasedProduct && paymentBasedChildManagerTotals ? (
                              <div className="w-full space-y-2 text-lg">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">Celkem v 1. roce</span>
                                  <span className="text-2xl font-bold text-slate-900">
                                    {formatMoney(paymentBasedChildManagerTotals.immediate)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">Celkem ročně následně</span>
                                  <span className="text-2xl font-bold text-slate-900">
                                    {formatMoney(paymentBasedChildManagerTotals.subsequent)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex w-full items-center justify-between gap-4">
                                <span className="text-lg font-semibold">
                                  Celkem meziprovize
                                </span>
                                <span className="text-2xl font-bold text-slate-900">
                                  {formatMoney(childManagerTotalDisplay)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* PROVIZE PORADCE */}
                {isOwnContract ? (
                  // VLASTNÍ SMLOUVA – vždy viditelné
                  <section className="space-y-4">
                    <h3 className={`text-xl font-semibold ${monoHeadingClass} flex items-center gap-2`}>
                      <span className={monoChipDarkClass}>Provize</span>
                      Výpočet provizí
                    </h3>
                    <div className={commissionPanelClass}>
                      <div className="space-y-1">
                        {adviserItems.map((item, idx) =>
                          renderCommissionRow(
                            item,
                            adviserBreakdownPosition,
                            adviserBreakdownMode,
                            `adviser-own-${idx}-${item.title}`
                          )
                        )}
                      </div>

                      <div className={commissionTotalHighlightClass}>
                        {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                          <div className="w-full space-y-2 text-lg">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Celkem v 1. roce</span>
                              <span className="text-2xl font-bold text-emerald-300">
                                {formatMoney(paymentBasedAdviserTotals.immediate)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Celkem ročně následně</span>
                              <span className="text-2xl font-bold text-emerald-300">
                                {formatMoney(paymentBasedAdviserTotals.subsequent)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-lg font-semibold">
                              Celkem
                            </span>
                            <span className="text-2xl font-bold text-emerald-300">
                              {formatMoney(adviserTotalDisplay)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                ) : (
                  // MANAŽER NA SMLOUVĚ PODŘÍZENÉHO – collapsible
                  <section className="space-y-4">
                    <button
                      type="button"
                      onClick={() =>
                        setShowAdvisorDetails((v) => !v)
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-5 py-2.5 text-lg font-semibold font-mono tracking-tight text-white transition hover:bg-black"
                    >
                      <span>
                        {showAdvisorDetails
                          ? "Skrýt provizi poradce"
                          : "Zobrazit provizi poradce"}
                      </span>
                      <span className="text-base text-slate-300">
                        {showAdvisorDetails ? "▲" : "▼"}
                      </span>
                    </button>

                        {showAdvisorDetails && (
                      <div className={commissionPanelClass}>
                        <div className="space-y-1">
                          {adviserItems.map((item, idx) =>
                            renderCommissionRow(
                              item,
                              adviserBreakdownPosition,
                              adviserBreakdownMode,
                              `adviser-team-${idx}-${item.title}`
                            )
                          )}
                        </div>

                        <div className={commissionTotalHighlightClass}>
                          {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                            <div className="w-full space-y-2 text-lg">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">Celkem v 1. roce</span>
                                <span className="text-2xl font-bold text-emerald-300">
                                  {formatMoney(paymentBasedAdviserTotals.immediate)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">Celkem ročně následně</span>
                                <span className="text-2xl font-bold text-emerald-300">
                                  {formatMoney(paymentBasedAdviserTotals.subsequent)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex w-full items-center justify-between gap-4">
                              <span className="text-lg font-semibold">
                                Celkem
                              </span>
                              <span className="text-2xl font-bold text-emerald-300">
                                {formatMoney(adviserTotalDisplay)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )}

              </div>

                {/* POZNÁMKA */}
                <section className={`${noteCardClass} space-y-4 lg:h-fit lg:mt-10`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`text-xl font-semibold ${monoHeadingClass} flex items-center gap-2`}>
                      <span className={monoChipDarkClass}>
                        <StickyNote size={14} strokeWidth={2} aria-hidden="true" />
                        <span>Poznámka</span>
                      </span>
                      Poznámka ke smlouvě
                    </h3>
                    {noteSaved && (
                      <span className="text-sm text-slate-700 font-mono">
                        Uloženo
                      </span>
                    )}
                  </div>

                  {noteError && (
                    <p className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-base text-slate-800">
                      {noteError}
                    </p>
                  )}

                  {isOwnContract ? (
                    <div className="space-y-3">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => {
                          setNoteDraft(e.target.value);
                          setNoteSaved(false);
                        }}
                        rows={6}
                        className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
                        placeholder="Sem si můžeš napsat poznámku jen pro sebe…"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={savingNote}
                          className="inline-flex items-center rounded-xl border border-slate-900 bg-slate-900 px-6 py-3 text-base sm:text-lg font-semibold font-mono tracking-tight text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingNote && (
                            <Spinner className="h-4 w-4 border-slate-400 border-t-slate-900" />
                          )}
                          <span>{savingNote ? "Ukládám…" : "Uložit poznámku"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900">
                      {contract.note?.trim()
                        ? contract.note.trim()
                        : "Autor smlouvy zatím žádnou poznámku nepřidal."}
                    </div>
                  )}
                </section>
            </div>

                {/* SMAZAT SMLOUVU */}
                {canDelete && (
                  <section className="pt-2">
                    {deleteError && (
                      <p className="mb-2 text-base text-slate-700">
                        {deleteError}
                      </p>
                    )}
                    {stornoError && (
                      <p className="mb-2 text-base text-slate-700">
                        {stornoError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStornoError(null);
                          setShowDeleteModal(false);
                          setShowStornoModal(true);
                        }}
                        disabled={updatingStorno}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-700 bg-amber-600 px-6 py-3 text-base sm:text-lg font-medium font-mono text-white shadow-[0_8px_20px_rgba(180,83,9,0.25)] transition hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {updatingStorno && (
                          <Spinner className="h-5 w-5 border-amber-200/70 border-t-white" />
                        )}
                        <span>{isStornoContract ? "Upravit storno" : "Stornovat smlouvu"}</span>
                      </button>
                      {isStornoContract && (
                        <button
                          type="button"
                          onClick={handleClearStorno}
                          disabled={updatingStorno}
                          className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-700 px-6 py-3 text-base sm:text-lg font-medium font-mono text-white transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Zrušit storno
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setShowStornoModal(false);
                          setShowDeleteModal(true);
                        }}
                        disabled={deleting}
                        className={destructiveButtonClass}
                      >
                        {deleting && (
                          <Spinner className="h-5 w-5 border-slate-400 border-t-slate-900" />
                        )}
                        <span>{deleting ? "Mažu…" : "Smazat smlouvu"}</span>
                      </button>
                    </div>
                  </section>
                )}
              </div>
              </>
            ) : null}
            </div>

            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => setShowProductPanel((v) => !v)}
                className={`h-full min-h-[210px] w-14 rounded-2xl border transition ${
                  showProductPanel
                    ? "border-slate-900 bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.25)]"
                    : "border-slate-900 bg-slate-900 text-white hover:bg-black"
                } flex items-center justify-center text-base font-semibold tracking-[0.2em]`}
                style={{ writingMode: "vertical-rl" }}
              >
                DETAIL
              </button>
            </div>

            {showProductPanel && (
              <div className={productPanelClass}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-semibold ${monoHeadingClass}`}>
                    Detail produktu
                  </h3>
                  <span className="text-base text-slate-600">{productLabel(prod)}</span>
                </div>
                {isAutoProduct(prod) && (
                  <AutoDetailPanel
                    prod={prod}
                    editMode={editMode}
                    fields={autoFields}
                    contract={contract}
                    onChange={handleAutoFieldChange}
                  />
                )}
                {prod === "neon" && (
                  <NeonDetailPanel
                    prod={prod}
                    editMode={editMode}
                    fields={neonFields}
                    contract={contract?.neonDetail ?? null}
                    onChange={handleNeonFieldChange}
                  />
                )}
                {prod === "domex" && (
                  <DomexDetailPanel
                    prod={prod}
                    editMode={editMode}
                    fields={domexFields}
                    domexDetail={contract?.domexDetail ?? null}
                    onChange={handleDomexFieldChange}
                  />
                )}
                {prod === "flexi" && (
                  <FlexiDetailPanel
                    prod={prod}
                    editMode={editMode}
                    fields={flexiFields}
                    contract={contract?.flexiDetail ?? null}
                    onChange={handleFlexiFieldChange}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {neonImmediateBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm"
            aria-label="Zavřít rozpis okamžité provize"
            onClick={() => setNeonImmediateBreakdown(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rozpis okamžité provize"
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  Rozpis okamžité provize
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  ČPP ŽP NEON • {positionLabel(neonImmediateBreakdown.position)}
                </p>
                <p className="text-sm text-slate-600">
                  Režim:{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.includeB3601 ? "Zrychlený" : "Běžný"}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Koeficient (okamžitá):{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.totalCoefficient.toLocaleString("cs-CZ", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3,
                    })}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Koeficient (101A):{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.a101Coefficient.toLocaleString("cs-CZ", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 4,
                    })}
                  </span>
                </p>
                <p className="text-sm text-slate-600">
                  Koeficient (B0301):{" "}
                  <span className="font-semibold text-slate-800">
                    {neonImmediateBreakdown.b0301Coefficient.toLocaleString("cs-CZ", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3,
                    })}
                  </span>
                </p>
                {neonImmediateBreakdown.includeB3601 && (
                  <p className="text-sm text-slate-600">
                    Koeficient (50% z B3601):{" "}
                    <span className="font-semibold text-slate-800">
                      {neonImmediateBreakdown.b3601HalfCoefficient.toLocaleString("cs-CZ", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 4,
                      })}
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setNeonImmediateBreakdown(null)}
                className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {neonImmediateBreakdown.parts.map((part) => (
                <div
                  key={part.label}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-800">{part.label}</span>
                  <span className="text-base font-semibold text-slate-900">
                    {formatMoney(part.amount)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-900 bg-slate-900 px-3 py-2">
              <span className="text-sm font-semibold text-white">Celkem okamžitá provize</span>
              <span className="text-xl font-bold text-emerald-300">
                {formatMoney(neonImmediateBreakdown.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {canDelete && showStornoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít potvrzení storna"
            onClick={() => {
              setStornoError(null);
              setShowStornoModal(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Potvrzení storna smlouvy"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-7 shadow-2xl shadow-slate-300/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  {isStornoContract ? "Upravit storno smlouvy" : "Stornovat smlouvu?"}
                </h3>
                <p className="mt-1 text-base text-slate-700">
                  Zadej datum storna a potvrď akci.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStornoError(null);
                  setShowStornoModal(false);
                }}
                className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Datum storna
              </label>
              <input
                type="date"
                value={stornoDateInput}
                onChange={(e) => setStornoDateInput(e.target.value)}
                disabled={updatingStorno}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
              />
            </div>

            {stornoError && (
              <p className="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {stornoError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setStornoError(null);
                  setShowStornoModal(false);
                }}
                className={ghostButtonClass}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSetStorno}
                disabled={updatingStorno}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-700 bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(180,83,9,0.25)] transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
              >
                {updatingStorno && (
                  <Spinner className="h-5 w-5 border-amber-200/70 border-t-white" />
                )}
                <span>{isStornoContract ? "Uložit storno" : "Potvrdit storno"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentVerificationModal &&
        canEmbedPaymentVerification &&
        paymentVerificationUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <button
              type="button"
              className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
              aria-label="Zavřít okno ověření zaplacení"
              onClick={() => setShowPaymentVerificationModal(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Ověření zaplacení smlouvy"
              className="relative z-10 flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl shadow-slate-300/40"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                    Ověření zaplacení
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 sm:text-base">
                    Číslo smlouvy je zkopírované. Vlož ho do formuláře
                    pomocí ⌘+V / Ctrl+V.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={paymentVerificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Otevřít v nové kartě
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowPaymentVerificationModal(false)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Zavřít
                  </button>
                </div>
              </div>

              <iframe
                src={paymentVerificationUrl}
                title="Kooperativa – Ověření zaplacení"
                className="h-full min-h-0 w-full flex-1 bg-white"
              />
            </div>
          </div>
        )}

      {canDelete && showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít potvrzení mazání"
            onClick={() => setShowDeleteModal(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Potvrzení smazání smlouvy"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-7 shadow-2xl shadow-slate-300/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                  Opravdu smazat smlouvu?
                </h3>
                <p className="mt-1 text-base text-slate-700">
                  Akce je nevratná. Potvrď prosím kliknutím na tlačítko Smazat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            {deleteError && (
              <p className="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className={ghostButtonClass}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-700 bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(190,24,93,0.28)] transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
              >
                {deleting && (
                  <Spinner className="h-5 w-5 border-rose-200/70 border-t-white" />
                )}
                <span>{deleting ? "Mažu…" : "Smazat"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
