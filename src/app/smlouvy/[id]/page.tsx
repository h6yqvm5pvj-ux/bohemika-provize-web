// src/app/smlouvy/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { auth, db } from "../../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";

import Plasma from "@/components/Plasma";
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

const DetailFallback = () => (
  <div className="text-xs text-slate-400">Načítám detail produktu…</div>
);

const AutoDetailPanel = dynamic(
  () => import("../components/AutoDetailPanel").then((mod) => mod.AutoDetailPanel),
  { ssr: false, loading: DetailFallback }
);

const NeonDetailPanel = dynamic(
  () => import("../components/NeonDetailPanel").then((mod) => mod.NeonDetailPanel),
  { ssr: false, loading: DetailFallback }
);

const DomexDetailPanel = dynamic(
  () => import("../components/DomexDetailPanel").then((mod) => mod.DomexDetailPanel),
  { ssr: false, loading: DetailFallback }
);

const FlexiDetailPanel = dynamic(
  () => import("../components/FlexiDetailPanel").then((mod) => mod.FlexiDetailPanel),
  { ssr: false, loading: DetailFallback }
);

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type ContractDoc = {
  id: string;
  note?: string | null;
  paid?: boolean | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: CommissionMode | null;
  managerChain?: {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
  }[];
  managerOverrides?: {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
    items: CommissionResultItemDTO[];
    total: number;
  }[];

  productKey?: Product;
  position?: Position;
  inputAmount?: number;
  frequencyRaw?: PaymentFrequency | null;
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
  total?: number;
  items?: CommissionResultItemDTO[];

  commissionMode?: CommissionMode | null;

  userEmail?: string | null;
  clientName?: string | null;
  contractNumber?: string | null;

  policyStartDate?: FirestoreTimestamp | Date | string | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | null;
  createdAt?: FirestoreTimestamp | Date | string | null;

  durationYears?: number | null;
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carTp?: string | null;
  carLiabilityLimit?: number | null;
  carHullSumInsured?: number | null;
  carHullDeductible?: number | null;
  carAssistancePlan?: string | null;
  carAddonGlass?: boolean | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonVandalism?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonNatural?: boolean | null;
  carAddonOwnDamage?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonSmartGap?: boolean | null;
  carAddonServisPro?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonPassengerInjury?: boolean | null;

  domexDetail?: {
    address?: string | null;
    propertyType?: string | null;
    propertyCoverage?: string | null;
    sumInsured?: number | null;
    deductible?: number | null;
    householdType?: string | null;
    householdCoverage?: string | null;
    householdSumInsured?: number | null;
    householdDeductible?: number | null;
    outbuildingSumInsured?: number | null;
    liabilitySumInsured?: number | null;
    liabilityDeductible?: number | null;
    liabilityMobile?: boolean | null;
    liabilityTenant?: boolean | null;
    liabilityLandlord?: boolean | null;
    assistancePlus?: boolean | null;
    note?: string | null;
  } | null;
  neonDetail?: {
    version?: string | null;
    deathType?: string | null;
    deathAmount?: number | null;
    death2Type?: string | null;
    death2Amount?: number | null;
    deathTerminalAmount?: number | null;
    waiverInvalidity?: boolean | null;
    waiverUnemployment?: boolean | null;
    invalidityAType?: string | null;
    invalidityA1?: number | null;
    invalidityA2?: number | null;
    invalidityA3?: number | null;
    invalidityBType?: string | null;
    invalidityB1?: number | null;
    invalidityB2?: number | null;
    invalidityB3?: number | null;
    invalidityPension?: boolean | null;
    criticalIllnessType?: string | null;
    criticalIllnessAmount?: number | null;
    childSurgeryAmount?: number | null;
    vaccinationCompAmount?: number | null;
    diabetesAmount?: number | null;
    deathAccidentAmount?: number | null;
    injuryPermanentAmount?: number | null;
    hospitalizationAmount?: number | null;
    workIncapacityStart?: string | null;
    workIncapacityBackpay?: string | null;
    workIncapacityAmount?: number | null;
    careDependencyAmount?: number | null;
    specialAidAmount?: number | null;
    caregivingAmount?: number | null;
    reproductionCostAmount?: number | null;
    cppHelp?: boolean | null;
    liabilityCitizenLimit?: number | null;
    liabilityEmployeeLimit?: number | null;
    travelInsurance?: boolean | null;
    accidentDailyBenefit?: number | null;
  } | null;
  flexiDetail?: {
    deathAmount?: number | null;
    deathTypedType?: string | null;
    deathTypedAmount?: number | null;
    deathAccidentAmount?: number | null;
    seriousIllnessType?: string | null;
    seriousIllnessAmount?: number | null;
    seriousIllnessForHim?: number | null;
    seriousIllnessForHer?: number | null;
    permanentIllnessAmount?: number | null;
    invalidityIllnessType?: string | null;
    invalidityIllness1?: number | null;
    invalidityIllness2?: number | null;
    invalidityIllness3?: number | null;
    hospitalGeneralAmount?: number | null;
    workIncapacityStart?: string | null;
    workIncapacityBackpay?: string | null;
    workIncapacityAmount?: number | null;
    caregivingAmount?: number | null;
    permanentAccidentAmount?: number | null;
    injuryDamageAmount?: number | null;
    accidentDailyBenefit?: number | null;
    hospitalAccidentAmount?: number | null;
    invalidityAccidentType?: string | null;
    invalidityAccident1?: number | null;
    invalidityAccident2?: number | null;
    invalidityAccident3?: number | null;
    trafficDeathAccidentAmount?: number | null;
    trafficPermanentAccidentAmount?: number | null;
    trafficInjuryDamageAmount?: number | null;
    trafficAccidentDailyBenefit?: number | null;
    trafficHospitalAccidentAmount?: number | null;
    trafficWorkIncapacityAmount?: number | null;
    trafficInvalidityAmount?: number | null;
    loanDeathAmount?: number | null;
    loanInvalidityType?: string | null;
    loanInvalidity1?: number | null;
    loanInvalidity2?: number | null;
    loanInvalidity3?: number | null;
    loanIllnessAmount?: number | null;
    loanWorkIncapacityAmount?: number | null;
    addonMajakBasic?: boolean | null;
    addonMajakPlus?: boolean | null;
    addonLiabilityCitizen?: number | null;
    addonTravel?: boolean | null;
  } | null;
};

type ToastMessage = {
  id: number;
  type: "success" | "error";
  message: string;
};

