"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  CalendarCheck,
  CalendarSearch,
  ChevronDown,
  CircleOff,
  Download,
  Eye,
  ExternalLink,
  Flame,
  Loader2,
  PhoneCall,
  PhoneMissed,
  PartyPopper,
  Radar,
  RotateCcw,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";
import introStyles from "@/app/cashflow/cashflowIntro.module.css";
import { AnimatedNumber } from "@/app/home/components/AnimatedNumbers";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  ADMIN_IMPERSONATION_EVENT,
  readAdminImpersonationState,
  type AdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import {
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

type ContractRow = {
  id: string;
  entryType?: string | null;
  status?: string | null;
  productKey?: Product | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  contractNumber?: string | null;
  policyStartDate?: unknown;
  policyEndDate?: unknown;
  contractSignedDate?: unknown;
  createdAt?: unknown;
  durationYears?: number | null;
  durationMonths?: number | null;
  userEmail?: string | null;
  adviserEmail?: string | null;
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

type ContractsListResponse = {
  ok: boolean;
  error?: string;
  position?: Position | null;
  contracts?: ContractRow[];
  hasMore?: boolean;
  teamContracts?: ContractRow[];
  teamHasMore?: boolean;
};

type ReviewsResponse = {
  ok: boolean;
  error?: string;
  reviews?: AnniversaryReview[];
};

const WINDOW_OPTIONS = [14, 30, 60, DEFAULT_ANNIVERSARY_WINDOW_DAYS] as const;

type ContactOutcome = "reached" | "no_answer" | "meeting" | "ignore";

type AnniversaryReview = {
  ownerEmail: string;
  entryId: string;
  occurrenceKey: string;
  contactOutcome?: ContactOutcome | null;
  note?: string | null;
  meetingAt?: string | null;
  handled?: boolean;
  reviewedBy?: string | null;
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

const TONE_META: Record<
  Tone,
  { label: string; strip: string; ring: string; badge: string; chipBg: string }
> = {
  urgent: {
    label: "Tento týden",
    strip: "bg-[linear-gradient(90deg,#fb7185_0%,#e11d48_100%)]",
    ring: "#e11d48",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    chipBg: "bg-[linear-gradient(135deg,#fb7185_0%,#be123c_100%)]",
  },
  soon: {
    label: "Příštích 14 dní",
    strip: "bg-[linear-gradient(90deg,#fbbf24_0%,#d97706_100%)]",
    ring: "#d97706",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    chipBg: "bg-[linear-gradient(135deg,#fbbf24_0%,#b45309_100%)]",
  },
  later: {
    label: "Později",
    strip: "bg-[linear-gradient(90deg,#38bdf8_0%,#0369a1_100%)]",
    ring: "#0369a1",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    chipBg: "bg-[linear-gradient(135deg,#38bdf8_0%,#0369a1_100%)]",
  },
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

function UrgencyRing({
  daysLeft,
  windowDays,
  color,
}: {
  daysLeft: number;
  windowDays: number;
  color: string;
}) {
  const size = 46;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, 1 - daysLeft / windowDays));
  const offset = circumference * (1 - progress);
  return (
    <div className="relative flex h-[46px] w-[46px] shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(15,23,42,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="absolute text-[13px] font-bold tabular-nums" style={{ color }}>
        {daysLeft}
      </span>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  gradient,
  glow,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  gradient: string;
  glow: string;
}) {
  return (
    <div className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.1)]">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-200 group-hover:scale-105 ${gradient} ${glow}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none text-slate-950">
          <AnimatedNumber value={value} duration={700} />
        </div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {label}
        </div>
      </div>
    </div>
  );
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
  const [error, setError] = useState<string | null>(null);

  const [windowDays, setWindowDays] = useState<number>(30);
  const [showTeam, setShowTeam] = useState(false);
  const [hideReviewed, setHideReviewed] = useState(false);

  const [position, setPosition] = useState<Position | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [reviewRecords, setReviewRecords] = useState<Map<string, AnniversaryReview>>(new Map());
  const [noteDrafts, setNoteDrafts] = useState<Map<string, string>>(new Map());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
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

  const loadData = useCallback(async () => {
    if (!user || !effectiveUserEmail) return;
    setLoading(true);
    setLoadedOnce(false);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: "my", mode: "anniversary" });
      params.set("includeTeam", "1");
      const data = await fetchAuthedJsonOrThrow<ContractsListResponse>(
        user,
        `/api/contracts/list?${params.toString()}`
      );
      if (!data.ok) throw new Error(data.error || "Nepodařilo se načíst smlouvy.");

      const my = data.contracts ?? [];
      const team = data.teamContracts ?? [];
      setContracts([...my, ...team]);
      setPosition(data.position ?? null);
      setTruncated(Boolean(data.hasMore) || Boolean(data.teamHasMore));

      const reviewsData = await fetchAuthedJsonOrThrow<ReviewsResponse>(
        user,
        "/api/contracts/anniversary-review"
      );
      if (reviewsData.ok && reviewsData.reviews) {
        const map = new Map<string, AnniversaryReview>();
        const drafts = new Map<string, string>();
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
          drafts.set(key, r.note ?? "");
        }
        setReviewRecords(map);
        setNoteDrafts(drafts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se načíst data.");
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [effectiveUserEmail, user]);

  useEffect(() => {
    if (user && effectiveUserEmail) void loadData();
  }, [effectiveUserEmail, user, loadData]);

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
      const review = reviewRecords.get(item.key);
      const currentReview = isCurrentReview(review, item.occurrenceKey) ? review : undefined;
      const meeting = splitMeetingAt(currentReview?.meetingAt ?? null);
      setContactDialog({
        item,
        outcome: currentReview?.contactOutcome ?? null,
        note: noteDrafts.get(item.key) ?? currentReview?.note ?? "",
        meetingDate: meeting.date,
        meetingTime: meeting.time,
      });
    },
    [noteDrafts, reviewRecords]
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

  const visibleItems = useMemo(() => {
    if (!hideReviewed) return radarItems;
    return radarItems.filter((item) => !isReviewHandled(reviewRecords.get(item.key), item.occurrenceKey));
  }, [radarItems, hideReviewed, reviewRecords]);

  const handledCount = useMemo(
    () => radarItems.filter((item) => isReviewHandled(reviewRecords.get(item.key), item.occurrenceKey)).length,
    [radarItems, reviewRecords]
  );
  const urgentCount = useMemo(
    () => radarItems.filter((item) => item.daysLeft <= 7).length,
    [radarItems]
  );

  const groups = useMemo(() => {
    const buckets: Record<Tone, RadarItem[]> = { urgent: [], soon: [], later: [] };
    for (const item of visibleItems) buckets[toneFor(item.daysLeft)].push(item);
    return (["urgent", "soon", "later"] as Tone[])
      .map((tone) => ({ tone, items: buckets[tone] }))
      .filter((g) => g.items.length > 0);
  }, [visibleItems]);

  const saveContactOutcome = useCallback(
    async (
      item: RadarItem,
      outcome: ContactOutcome,
      details?: { note?: string; meetingAt?: string | null }
    ) => {
      if (!user || pendingKeys.has(item.key)) return;
      setPendingKeys((prev) => new Set(prev).add(item.key));
      const prevRecord = reviewRecords.get(item.key) ?? null;
      const note = details?.note ?? noteDrafts.get(item.key) ?? (prevRecord?.note ?? "");
      const meetingAt = outcome === "meeting" ? details?.meetingAt ?? null : null;

      setNoteDrafts((prev) => {
        const next = new Map(prev);
        next.set(item.key, note);
        return next;
      });

      setReviewRecords((prev) => {
        const next = new Map(prev);
        next.set(item.key, {
          ownerEmail: item.ownerEmail,
          entryId: item.entryId,
          occurrenceKey: item.occurrenceKey,
          contactOutcome: outcome,
          note,
          meetingAt,
          handled: true,
        });
        return next;
      });

      try {
        await fetchAuthedJsonOrThrow(user, "/api/contracts/anniversary-review", {
          method: "POST",
          body: JSON.stringify({
            action: "mark",
            ownerEmail: item.ownerEmail,
            entryId: item.entryId,
            occurrenceKey: item.occurrenceKey,
            contractNumber: item.contractNumber,
            contactOutcome: outcome,
            note,
            meetingAt,
          }),
        });
        setContactDialog(null);
      } catch (e) {
        setReviewRecords((prev) => {
          const next = new Map(prev);
          if (prevRecord) next.set(item.key, prevRecord);
          else next.delete(item.key);
          return next;
        });
        setError(e instanceof Error ? e.message : "Uložení se nepodařilo.");
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
      }
    },
    [user, pendingKeys, reviewRecords, noteDrafts]
  );

  const clearContactOutcome = useCallback(
    async (item: RadarItem) => {
      if (!user || pendingKeys.has(item.key)) return;
      setPendingKeys((prev) => new Set(prev).add(item.key));
      const prevRecord = reviewRecords.get(item.key) ?? null;
      const note = noteDrafts.get(item.key) ?? (prevRecord?.note ?? "");

      setReviewRecords((prev) => {
        const next = new Map(prev);
        if (note.trim()) {
          next.set(item.key, {
            ownerEmail: item.ownerEmail,
            entryId: item.entryId,
            occurrenceKey: item.occurrenceKey,
            contactOutcome: null,
            note,
            meetingAt: null,
            handled: false,
          });
        } else {
          next.delete(item.key);
        }
        return next;
      });

      try {
        await fetchAuthedJsonOrThrow(user, "/api/contracts/anniversary-review", {
          method: "POST",
          body: JSON.stringify({
            action: "clearOutcome",
            ownerEmail: item.ownerEmail,
            entryId: item.entryId,
          }),
        });
        setContactDialog(null);
      } catch (e) {
        setReviewRecords((prev) => {
          const next = new Map(prev);
          if (prevRecord) next.set(item.key, prevRecord);
          else next.delete(item.key);
          return next;
        });
        setError(e instanceof Error ? e.message : "Uložení se nepodařilo.");
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
      }
    },
    [user, pendingKeys, reviewRecords, noteDrafts]
  );

  const updateNoteDraft = useCallback((key: string, value: string) => {
    setNoteDrafts((prev) => {
      const next = new Map(prev);
      next.set(key, value.slice(0, 280));
      return next;
    });
  }, []);

  const saveReviewNote = useCallback(
    async (item: RadarItem) => {
      if (!user || pendingKeys.has(item.key)) return;
      setPendingKeys((prev) => new Set(prev).add(item.key));
      const prevRecord = reviewRecords.get(item.key) ?? null;
      const note = noteDrafts.get(item.key) ?? "";

      setReviewRecords((prev) => {
        const next = new Map(prev);
        next.set(item.key, {
          ownerEmail: item.ownerEmail,
          entryId: item.entryId,
          occurrenceKey: item.occurrenceKey,
          contactOutcome: isCurrentReview(prevRecord ?? undefined, item.occurrenceKey)
            ? prevRecord?.contactOutcome ?? null
            : null,
          note,
          meetingAt: isCurrentReview(prevRecord ?? undefined, item.occurrenceKey)
            ? prevRecord?.meetingAt ?? null
            : null,
          handled: isReviewHandled(prevRecord ?? undefined, item.occurrenceKey),
        });
        return next;
      });

      try {
        await fetchAuthedJsonOrThrow(user, "/api/contracts/anniversary-review", {
          method: "POST",
          body: JSON.stringify({
            action: "save",
            ownerEmail: item.ownerEmail,
            entryId: item.entryId,
            occurrenceKey: item.occurrenceKey,
            contractNumber: item.contractNumber,
            note,
          }),
        });
      } catch (e) {
        setReviewRecords((prev) => {
          const next = new Map(prev);
          if (prevRecord) next.set(item.key, prevRecord);
          else next.delete(item.key);
          return next;
        });
        setError(e instanceof Error ? e.message : "Uložení poznámky se nepodařilo.");
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
      }
    },
    [user, pendingKeys, reviewRecords, noteDrafts]
  );

  const saveContactDialog = useCallback(() => {
    if (!contactDialog?.outcome) return;
    const meetingAt =
      contactDialog.outcome === "meeting"
        ? combineMeetingAt(contactDialog.meetingDate, contactDialog.meetingTime)
        : null;

    void saveContactOutcome(contactDialog.item, contactDialog.outcome, {
      note: contactDialog.note.slice(0, 280),
      meetingAt,
    });
  }, [contactDialog, saveContactOutcome]);

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

  let renderIndex = 0;
  const isInitialLoading = !authReady || (Boolean(user) && (loading || !loadedOnce));
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

  if (isInitialLoading) {
    return (
      <AppLayout active="tools">
        <div className="w-full max-w-6xl">
          <RadarAnniversaryLoader />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="relative -mx-1 overflow-hidden rounded-3xl px-1 pb-1 pt-2">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(244,63,94,0.16)_0%,transparent_70%)]" />
          <div className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.14)_0%,transparent_70%)]" />
          <div className="relative space-y-1 px-3 pt-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">
              <Sparkles className="h-3 w-3" />
              Nová pomůcka
            </div>
            <SplitTitle text="Radar výročí" />
            <p className="max-w-xl text-sm text-slate-500">
              Klientům se blíží výročí smlouvy – zavolej a projdi krytí dřív, než to udělá konkurence.
            </p>
          </div>

          <div className="relative mt-4 grid grid-cols-2 gap-3 px-3 sm:grid-cols-3">
            <StatTile
              icon={Flame}
              label="Tento týden"
              value={urgentCount}
              gradient="bg-[linear-gradient(135deg,#fb7185_0%,#be123c_100%)]"
              glow="shadow-[0_10px_22px_rgba(190,18,60,0.28)]"
            />
            <StatTile
              icon={Target}
              label={`V okně ${windowDays} dní`}
              value={radarItems.length}
              gradient="bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)]"
              glow="shadow-[0_10px_22px_rgba(67,56,202,0.26)]"
            />
            <StatTile
              icon={PartyPopper}
              label="Vyřízeno"
              value={handledCount}
              gradient="bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)]"
              glow="shadow-[0_10px_22px_rgba(4,120,87,0.26)]"
            />
          </div>
        </header>

        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            {WINDOW_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  windowDays === days
                    ? "bg-[linear-gradient(135deg,#334155_0%,#0f172a_100%)] !text-white shadow-[0_6px_16px_rgba(15,23,42,0.28)]"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                <span className={windowDays === days ? "!text-white" : ""}>
                  {days} dní
                </span>
              </button>
            ))}
          </div>

          {canShowTeam && (
            <button
              type="button"
              onClick={() => setShowTeam((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                showTeam
                  ? "border-indigo-500 bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)] text-white shadow-[0_6px_16px_rgba(67,56,202,0.3)]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Tým
            </button>
          )}

          <button
            type="button"
            onClick={() => setHideReviewed((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"
          >
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                hideReviewed ? "bg-emerald-500" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  hideReviewed ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </span>
            Skrýt vyřízené
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {visibleItems.length} výročí{handledCount > 0 ? ` · ${handledCount} vyřízeno` : ""}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              disabled={visibleItems.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_18px_rgba(15,23,42,0.1)] disabled:pointer-events-none disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </section>

        {truncated && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            Zobrazuje se první dávka smluv. Pro úplný přehled velkého portfolia použij filtr „Výročí“ přímo ve
            Smlouvách.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</div>
        )}

        <section className="space-y-6">
          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,#818cf8_0%,#4338ca_100%)] text-white shadow-[0_12px_26px_rgba(67,56,202,0.3)]">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="text-sm font-medium text-slate-700">
                V tomto okně nikomu nekončí výročí smlouvy.
              </div>
              <div className="text-xs text-slate-400">Zkus zvětšit okno nebo zapnout pohled na tým.</div>
            </div>
          ) : (
            groups.map((group) => {
              const meta = TONE_META[group.tone];
              return (
                <div key={group.tone} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span
                      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white ${meta.chipBg}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">{group.items.length}</span>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const review = reviewRecords.get(item.key);
                      const isHandled = isReviewHandled(review, item.occurrenceKey);
                      const activeOutcome = isCurrentReview(review, item.occurrenceKey)
                        ? review?.contactOutcome ?? null
                        : null;
                      const ActiveOutcomeIcon = outcomeIcon(activeOutcome);
                      const isExpanded = expandedKeys.has(item.key);
                      const isPending = pendingKeys.has(item.key);
                      const savedNote = isCurrentReview(review, item.occurrenceKey) ? review?.note ?? "" : "";
                      const meetingAt = isCurrentReview(review, item.occurrenceKey)
                        ? review?.meetingAt ?? null
                        : null;
                      const noteDraft = noteDrafts.get(item.key) ?? savedNote;
                      const noteDirty = noteDraft.trim() !== savedNote.trim();
                      const tone = TONE_META[group.tone];
                      const delay = Math.min(renderIndex, 8) * 40;
                      renderIndex += 1;
                      return (
                        <article
                          key={item.key}
                          className={`animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-2xl border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(15,23,42,0.1)] ${
                            isHandled ? "border-violet-200 opacity-80" : "border-slate-200"
                          }`}
                          style={{ animationDelay: `${delay}ms`, animationDuration: "450ms" }}
                        >
                          <div className={`h-1 ${meta.strip}`} />
                          <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                            <UrgencyRing daysLeft={item.daysLeft} windowDays={windowDays} color={tone.ring} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="truncate text-sm font-semibold text-slate-950">
                                  {item.clientName}
                                </span>
                                {item.contractNumber && (
                                  <span className="text-xs text-slate-400">#{item.contractNumber}</span>
                                )}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {productLabel(item.product)}
                                {productInstitutionLabel(item.product)
                                  ? ` · ${productInstitutionLabel(item.product)}`
                                  : ""}
                                {showTeam && item.ownerEmail !== effectiveUserEmail
                                  ? ` · ${item.ownerEmail}`
                                  : ""}
                              </div>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-sm font-semibold ${
                                  group.tone === "urgent" ? "text-rose-700" : "text-slate-900"
                                }`}
                              >
                                za {formatDaysLeft(item.daysLeft)}
                              </div>
                              <div className="text-xs text-slate-400">
                                {item.next.toLocaleDateString("cs-CZ")}
                                {item.anniversaryNumber != null ? ` · ${item.anniversaryNumber}. výročí` : ""}
                              </div>
                            </div>
                            <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:min-w-[210px] sm:items-end">
                              {isHandled ? (
                                <>
                                  <span className="anniversary-purple-fill inline-flex max-w-full items-center gap-1.5 rounded-full bg-violet-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(109,40,217,0.22)]">
                                    <ActiveOutcomeIcon className="h-3.5 w-3.5 shrink-0 text-white" aria-hidden="true" />
                                    <span className="truncate text-white">
                                      {outcomeLabel(activeOutcome) || "Zkontrolováno"}
                                    </span>
                                  </span>
                                  {meetingAt && (
                                    <span className="max-w-full truncate text-[11px] font-semibold text-violet-700">
                                      {formatMeetingAt(meetingAt)}
                                    </span>
                                  )}
                                  {savedNote && (
                                    <span className="max-w-[260px] truncate text-[11px] text-slate-500">
                                      {savedNote}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[11px] font-semibold text-slate-400">
                                  Zatím nezpracováno
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => openContactDialog(item)}
                                className="anniversary-purple-fill inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-violet-700 bg-violet-700 px-3 text-xs font-bold text-white shadow-[0_8px_18px_rgba(109,40,217,0.2)] transition hover:bg-violet-800 disabled:opacity-50"
                              >
                                {isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-hidden="true" />
                                ) : (
                                  <PhoneCall className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                                )}
                                {isHandled ? "Upravit" : "Kontakt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => openContractDetailWindow(item)}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 hover:shadow-[0_8px_18px_rgba(109,40,217,0.12)]"
                                title="Zobrazit smlouvu"
                                aria-label={`Otevřít smlouvu ${item.contractNumber ?? item.clientName}`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Smlouva</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(item.key)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                                title="Kontrolní body"
                              >
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="animate-in fade-in slide-in-from-top-1 border-t border-slate-100 bg-slate-50 px-4 py-3 duration-200">
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
        </section>
      </div>
      {contactDialog ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-3 py-4 backdrop-blur-md sm:px-5 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Výsledek kontaktu"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeContactDialog();
            }
          }}
        >
          <div className="w-[min(620px,94vw)] overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_36px_92px_rgba(2,6,23,0.38)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7f1ff_100%)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">
                  Výsledek kontaktu
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

            <div className="space-y-5 px-5 py-5">
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
                    Poznámka k výročí
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
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                    Vymazat výsledek
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
                    "Uložit výsledek"
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
