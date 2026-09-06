"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  BriefcaseBusiness,
  CarFront,
  CalendarCheck,
  CalendarSearch,
  Check,
  CircleCheck,
  ChevronDown,
  CircleOff,
  Download,
  Eye,
  ExternalLink,
  HeartPulse,
  History,
  House,
  Inbox,
  Loader2,
  MessageSquareText,
  PhoneCall,
  PhoneMissed,
  Radar,
  RotateCcw,
  ShieldCheck,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { AppLayout } from "@/components/AppLayout";
import introStyles from "@/app/cashflow/cashflowIntro.module.css";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { loadAnniversaryPortfolio, type AnniversaryContract as ContractRow } from "@/app/lib/anniversaryPortfolio";
import type { AnniversaryReview, AnniversaryReviewMutationResponse, ContactOutcome } from "@/app/lib/anniversaryReviews";
import { AnniversaryHistory } from "./AnniversaryHistory";
import { anniversaryStage, RADAR_STAGE_LABELS, type RadarActivityFilter } from "./radarActivity";
import styles from "./radar.module.css";
import {
  ADMIN_IMPERSONATION_EVENT,
  readAdminImpersonationState,
  type AdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import {
  AUTO_PRODUCTS,
  LIFE_PRODUCTS,
  LIABILITY_PRODUCTS,
  PROPERTY_PRODUCTS,
  productCategory,
  productInstitutionLabel,
  productLabel,
} from "@/app/lib/productCatalog";
import type { Position, Product } from "@/app/types/domain";
import {
  DEFAULT_ANNIVERSARY_WINDOW_DAYS,
  anniversaryOccurrenceKey,
  formatDaysLeft,
  getAnniversaryStartDate,
  isAnniversarySoon,
  shouldTrackAnniversary,
} from "@/app/lib/contractAnniversary";

type ReviewsResponse = {
  ok: boolean;
  error?: string;
  reviews?: AnniversaryReview[];
};

const WINDOW_OPTIONS = [14, 30, 60, DEFAULT_ANNIVERSARY_WINDOW_DAYS] as const;

const ACTIVITY_FILTERS = [
  { key: "new", label: RADAR_STAGE_LABELS.new, icon: Inbox },
  { key: "active", label: RADAR_STAGE_LABELS.active, icon: MessageSquareText },
  { key: "completed", label: RADAR_STAGE_LABELS.completed, icon: CircleCheck },
  { key: "all", label: "Všechny", icon: Target },
] as const;

const ACTIVITY_COPY: Record<RadarActivityFilter, { title: string; description: string; emptyTitle: string; emptyDescription: string }> = {
  new: {
    title: "Tady začíná další kontakt", description: "Smlouvy bez kontaktu či poznámky k aktuálnímu výročí.",
    emptyTitle: "V tomto období nejsou žádná nezpracovaná výročí", emptyDescription: "Zkus delší období nebo jiný druh pojištění.",
  },
  active: {
    title: "Navaž na předchozí jednání", description: "Zapsaný kontakt nebo poznámka. Případ zůstává rozpracovaný, dokud ho neoznačíš jako dokončený.",
    emptyTitle: "Žádné rozpracované případy", emptyDescription: "Po uložení kontaktu nebo poznámky se případ přesune sem. Dokončené najdeš zvlášť.",
  },
  completed: {
    title: "Dokončené případy", description: "Výslovně uzavřená výročí. Kdykoliv je můžeš vrátit k řešení, historie zůstane uložená.",
    emptyTitle: "Zatím žádné dokončené případy", emptyDescription: "Dovolání ani schůzka případ neuzavřou. Až bude vše vyřešené, použij tlačítko Dokončit.",
  },
  all: {
    title: "Všechna výročí na jednom místě", description: "Nejprve nezpracované, potom rozpracované a nakonec dokončené případy.",
    emptyTitle: "V tomto období nejsou žádná výročí", emptyDescription: "Zkus delší období nebo jiný druh pojištění.",
  },
};

type RadarProductFilter =
  | "all"
  | "life"
  | "propertyLiability"
  | "auto"
  | "entrepreneurs";

const RADAR_PRODUCT_FILTERS: Array<{ key: RadarProductFilter; label: string }> = [
  { key: "all", label: "Vše" },
  { key: "life", label: "Život" },
  { key: "propertyLiability", label: "Majetek a odpovědnost" },
  { key: "auto", label: "Auto" },
  { key: "entrepreneurs", label: "Podnikatelé" },
];

// Stejné dělení jako ve filtrech Smluv a v exportu produkce.
const RADAR_ENTREPRENEUR_PRODUCTS = new Set<Product>([
  "cppsimplex",
  "kooppmop",
  "cppPPRs",
  "cppPPRbez",
]);
const RADAR_PROPERTY_LIABILITY_PRODUCTS = new Set<Product>(
  [...PROPERTY_PRODUCTS, ...LIABILITY_PRODUCTS].filter(
    (product) => product !== "zamex" && !RADAR_ENTREPRENEUR_PRODUCTS.has(product)
  )
);

const matchesRadarProductFilter = (
  product: Product | null | undefined,
  filter: RadarProductFilter
): boolean => {
  if (filter === "all") return true;
  if (!product) return false;
  if (filter === "life") return LIFE_PRODUCTS.includes(product);
  if (filter === "auto") return AUTO_PRODUCTS.includes(product);
  if (filter === "entrepreneurs") return RADAR_ENTREPRENEUR_PRODUCTS.has(product);
  return RADAR_PROPERTY_LIABILITY_PRODUCTS.has(product);
};

const CONTACT_OUTCOME_OPTIONS: Array<{
  value: ContactOutcome;
  label: string;
  shortLabel: string;
  icon: typeof PhoneCall;
}> = [
  { value: "reached", label: "Dovolal jsem se", shortLabel: "Dovolal", icon: PhoneCall },
  { value: "no_answer", label: "Nezvedá", shortLabel: "Nezvedá", icon: PhoneMissed },
  { value: "meeting", label: "Domluvena schůzka", shortLabel: "Schůzka", icon: CalendarCheck },
  { value: "ignore", label: "Neřešit", shortLabel: "Neřešit", icon: CircleOff },
];

const CATEGORY_CHECKLIST: Record<string, string[]> = {
  life: [
    "Odpovídá pojistná částka aktuálnímu příjmu a závazkům (hypotéka, úvěry)?",
    "Nezměnila se rodinná situace – děti, sňatek, rozvod?",
    "Nabídni indexaci / navýšení pojistné částky.",
  ],
  property: [
    "Zeptej se, zda neproběhla rekonstrukce, přístavba nebo pořízení cennějšího vybavení.",
    "Pokud klient nevyužívá valorizaci, ověř, zda pojistné částky stále odpovídají dnešní hodnotě nemovitosti a domácnosti.",
  ],
  comfort: [
    "Zkontroluj aktuální investiční strategii a tempo spoření.",
    "Platí stále původní investiční cíl klienta?",
  ],
};
const AUTO_CHECKLIST = [
  "Přepočítej smlouvu napříč pojišťovnami; u výročí může aktuálně vycházet lépe jiná pojišťovna.",
  "Cílem není jen snížit pojistné - hledej lepší poměr ceny a krytí, případně vyšší krytí za podobnou cenu.",
];
const AUTO_HULL_CHECKLIST = [
  "U havarijního pojištění ověř, zda pojistná částka odpovídá dnešní reálné hodnotě vozu.",
];
const DEFAULT_CHECKLIST = [
  "Projdi s klientem aktuální krytí a zeptej se na změny v jeho situaci.",
  "Zkontroluj, jestli nechce upravit rozsah nebo výši pojištění.",
];

const RADAR_LOADER_STAGES = [
  "Skenuji smlouvy v portfoliu",
  "Hledám nejbližší výročí",
  "Kontroluji zkontrolované případy",
  "Řadím klienty podle naléhavosti",
  "Připravuji radar výročí",
];

type Tone = "urgent" | "soon" | "later";

const TONE_META: Record<Tone, { label: string }> = {
  urgent: { label: "Tento týden" },
  soon: { label: "Za 8–14 dní" },
  later: { label: "Později" },
};

function toneFor(daysLeft: number): Tone {
  if (daysLeft <= 7) return "urgent";
  if (daysLeft <= 14) return "soon";
  return "later";
}

function isManagerPosition(pos: Position | null | undefined): boolean {
  return typeof pos === "string" && pos.startsWith("manazer");
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function contractOwnerEmail(contract: ContractRow): string {
  return normalizeEmail(contract.adviserEmail ?? contract.userEmail ?? null);
}

type RadarItem = {
  key: string;
  ownerEmail: string;
  entryId: string;
  contractNumber: string | null;
  clientName: string;
  clientPhone: string | null;
  product: Product | null | undefined;
  next: Date;
  daysLeft: number;
  anniversaryNumber?: number;
  occurrenceKey: string;
  carHullSumInsured?: number | null;
  carHullSumInsuredText?: string | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
};

function hasCarHullCoverage(item: RadarItem): boolean {
  return (
    item.carHullSumInsured != null ||
    (item.carHullSumInsuredText?.trim() ?? "") !== "" ||
    item.carHullDeductible != null ||
    (item.carHullDeductibleText?.trim() ?? "") !== "" ||
    item.carHullRiskAccident === true ||
    item.carHullRiskTheft === true ||
    item.carHullRiskNatural === true ||
    item.carHullRiskVandalism === true ||
    item.carHullRiskAnimalCollision === true
  );
}

function checklistForItem(item: RadarItem): string[] {
  const category = productCategory(item.product ?? null);
  if (category === "auto") {
    return hasCarHullCoverage(item) ? [...AUTO_CHECKLIST, ...AUTO_HULL_CHECKLIST] : AUTO_CHECKLIST;
  }
  if (category && CATEGORY_CHECKLIST[category]) return CATEGORY_CHECKLIST[category];
  return DEFAULT_CHECKLIST;
}

function ProductCategoryIcon({ product }: { product: Product | null | undefined }) {
  let Icon = ShieldCheck;

  if (product && RADAR_ENTREPRENEUR_PRODUCTS.has(product)) {
    Icon = BriefcaseBusiness;
  } else {
    switch (productCategory(product ?? null)) {
      case "life":
        Icon = HeartPulse;
        break;
      case "auto":
        Icon = CarFront;
        break;
      case "property":
        Icon = House;
        break;
    }
  }

  return <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />;
}

type ContractDetailWindowState = {
  href: string;
  pageHref: string;
  title: string;
};

type ContactDialogState = {
  item: RadarItem;
  outcome: ContactOutcome | null;
  note: string;
  meetingDate: string;
  meetingTime: string;
};

function contractDetailHref(ownerEmail: string, entryId: string): string {
  return `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}?from=anniversary`;
}

function reviewKey(ownerEmail: string, entryId: string): string {
  return `${normalizeEmail(ownerEmail)}__${entryId}`;
}

function isCurrentReview(record: AnniversaryReview | undefined, occurrenceKey: string): boolean {
  return record?.occurrenceKey === occurrenceKey;
}

function isReviewHandled(record: AnniversaryReview | undefined, occurrenceKey: string): boolean {
  if (!isCurrentReview(record, occurrenceKey)) return false;
  return Boolean(record?.contactOutcome || record?.handled);
}

function outcomeLabel(outcome: ContactOutcome | null | undefined): string {
  return CONTACT_OUTCOME_OPTIONS.find((option) => option.value === outcome)?.label ?? "";
}

function outcomeIcon(outcome: ContactOutcome | null | undefined): typeof PhoneCall {
  return CONTACT_OUTCOME_OPTIONS.find((option) => option.value === outcome)?.icon ?? PhoneCall;
}

function splitMeetingAt(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const [date = "", timeWithSeconds = ""] = value.split("T");
  return { date, time: timeWithSeconds.slice(0, 5) };
}

function combineMeetingAt(date: string, time: string): string | null {
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function formatMeetingAt(value: string | null | undefined): string {
  if (!value) return "";
  const { date, time } = splitMeetingAt(value);
  if (!date || !time) return "";
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date} ${time}`;
  return `${parsed.toLocaleDateString("cs-CZ")} ${parsed.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function csvEscape(value: string): string {
  // Neutralize leading formula characters so Excel/Sheets/LibreOffice never
  // interpret an exported client name or note as a spreadsheet formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[";\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function RadarAnniversaryLoader() {
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 96) return current;
        if (current < 20) return Math.min(96, current + 5);
        if (current < 64) return Math.min(96, current + 3);
        return Math.min(96, current + 1);
      });
    }, 150);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % RADAR_LOADER_STAGES.length);
    }, 1180);

    return () => window.clearInterval(interval);
  }, []);

  const progressStyle = useMemo(
    () => ({ width: `${Math.max(0, Math.min(100, progress))}%` }),
    [progress]
  );
  const stageText = RADAR_LOADER_STAGES[stageIndex] ?? RADAR_LOADER_STAGES[0];
  const radarHits = [
    { left: "70%", top: "30%", delay: "-120ms" },
    { left: "34%", top: "38%", delay: "-520ms" },
    { left: "58%", top: "68%", delay: "-880ms" },
    { left: "78%", top: "62%", delay: "-1240ms" },
    { left: "44%", top: "76%", delay: "-1600ms" },
  ];

  return (
    <section
      className={`${introStyles.initialLoaderShell} min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-[32px] border border-white/80 px-4 py-6 shadow-[0_28px_88px_rgba(15,23,42,0.14)] sm:px-7 sm:py-8 lg:px-10`}
      aria-busy="true"
      aria-live="polite"
    >
      <span className={introStyles.initialLoaderBeam} aria-hidden="true" />

      <div className="relative z-10 grid min-h-[calc(100vh-11.5rem)] grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.74fr)]">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-fuchsia-200 bg-white text-fuchsia-700 shadow-[0_14px_30px_rgba(162,28,175,0.13)]">
              <CalendarSearch className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-black">Radar výročí</p>
              <p className="text-sm text-black/55">Anniversary scan</p>
            </div>
          </div>

          <div>
            <div className="flex items-end gap-2 font-mono text-7xl font-semibold leading-none text-black sm:text-8xl lg:text-9xl">
              <span>{Math.round(progress)}</span>
              <span className="pb-2 text-3xl text-fuchsia-700 sm:text-4xl lg:pb-3">%</span>
            </div>

            <h1
              key={stageText}
              className={`${introStyles.initialLoaderStage} mt-5 max-w-4xl text-3xl font-semibold leading-tight text-black sm:text-4xl`}
            >
              {stageText}
            </h1>
          </div>

          <div
            className={introStyles.initialLoaderProgress}
            role="progressbar"
            aria-label="Načítání radaru výročí"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <span className={introStyles.initialLoaderProgressFill} style={progressStyle} />
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            {["Smlouvy", "Výročí", "Klienti", "Tým"].map((label) => (
              <span
                key={label}
                className="rounded-full border border-fuchsia-200 bg-white/80 px-3 py-1 shadow-[0_8px_18px_rgba(162,28,175,0.08)]"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className={introStyles.initialLoaderConsole} aria-hidden="true">
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-black">
              <Radar className="h-5 w-5 text-fuchsia-700" strokeWidth={2.2} />
              Radar portfolia
            </div>
            <div className="rounded-full border border-fuchsia-200 bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-fuchsia-700">
              scan
            </div>
          </div>

          <div className="anniversaryRadar">
            <span className="anniversaryRadarRing anniversaryRadarRingOuter" />
            <span className="anniversaryRadarRing anniversaryRadarRingMiddle" />
            <span className="anniversaryRadarRing anniversaryRadarRingInner" />
            <span className="anniversaryRadarAxis anniversaryRadarAxisX" />
            <span className="anniversaryRadarAxis anniversaryRadarAxisY" />
            <span className="anniversaryRadarSweep" />
            <span className="anniversaryRadarCenter">
              <Radar className="h-8 w-8" strokeWidth={2.2} />
            </span>
            {radarHits.map((hit, index) => (
              <span
                key={`${hit.left}-${hit.top}`}
                className="anniversaryRadarDot"
                style={{ left: hit.left, top: hit.top, animationDelay: hit.delay }}
              >
                <span>{index + 1}</span>
              </span>
            ))}
          </div>

          <div className="anniversaryRadarResults">
            {[0, 1, 2].map((row) => (
              <span key={row} style={{ animationDelay: `${row * 170}ms` }}>
                <i />
                <b />
                <em />
              </span>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .anniversaryRadar {
          position: relative;
          z-index: 1;
          display: grid;
          min-height: 20rem;
          margin-top: 1.2rem;
          place-items: center;
          overflow: hidden;
          border-radius: 26px;
          border: 1px solid rgba(2, 6, 23, 0.1);
          background:
            radial-gradient(circle at 50% 50%, rgba(217, 70, 239, 0.12), transparent 22%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(253, 244, 255, 0.48)),
            rgba(255, 255, 255, 0.5);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.78),
            0 20px 44px rgba(2, 6, 23, 0.1);
        }

        .anniversaryRadar::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to right, rgba(2, 6, 23, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(2, 6, 23, 0.05) 1px, transparent 1px);
          background-size: 32px 32px;
          pointer-events: none;
        }

        .anniversaryRadar::after {
          content: "";
          position: absolute;
          inset: auto 13% 1.25rem;
          height: 1.1rem;
          border-radius: 9999px;
          background: rgba(2, 6, 23, 0.16);
          filter: blur(14px);
          pointer-events: none;
        }

        .anniversaryRadarRing,
        .anniversaryRadarAxis,
        .anniversaryRadarSweep,
        .anniversaryRadarCenter,
        .anniversaryRadarDot {
          position: absolute;
        }

        .anniversaryRadarRing {
          border-radius: 9999px;
          border: 1px solid rgba(162, 28, 175, 0.22);
          box-shadow: inset 0 0 30px rgba(217, 70, 239, 0.05);
        }

        .anniversaryRadarRingOuter {
          width: min(78%, 18rem);
          aspect-ratio: 1;
        }

        .anniversaryRadarRingMiddle {
          width: min(56%, 13rem);
          aspect-ratio: 1;
        }

        .anniversaryRadarRingInner {
          width: min(32%, 7.4rem);
          aspect-ratio: 1;
        }

        .anniversaryRadarAxis {
          left: 50%;
          top: 50%;
          width: min(78%, 18rem);
          height: 1px;
          border-radius: 9999px;
          background: linear-gradient(90deg, transparent, rgba(2, 6, 23, 0.16), transparent);
          transform: translate(-50%, -50%);
        }

        .anniversaryRadarAxisY {
          transform: translate(-50%, -50%) rotate(90deg);
        }

        .anniversaryRadarSweep {
          left: 50%;
          top: 50%;
          width: min(39%, 9rem);
          height: min(39%, 9rem);
          border-radius: 100% 0 0 0;
          background: linear-gradient(45deg, rgba(217, 70, 239, 0.42), rgba(217, 70, 239, 0));
          clip-path: polygon(0 0, 100% 0, 0 100%);
          filter: drop-shadow(0 0 18px rgba(217, 70, 239, 0.34));
          transform-origin: 0 0;
          animation: anniversaryRadarSweep 2100ms linear infinite;
        }

        .anniversaryRadarCenter {
          z-index: 4;
          display: grid;
          width: 4.6rem;
          height: 4.6rem;
          place-items: center;
          border-radius: 1.5rem;
          border: 1px solid rgba(217, 70, 239, 0.34);
          background: linear-gradient(135deg, #020617 0%, #111827 58%, #a21caf 100%);
          color: #fff;
          box-shadow:
            0 22px 42px rgba(15, 23, 42, 0.2),
            0 0 0 8px rgba(217, 70, 239, 0.08);
        }

        .anniversaryRadarDot {
          z-index: 3;
          display: grid;
          width: 1.85rem;
          height: 1.85rem;
          place-items: center;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.92);
          background: #a21caf;
          color: #fff;
          font-size: 0.68rem;
          font-weight: 900;
          box-shadow:
            0 0 0 0 rgba(217, 70, 239, 0.32),
            0 12px 22px rgba(162, 28, 175, 0.24);
          transform: translate(-50%, -50%);
          animation: anniversaryRadarDot 1600ms ease-in-out infinite;
        }

        .anniversaryRadarDot span {
          transform: translateY(-0.02rem);
        }

        .anniversaryRadarResults {
          position: relative;
          z-index: 2;
          display: grid;
          gap: 0.65rem;
          margin-top: 1rem;
        }

        .anniversaryRadarResults span {
          display: grid;
          grid-template-columns: 2.1rem minmax(0, 1fr) 4.5rem;
          align-items: center;
          gap: 0.8rem;
          min-height: 2.7rem;
          border-radius: 1rem;
          border: 1px solid rgba(2, 6, 23, 0.1);
          background: rgba(255, 255, 255, 0.72);
          padding: 0.55rem 0.7rem;
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
          animation: anniversaryRadarRow 1400ms cubic-bezier(0.18, 0.82, 0.24, 1) infinite;
        }

        .anniversaryRadarResults i,
        .anniversaryRadarResults b,
        .anniversaryRadarResults em {
          display: block;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.14);
        }

        .anniversaryRadarResults i {
          width: 2.1rem;
          height: 2.1rem;
          background: rgba(217, 70, 239, 0.18);
        }

        .anniversaryRadarResults b {
          height: 0.62rem;
        }

        .anniversaryRadarResults em {
          height: 0.62rem;
          background: rgba(162, 28, 175, 0.22);
        }

        @keyframes anniversaryRadarSweep {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes anniversaryRadarDot {
          0%,
          100% {
            box-shadow:
              0 0 0 0 rgba(217, 70, 239, 0.32),
              0 12px 22px rgba(162, 28, 175, 0.24);
            transform: translate(-50%, -50%) scale(0.92);
          }
          48% {
            box-shadow:
              0 0 0 0.7rem rgba(217, 70, 239, 0),
              0 12px 22px rgba(162, 28, 175, 0.24);
            transform: translate(-50%, -50%) scale(1.08);
          }
        }

        @keyframes anniversaryRadarRow {
          0%,
          100% {
            opacity: 0.58;
            transform: translate3d(0, 0.18rem, 0) scale(0.99);
          }
          45% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @media (max-width: 640px) {
          .anniversaryRadar {
            min-height: 16.5rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .anniversaryRadarSweep,
          .anniversaryRadarDot,
          .anniversaryRadarResults span {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}

export default function RadarVyrociPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [adminImpersonation, setAdminImpersonation] =
    useState<AdminImpersonationState | null>(() =>
      typeof window === "undefined" ? null : readAdminImpersonationState()
    );
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [portfolioFailed, setPortfolioFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [windowDays, setWindowDays] = useState<number>(30);
  const [showTeam, setShowTeam] = useState(false);
  const [activityFilter, setActivityFilter] = useState<RadarActivityFilter>("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [savedNotice, setSavedNotice] = useState<{ message: string; destination: RadarActivityFilter } | null>(null);
  const [productFilter, setProductFilter] = useState<RadarProductFilter>("all");

  const [position, setPosition] = useState<Position | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [reviewRecords, setReviewRecords] = useState<Map<string, AnniversaryReview>>(new Map());
  const [noteDrafts, setNoteDrafts] = useState<Map<string, string>>(new Map());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const pendingMutations = useRef(new Set<string>());
  const mutationIds = useRef(new Map<string, string>());
  const activeAccount = useRef("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [contractDetailWindow, setContractDetailWindow] =
    useState<ContractDetailWindowState | null>(null);
  const [contactDialog, setContactDialog] = useState<ContactDialogState | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncImpersonation = () => {
      setAdminImpersonation(readAdminImpersonationState());
    };
    syncImpersonation();
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
    return () => {
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, syncImpersonation);
    };
  }, []);

  const effectiveUserEmail =
    normalizeEmail(adminImpersonation?.email) || normalizeEmail(user?.email);
  useEffect(() => {
    activeAccount.current = effectiveUserEmail;
    return () => { activeAccount.current = ""; };
  }, [effectiveUserEmail]);

  const loadData = useCallback(async (signal: AbortSignal) => {
    if (!user || !effectiveUserEmail) return;
    setLoading(true);
    setLoadedOnce(false);
    setPortfolioFailed(false);
    setError(null);
    setContracts([]);
    setPosition(null);
    setReviewRecords(new Map());
    setNoteDrafts(new Map());
    setPendingKeys(new Set());
    setExpandedKeys(new Set());
    setContactDialog(null);
    setContractDetailWindow(null);
    setSavedNotice(null);
    try {
      const portfolio = await loadAnniversaryPortfolio(user, signal);
      const reviewsData = await fetchAuthedJsonOrThrow<ReviewsResponse>(
        user,
        "/api/contracts/anniversary-review",
        { signal }
      );
      signal.throwIfAborted();
      if (!reviewsData?.ok || !Array.isArray(reviewsData.reviews)) {
        throw new Error(reviewsData?.error || "Nepodařilo se načíst stav výročí smluv.");
      }
      const map = new Map<string, AnniversaryReview>();
      for (const r of reviewsData.reviews) {
        const key = reviewKey(r.ownerEmail, r.entryId);
        map.set(key, {
          ...r,
          ownerEmail: normalizeEmail(r.ownerEmail),
          note: r.note ?? "",
          meetingAt: r.meetingAt ?? null,
          contactOutcome: r.contactOutcome ?? null,
          handled: Boolean(r.handled || r.contactOutcome),
        });
      }
      setReviewRecords(map);
      setNoteDrafts(new Map());
      setContracts(portfolio.contracts);
      setPosition(portfolio.position);
    } catch (e) {
      if (signal.aborted) return;
      setPortfolioFailed(true);
      setError(e instanceof Error ? e.message : "Nepodařilo se načíst data.");
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setLoadedOnce(true);
        setLoadedFor(effectiveUserEmail);
      }
    }
  }, [effectiveUserEmail, user]);

  useEffect(() => {
    const controller = new AbortController();
    if (user && effectiveUserEmail) void loadData(controller.signal);
    return () => controller.abort();
  }, [effectiveUserEmail, user, loadData, loadAttempt]);

  const closeContractDetailWindow = useCallback(() => {
    setContractDetailWindow(null);
  }, []);

  const closeContactDialog = useCallback(() => {
    setContactDialog(null);
  }, []);

  useEffect(() => {
    if (!contractDetailWindow && !contactDialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (contactDialog) closeContactDialog();
      else closeContractDetailWindow();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContactDialog, closeContractDetailWindow, contactDialog, contractDetailWindow]);

  const openContractDetailWindow = useCallback((item: RadarItem) => {
    const pageHref = contractDetailHref(item.ownerEmail, item.entryId);
    const title = item.contractNumber
      ? `Smlouva ${item.contractNumber}`
      : `Smlouva ${item.clientName}`;

    setContractDetailWindow({
      href: `${pageHref}&embedded=1`,
      pageHref,
      title,
    });
  }, []);

  const openContactDialog = useCallback(
    (item: RadarItem) => {
      setError(null);
      setContactDialog({
        item,
        outcome: null,
        note: "",
        meetingDate: "",
        meetingTime: "",
      });
    },
    []
  );

  const canShowTeam = isManagerPosition(position);

  const radarItems = useMemo<RadarItem[]>(() => {
    const items: RadarItem[] = [];
    for (const contract of contracts) {
      if ((contract.entryType ?? "contract") !== "contract") continue;
      if (!shouldTrackAnniversary(contract.productKey ?? null)) continue;
      const lifecycle = contractLifecycleStatus(contract);
      if (lifecycle === "storno" || lifecycle === "dozita") continue;

      const ownerEmail = contractOwnerEmail(contract);
      if (!ownerEmail) continue;
      if (!showTeam && ownerEmail !== effectiveUserEmail) continue;

      const start = getAnniversaryStartDate(contract);
      const info = isAnniversarySoon(start, windowDays);
      if (!info.soon || !info.next || info.daysLeft == null) continue;

      const occurrenceKey = anniversaryOccurrenceKey(info.next);
      if (!occurrenceKey) continue;

      items.push({
        key: `${ownerEmail}__${contract.id}`,
        ownerEmail,
        entryId: contract.id,
        contractNumber: contract.contractNumber ?? null,
        clientName: contract.clientName?.trim() || "Bez jména",
        clientPhone: contract.clientPhone ?? null,
        product: contract.productKey,
        next: info.next,
        daysLeft: info.daysLeft,
        anniversaryNumber: info.anniversaryNumber,
        occurrenceKey,
        carHullSumInsured: contract.carHullSumInsured ?? null,
        carHullSumInsuredText: contract.carHullSumInsuredText ?? null,
        carHullDeductible: contract.carHullDeductible ?? null,
        carHullDeductibleText: contract.carHullDeductibleText ?? null,
        carHullRiskAccident: contract.carHullRiskAccident ?? null,
        carHullRiskTheft: contract.carHullRiskTheft ?? null,
        carHullRiskNatural: contract.carHullRiskNatural ?? null,
        carHullRiskVandalism: contract.carHullRiskVandalism ?? null,
        carHullRiskAnimalCollision: contract.carHullRiskAnimalCollision ?? null,
      });
    }
    items.sort((a, b) => a.daysLeft - b.daysLeft);
    return items;
  }, [contracts, effectiveUserEmail, showTeam, windowDays]);

  const productFilteredItems = useMemo(
    () => radarItems.filter((item) => matchesRadarProductFilter(item.product, productFilter)),
    [productFilter, radarItems]
  );

  const searchedItems = useMemo(() => {
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ");
    const query = normalize(searchQuery.trim());
    return query ? productFilteredItems.filter(item =>
      normalize(`${item.clientName} ${item.contractNumber ?? ""} ${item.clientPhone ?? ""}`).includes(query)
    ) : productFilteredItems;
  }, [productFilteredItems, searchQuery]);

  const activityCounts = useMemo(() => {
    const counts = { new: 0, active: 0, completed: 0, all: searchedItems.length };
    for (const item of searchedItems) counts[anniversaryStage(reviewRecords.get(item.key), item.occurrenceKey)] += 1;
    return counts;
  }, [searchedItems, reviewRecords]);

  const visibleItems = useMemo(() => searchedItems.filter(item => {
    if (activityFilter === "all") return true;
    return anniversaryStage(reviewRecords.get(item.key), item.occurrenceKey) === activityFilter;
  }), [searchedItems, activityFilter, reviewRecords]);

  const groups = useMemo(() => {
    return (["new", "active", "completed"] as const).flatMap(activity => {
      const buckets: Record<Tone, RadarItem[]> = { urgent: [], soon: [], later: [] };
      for (const item of visibleItems) {
        const itemActivity = anniversaryStage(reviewRecords.get(item.key), item.occurrenceKey);
        if (itemActivity === activity) buckets[toneFor(item.daysLeft)].push(item);
      }
      return (["urgent", "soon", "later"] as Tone[])
        .map(tone => ({ activity, tone, items: buckets[tone] }))
        .filter(group => group.items.length > 0)
        .map((group, index) => ({ ...group, firstInActivity: index === 0 }));
    });
  }, [visibleItems, reviewRecords]);

  const mutateReview = useCallback(
    async (item: RadarItem, changes: { action: "mark" | "save" | "clearOutcome" | "complete" | "reopen"; note?: string; contactOutcome?: ContactOutcome; meetingAt?: string | null }) => {
      if (!user || pendingMutations.current.has(item.key)) return false;
      const account = effectiveUserEmail;
      const body = {
        ...changes, ownerEmail: item.ownerEmail, entryId: item.entryId,
        occurrenceKey: item.occurrenceKey, contractNumber: item.contractNumber,
      };
      const fingerprint = JSON.stringify({ account, ...body });
      const requestId = mutationIds.current.get(fingerprint) ?? crypto.randomUUID();
      mutationIds.current.set(fingerprint, requestId);
      pendingMutations.current.add(item.key);
      setPendingKeys(previous => new Set(previous).add(item.key));
      setError(null);
      setSavedNotice(null);
      try {
        const data = await fetchAuthedJsonOrThrow<AnniversaryReviewMutationResponse>(user, "/api/contracts/anniversary-review", {
          method: "POST", body: JSON.stringify({ ...body, requestId }),
        });
        if (!data?.ok || !data.review) throw new Error(data?.error || "Záznam se nepodařilo uložit.");
        mutationIds.current.delete(fingerprint);
        if (activeAccount.current !== account) return false;
        setReviewRecords(previous => new Map(previous).set(item.key, data.review));
        if (changes.action !== "complete" && changes.action !== "reopen") {
          setNoteDrafts(previous => new Map(previous).set(item.key, data.review.note ?? ""));
        }
        return data.review;
      } catch (cause) {
        if (activeAccount.current === account) setError(cause instanceof Error ? cause.message : "Záznam se nepodařilo uložit.");
        return false;
      } finally {
        pendingMutations.current.delete(item.key);
        if (activeAccount.current === account) setPendingKeys(previous => {
          const next = new Set(previous); next.delete(item.key); return next;
        });
      }
    }, [user, effectiveUserEmail]
  );

  const clearContactOutcome = useCallback(async (item: RadarItem) => {
    if (await mutateReview(item, { action: "clearOutcome" })) setContactDialog(null);
  }, [mutateReview]);

  const changeCompletion = useCallback(async (item: RadarItem, completed: boolean) => {
    const saved = await mutateReview(item, { action: completed ? "complete" : "reopen" });
    if (saved) {
      const destination = anniversaryStage(saved, item.occurrenceKey);
      setSavedNotice({
        message: `${item.clientName}: ${destination === "completed" ? "případ označen jako dokončený." : !completed && destination === "active" ? "případ vrácen k řešení. Předchozí jednání zůstává uložené." : `stav se mezitím změnil. Aktuální přehled: ${RADAR_STAGE_LABELS[destination]}.`}`,
        destination,
      });
    }
  }, [mutateReview]);

  const updateNoteDraft = useCallback((key: string, value: string) => {
    setNoteDrafts(previous => new Map(previous).set(key, value.slice(0, 280)));
  }, []);

  const saveReviewNote = useCallback(async (item: RadarItem) => {
    const saved = await mutateReview(item, { action: "save", note: noteDrafts.get(item.key) ?? "" });
    if (saved) {
      setSavedNotice({ message: `${item.clientName}: poznámka uložena.`, destination: anniversaryStage(saved, item.occurrenceKey) });
    }
  }, [mutateReview, noteDrafts]);

  const saveContactDialog = useCallback(async () => {
    if (!contactDialog?.outcome) return;
    const saved = await mutateReview(contactDialog.item, {
      action: "mark", contactOutcome: contactDialog.outcome,
      note: contactDialog.note.slice(0, 280),
      meetingAt: contactDialog.outcome === "meeting"
        ? combineMeetingAt(contactDialog.meetingDate, contactDialog.meetingTime) : null,
    });
    if (saved) {
      const destination = anniversaryStage(saved, contactDialog.item.occurrenceKey);
      setSavedNotice({ message: `${contactDialog.item.clientName}: kontakt uložen. ${destination === "active" ? "Případ zůstává rozpracovaný." : `Aktuální přehled: ${RADAR_STAGE_LABELS[destination]}.`}`, destination });
      setContactDialog(null);
    }
  }, [contactDialog, mutateReview]);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exportCsv = useCallback(() => {
    const header = [
      "Klient",
      "Telefon",
      "Produkt",
      "Pojišťovna",
      "Datum výročí",
      "Kolikáté výročí",
      "Stav zpracování",
      "Výsledek kontaktu",
      "Termín schůzky",
      "Poznámka",
    ];
    const rows = visibleItems.map((item) => {
      const review = reviewRecords.get(item.key);
      const contactOutcome = isCurrentReview(review, item.occurrenceKey) ? review?.contactOutcome : null;
      return [
        item.clientName,
        item.clientPhone ?? "",
        productLabel(item.product),
        productInstitutionLabel(item.product) ?? "",
        item.next.toLocaleDateString("cs-CZ"),
        item.anniversaryNumber != null ? `${item.anniversaryNumber}.` : "",
        RADAR_STAGE_LABELS[anniversaryStage(review, item.occurrenceKey)],
        outcomeLabel(contactOutcome) || (isReviewHandled(review, item.occurrenceKey) ? "Zkontrolováno" : ""),
        formatMeetingAt(isCurrentReview(review, item.occurrenceKey) ? review?.meetingAt : null),
        isCurrentReview(review, item.occurrenceKey) ? review?.note ?? "" : "",
      ]
        .map(csvEscape)
        .join(";");
    });
    const csv = [header.join(";"), ...rows].join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `radar-vyroci-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visibleItems, reviewRecords]);

  const isInitialLoading = !authReady || (Boolean(user) && (loading || !loadedOnce || loadedFor !== effectiveUserEmail));
  const contactDialogPending = contactDialog ? pendingKeys.has(contactDialog.item.key) : false;
  const contactDialogDateIncomplete = Boolean(
    contactDialog?.outcome === "meeting" &&
      (contactDialog.meetingDate || contactDialog.meetingTime) &&
      (!contactDialog.meetingDate || !contactDialog.meetingTime)
  );
  const contactDialogCanSave = Boolean(
    contactDialog?.outcome && !contactDialogDateIncomplete && !contactDialogPending
  );
  const contactDialogReview = contactDialog ? reviewRecords.get(contactDialog.item.key) : undefined;
  const contactDialogIsHandled = contactDialog
    ? isReviewHandled(contactDialogReview, contactDialog.item.occurrenceKey)
    : false;
  const hasProcessedItems = activityCounts.active + activityCounts.completed > 0;

  if (isInitialLoading) {
    return (
      <AppLayout active="tools">
        <div className="w-full max-w-6xl">
          <RadarAnniversaryLoader />
        </div>
      </AppLayout>
    );
  }

  if (portfolioFailed) {
    return (
      <AppLayout active="tools">
        <div role="alert" className="w-full max-w-5xl space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="font-semibold text-slate-900">Portfolio se nepodařilo načíst celé</p>
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            <RotateCcw className="h-4 w-4" /> Zkusit znovu
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <div className={styles.eyebrow}><Radar size={14} /> Péče o klienty</div>
            <h1 className={styles.title}>Radar výročí</h1>
            <p className={styles.subtitle}>Ozvi se klientům včas. Kontakty, poznámky a další kroky na jednom místě.</p>
          </div>
          <div className={styles.heroIcon} aria-hidden="true"><Radar size={42} strokeWidth={1.3} /></div>
        </header>

        {error && <div role="alert" className={styles.notice}>{error}</div>}

        <section className={styles.workspace} aria-label="Přehled výročí smluv">
          <div className={styles.tabs} role="group" aria-label="Stav zpracování">
            {ACTIVITY_FILTERS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" className={styles.tab} aria-pressed={activityFilter === key} onClick={() => setActivityFilter(key)}>
                <Icon size={15} /><span>{label}</span><span className={styles.tabCount}>{activityCounts[key]}</span>
              </button>
            ))}
          </div>

          <div className={styles.filters}>
            <div className={styles.filterRow}>
              <div className={styles.windowFilter}>
                <span className={styles.filterLabel}>Výročí do</span>
                <div className={styles.segments} role="group" aria-label="Období výročí">
                  {WINDOW_OPTIONS.map(days => (
                    <button key={days} type="button" className={styles.segment} aria-pressed={windowDays === days} onClick={() => setWindowDays(days)}>{days} dní</button>
                  ))}
                </div>
              </div>
              <div className={styles.search}>
                <Search size={15} aria-hidden="true" />
                <input type="search" aria-label="Hledat klienta, smlouvu nebo telefon" placeholder="Hledat klienta nebo smlouvu…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} />
                {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Vymazat hledání"><X size={14} /></button>}
              </div>
              {canShowTeam && <button type="button" className={styles.teamButton} aria-pressed={showTeam} onClick={() => setShowTeam(value => !value)}><Users size={14} /> Tým</button>}
            </div>
            <div className={styles.products} role="group" aria-label="Druh pojištění">
              {RADAR_PRODUCT_FILTERS.map(filter => {
                const Icon = { all: null, life: HeartPulse, propertyLiability: House, auto: CarFront, entrepreneurs: BriefcaseBusiness }[filter.key];
                return <button key={filter.key} type="button" className={styles.product} aria-pressed={productFilter === filter.key} onClick={() => setProductFilter(filter.key)}>{Icon && <Icon size={13} />}{filter.key === "all" ? "Všechny produkty" : filter.label}</button>;
              })}
            </div>
          </div>

          <div className={styles.list}>
            <div className={styles.listIntro}>
              <div>
                <h2>{ACTIVITY_COPY[activityFilter].title}</h2>
                <p>{ACTIVITY_COPY[activityFilter].description} Seřazeno od nejbližšího výročí.</p>
              </div>
              <button type="button" className={styles.export} onClick={exportCsv} disabled={visibleItems.length === 0} aria-label="Export CSV" title="Exportovat právě zobrazené smlouvy"><Download size={14} /><span>Export CSV</span></button>
            </div>

            {savedNotice && <div className={styles.savedNotice} role="status">
              <Check size={14} /><span>{savedNotice.message}</span>
              {activityFilter !== savedNotice.destination && activityFilter !== "all" && <button type="button" onClick={() => setActivityFilter(savedNotice.destination)}>Zobrazit {savedNotice.destination === "completed" ? "dokončené" : savedNotice.destination === "new" ? "nezpracované" : "rozpracované"}</button>}
              <button type="button" onClick={() => setSavedNotice(null)} aria-label="Zavřít oznámení"><X size={14} /></button>
            </div>}

            {visibleItems.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>{searchQuery.trim() ? <Search size={24} /> : activityFilter === "completed" || (activityFilter === "new" && hasProcessedItems) ? <CircleCheck size={24} /> : <Inbox size={24} />}</div>
                <h3>{searchQuery.trim() ? "Žádná shoda" : activityFilter === "new" && hasProcessedItems ? "Všechny smlouvy už mají první krok" : ACTIVITY_COPY[activityFilter].emptyTitle}</h3>
                <p>{searchQuery.trim() ? "Zkus jiné jméno, číslo smlouvy nebo jiný stav zpracování." : activityFilter === "new" && hasProcessedItems ? "Případy najdeš v přehledech Rozpracované a Dokončené." : ACTIVITY_COPY[activityFilter].emptyDescription}</p>
                {searchQuery.trim() ? <button type="button" onClick={() => setSearchQuery("")}>Vymazat hledání</button>
                  : activityFilter === "new" && hasProcessedItems ? <button type="button" onClick={() => setActivityFilter("all")}>Zobrazit všechny smlouvy</button>
                  : activityFilter === "completed" ? <button type="button" onClick={() => setActivityFilter("active")}>Zobrazit rozpracované</button>
                  : activityFilter === "active" ? <button type="button" onClick={() => setActivityFilter("new")}>Přejít na nezpracované</button> : null}
              </div>
            ) : (
              groups.map(group => {
                const meta = TONE_META[group.tone];
                return (
                  <div key={`${group.activity}-${group.tone}`} className={styles.group}>
                    {activityFilter === "all" && group.firstInActivity && <h2 className={styles.activityHeading}>{RADAR_STAGE_LABELS[group.activity]} <span className={styles.tabCount}>{activityCounts[group.activity]}</span></h2>}
                    <div className={styles.groupHeading} data-tone={group.activity === "completed" ? "later" : group.tone}>
                      <span className={styles.groupDot} /><h3>{meta.label}</h3><span>{group.items.length}</span>
                    </div>
                    <div className={styles.cards}>
                      {group.items.map(item => {
                        const review = reviewRecords.get(item.key);
                        const stage = anniversaryStage(review, item.occurrenceKey);
                        const hasActivity = stage !== "new";
                        const isCompleted = stage === "completed";
                        const isHandled = isReviewHandled(review, item.occurrenceKey);
                        const activeOutcome = isCurrentReview(review, item.occurrenceKey) ? review?.contactOutcome ?? null : null;
                        const ActiveOutcomeIcon = isCompleted ? CircleCheck : activeOutcome ? outcomeIcon(activeOutcome) : hasActivity ? MessageSquareText : Inbox;
                        const isExpanded = expandedKeys.has(item.key);
                        const isPending = pendingKeys.has(item.key);
                        const savedNote = isCurrentReview(review, item.occurrenceKey) ? review?.note ?? "" : "";
                        const meetingAt = isCurrentReview(review, item.occurrenceKey) ? review?.meetingAt ?? null : null;
                        const noteDraft = noteDrafts.get(item.key) ?? savedNote;
                        const noteDirty = noteDraft.trim() !== savedNote.trim();
                        return (
                          <article key={item.key} className={styles.card} data-urgent={group.tone === "urgent" && !hasActivity} data-completed={isCompleted} aria-label={`${item.clientName}, smlouva ${item.contractNumber ?? item.entryId}`}>
                            <div className={styles.cardRow}>
                              <div className={styles.client}>
                                <span className={styles.categoryIcon}><ProductCategoryIcon product={item.product} /></span>
                                <div className={styles.clientInfo}>
                                  <div className={styles.clientName} title={item.clientName}>{item.clientName}</div>
                                  <div className={styles.productName} title={productLabel(item.product)}>{productLabel(item.product)}{productInstitutionLabel(item.product) ? ` · ${productInstitutionLabel(item.product)}` : ""}</div>
                                  {item.contractNumber && <div className={styles.contractNumber}>#{item.contractNumber}</div>}
                                  {showTeam && item.ownerEmail !== effectiveUserEmail && <div className={styles.contractNumber} title={item.ownerEmail}>{item.ownerEmail}</div>}
                                </div>
                              </div>
                              <div className={styles.deadline} data-tone={isCompleted ? "later" : group.tone}>
                                <div className={styles.daysLeft}>{item.daysLeft === 0 ? "Výročí dnes" : item.daysLeft === 1 ? "Výročí zítra" : `Za ${formatDaysLeft(item.daysLeft)}`}</div>
                                <time dateTime={item.occurrenceKey}>{item.next.toLocaleDateString("cs-CZ")}</time>
                                {item.anniversaryNumber != null && <div className={styles.anniversaryNumber}>{item.anniversaryNumber}. výročí smlouvy</div>}
                              </div>
                              <div className={styles.status}>
                                <span className={styles.statusBadge} data-outcome={isCompleted ? "completed" : activeOutcome ?? (hasActivity && !isHandled ? "note" : "new")}>
                                  <ActiveOutcomeIcon size={12} className="shrink-0" aria-hidden="true" />
                                  <span>{isCompleted ? "Dokončeno" : outcomeLabel(activeOutcome) || (savedNote && !isHandled ? "Uložena poznámka" : hasActivity ? "Rozpracováno" : "Čeká na první krok")}</span>
                                </span>
                                {isCompleted && activeOutcome && <span className={styles.statusNote}>{outcomeLabel(activeOutcome)}</span>}
                                {meetingAt && <span className={styles.meeting}>{formatMeetingAt(meetingAt)}</span>}
                                {savedNote && <span className={styles.statusNote} title={savedNote}>{savedNote}</span>}
                                {!isCompleted && <button type="button" className={styles.completeButton} disabled={isPending || noteDirty} onClick={() => changeCompletion(item, true)} title={noteDirty ? "Nejdřív ulož rozepsanou poznámku" : "Označit toto výročí jako dokončené"} aria-label={`Dokončit případ: ${item.clientName}`}><CircleCheck size={13} /> Dokončit</button>}
                                {!isCompleted && noteDirty && <span className={styles.statusNote}>Nejdřív ulož rozepsanou poznámku.</span>}
                              </div>
                              <div className={styles.actions}>
                                <button type="button" disabled={isPending} onClick={() => isCompleted ? changeCompletion(item, false) : openContactDialog(item)} className={styles.contactButton} data-active={hasActivity}>
                                  {isPending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : isCompleted ? <RotateCcw size={13} aria-hidden="true" /> : <PhoneCall size={13} aria-hidden="true" />}
                                  {isCompleted ? "Vrátit k řešení" : hasActivity ? "Další kontakt" : "Zapsat kontakt"}
                                </button>
                                <div className={styles.secondaryActions}>
                                  <button type="button" onClick={() => openContractDetailWindow(item)} aria-label={`Otevřít smlouvu ${item.contractNumber ?? item.clientName}`}><Eye size={12} /> Smlouva</button>
                                  <button type="button" onClick={() => toggleExpanded(item.key)} title="Historie jednání a kontrolní body" aria-label={`Historie jednání: ${item.clientName}`} aria-expanded={isExpanded} aria-controls={`anniversary-details-${item.key}`}>
                                    <History size={12} /> Historie{review?.historyCount ? ` (${review.historyCount})` : ""}<ChevronDown size={11} className={isExpanded ? "rotate-180" : ""} />
                                  </button>
                                </div>
                              </div>
                            </div>

                          {isExpanded && (
                            <div id={`anniversary-details-${item.key}`} className="animate-in fade-in slide-in-from-top-1 border-t border-slate-100 bg-slate-50 px-4 py-3 duration-200">
                              {user && <div className="mb-4"><AnniversaryHistory user={user} ownerEmail={item.ownerEmail} entryId={item.entryId} occurrenceKey={item.occurrenceKey} version={review?.historyCount} /></div>}
                              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Co zkontrolovat
                              </div>
                              <ul className="mt-2 space-y-1.5">
                                {checklistForItem(item).map((line) => (
                                  <li key={line} className="flex gap-2 text-xs text-slate-700">
                                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                                    {line}
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-4 rounded-2xl border border-violet-100 bg-white p-3 shadow-[0_8px_18px_rgba(109,40,217,0.06)]">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <label
                                    htmlFor={`anniversary-note-${item.key}`}
                                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700"
                                  >
                                    Poznámka k výročí
                                  </label>
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    {noteDraft.length}/280
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                  <input
                                    id={`anniversary-note-${item.key}`}
                                    type="text"
                                    value={noteDraft}
                                    onChange={(event) => updateNoteDraft(item.key, event.target.value)}
                                    placeholder="volat po 17h, má nové auto, chce navýšit krytí"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                                  />
                                  <button
                                    type="button"
                                    disabled={isPending || !noteDirty}
                                    onClick={() => saveReviewNote(item)}
                                    className="anniversary-purple-fill inline-flex h-10 items-center justify-center rounded-xl bg-violet-700 px-4 text-xs font-bold text-white shadow-[0_10px_22px_rgba(109,40,217,0.2)] transition hover:bg-violet-800 disabled:pointer-events-none disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                                  >
                                    {isPending ? (
                                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                      "Uložit poznámku"
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </section>
      </div>
      {contactDialog ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-3 py-4 backdrop-blur-md sm:px-5 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Nový kontakt"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeContactDialog();
            }
          }}
        >
          <div className="flex max-h-[90dvh] w-[min(620px,94vw)] flex-col overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_36px_92px_rgba(2,6,23,0.38)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7f1ff_100%)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">
                  Nový kontakt
                </p>
                <h2 className="mt-1 truncate text-xl font-bold text-slate-950">
                  {contactDialog.item.clientName}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {contactDialog.item.contractNumber ? `#${contactDialog.item.contractNumber} · ` : ""}
                  {productLabel(contactDialog.item.product)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeContactDialog}
                className="ui-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                aria-label="Zavřít výsledek kontaktu"
              >
                <X size={18} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
              <p className="text-xs text-slate-500">Zapiš další krok jednání. Předchozí kontakty zůstávají v historii.</p>
              {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Co se stalo
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CONTACT_OUTCOME_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const selected = contactDialog.outcome === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setContactDialog((current) =>
                            current
                              ? {
                                  ...current,
                                  outcome: option.value,
                                  meetingDate: option.value === "meeting" ? current.meetingDate : "",
                                  meetingTime: option.value === "meeting" ? current.meetingTime : "",
                                }
                              : current
                          )
                        }
                        className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 text-left text-sm font-bold transition-all duration-150 ${
                          selected
                            ? "anniversary-purple-fill border-violet-700 bg-violet-700 text-white shadow-[0_12px_28px_rgba(109,40,217,0.24)]"
                            : "border-slate-200 bg-white text-slate-800 hover:border-violet-300 hover:bg-violet-50"
                        }`}
                      >
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${
                            selected
                              ? "anniversary-purple-fill border-white/25 bg-white/15 text-white"
                              : "border-violet-100 bg-violet-50 text-violet-700"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${selected ? "text-white" : "text-violet-700"}`}
                            aria-hidden="true"
                          />
                        </span>
                        <span className={selected ? "text-white" : "text-slate-800"}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {contactDialog.outcome === "meeting" && (
                <div className="animate-in fade-in slide-in-from-top-1 rounded-2xl border border-violet-100 bg-violet-50/70 p-3 duration-200">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">
                    <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Termín schůzky
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="date"
                      value={contactDialog.meetingDate}
                      onChange={(event) =>
                        setContactDialog((current) =>
                          current ? { ...current, meetingDate: event.target.value } : current
                        )
                      }
                      className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    />
                    <input
                      type="time"
                      value={contactDialog.meetingTime}
                      onChange={(event) =>
                        setContactDialog((current) =>
                          current ? { ...current, meetingTime: event.target.value } : current
                        )
                      }
                      className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>
                  {contactDialogDateIncomplete && (
                    <p className="mt-2 text-xs font-semibold text-rose-600">
                      Vyplň datum i čas, nebo nech termín prázdný.
                    </p>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="contact-dialog-note"
                    className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500"
                  >
                    Poznámka k tomuto kontaktu
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {contactDialog.note.length}/280
                  </span>
                </div>
                <textarea
                  id="contact-dialog-note"
                  value={contactDialog.note}
                  onChange={(event) =>
                    setContactDialog((current) =>
                      current ? { ...current, note: event.target.value.slice(0, 280) } : current
                    )
                  }
                  rows={3}
                  placeholder="volat po 17h, má nové auto, chce navýšit krytí"
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </div>
              {user && <AnniversaryHistory user={user} ownerEmail={contactDialog.item.ownerEmail} entryId={contactDialog.item.entryId} occurrenceKey={contactDialog.item.occurrenceKey} version={contactDialogReview?.historyCount} />}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {contactDialogIsHandled && (
                  <button
                    type="button"
                    disabled={contactDialogPending}
                    onClick={() => clearContactOutcome(contactDialog.item)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
                  >
                    {contactDialogPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    )}
                    Vymazat výsledek kontaktu
                  </button>
                )}
              </div>
              <div className="flex gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={closeContactDialog}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 sm:flex-none"
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  disabled={!contactDialogCanSave}
                  onClick={saveContactDialog}
                  className="anniversary-purple-fill inline-flex h-10 flex-1 items-center justify-center rounded-full bg-violet-700 px-5 text-xs font-bold text-white shadow-[0_12px_28px_rgba(109,40,217,0.24)] transition hover:bg-violet-800 disabled:pointer-events-none disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none sm:flex-none"
                >
                  {contactDialogPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
                  ) : contactDialogDateIncomplete ? (
                    "Doplň datum i čas"
                  ) : (
                    "Přidat záznam"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {contractDetailWindow ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-3 py-4 backdrop-blur-md sm:px-5 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label={contractDetailWindow.title}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeContractDetailWindow();
            }
          }}
        >
          <div className="flex h-[min(900px,92vh)] w-[min(1120px,92vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_36px_92px_rgba(2,6,23,0.42)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
              <div className="min-w-0 px-1">
                <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Detail smlouvy
                </p>
                <p className="truncate text-sm font-bold text-slate-950">
                  {contractDetailWindow.title}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={contractDetailWindow.pageHref}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-focus hidden h-8 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 sm:inline-flex"
                >
                  <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>Otevřít jako stránku</span>
                </a>
                <button
                  type="button"
                  onClick={closeContractDetailWindow}
                  className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition hover:bg-black"
                  aria-label="Zavřít detail smlouvy"
                >
                  <X size={18} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>
            </div>
            <iframe
              key={contractDetailWindow.href}
              src={contractDetailWindow.href}
              title={contractDetailWindow.title}
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      ) : null}
      <style jsx global>{`
        body.simple-bg.simple-bg-white .app-content .anniversary-purple-fill.anniversary-purple-fill:not(:disabled),
        body.simple-bg.simple-bg-white .app-content .anniversary-purple-fill.anniversary-purple-fill:not(:disabled) *,
        body.simple-bg.simple-bg-white .app-content .anniversary-purple-fill.anniversary-purple-fill:not(:disabled) svg {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          stroke: #ffffff !important;
        }
      `}</style>
    </AppLayout>
  );
}
