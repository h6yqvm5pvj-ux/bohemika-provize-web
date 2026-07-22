"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  FileWarning,
  GitCompareArrows,
  Info,
  Link2Off,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { AppLayout } from "@/components/AppLayout";

type HealthCheckSeverity = "ok" | "info" | "warning" | "critical";
type HealthCheckStatus = "pass" | "warn" | "fail";

type HealthSample = {
  label: string;
  detail?: string;
  href?: string;
  ownerEmail?: string | null;
  entryId?: string | null;
  contractNumber?: string | null;
  productKey?: string | null;
  meta?: Record<string, string | number | boolean | null>;
  duplicateMembers?: DuplicateContractMember[];
};

type DuplicateContractMember = {
  ownerEmail: string;
  entryId: string;
  href: string;
  contractNumber: string;
  clientName: string | null;
  productKey: string | null;
  signedDateMs: number | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  total: number | null;
  paid: boolean | null;
  status: string | null;
};

type HealthCheck = {
  key: string;
  title: string;
  severity: HealthCheckSeverity;
  status: HealthCheckStatus;
  count: number;
  scanned: number;
  truncated?: boolean;
  description: string;
  samples: HealthSample[];
};

type DataHealthResponse = {
  ok: true;
  generatedAtMs: number;
  generatedAtIso: string;
  generatedBy: string;
  durationMs: number;
  limits: {
    scanLimit: number;
    sampleLimit: number;
    maxScanLimit: number;
  };
  scanned: {
    users: number | null;
    entries: number | null;
    contractRefs: number | null;
    commissionStatements: number | null;
    teamOverviewTotals: number | null;
  };
  summary: {
    checks: number;
    passed: number;
    warnings: number;
    failed: number;
    critical: number;
    totalFindings: number;
    truncatedChecks: number;
  };
  checks: HealthCheck[];
} & Record<string, unknown>;

type DeleteDuplicateResponse = {
  ok: true;
  deleted?: number;
  remainingDuplicates?: number;
  warnings?: string[];
} & Record<string, unknown>;

type RefreshTeamTotalsResponse = {
  ok: true;
  rebuiltOwners: number;
  scannedEntries: number;
  consumedEntries: number;
  deletedOrphanTotals: number;
  yearMonth: string;
  previousMonth: string;
} & Record<string, unknown>;

const numberFormatter = new Intl.NumberFormat("cs-CZ");

const SCAN_LIMITS = [500, 2_000, 5_000, 8_000];

const severityMeta: Record<
  HealthCheckSeverity,
  {
    label: string;
    Icon: LucideIcon;
    badgeClass: string;
    borderClass: string;
    iconClass: string;
  }