function nameFromEmail(email?: string | null): string {
  if (!email) return "Neznámý poradce";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  const cap = (s: string) =>
    s.length === 0
      ? s
      : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return parts.map(cap).join(" ");
}

function preloadFormulaModule(product?: Product | null) {
  switch (product) {
    case "neon":
      import("../../lib/productFormulas/neon");
      break;
    case "flexi":
      import("../../lib/productFormulas/flexi");
      break;
    case "maximaMaxEfekt":
      import("../../lib/productFormulas/maximaMaxEfekt");
      break;
    case "pillowInjury":
      import("../../lib/productFormulas/pillowInjury");
      break;
    case "domex":
      import("../../lib/productFormulas/domex");
      break;
    case "cppPPRbez":
      import("../../lib/productFormulas/cppPPRbez");
      break;
    case "maxdomov":
      import("../../lib/productFormulas/maxdomov");
      break;
    case "cppAuto":
      import("../../lib/productFormulas/cppAuto");
      break;
    case "cppPPRs":
      import("../../lib/productFormulas/cppPPRs");
      break;
    case "allianzAuto":
      import("../../lib/productFormulas/allianzAuto");
      break;
    case "csobAuto":
      import("../../lib/productFormulas/csobAuto");
      break;
    case "uniqaAuto":
      import("../../lib/productFormulas/uniqaAuto");
      break;
    case "pillowAuto":
      import("../../lib/productFormulas/pillowAuto");
      break;
    case "kooperativaAuto":
      import("../../lib/productFormulas/kooperativaAuto");
      break;
    case "zamex":
      import("../../lib/productFormulas/zamex");
      break;
    case "cppcestovko":
      import("../../lib/productFormulas/cppcestovko");
      break;
    case "axacestovko":
      import("../../lib/productFormulas/axacestovko");
      break;
    case "comfortcc":
      import("../../lib/productFormulas/comfortcc");
      break;
    default:
      break;
  }
}