> = {
  ok: {
    label: "OK",
    Icon: CheckCircle2,
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    borderClass: "border-slate-200",
    iconClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  info: {
    label: "Info",
    Icon: Info,
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    borderClass: "border-sky-200",
    iconClass: "border-sky-200 bg-sky-50 text-sky-700",
  },
  warning: {
    label: "Pozor",
    Icon: AlertTriangle,
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
    borderClass: "border-amber-200",
    iconClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  critical: {
    label: "Kritické",
    Icon: XCircle,
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
    borderClass: "border-rose-200",
    iconClass: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const checkIcons: Record<string, LucideIcon> = {
  duplicateContractNumbers: FileWarning,
  orphanContractRefs: Link2Off,
  missingManagerChain: UsersRound,
  productDrift: GitCompareArrows,
  unmatchedCommissionStatements: ReceiptText,
  suspiciousStornos: ShieldAlert,
  staleTeamTotals: Database,
};

const loadingChecks: Array<{
  label: string;
  detail: string;
  Icon: LucideIcon;
  iconClass: string;
  barClass: string;
}> = [
  {
    label: "contractRefs",
    detail: "kontrola vazeb",
    Icon: Link2Off,
    iconClass: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
    barClass: "from-cyan-300 via-sky-300 to-cyan-200",
  },
  {
    label: "Duplicity",
    detail: "čísla smluv",
    Icon: FileWarning,
    iconClass: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    barClass: "from-amber-300 via-orange-300 to-amber-200",
  },
  {
    label: "managerChain",
    detail: "nadřízení",
    Icon: UsersRound,
    iconClass: "border-violet-300/30 bg-violet-300/10 text-violet-200",
    barClass: "from-violet-300 via-fuchsia-300 to-violet-200",
  },
  {
    label: "Výpisy",
    detail: "provize",
    Icon: ReceiptText,
    iconClass: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    barClass: "from-emerald-300 via-teal-300 to-emerald-200",
  },
  {
    label: "Rules",
    detail: "produkty",
    Icon: GitCompareArrows,
    iconClass: "border-rose-300/30 bg-rose-300/10 text-rose-200",
    barClass: "from-rose-300 via-pink-300 to-rose-200",
  },
  {
    label: "Součty",
    detail: "read modely",
    Icon: Database,
    iconClass: "border-slate-300/30 bg-white/10 text-slate-100",
    barClass: "from-slate-200 via-white to-slate-300",
  },
];

const metaLabels: Record<string, string> = {
  uniqueContracts: "Počet smluv",
  expectedManager: "Očekávaný manager",
  chainLength: "Délka chainu",
  chainRowEmail: "Řádek chainu",
  inCatalog: "Katalog",
  inFormulas: "API/formule",
  inRules: "Rules",
  statementPeriod: "Období",
  notFound: "Nenalezené",
  ambiguous: "Duplicitní",
  errors: "Chyby",
  status: "Status",
  contractSignedDateMs: "Podpis",
  stornoDateMs: "Storno",
  position: "Pozice",
  modelVersion: "Model",
  updatedAtMs: "Aktualizace",
};

const formatDateTime = (value: number | string | null | undefined): string => {
  if (value == null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${numberFormatter.format(Math.round(ms))} ms`;
  return `${(ms / 1000).toLocaleString("cs-CZ", {
    maximumFractionDigits: 1,
  })} s`;
};

const formatMoney = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} Kč`;
};

const formatMetaValue = (
  key: string,
  value: string | number | boolean | null | undefined
): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ano" : "Ne";
  if (typeof value === "number") {
    if (key.endsWith("AtMs") || key.endsWith("DateMs")) return formatDateTime(value);
    return numberFormatter.format(value);
  }
  return value;
};

function DataHealthLoading({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-white shadow-sm"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <style>{`
          @keyframes data-health-meter {
            0% { transform: translateX(-120%); }
            55% { transform: translateX(55%); }
            100% { transform: translateX(130%); }
          }

          .data-health-meter {
            animation: data-health-meter 1.45s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .data-health-meter {
              animation: none;
              transform: translateX(0);
            }
          }
        `}</style>
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold">Obnovuju diagnostiku</div>
              <div className="text-xs font-semibold text-slate-300">
                Skenuju nejčerstvější stav dat.
              </div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <span className="data-health-meter block h-full w-1/2 rounded-full bg-gradient-to-r from-cyan-300 via-white to-emerald-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <style>{`
        @keyframes data-health-scan {
          0% { transform: translateY(-80%); opacity: 0; }
          18% { opacity: 1; }
          72% { opacity: 1; }
          100% { transform: translateY(170%); opacity: 0; }
        }

        @keyframes data-health-meter {
          0% { transform: translateX(-120%); }
          55% { transform: translateX(55%); }
          100% { transform: translateX(130%); }
        }

        @keyframes data-health-glow {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50% { opacity: 1; transform: scale(1); }
        }

        .data-health-grid {
          background-image:
            linear-gradient(rgba(148, 163, 184, 0.13) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.13) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        .data-health-scan {
          animation: data-health-scan 1.9s ease-in-out infinite;
        }

        .data-health-meter {
          animation: data-health-meter 1.55s ease-in-out infinite;
        }

        .data-health-glow {
          animation: data-health-glow 1.4s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .data-health-scan,
          .data-health-meter,
          .data-health-glow {
            animation: none;
            transform: none;
          }
        }
      `}</style>

      <div className="relative overflow-hidden border-b border-slate-200 bg-slate-950 px-4 py-5 text-white sm:px-5">
        <div className="data-health-grid absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" aria-hidden="true" />

        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="data-health-glow inline-flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
                <Activity className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-bold">Spouštím datovou diagnostiku</div>
                <div className="mt-1 text-sm font-semibold text-slate-300">
                  Prověřuju smlouvy, indexy, provize a týmové součty.
                </div>
              </div>
            </div>

            <div className="relative mt-5 h-36 overflow-hidden rounded-lg border border-white/10 bg-slate-900/80">
              <div className="data-health-grid absolute inset-0 opacity-60" aria-hidden="true" />
              <div
                className="data-health-scan absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-cyan-300/0 via-cyan-300/30 to-cyan-300/0"
                aria-hidden="true"
              />
              <div className="relative grid h-full content-center gap-3 p-4">
                {[0, 1, 2, 3].map((line) => (
                  <div key={line} className="grid grid-cols-[5rem_minmax(0,1fr)_3rem] items-center gap-3">
                    <span className="h-2 rounded-full bg-white/15" />
                    <span className="h-2 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="data-health-meter block h-full w-2/5 rounded-full bg-gradient-to-r from-cyan-300 via-white to-emerald-300"
                        style={{ animationDelay: `${line * 130}ms` }}
                      />
                    </span>
                    <span className="h-2 rounded-full bg-white/15" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {loadingChecks.slice(0, 4).map(({ label, detail, Icon, iconClass }, index) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2"
                style={{ animationDelay: `${index * 110}ms` }}
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconClass}`}>
                  <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{label}</div>
                  <div className="truncate text-xs font-semibold text-slate-300">{detail}</div>
                </div>
                <span className="ml-auto h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.8)]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {loadingChecks.map(({ label, detail, Icon, barClass }, index) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-white">
                <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-950">{label}</div>
                <div className="truncate text-xs font-semibold text-slate-500">{detail}</div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <span
                className={`data-health-meter block h-full w-2/3 rounded-full bg-gradient-to-r ${barClass}`}
                style={{ animationDelay: `${index * 120}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  tone: "slate" | "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${toneClass}`}>
          <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
        {typeof value === "number" ? numberFormatter.format(value) : value}
      </div>
    </div>
  );
}

function CheckCard({
  check,
  currentUser,
  onRefresh,
}: {
  check: HealthCheck;
  currentUser: FirebaseUser | null;
  onRefresh: () => Promise<void>;
}) {
  const severity = severityMeta[check.severity] ?? severityMeta.info;
  const CheckIcon = checkIcons[check.key] ?? Activity;
  const SeverityIcon = severity.Icon;
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [repairingKey, setRepairingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const canRefreshTeamTotals = check.key === "staleTeamTotals" && check.count > 0;
  const isRepairingTeamTotals = repairingKey === "staleTeamTotals";

  const handleRefreshTeamTotals = async () => {
    if (!currentUser || !canRefreshTeamTotals) return;

    setRepairingKey("staleTeamTotals");
    setActionError(null);
    setActionStatus(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<RefreshTeamTotalsResponse>(
        currentUser,
        "/api/admin/data-health",
        {
          method: "POST",
          body: JSON.stringify({
            action: "refreshTeamOverviewTotals",
          }),
        }
      );
      setActionStatus(
        `Týmové součty přepočteny pro ${numberFormatter.format(
          payload.rebuiltOwners
        )} uživatelů. Zpracováno smluv: ${numberFormatter.format(
          payload.consumedEntries
        )}. Osiřelé součty smazány: ${numberFormatter.format(payload.deletedOrphanTotals)}.`
      );
      await onRefresh();
    } catch (repairError) {
      setActionError(repairError instanceof Error ? repairError.message : String(repairError));
    } finally {
      setRepairingKey(null);
    }
  };

  const handleDeleteDuplicate = async (
    sample: HealthSample,
    member: DuplicateContractMember
  ) => {
    if (!currentUser) return;
    const key = `${sample.label}::${member.ownerEmail}::${member.entryId}`;
    if (confirmDeleteKey !== key) {
      setConfirmDeleteKey(key);
      setActionError(null);
      setActionStatus(null);
      return;
    }

    setDeletingKey(key);
    setActionError(null);
    setActionStatus(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<DeleteDuplicateResponse>(
        currentUser,
        "/api/admin/data-health",
        {
          method: "DELETE",
          body: JSON.stringify({
            action: "deleteDuplicateContract",
            ownerEmail: member.ownerEmail,
            entryId: member.entryId,
            contractNumber: member.contractNumber || sample.contractNumber || sample.label,
            confirmContractNumber: sample.contractNumber || sample.label,
          }),
        }
      );
      const warnings = Array.isArray(payload.warnings) && payload.warnings.length > 0
        ? ` Upozornění: ${payload.warnings.join(" ")}`
        : "";
      setActionStatus(
        `Smlouva ${member.contractNumber} byla smazána. Zbývá duplicit: ${
          payload.remainingDuplicates ?? "?"
        }.${warnings}`
      );
      setConfirmDeleteKey(null);
      await onRefresh();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <article className={`rounded-lg border bg-white p-4 ${severity.borderClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${severity.iconClass}`}>
            <CheckIcon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-slate-950">
              {check.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{check.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canRefreshTeamTotals ? (
            <button
              type="button"
              onClick={() => void handleRefreshTeamTotals()}
              disabled={!currentUser || Boolean(repairingKey)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRepairingTeamTotals ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
              )}
              Přepočítat součty
            </button>
          ) : null}
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${severity.badgeClass}`}>
            <SeverityIcon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
            {severity.label}
          </span>
          {check.truncated ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              Limit
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-y border-slate-100 py-3 sm:grid-cols-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Nálezy
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {numberFormatter.format(check.count)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Projito
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {numberFormatter.format(check.scanned)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Stav
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {check.status === "pass"
              ? "Bez nálezu"
              : check.status === "fail"
                ? "Selhalo"
                : "Nález"}
          </div>
        </div>
      </div>

      {actionStatus ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {actionStatus}
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {actionError}
        </div>
      ) : null}

      {check.samples.length > 0 ? (
        <div className="mt-4 divide-y divide-slate-100">
          {check.samples.map((sample, index) => (
            <div key={`${check.key}-${sample.label}-${index}`} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-slate-950">
                    {sample.label}
                  </div>
                  {sample.detail ? (
                    <div className="mt-1 break-words text-sm leading-6 text-slate-600">
                      {sample.detail}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                    {sample.ownerEmail ? <span>{sample.ownerEmail}</span> : null}
                    {sample.entryId ? <span>{sample.entryId}</span> : null}
                    {sample.productKey ? <span>{sample.productKey}</span> : null}
                  </div>
                </div>
                {sample.href ? (
                  <Link
                    href={sample.href}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                    Detail
                  </Link>
                ) : null}
              </div>
              {sample.meta && Object.keys(sample.meta).length > 0 ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(sample.meta).map(([key, value]) => (
                    <div key={key} className="min-w-0 border-l border-slate-200 pl-3">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {metaLabels[key] ?? key}
                      </dt>
                      <dd className="mt-0.5 break-words text-xs font-semibold text-slate-700">
                        {formatMetaValue(key, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {sample.duplicateMembers && sample.duplicateMembers.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <div className="grid gap-0 divide-y divide-slate-200">
                    {sample.duplicateMembers.map((member) => {
                      const deleteKey = `${sample.label}::${member.ownerEmail}::${member.entryId}`;
                      const isConfirming = confirmDeleteKey === deleteKey;
                      const isDeleting = deletingKey === deleteKey;
                      return (
                        <div
                          key={deleteKey}
                          className="grid gap-3 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="break-words text-sm font-bold text-slate-950">
                                {member.clientName || "Bez klienta"}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {member.productKey || "bez produktu"}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  member.paid
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {member.paid ? "Zaplaceno" : "Nezaplaceno"}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                              <span>{member.ownerEmail}</span>
                              <span>{member.entryId}</span>
                              <span>Podpis: {formatDateTime(member.signedDateMs)}</span>
                              <span>Vytvořeno: {formatDateTime(member.createdAtMs)}</span>
                              <span>Total: {formatMoney(member.total)}</span>
                              {member.status ? <span>Status: {member.status}</span> : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Link
                              href={member.href}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <ExternalLink
                                className="h-3.5 w-3.5"
                                strokeWidth={2.2}
                                aria-hidden="true"
                              />
                              Detail
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleDeleteDuplicate(sample, member)}
                              disabled={!currentUser || Boolean(deletingKey)}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                isConfirming
                                  ? "border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
                                  : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                              }`}
                            >
                              {isDeleting ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  strokeWidth={2.2}
                                  aria-hidden="true"
                                />
                              ) : (
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2.2}
                                  aria-hidden="true"
                                />
                              )}
                              {isConfirming ? "Potvrdit smazání" : "Smazat"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
          Bez vzorků.
        </div>
      )}
    </article>
  );
}

export default function AdminDataHealthPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [scanLimit, setScanLimit] = useState(2_000);
  const [data, setData] = useState<DataHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const loadData = useCallback(
    async (currentUser: FirebaseUser | null = auth.currentUser) => {
      if (!currentUser) return;
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<DataHealthResponse>(
          currentUser,
          `/api/admin/data-health?limit=${scanLimit}&sample=12`
        );
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [scanLimit]
  );

  useEffect(() => {
    if (!authReady || !user) return;
    void loadData(user);
  }, [authReady, loadData, user]);

  const scannedEntries = useMemo(() => {
    if (!data) return [];
    return [
      ["Uživatelé", data.scanned.users],
      ["Smlouvy", data.scanned.entries],
      ["contractRefs", data.scanned.contractRefs],
      ["Výpisy", data.scanned.commissionStatements],
      ["Týmové součty", data.scanned.teamOverviewTotals],
    ] as Array<[string, number | null]>;
  }, [data]);

  return (
    <AppLayout active="admin">
      <div className="w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/zadosti"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Admin
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Data Health
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>
                Vygenerováno: {data ? formatDateTime(data.generatedAtMs) : "—"}
              </span>
              <span>Trvání: {data ? formatDuration(data.durationMs) : "—"}</span>
              <span>Admin: {data?.generatedBy ?? user?.email ?? "—"}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <Database className="h-4 w-4 text-slate-500" strokeWidth={2.2} aria-hidden="true" />
              <select
                value={scanLimit}
                onChange={(event) => setScanLimit(Number(event.target.value))}
                className="bg-transparent text-sm font-semibold text-slate-800 outline-none"
              >
                {SCAN_LIMITS.map((limit) => (
                  <option key={limit} value={limit}>
                    {numberFormatter.format(limit)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={!user || loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              )}
              {loading ? "Kontroluju" : "Refresh"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {!data && loading ? (
          <DataHealthLoading />
        ) : null}

        {data ? (
          <>
            {loading ? <DataHealthLoading compact /> : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Nálezy"
                value={data.summary.totalFindings}
                Icon={Activity}
                tone={data.summary.totalFindings > 0 ? "amber" : "emerald"}
              />
              <StatTile
                label="OK kontroly"
                value={data.summary.passed}
                Icon={CheckCircle2}
                tone="emerald"
              />
              <StatTile
                label="Varování"
                value={data.summary.warnings}
                Icon={AlertTriangle}
                tone={data.summary.warnings > 0 ? "amber" : "slate"}
              />
              <StatTile
                label="Selhání"
                value={data.summary.failed}
                Icon={XCircle}
                tone={data.summary.failed > 0 ? "rose" : "slate"}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
                {scannedEntries.map(([label, value]) => (
                  <span key={label}>
                    <span className="font-semibold text-slate-900">{label}:</span>{" "}
                    {value == null ? "—" : numberFormatter.format(value)}
                  </span>
                ))}
                <span>
                  <span className="font-semibold text-slate-900">Limitované kontroly:</span>{" "}
                  {numberFormatter.format(data.summary.truncatedChecks)}
                </span>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {data.checks.map((check) => (
                <CheckCard
                  key={check.key}
                  check={check}
                  currentUser={user}
                  onRefresh={() => loadData(user)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