// ---------- helpers ----------

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as any).seconds === "number"
  ) {
    const v = value as FirestoreTimestamp;
    const ms =
      v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("cs-CZ");
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function productLabel(p?: Product): string {
  switch (p) {
    case "neon":
      return "ČPP ŽP NEON";
    case "flexi":
      return "Kooperativa ŽP FLEXI";
    case "maximaMaxEfekt":
      return "MAXIMA ŽP MaxEfekt";
    case "pillowInjury":
      return "Pillow Úraz / Nemoc";
    case "zamex":
      return "ČPP ZAMEX";
    case "domex":
      return "ČPP DOMEX";
    case "cppPPRbez":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů";
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
    case "cppPPRs":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS";
    case "allianzAuto":
      return "Allianz Auto";
    case "csobAuto":
      return "ČSOB Auto";
    case "uniqaAuto":
      return "UNIQA Auto";
    case "pillowAuto":
      return "Pillow Auto";
    case "kooperativaAuto":
      return "Kooperativa Auto";
    case "cppcestovko":
      return "ČPP Cestovko";
    case "axacestovko":
      return "AXA Cestovko";
    case "comfortcc":
      return "Comfort Commodity";
    default:
      return "Neznámý produkt";
  }
}

function isAutoProduct(p?: Product | null): boolean {
  return (
    p === "cppAuto" ||
    p === "allianzAuto" ||
    p === "csobAuto" ||
    p === "uniqaAuto" ||
    p === "pillowAuto" ||
    p === "kooperativaAuto"
  );
}

function productIcon(p?: Product): string {
  if (
    p === "neon" ||
    p === "flexi" ||
    p === "maximaMaxEfekt" ||
    p === "pillowInjury"
  ) {
    return "/icons/zivot.png";
  }

  if (
    p === "cppAuto" ||
    p === "allianzAuto" ||
    p === "csobAuto" ||
    p === "uniqaAuto" ||
    p === "pillowAuto" ||
    p === "kooperativaAuto"
  ) {
    return "/icons/icon_auto.png";
  }

  if (p === "zamex") {
    return "/icons/icon_zamex.png";
  }

  if (p === "domex" || p === "maxdomov" || p === "cppPPRs" || p === "cppPPRbez") {
    return "/icons/icon_domex.png";
  }

  if (p === "cppcestovko" || p === "axacestovko") {
    return "/icons/icon_cestovko.png";
  }

  if (p === "comfortcc") {
    return "/icons/trezor.png";
  }

  return "/icons/produkt.png";
}

function positionLabel(pos?: Position | null): string {
  const map: Record<Position, string> = {
    poradce1: "Poradce 1",
    poradce2: "Poradce 2",
    poradce3: "Poradce 3",
    poradce4: "Poradce 4",
    poradce5: "Poradce 5",
    poradce6: "Poradce 6",
    poradce7: "Poradce 7",
    poradce8: "Poradce 8",
    poradce9: "Poradce 9",
    poradce10: "Poradce 10",
    manazer4: "Manažer 4",
    manazer5: "Manažer 5",
    manazer6: "Manažer 6",
    manazer7: "Manažer 7",
    manazer8: "Manažer 8",
    manazer9: "Manažer 9",
    manazer10: "Manažer 10",
  };
  return pos ? map[pos] ?? pos : "—";
}

function frequencyText(raw?: PaymentFrequency | null): string {
  switch (raw) {
    case "monthly":
      return "měsíční";
    case "quarterly":
      return "čtvrtletní";
    case "semiannual":
      return "pololetní";
    case "annual":
      return "roční";
    default:
      return "—";
  }
}

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

function toDateInputValue(value: unknown): string {
  const d = toDate(value);
  if (!d) return "";
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

function normalizeTitleForCompare(title: string | undefined | null): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function stripTotalRows(
  arr: CommissionResultItemDTO[] | null | undefined
): CommissionResultItemDTO[] {
  return (arr ?? []).filter(
    (it) => !normalizeTitleForCompare(it.title).includes("celkem")
  );
}

function itemMultiplier(title: string | undefined | null): number {
  const norm = normalizeTitleForCompare(title);
  if (norm.includes("2.–5.")) return 4; // roky 2–5
  if (norm.includes("5.–10.")) return 6; // roky 5–10
  return 1;
}

function computeTotalWithMultipliers(
  items: CommissionResultItemDTO[] | null | undefined
): number {
  const cleaned = stripTotalRows(items);
  const hasYearly = cleaned.some((it) =>
    normalizeTitleForCompare(it.title).includes("provize za rok")
  );
  const source = hasYearly
    ? cleaned.filter((it) =>
        normalizeTitleForCompare(it.title).includes("provize za rok")
      )
    : cleaned;

  return source.reduce((sum, it) => {
    const amt = it.amount ?? 0;
    return sum + amt * itemMultiplier(it.title);
  }, 0);
}

function diffItemsByTitle(
  upper: CommissionResultItemDTO[] | null | undefined,
  lower: CommissionResultItemDTO[] | null | undefined
): { items: CommissionResultItemDTO[]; total: number } {
  const upperClean = stripTotalRows(upper);
  const lowerClean = stripTotalRows(lower);

  const upperMap = new Map<string, { title: string; amount: number }>();
  upperClean.forEach((it) => {
    const key = normalizeTitleForCompare(it.title);
    const prev = upperMap.get(key);
    upperMap.set(key, {
      title: it.title ?? prev?.title ?? key,
      amount: (prev?.amount ?? 0) + (it.amount ?? 0),
    });
  });

  const diffs: CommissionResultItemDTO[] = [];

  let runningTotal = 0;
  lowerClean.forEach((it) => {
    const key = normalizeTitleForCompare(it.title);
    const up = upperMap.get(key);
    const diff = (up?.amount ?? 0) - (it.amount ?? 0);
    if (diff > 0) {
      const titleVal = up?.title ?? it.title;
      diffs.push({ title: titleVal, amount: diff });
      runningTotal += diff * itemMultiplier(titleVal);
    }
    upperMap.delete(key);
  });

  upperMap.forEach((val) => {
    if (val.amount > 0) {
      diffs.push({ title: val.title, amount: val.amount });
      runningTotal += val.amount * itemMultiplier(val.title);
    }
  });

  const hasYearly = diffs.some((it) =>
    normalizeTitleForCompare(it.title).includes("provize za rok")
  );
  const total = hasYearly
    ? diffs
        .filter((it) => normalizeTitleForCompare(it.title).includes("provize za rok"))
        .reduce((sum, it) => sum + (it.amount ?? 0) * itemMultiplier(it.title), 0)
    : runningTotal;

  return { items: diffs, total };
}

// spočítá kompletní výsledek pro danou pozici (stejné formule jako v kalkulačce)
async function calculateResultForPosition(
  c: ContractDoc,
  position: Position,
  mode: CommissionMode | null
): Promise<{ items: CommissionResultItemDTO[]; total: number } | null> {
  const product = c.productKey;
  if (!product) return null;

  const amount = c.inputAmount ?? 0;
  const freq = (c.frequencyRaw ?? "annual") as PaymentFrequency;
  const comfortPayment = c.comfortPayment ?? 0;
  const comfortGradual = !!c.comfortGradual;

  const years =
    typeof c.durationYears === "number" && !Number.isNaN(c.durationYears)
      ? c.durationYears
      : 30;

  const usedMode = (mode ?? "standard") as CommissionMode;

  switch (product) {
    case "neon": {
      const { calculateNeon } = await import("../../lib/productFormulas/neon");
      return calculateNeon(amount, position, years, usedMode);
    }
    case "flexi": {
      const { calculateFlexi } = await import("../../lib/productFormulas/flexi");
      return calculateFlexi(amount, position, usedMode);
    }
    case "maximaMaxEfekt": {
      const { calculateMaxEfekt } = await import(
        "../../lib/productFormulas/maximaMaxEfekt"
      );
      return calculateMaxEfekt(amount, years, position, usedMode);
    }
    case "pillowInjury": {
      const { calculatePillowInjury } = await import(
        "../../lib/productFormulas/pillowInjury"
      );
      return calculatePillowInjury(amount, position, usedMode);
    }
    case "domex": {
      const { calculateDomex } = await import("../../lib/productFormulas/domex");
      return calculateDomex(amount, freq, position);
    }
    case "cppPPRbez": {
      const { calculateCppPPRbez } = await import(
        "../../lib/productFormulas/cppPPRbez"
      );
      return calculateCppPPRbez(amount, freq, position);
    }
    case "maxdomov": {
      const { calculateMaxdomov } = await import(
        "../../lib/productFormulas/maxdomov"
      );
      return calculateMaxdomov(amount, freq, position);
    }
    case "cppAuto": {
      const { calculateCppAuto } = await import("../../lib/productFormulas/cppAuto");
      return calculateCppAuto(amount, freq, position);
    }
    case "cppPPRs": {
      const { calculateCppPPRs } = await import("../../lib/productFormulas/cppPPRs");
      return calculateCppPPRs(amount, freq, position);
    }
    case "allianzAuto": {
      const { calculateAllianzAuto } = await import(
        "../../lib/productFormulas/allianzAuto"
      );
      return calculateAllianzAuto(amount, freq, position);
    }
    case "csobAuto": {
      const { calculateCsobAuto } = await import("../../lib/productFormulas/csobAuto");
      return calculateCsobAuto(amount, freq, position);
    }
    case "uniqaAuto": {
      const { calculateUniqaAuto } = await import(
        "../../lib/productFormulas/uniqaAuto"
      );
      return calculateUniqaAuto(amount, freq, position);
    }
    case "pillowAuto": {
      const { calculatePillowAuto } = await import(
        "../../lib/productFormulas/pillowAuto"
      );
      return calculatePillowAuto(amount, freq, position);
    }
    case "kooperativaAuto": {
      const { calculateKooperativaAuto } = await import(
        "../../lib/productFormulas/kooperativaAuto"
      );
      return calculateKooperativaAuto(amount, freq, position);
    }
    case "zamex": {
      const { calculateZamex } = await import("../../lib/productFormulas/zamex");
      return calculateZamex(amount, freq, position);
    }
    case "cppcestovko": {
      const { calculateCppCestovko } = await import(
        "../../lib/productFormulas/cppcestovko"
      );
      return calculateCppCestovko(amount, position);
    }
    case "axacestovko": {
      const { calculateAxaCestovko } = await import(
        "../../lib/productFormulas/axacestovko"
      );
      return calculateAxaCestovko(amount, position);
    }
    case "comfortcc": {
      const { calculateComfortCC } = await import(
        "../../lib/productFormulas/comfortcc"
      );
      return calculateComfortCC({
        fee: amount,
        payment: comfortGradual ? comfortPayment : 0,
        isSavings: comfortGradual,
        isGradualFee: comfortGradual,
        position,
      });
    }
    default:
      return null;
  }
}

const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <span
    className={`inline-block animate-spin rounded-full border-2 border-white/30 border-t-white/80 ${className}`}
    aria-hidden="true"
  />
);

const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-xl bg-white/10 ${className}`} />
);

function Toasts({
  items,
  onDismiss,
}: {
  items: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed top-6 right-4 z-50 flex max-w-md flex-col gap-3">
      {items.map((toast) => {
        const isError = toast.type === "error";
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md ${
              isError
                ? "border-rose-400/50 bg-rose-600/20 text-rose-50 shadow-rose-900/40"
                : "border-emerald-400/50 bg-emerald-500/20 text-emerald-50 shadow-emerald-900/40"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                  isError ? "bg-rose-300" : "bg-emerald-300"
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 text-sm font-medium">{toast.message}</div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="text-xs text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60 rounded-full px-2"
                aria-label="Zavřít upozornění"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- PAGE ----------

export default function ContractDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rawId = params?.id;

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
  const [managerMode, setManagerMode] = useState<CommissionMode | null>(
    null
  );

  const [contract, setContract] = useState<ContractDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overrideItems, setOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [overrideTotal, setOverrideTotal] = useState<number | null>(null);
  const [childOverrideItems, setChildOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [childOverrideTotal, setChildOverrideTotal] = useState<number | null>(null);
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
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [updatingPaid, setUpdatingPaid] = useState(false);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const toastTimeouts = useRef<number[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [unauthorized, setUnauthorized] = useState(false);

  const pushToast = useCallback(
    (message: string, type: ToastMessage["type"] = "success") => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, message }]);
      const timeoutId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        toastTimeouts.current = toastTimeouts.current.filter((tid) => tid !== timeoutId);
      }, 3800);
      toastTimeouts.current.push(timeoutId);
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      toastTimeouts.current.forEach((id) => clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDeleteModal(false);
      }
    };
    if (showDeleteModal) {
      window.addEventListener("keydown", onKey);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [showDeleteModal]);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // metadata přihlášeného usera
  useEffect(() => {
    const loadUserMeta = async () => {
      if (!user?.email) return;

      try {
        const ref = doc(db, "users", user.email);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data.position) {
            setManagerPosition(data.position as Position);
          }
          if (data.commissionMode) {
            setManagerMode(data.commissionMode as CommissionMode);
          }
        }
      } catch (e) {
        console.error("Chyba při načítání uživatele:", e);
      }
    };

    loadUserMeta();
  }, [user]);

  useEffect(() => {
    preloadFormulaModule(contract?.productKey ?? null);
  }, [contract?.productKey]);

  // načtení smlouvy – users/{email}/entries/{entryId}
  useEffect(() => {
    const load = async () => {
      if (!ownerEmail || !entryId) {
        setError("Neplatný odkaz na smlouvu.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const ref = doc(db, "users", ownerEmail, "entries", entryId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Smlouva nebyla nalezena.");
          setContract(null);
        } else {
          const data = snap.data() as any;
          const c: ContractDoc = {
            id: snap.id,
            ...data,
          };
          setContract(c);
          setNoteDraft((data.note as string | undefined) ?? "");

          // meta o poradci
          try {
            const userRef = doc(db, "users", ownerEmail);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const d = userSnap.data() as any;
              const pos = (d.position ?? null) as Position | null;
              const mgrEmail =
                ((d.managerEmail as string | undefined) ?? null)?.toLowerCase() ??
                null;
              setOwnerPosition(pos);
              setOwnerManagerEmail(mgrEmail);

              if (mgrEmail) {
                const mgrSnap = await getDoc(doc(db, "users", mgrEmail));
                if (mgrSnap.exists()) {
                  const md = mgrSnap.data() as any;
                  setOwnerManagerPosition(
                    (md.position ?? null) as Position | null
                  );
                }
              }
            }
          } catch (metaErr) {
            console.error("Chyba při načítání uživatele smlouvy:", metaErr);
          }
        }
      } catch (e) {
        console.error(e);
        setError("Při načítání smlouvy došlo k chybě.");
        setContract(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ownerEmail, entryId]);

  const premium = contract?.inputAmount ?? 0;
  const total = contract?.total ?? 0;
  const freq = contract?.frequencyRaw ?? null;
  const prod = contract?.productKey as Product | undefined;
  const durationYears =
    typeof contract?.durationYears === "number" && !Number.isNaN(contract.durationYears)
      ? contract.durationYears
      : null;
  const showDurationForNeon = prod === "neon" && durationYears;

  const isOwnContract = useMemo(() => {
    if (!user?.email || !contract?.userEmail) return false;
    return (
      user.email.trim().toLowerCase() ===
      contract.userEmail.trim().toLowerCase()
    );
  }, [user, contract]);

  const isManagerViewingSubordinate = useMemo(() => {
    if (!user?.email || !contract?.userEmail) return false;
    if (!isManagerPosition(managerPosition)) return false;

    const current = user.email.trim().toLowerCase();
    const owner = contract.userEmail.trim().toLowerCase();
    return current !== owner;
  }, [user, contract, managerPosition]);

  const effectiveManagerPosition =
    managerPosition ?? ((contract as any)?.managerPositionSnapshot as Position | null | undefined) ?? null;
  const effectiveManagerMode =
    managerMode ?? ((contract as any)?.managerModeSnapshot as CommissionMode | null | undefined) ?? null;

  const [editMode, setEditMode] = useState(false);
  const [editClientName, setEditClientName] = useState("");
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
  const [editNeonWorkIncapacityStart, setEditNeonWorkIncapacityStart] = useState("");
  const [editNeonWorkIncapacityBackpay, setEditNeonWorkIncapacityBackpay] = useState("");
  const [editNeonWorkIncapacityAmount, setEditNeonWorkIncapacityAmount] = useState("");
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
    workIncapacityStart: editNeonWorkIncapacityStart,
    workIncapacityBackpay: editNeonWorkIncapacityBackpay,
    workIncapacityAmount: editNeonWorkIncapacityAmount,
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
        case "workIncapacityStart":
          setEditNeonWorkIncapacityStart(String(value));
          break;
        case "workIncapacityBackpay":
          setEditNeonWorkIncapacityBackpay(String(value));
          break;
        case "workIncapacityAmount":
          setEditNeonWorkIncapacityAmount(String(value));
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

  const resetEditFields = () => {
    if (!contract) return;
    setEditClientName(contract.clientName ?? "");
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
    setEditNeonWorkIncapacityStart(contract.neonDetail?.workIncapacityStart ?? "");
    setEditNeonWorkIncapacityBackpay(contract.neonDetail?.workIncapacityBackpay ?? "");
    setEditNeonWorkIncapacityAmount(
      contract.neonDetail?.workIncapacityAmount != null &&
      Number.isFinite(contract.neonDetail.workIncapacityAmount)
        ? String(contract.neonDetail.workIncapacityAmount)
        : ""
    );
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
  };

  useEffect(() => {
    if (!contract) return;
    resetEditFields();
    setDetailsSaved(false);
    setDetailsError(null);
  }, [contract]);

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

      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      const trimmedName = editClientName.trim();
      const trimmedNumber = editContractNumber.trim();
      const signedDate = editContractSigned ? new Date(editContractSigned) : null;
      const startDate = editPolicyStart ? new Date(editPolicyStart) : null;
      const durationVal =
        prod === "neon" && typeof editDuration === "number" && !Number.isNaN(editDuration)
          ? Math.max(1, Math.min(40, editDuration))
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
                workIncapacityStart: editNeonWorkIncapacityStart.trim() || null,
                workIncapacityBackpay: editNeonWorkIncapacityBackpay.trim() || null,
                workIncapacityAmount: toNumberOrNull(editNeonWorkIncapacityAmount),
                careDependencyAmount: toNumberOrNull(editNeonCareDependencyAmount),
                specialAidAmount: toNumberOrNull(editNeonSpecialAidAmount),
                caregivingAmount: toNumberOrNull(editNeonCaregivingAmount),
                reproductionCostAmount: toNumberOrNull(editNeonReproductionCostAmount),
                cppHelp: !!editNeonCppHelp,
                liabilityCitizenLimit: toNumberOrNull(editNeonLiabilityCitizenLimit),
                liabilityEmployeeLimit: toNumberOrNull(editNeonLiabilityEmployeeLimit),
                travelInsurance: !!editNeonTravelInsurance,
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
        contractNumber: trimmedNumber || null,
        contractSignedDate: signedDate ?? null,
        policyStartDate: startDate ?? null,
        ...autoFields,
        ...neonUpdate,
        ...flexiUpdate,
        ...domexUpdate,
      };
      if (prod === "neon") {
        updates.durationYears = durationVal ?? null;
      }

      await updateDoc(ref, updates);

      setContract((prev) =>
        prev
          ? {
              ...prev,
              clientName: trimmedName || null,
              contractNumber: trimmedNumber || null,
              contractSignedDate: signedDate ?? null,
              policyStartDate: startDate ?? null,
              durationYears:
                prod === "neon"
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
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      await updateDoc(ref, { note: noteDraft.trim() });
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
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      await updateDoc(ref, { paid: nextValue });
      setContract((prev) => (prev ? { ...prev, paid: nextValue } : prev));
      pushToast(
        nextValue ? "Smlouva označena jako zaplacená." : "Platba označena jako neuhrazená.",
        "success"
      );
    } catch (e) {
      console.error("Chyba při ukládání stavu platby:", e);
      setPaidError("Nepodařilo se uložit stav platby. Zkus to prosím znovu.");
      pushToast("Nepodařilo se uložit stav platby. Zkus to prosím znovu.", "error");
    } finally {
      setUpdatingPaid(false);
    }
  };

  // výpočet meziprovize
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const managerModeForOverride: CommissionMode =
        (effectiveManagerMode as CommissionMode | null) ??
        (managerMode as CommissionMode | null) ??
        "standard";

      if (!contract || !effectiveManagerPosition || !isManagerViewingSubordinate) {
        if (cancelled) return;
        setOverrideItems(null);
        setOverrideTotal(null);
        setChildOverrideItems(null);
        setChildOverrideTotal(null);
        setChildOverrideLabel(null);
        return;
      }

      // nejprve zkus použít uloženou meziprovizi pro aktuálního manažera
      const storedOverride =
        (contract?.managerOverrides as ContractDoc["managerOverrides"])?.find(
          (o) => o.email?.toLowerCase() === user?.email?.toLowerCase()
        ) ?? null;

      let resolvedOverrideItems: CommissionResultItemDTO[] | null = null;
      let resolvedOverrideTotal: number | null = null;

      if (storedOverride) {
        const sanitizedAdvisorItems = stripTotalRows(contract.items);
        const sanitizedOverrideItems = stripTotalRows(storedOverride.items);

        const advisorTitles = new Set(
          sanitizedAdvisorItems.map((it) => normalizeTitleForCompare(it.title as string))
        );
        const overrideTitles = sanitizedOverrideItems.map((it) =>
          normalizeTitleForCompare(it.title as string)
        );

        const hasSameCount = overrideTitles.length === advisorTitles.size;
        const allTitlesMatch =
          overrideTitles.length > 0 &&
          overrideTitles.every((t) => t && advisorTitles.has(t));

        const overrideTotalFromItems = computeTotalWithMultipliers(
          sanitizedOverrideItems
        );
        const overrideTotalValid = overrideTotalFromItems > 0;

        if (hasSameCount && allTitlesMatch && overrideTotalValid) {
          resolvedOverrideItems = sanitizedOverrideItems ?? null;
          resolvedOverrideTotal = overrideTotalFromItems;
        }
      }

      const chain = (contract.managerChain as ContractDoc["managerChain"]) ?? [];
      const normalizedUserEmail = user?.email?.toLowerCase() ?? null;

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
          : fallbackChild ??
            (ownerManagerPosition
              ? {
                  email: ownerManagerEmail,
                  position: ownerManagerPosition,
                  commissionMode:
                    (contract.managerModeSnapshot as CommissionMode | null | undefined) ??
                    null,
                }
              : null);

      const baselinePosCurrent =
        (childSnap?.position as Position | null | undefined) ??
        ownerPosition ??
        ((contract.position as Position | null) ?? null);

      // pro rozdíl vůči aktuálnímu manažerovi použijeme jeho režim (typicky běžný),
      // i když podřízený má zrychlený.
      const baselineModeCurrent = managerModeForOverride;

      const advisorPos =
        ownerPosition ?? ((contract.position as Position | null) ?? null);
      const advisorMode =
        (contract.commissionMode as CommissionMode | null | undefined) ??
        (contract as any)?.mode ??
        "standard";

      // pokud není validní snapshot, dopočítej meziprovizi
      if (!resolvedOverrideItems) {
        const managerResult = await calculateResultForPosition(
          contract,
          effectiveManagerPosition,
          managerModeForOverride
        );
        if (cancelled || !managerResult) {
          setOverrideItems(null);
          setOverrideTotal(null);
          setChildOverrideItems(null);
          setChildOverrideTotal(null);
          setChildOverrideLabel(null);
          return;
        }

        const baselineResultMain =
          baselinePosCurrent != null
            ? await calculateResultForPosition(contract, baselinePosCurrent, baselineModeCurrent)
            : null;

        const subItemsMain = baselineResultMain?.items ?? contract.items ?? [];
        const mainDiff = diffItemsByTitle(managerResult.items, subItemsMain);

        resolvedOverrideItems = mainDiff.items;
        resolvedOverrideTotal = mainDiff.total;
      }

      if (cancelled) return;
      setOverrideItems(resolvedOverrideItems ?? null);
      setOverrideTotal(resolvedOverrideTotal ?? null);

      const childEmail =
        (childSnap?.email as string | null | undefined)?.toLowerCase() ?? null;

      const storedChildOverride =
        (contract?.managerOverrides as ContractDoc["managerOverrides"])?.find(
          (o) => (o.email ?? "").toLowerCase() === (childEmail ?? "")
        ) ?? null;
      const storedChildItems = stripTotalRows(storedChildOverride?.items);
      const storedChildTotal = computeTotalWithMultipliers(storedChildItems);

      // meziprovize pro přímého manažera pod sjednavatelem (např. manazer7)
      if (childSnap && childEmail && advisorPos) {
        const childMode =
          (childSnap?.commissionMode as CommissionMode | null | undefined) ??
          (contract.managerModeSnapshot as CommissionMode | null | undefined) ??
          (contract.commissionMode as CommissionMode | null | undefined) ??
          (contract as any)?.mode ??
          "accelerated";

        const childSnapshotValid =
          storedChildOverride &&
          storedChildItems.length > 0 &&
          storedChildTotal > 0;

        const childCalcUpper = await calculateResultForPosition(
          contract,
          childSnap.position as Position,
          childMode
        );
        const childCalcLower = await calculateResultForPosition(contract, advisorPos, advisorMode);

        const childComputed =
          childCalcUpper && childCalcLower
            ? diffItemsByTitle(childCalcUpper.items, childCalcLower.items)
            : null;

        if (childSnapshotValid) {
          const items = storedChildItems ?? null;
          const totalFromItems = storedChildTotal ?? null;
          const useSnapshot =
            totalFromItems != null &&
            totalFromItems > 0 &&
            (!childComputed || Math.abs((childComputed.total ?? 0) - totalFromItems) < 1e-6);

          if (useSnapshot) {
            setChildOverrideItems(items);
            setChildOverrideTotal(totalFromItems);
            setChildOverrideName(nameFromEmail(childSnap.email ?? childEmail));
            setChildOverridePosition((childSnap.position as Position | null | undefined) ?? null);
          } else if (childComputed && childComputed.total > 0) {
            setChildOverrideItems(childComputed.items);
            setChildOverrideTotal(childComputed.total);
            setChildOverrideName(nameFromEmail(childSnap.email ?? childEmail));
            setChildOverridePosition((childSnap.position as Position | null | undefined) ?? null);
          } else {
            setChildOverrideItems(null);
            setChildOverrideTotal(null);
            setChildOverrideName(null);
            setChildOverridePosition(null);
          }
          setChildOverrideLabel(
            (childSnap.position as Position | null | undefined) ??
              normalizeTitleForCompare(childSnap.email ?? childEmail)
          );
        } else if (childComputed && childComputed.total > 0) {
          setChildOverrideItems(childComputed.items);
          setChildOverrideTotal(childComputed.total);
          setChildOverrideLabel(
            (childSnap.position as Position | null | undefined) ??
              normalizeTitleForCompare(childSnap.email ?? childEmail)
          );
          setChildOverrideName(nameFromEmail(childSnap.email ?? childEmail));
          setChildOverridePosition((childSnap.position as Position | null | undefined) ?? null);
        } else {
          setChildOverrideItems(null);
          setChildOverrideTotal(null);
          setChildOverrideLabel(null);
          setChildOverrideName(null);
          setChildOverridePosition(null);
        }
      } else {
        setChildOverrideItems(null);
        setChildOverrideTotal(null);
        setChildOverrideLabel(null);
        setChildOverrideName(null);
        setChildOverridePosition(null);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    contract,
    effectiveManagerMode,
    effectiveManagerPosition,
    managerMode,
    isManagerViewingSubordinate,
    ownerManagerPosition,
    ownerPosition,
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
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      await deleteDoc(ref);
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

  // vyfiltrované položky bez řádku "Celkem"
  const filterDomexItems = (arr: CommissionResultItemDTO[]) => {
    if (prod !== "domex") return arr;
    return arr.filter((it) =>
      (it.title ?? "").toLowerCase().includes("(z platby)")
    );
  };

  const filterAnnualYearlyDupes = (arr: CommissionResultItemDTO[]) => {
    if (prod !== "cppPPRs" || freq !== "annual") return arr;
    return arr.filter(
      (it) =>
        !normalizeTitleForCompare(it.title).includes("provize za rok")
    );
  };

  const adviserItems =
    filterAnnualYearlyDupes(
      filterDomexItems(
        (contract?.items ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const managerItems =
    filterAnnualYearlyDupes(
      filterDomexItems(
        (overrideItems ?? []).filter(
          (it) => !it.title.toLowerCase().includes("celkem")
        )
      )
    ) ?? [];

  const childManagerItems =
    filterAnnualYearlyDupes(
      filterDomexItems(
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

  const canDelete = isOwnContract || isManagerViewingSubordinate;

  // pokud je načtený kontrakt a uživatel nemá oprávnění, schovej data a přesměruj
  useEffect(() => {
    if (loading || !user || !contract) return;
    const canView = isOwnContract || isManagerViewingSubordinate;
    if (!canView && !unauthorized) {
      setUnauthorized(true);
      setContract(null);
      setError("Nemáš oprávnění tuto smlouvu zobrazit.");
      setShowDeleteModal(false);
      router.replace("/smlouvy");
    }
  }, [loading, user, contract, isOwnContract, isManagerViewingSubordinate, unauthorized, router]);

  const renderLoadingSkeleton = () => (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
          <Skeleton className="h-3 w-20 mb-2" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-6 w-36" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
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
        <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
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

      <section className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="divide-y divide-white/10">
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

      <section className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-24 w-full" />
      </section>
    </div>
  );

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-50">
      {/* Plasma pozadí jako na ostatních stránkách */}
      <div className="fixed inset-0 -z-10 bg-black">
        <Plasma
          color="#4f46e5"
          speed={0.6}
          direction="forward"
          scale={1.1}
          opacity={0.85}
          mouseInteractive={false}
          animated={false}
        />
      </div>

      <Toasts items={toasts} onDismiss={dismissToast} />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-6xl">
          <div className="flex items-stretch gap-3">
            <div className="flex-1 rounded-3xl bg-white/5 border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-6 sm:p-8 space-y-6 transition-all duration-300">
            {/* HEADER */}
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-1">
                  Detail smlouvy
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {isOwnContract && (
                  <button
                    type="button"
                    onClick={handleTogglePaid}
                    disabled={updatingPaid}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold border transition ${
                      contract?.paid
                        ? "bg-emerald-500/80 border-emerald-400 text-emerald-900"
                        : "bg-rose-500/20 border-rose-400/70 text-rose-100"
                    } ${updatingPaid ? "opacity-60" : ""}`}
                  >
                    {updatingPaid && <Spinner className="h-3 w-3 border-2 border-emerald-100/70 border-t-white/90" />}
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
                    className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/15"
                  >
                    Upravit údaje
                  </button>
                )}

                {isOwnContract && editMode && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={savingDetails}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-500/70 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-950 hover:bg-emerald-400 transition disabled:opacity-60"
                    >
                      {savingDetails && (
                        <Spinner className="h-3.5 w-3.5 border-emerald-100/90 border-t-emerald-900" />
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
                      className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/10 disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                  </>
                )}

                <Link
                  href="/smlouvy"
                  className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/10"
                >
                  ← Zpět na smlouvy
                </Link>
              </div>
            </header>

            {detailsError && (
              <div className="rounded-xl border border-rose-400/60 bg-rose-500/15 px-4 py-2 text-sm text-rose-100">
                {detailsError}
              </div>
            )}
            {detailsSaved && (
              <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-100">
                Změny byly uloženy.
              </div>
            )}

            {loading ? (
              renderLoadingSkeleton()
            ) : error ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : contract ? (
              <>
                {/* Klient / Produkt boxy */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1.5">
                      Klient
                    </div>
                    {editMode ? (
                      <input
                        type="text"
                        value={editClientName}
                        onChange={(e) => setEditClientName(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-lg font-semibold text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        placeholder="Jméno klienta"
                      />
                    ) : (
                      <div className="text-2xl font-semibold text-slate-50">
                        {contract?.clientName ?? "—"}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1.5">
                      Produkt
                    </div>
                    <div className="text-lg font-semibold text-slate-50">
                      <div className="flex items-center gap-3">
                        <Image
                          src={productIcon(prod)}
                          alt="Produkt"
                          width={56}
                          height={56}
                          className="h-12 w-auto"
                        />
                        <span>{productLabel(prod)}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Info o poradci – zobraz pouze manažerovi na podřízené smlouvě */}
                {contract && isManagerViewingSubordinate && (
                  <section className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                    <h3 className="text-sm font-semibold text-slate-100 mb-2">
                      Poradce
                    </h3>
                    <dl className="space-y-1 text-sm text-slate-200">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Sjednal</dt>
                        <dd className="font-semibold text-right">
                          {nameFromEmail(contract.userEmail)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Pozice</dt>
                        <dd className="font-semibold text-right">
                          {positionLabel(
                            ownerPosition ?? (contract.position as Position | null)
                          )}
                        </dd>
                      </div>
                      {ownerManagerEmail && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-300">Nadřízený</dt>
                          <dd className="font-semibold text-right">
                            {nameFromEmail(ownerManagerEmail)}
                            {ownerManagerPosition && (
                              <span className="text-[11px] text-slate-400 block">
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
                  <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {paidError}
                  </div>
                )}

                <div className="space-y-6">
                {/* ZÁKLADNÍ INFO */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
                    <h3 className="text-base font-semibold text-slate-100 mb-3">
                      Základní údaje
                    </h3>
                    <dl className="space-y-2 text-sm text-slate-200">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Sjednána jako</dt>
                        <dd className="font-semibold text-right">
                          {positionLabel(contract.position)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Pojistné</dt>
                        <dd className="font-semibold text-right">
                          {formatMoney(premium)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">
                          Frekvence platby
                        </dt>
                        <dd className="font-semibold text-right">
                          {frequencyText(freq)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* DATA SMLOUVY */}
                  <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
                    <h3 className="text-base font-semibold text-slate-100 mb-3">
                      Data smlouvy
                    </h3>
                    <dl className="space-y-2 text-sm text-slate-200">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Datum sjednání</dt>
                        <dd className="font-semibold text-right">
                          {editMode ? (
                            <input
                              type="date"
                              value={editContractSigned}
                              onChange={(e) => setEditContractSigned(e.target.value)}
                              className="rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            />
                          ) : (
                            formatDate(contract.contractSignedDate ?? contract.createdAt)
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">
                          Počátek smlouvy
                        </dt>
                        <dd className="font-semibold text-right">
                          {editMode ? (
                            <input
                              type="date"
                              value={editPolicyStart}
                              onChange={(e) => setEditPolicyStart(e.target.value)}
                              className="rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            />
                          ) : (
                            formatDate(contract.policyStartDate)
                          )}
                        </dd>
                      </div>
                      {showDurationForNeon && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-300">Doba trvání (provize)</dt>
                          <dd className="font-semibold text-right">
                            {editMode ? (
                              <input
                                type="number"
                                min={1}
                                max={40}
                                value={editDuration ?? ""}
                                onChange={(e) =>
                                  setEditDuration(e.target.value ? Number(e.target.value) : null)
                                }
                                className="w-20 rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                              />
                            ) : (
                              `${durationYears} ${durationYears === 1 ? "rok" : "let"}`
                            )}
                          </dd>
                        </div>
                      )}
                      {editMode ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-300">Číslo smlouvy</dt>
                          <dd className="font-semibold text-right w-40">
                            <input
                              type="text"
                              value={editContractNumber}
                              onChange={(e) => setEditContractNumber(e.target.value)}
                              className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                              placeholder="Číslo smlouvy"
                            />
                          </dd>
                        </div>
                      ) : (
                        contract.contractNumber && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-300">
                              Číslo smlouvy
                            </dt>
                            <dd className="font-semibold text-right">
                          {contract.contractNumber}
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              </div>
            </section>

            {/* MEZIPROVIZE – jen když manažer kouká na podřízeného */}
            {showMeziprovision && (
              <section className="space-y-4">
                <div className="space-y-3">
          <h3 className="text-sm font-semibold text-emerald-200">
            Meziprovize pro{" "}
            {nameFromEmail(user?.email)}
            {effectiveManagerPosition && (
              <span className="text-xs text-slate-400 ml-2">
                {positionLabel(effectiveManagerPosition)}
              </span>
            )}
          </h3>
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
            {managerItems.map((item) => (
              <div
                key={item.title}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="text-sm text-slate-200">
                  {item.title}
                </span>
                <span className="text-sm font-semibold text-emerald-300">
                  {formatMoney(item.amount)}
                </span>
              </div>
            ))}

                        <div className="flex items-center justify-between pt-3">
                          <span className="text-sm font-semibold">
                            Celkem meziprovize
                          </span>
                          <span className="text-base font-bold text-emerald-300">
                            {formatMoney(overrideTotal)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {showChildMeziprovision && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-emerald-200">
                          Meziprovize pro podřízeného manažera{" "}
                          {childOverrideName ?? ""}
                          {childOverridePosition && (
                            <span className="text-[11px] text-slate-400 ml-1">
                              ({positionLabel(childOverridePosition)})
                            </span>
                          )}
                        </h4>
                        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-900/20 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                          {childManagerItems.map((item) => (
                            <div
                              key={item.title}
                              className="flex items-baseline justify-between gap-3 py-2"
                            >
                              <span className="text-sm text-slate-200">
                                {item.title}
                              </span>
                              <span className="text-sm font-medium text-slate-50">
                                {formatMoney(item.amount)}
                              </span>
                            </div>
                          ))}

                          <div className="flex items-center justify-between pt-3">
                            <span className="text-sm font-semibold">
                              Celkem meziprovize
                            </span>
                            <span className="text-base font-bold text-emerald-300">
                              {formatMoney(childOverrideTotal ?? 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* PROVIZE PORADCE */}
                {isOwnContract ? (
                  // VLASTNÍ SMLOUVA – vždy viditelné
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Výpočet provizí
                    </h3>
                    <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                      {adviserItems.map((item) => (
                        <div
                          key={item.title}
                          className="flex items-baseline justify-between gap-3 py-2"
                        >
                          <span className="text-sm text-slate-200">
                            {item.title}
                          </span>
                          <span className="text-sm font-medium text-slate-50">
                            {formatMoney(item.amount)}
                          </span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-3">
                        <span className="text-sm font-semibold">
                          Celkem
                        </span>
                        <span className="text-base font-bold">
                          {formatMoney(total)}
                        </span>
                      </div>
                    </div>
                  </section>
                ) : (
                  // MANAŽER NA SMLOUVĚ PODŘÍZENÉHO – collapsible
                  <section className="space-y-3">
                    <button
                      type="button"
                      onClick={() =>
                        setShowAdvisorDetails((v) => !v)
                      }
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100 hover:text-emerald-300 transition"
                    >
                      <span>
                        {showAdvisorDetails
                          ? "Skrýt provizi poradce"
                          : "Zobrazit provizi poradce"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {showAdvisorDetails ? "▲" : "▼"}
                      </span>
                    </button>

                    {showAdvisorDetails && (
                      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                        {adviserItems.map((item) => (
                          <div
                            key={item.title}
                            className="flex items-baseline justify-between gap-3 py-2"
                          >
                            <span className="text-sm text-slate-200">
                              {item.title}
                            </span>
                            <span className="text-sm font-medium text-slate-50">
                              {formatMoney(item.amount)}
                            </span>
                          </div>
                        ))}

                        <div className="flex items-center justify-between pt-3">
                          <span className="text-sm font-semibold">
                            Celkem
                          </span>
                          <span className="text-base font-bold">
                            {formatMoney(total)}
                          </span>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* POZNÁMKA */}
                <section className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-100">
                      Poznámka ke smlouvě
                    </h3>
                    {noteSaved && (
                      <span className="text-[11px] text-emerald-300">
                        Uloženo
                      </span>
                    )}
                  </div>

                  {noteError && (
                    <p className="text-xs text-amber-200 bg-amber-900/40 border border-amber-500/60 rounded-lg px-3 py-2">
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
                        rows={4}
                        className="w-full rounded-2xl border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-none"
                        placeholder="Sem si můžeš napsat poznámku jen pro sebe…"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={savingNote}
                          className="inline-flex items-center rounded-xl border border-emerald-400/70 bg-emerald-500/25 px-4 py-2 text-xs sm:text-sm font-semibold text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.4)] hover:bg-emerald-500/35 hover:border-emerald-200 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {savingNote && (
                            <Spinner className="h-3.5 w-3.5 border-emerald-100/90 border-t-emerald-900" />
                          )}
                          <span>{savingNote ? "Ukládám…" : "Uložit poznámku"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                      {contract.note?.trim()
                        ? contract.note.trim()
                        : "Autor smlouvy zatím žádnou poznámku nepřidal."}
                    </div>
                  )}
                </section>

                {/* SMAZAT SMLOUVU */}
                {canDelete && (
                  <section className="pt-2">
                    {deleteError && (
                      <p className="mb-2 text-xs text-red-300">
                        {deleteError}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setShowDeleteModal(true);
                        }}
                        disabled={deleting}
                        className="inline-flex items-center rounded-xl border border-red-500/70 bg-red-600/80 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-lg shadow-red-500/40 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {deleting && (
                          <Spinner className="h-4 w-4 border-white/80 border-t-red-900" />
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
                className={`h-full min-h-[160px] w-10 rounded-2xl border transition ${
                  showProductPanel
                    ? "bg-emerald-500/90 border-emerald-300 text-emerald-950"
                    : "bg-emerald-500/60 border-emerald-300/60 text-emerald-50 hover:bg-emerald-500/80"
                } flex items-center justify-center font-semibold text-xs tracking-wide`}
                style={{ writingMode: "vertical-rl" }}
              >
                DETAIL
              </button>
            </div>

            {showProductPanel && (
              <div className="w-[360px] rounded-3xl bg-white/5 border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Detail produktu
                  </h3>
                  <span className="text-xs text-slate-400">{productLabel(prod)}</span>
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
            className="relative z-10 w-full max-w-md rounded-2xl border border-red-400/60 bg-slate-950/95 p-6 shadow-2xl shadow-red-900/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-50">
                  Opravdu smazat smlouvu?
                </h3>
                <p className="mt-1 text-sm text-slate-300">
                  Akce je nevratná. Potvrď prosím kliknutím na tlačítko Smazat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-full px-2 text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-300"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            {deleteError && (
              <p className="mt-3 text-xs text-rose-200 bg-rose-900/40 border border-rose-500/50 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-400/70 bg-red-600/80 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-red-500/40 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting && (
                  <Spinner className="h-4 w-4 border-white/80 border-t-red-900" />
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
