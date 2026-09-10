"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CalendarDays,
  CarFront,
  Check,
  ChevronDown,
  FileText,
  Fuel,
  Palette,
  Zap,
  ChevronRight,
  ClipboardCopy,
  Gauge,
  History,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJson } from "@/app/lib/authenticatedApi";
import { isValidVehicleQuery, normalizeVehicleQuery } from "@/app/lib/vehicleLookupQuery";
import { VehicleAdditionalChecks } from "./VehicleAdditionalChecks";
import { VehicleVignette } from "./VehicleVignette";
import type {
  VehicleLookupResponse, VehicleChecks, VehicleReportPayload, VehicleReportSummary,
  VehicleReportStkStatus, VehicleReportHero, VehicleReportValuation, VehicleReportTechnical,
  VehicleReportTechnicalSection, VehicleReportOwnerRow, VehicleReportInspectionRow,
  VehicleReportOdometerRow, VehicleReportValuationMileageRow, VehicleReportTechnicalRow,
} from "@/app/lib/vehicleReport";
import { type SautoMarketResponse } from "../naceneni-vozidla/types";
import {
  buildVehicleValuationEstimate,
  roundTo,
  type VehicleValuationSummary,
} from "../naceneni-vozidla/valuation";
import { VehicleIntro, VehicleLoader } from "./VehicleScenes";
import { VehicleSearchForm } from "./VehicleSearchForm";
import { VehicleIllustration } from "./VehicleIllustration";
import { VehicleReportIllustration } from "./VehicleReportIllustrations";
import { VehicleBrandLogo } from "./VehicleBrandLogo";
import { VehicleValuePanels } from "./VehicleValuePanels";
import { VehicleMileageHistory } from "./VehicleMileageHistory";
import { buildMileageScenarios } from "./vehicleValueDisplay";
import reportStyles from "./vehicleReport.module.css";
import styles from "./vehicleAudit.module.css";

type VehicleData = Record<string, unknown>;

type LookupResult = {
  vin?: unknown;
  forUser?: unknown;
  payload?: {
    Status?: unknown;
    Data?: VehicleData;
  };
};

type VehicleSummary = VehicleValuationSummary & {
  model: string;
  firstRegistrationLabel: string;
  displacement: number | null;
  color: string;
  status: string;
  categoryLabel: string;
  stkDoLabel: string;
  ownerCountLabel: string;
  operatorCountLabel: string;
};

type PatternRow = {
  path: string;
  key: string;
  valueLabel: string;
  numericValue: number | null;
  date: Date | null;
};

type StkCheck = {
  id: string;
  date: Date | null;
  dateLabel: string;
  mileageKm: number | null;
  typeLabel: string;
  resultLabel: string;
  isPassed: boolean | null;
  defectsText?: string;
  stationLabel: string;
  protocolLabel: string;
  sourceLabel: string;
};

type OwnerRecord = {
  id: string;
  order: number;
  name: string;
  roleLabel: string;
  icoLabel: string;
  addressLabel: string;
  fromDate: Date | null;
  toDate: Date | null;
  fromLabel: string;
  toLabel: string;
  isCurrent: boolean;
};

type MileagePoint = {
  label: string;
  date: Date | null;
  km: number;
};

type MileagePriceRow = {
  label: string;
  km: number;
  price: number;
  highlighted: boolean;
  widthPercent?: number | null;
};

type SpecPair = {
  label: string;
  value: string;
};

type SpecSection = {
  title: string;
  rows: Array<{ left: SpecPair; right: SpecPair }>;
};

const MAX_PATTERN_ROWS = 100;


const MILEAGE_PATTERNS = ["najet", "najezd", "tachometr", "kilometr", "km"];
const DATE_PATTERNS = ["datum", "date", "cas", "time", "od", "do", "rok"];

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function safeStr(value: unknown): string {
  if (!hasValue(value)) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const normalizeVinInput = normalizeVehicleQuery;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!hasValue(value)) return null;

  const raw = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const matches = raw.match(/-?\d[\d\s.,]*/g);
  if (!matches?.length) return null;

  const normalizeChunk = (chunk: string): number | null => {
    let normalized = chunk.trim().replace(/\s+/g, "");
    if (!normalized) return null;

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");
      if (lastComma > lastDot) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
      } else {
        normalized = normalized.replace(/,/g, "");
      }
    } else if (hasComma) {
      normalized = /,\d{1,2}$/.test(normalized)
        ? normalized.replace(",", ".")
        : normalized.replace(/,/g, "");
    } else if (hasDot) {
      normalized = /\.\d{1,2}$/.test(normalized)
        ? normalized
        : normalized.replace(/\./g, "");
    }

    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  };

  for (const chunk of matches) {
    const parsed = normalizeChunk(chunk);
    if (parsed != null) return parsed;
  }
  return null;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["true", "1", "ano", "yes"].includes(normalized)) return true;
    if (["false", "0", "ne", "no"].includes(normalized)) return false;
  }
  return null;
}

function isPlausibleMileage(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 1_000 && value <= 2_000_000;
}

function firstOf(data: VehicleData | null, keys: string[]): unknown {
  if (!data) return null;
  for (const key of keys) {
    if (key in data && hasValue(data[key])) return data[key];
  }
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isStringObject(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((item) => typeof item === "string");
}

function parseDateLoose(value: unknown): Date | null {
  if (!hasValue(value)) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1900 && value <= 2100) {
      return new Date(Date.UTC(Math.round(value), 0, 1));
    }
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d{4}$/.test(text)) {
    const year = Number(text);
    if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
      return new Date(Date.UTC(year, 0, 1));
    }
  }

  const normalized = text.replace(/\./g, "-").replace(/\//g, "-");
  const euMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (euMatch) {
    const day = Number(euMatch[1]);
    const month = Number(euMatch[2]);
    const year = Number(euMatch[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateCs(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("cs-CZ");
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("cs-CZ")} Kč`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("cs-CZ");
}

function formatKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("cs-CZ")} km`;
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

function hasPattern(key: string, patterns: string[]): boolean {
  const normalized = normalizeText(key);
  return patterns.some((pattern) => normalized.includes(pattern));
}

function valueToLabel(value: unknown): string {
  if (!hasValue(value)) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => valueToLabel(item))
      .filter((item) => item !== "—")
      .slice(0, 4)
      .join(" · ");
  }
  if (isStringObject(value)) {
    const pairs = Object.entries(value)
      .slice(0, 4)
      .map(([key, item]) => `${key}: ${item}`);
    return pairs.join(" · ") || "—";
  }
  return "—";
}

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function findDateInObject(row: Record<string, unknown>): Date | null {
  for (const [key, value] of Object.entries(row)) {
    if (!hasPattern(key, DATE_PATTERNS)) continue;
    const date = parseDateLoose(value);
    if (date) return date;
  }
  return null;
}

function collectPatternRows(data: VehicleData | null, patterns: string[], limit = MAX_PATTERN_ROWS): PatternRow[] {
  if (!data) return [];

  const out: PatternRow[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, path: string[], parentObject: Record<string, unknown> | null) => {
    if (out.length >= limit) return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path, `[${index}]`], parentObject));
      return;
    }

    const row = readObject(node);
    if (!row) return;

    const ownDate = findDateInObject(row) ?? (parentObject ? findDateInObject(parentObject) : null);

    for (const [key, value] of Object.entries(row)) {
      const nextPath = [...path, key];
      if (hasPattern(key, patterns) && hasValue(value)) {
        const valueLabel = valueToLabel(value);
        if (valueLabel !== "—") {
          const entryPath = nextPath.join(" › ");
          const signature = `${entryPath}|${valueLabel}`;
          if (!seen.has(signature)) {
            seen.add(signature);
            out.push({
              key: humanizeKey(key),
              path: entryPath,
              valueLabel,
              numericValue: toNumber(value),
              date: ownDate,
            });
            if (out.length >= limit) return;
          }
        }
      }

      walk(value, nextPath, row);
      if (out.length >= limit) return;
    }
  };

  walk(data, [], data);
  return out;
}

function readApiError(payload: unknown): string | null {
  const row = readObject(payload);
  if (!row) return null;
  const error = row.error ?? row.message ?? row.detail;
  if (typeof error === "string" && error.trim().length > 0) return error.trim();
  return null;
}

function isSautoMarketResponse(payload: unknown): payload is SautoMarketResponse {
  const row = readObject(payload);
  return row?.ok === true && row.source === "sauto" && Array.isArray(row.listings) && readObject(row.stats) != null;
}

function parsePowerKwFromLabel(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*kW/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeVehicleOwnerRecords(rows: VehicleReportOwnerRow[]): OwnerRecord[] {
  const mapped = rows
    .map((raw, idx, arr) => {
      const row = raw as VehicleReportOwnerRow;
      const fromDate = parseDateLoose(row.fromIso);
      const toDate = parseDateLoose(row.toIso);
      const name = safeStr(row.name);
      const roleLabel = safeStr(row.roleLabel);
      const icoLabel = safeStr(row.icoLabel);
      const addressLabel = safeStr(row.addressLabel);

      return {
        id: `vehicle-owner-${idx}-${name}-${roleLabel}-${formatDateCs(fromDate)}-${formatDateCs(toDate)}`,
        order: arr.length - idx,
        name: name === "—" ? "Neuvedený subjekt" : name,
        roleLabel: roleLabel === "—" ? "Evidovaný subjekt" : roleLabel,
        icoLabel: icoLabel === "—" ? "IČO neuvedeno" : icoLabel,
        addressLabel: addressLabel === "—" ? "Adresa neuvedena" : addressLabel,
        fromDate,
        toDate,
        fromLabel: formatDateCs(fromDate),
        toLabel: toDate ? formatDateCs(toDate) : row.isCurrent === true ? "dosud" : "Neuvedeno",
        isCurrent: row.isCurrent === true,
      } satisfies OwnerRecord;
    })
    .filter((row) => row.fromDate != null || row.toDate != null || row.name !== "Neuvedený subjekt");

  return mapped
    .sort((a, b) => (b.fromDate?.getTime() ?? -Infinity) - (a.fromDate?.getTime() ?? -Infinity))
    .map((row, idx, arr) => ({ ...row, order: arr.length - idx }));
}

function normalizeVehicleStkChecks(rows: VehicleReportInspectionRow[]): StkCheck[] {
  type ParsedStkRow = StkCheck & {
    groupKey: string;
    _defectCount: number | null;
    _severity: string;
  };

  const mapped: ParsedStkRow[] = rows.map((raw, idx) => {
    const row = raw as VehicleReportInspectionRow;
    const date = parseDateLoose(row.dateIso);
    const mileageRaw = toNumber(row.mileageKm);
    const mileage = isPlausibleMileage(mileageRaw) ? mileageRaw : null;
    const resultText = safeStr(row.resultLabel);
    const resultNum = toNumber(row.result);
    const resultNorm = normalizeText(resultText);
    const isPassed = resultNum === 1 ? true
      : /nezpus|nevyhov/.test(resultNorm) ? false
      : /zpusob|vyhov/.test(resultNorm) ? true : null;

    const typeLabelRaw = safeStr(row.inspectionTypeLabel);
    const typeNorm = normalizeText(typeLabelRaw);
    const typeLabel = typeLabelRaw === "—" ? "Typ neuveden" : typeLabelRaw;

    const sourceLabel =
      normalizeText(safeStr(row.sourceLabel)).includes("sme") || typeNorm.includes("sme") || safeStr(row.protocolLabel).startsWith("CZ-440")
        ? "SME"
        : "STK";

    const stationTown = safeStr(row.stationTown);
    const stationNo = safeStr(row.stationNumber);
    const stationLabel =
      stationTown !== "—" || stationNo !== "—"
        ? `Stanice #${stationNo === "—" ? "?" : stationNo}${stationTown === "—" ? "" : ` ${stationTown}`}`
        : "Stanice neuvedena";

    const protocolLabel = safeStr(row.protocolLabel) === "—" ? "Protokol neuveden" : safeStr(row.protocolLabel);
    const defectCount = toNumber(row.defectCount);
    const worstSeverity = safeStr(row.worstSeverity);
    const sameDayGroupId = safeStr(row.sameDayGroupId);
    const groupKey =
      sameDayGroupId !== "—"
        ? sameDayGroupId
        : (date?.toISOString().slice(0, 10) ?? `fallback-${idx}`);

    return {
      id: `vehicle-stk-${idx}-${protocolLabel}-${formatDateCs(date)}-${mileage ?? "no-km"}`,
      date,
      dateLabel: formatDateCs(date),
      mileageKm: mileage,
      typeLabel,
      resultLabel: resultText === "—" ? "Výsledek neuveden" : resultText,
      defectsText: safeStr(row.defectsText) === "—" ? undefined : safeStr(row.defectsText),
      isPassed,
      stationLabel,
      protocolLabel,
      sourceLabel,
      groupKey,
      _defectCount: defectCount,
      _severity: worstSeverity,
    };
  });

  return mapped.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
}

function normalizeVehicleMileageHistory(rows: VehicleReportOdometerRow[]): MileagePoint[] {
  const points = rows
    .map((raw) => {
      const row = raw as VehicleReportOdometerRow;
      const date = parseDateLoose(row.dateIso);
      const km = toNumber(row.km);
      if (!(date instanceof Date) || !isPlausibleMileage(km)) return null;
      return {
        date,
        km,
      };
    })
    .filter((row): row is { date: Date; km: number } => row != null);

  const unique = Array.from(
    new Map(points.map((row) => [`${row.date.toISOString()}|${row.km}`, row])).values()
  ).sort((a, b) => a.date.getTime() - b.date.getTime());

  return unique.map((row) => ({
    date: row.date,
    km: row.km,
    label: row.date.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" }),
  }));
}

function normalizeVehicleMileagePriceRows(rows: VehicleReportValuationMileageRow[]): MileagePriceRow[] {
  const out: MileagePriceRow[] = [];
  for (const raw of rows) {
    const row = raw as VehicleReportValuationMileageRow;
    const km = toNumber(row.km);
    const price = toNumber(row.price);
    if (!isPlausibleMileage(km) || price == null || !Number.isFinite(price) || price <= 0) continue;

    const widthPercent = toNumber(row.widthPercent);
    out.push({
      label: formatNumber(km),
      km,
      price,
      highlighted: toBool(row.highlighted) === true,
      widthPercent: widthPercent != null && Number.isFinite(widthPercent) ? widthPercent : null,
    });
  }

  out.sort((a, b) => a.km - b.km);
  return out;
}

function statusLabel(data: VehicleData | null): string {
  const raw = firstOf(data, [
    "VozidloStav",
    "StavVozidla",
    "StatusVozidla",
    "StatusNazev",
    "Provozovane",
    "VozidloProvozovane",
  ]);

  if (typeof raw === "boolean") return raw ? "PROVOZOVANÉ" : "MIMO PROVOZ";

  const s = safeStr(raw);
  if (s !== "—") return s.toUpperCase();

  const firstReg = firstOf(data, ["DatumPrvniRegistrace", "DatumPrvniRegistraceVCr"]);
  return hasValue(firstReg) ? "PROVOZOVANÉ" : "NEZNÁMÝ STAV";
}

function statusTone(status: string): "green" | "amber" {
  const normalized = status.toUpperCase();
  if (normalized.includes("PROVOZ") || normalized.includes("AKTIV")) return "green";
  return "amber";
}

function revealStyle(delayMs: number): CSSProperties {
  return { animationDelay: `${delayMs}ms` };
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "rose" }) {
  const styles: Record<typeof tone, string> = {
    neutral: "border-slate-200 bg-slate-100 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

function Tile({ title, value, subtitle, icon, tone = "neutral" }: { title: string; value: string; subtitle?: string; icon: ReactNode; tone?: "neutral" | "green" | "rose" | "amber" }) {
  return <div className={`${reportStyles.metric} ${tone === "rose" ? reportStyles.metricAlert : ""}`}>
    <div className={reportStyles.metricLabel}><span>{icon}</span><span>{title}</span></div>
    <div className={reportStyles.metricValue}>{value}</div>
    {subtitle && <p>{subtitle}</p>}
  </div>;
}

function StkCard({ check }: { check: StkCheck }) {
  return (
    <article className="rounded-3xl border border-violet-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-xl font-semibold text-slate-900">{check.dateLabel}</div>
          <div className="text-base font-semibold text-slate-600">{formatKm(check.mileageKm)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={check.sourceLabel === "SME" ? "amber" : "green"}>{check.sourceLabel}</Pill>
          <Pill>{check.typeLabel}</Pill>
          <Pill tone={check.isPassed === true ? "green" : check.isPassed === false ? "rose" : "neutral"}>{check.resultLabel}</Pill>
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:grid-cols-2">
        <div className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-slate-400" />
          {check.stationLabel}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <History className="h-4 w-4 text-slate-400" />
          {check.protocolLabel}
        </div>
        {check.defectsText && <p className="sm:col-span-2 whitespace-pre-wrap">Závady: {check.defectsText}</p>}
      </div>
    </article>
  );
}

function OwnerCard({ owner }: { owner: OwnerRecord }) {
  return (
    <article className={`rounded-3xl border bg-white p-4 ${owner.isCurrent ? "border-violet-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-slate-900">{owner.name}</div>
          <div className="mt-1 inline-flex items-center gap-2">
            <Pill tone={owner.isCurrent ? "green" : "neutral"}>{owner.roleLabel}</Pill>
            {owner.isCurrent && <Pill tone="green">Aktuální</Pill>}
          </div>
        </div>
        <div className="text-right text-sm font-semibold text-slate-500">#{owner.order}</div>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-600">
        <div className="inline-flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-slate-400" />
          {owner.icoLabel}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-slate-400" />
          {owner.addressLabel}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          {owner.fromLabel} <ChevronRight className="h-4 w-4" /> {owner.toLabel}
        </div>
      </div>
    </article>
  );
}

function CollapsibleSectionHeader({
  icon,
  title,
  subtitle,
  expanded,
  countLabel,
  controlsId,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  expanded: boolean;
  countLabel: string;
  controlsId: string;
  onToggle: () => void;
}) {
  return <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={controlsId} className={reportStyles.disclosure}>
    <span className={reportStyles.disclosureTitle}><span className={reportStyles.headingIcon}>{icon}</span><span><strong>{title}</strong><small>{subtitle}</small></span></span>
    <span className={reportStyles.disclosureEnd}><span>{countLabel}</span><ChevronDown size={16} className={expanded ? reportStyles.rotated : ""} /></span>
  </button>;
}

function TechnicalSection({ section }: { section: SpecSection }) {
  const pairs = section.rows.flatMap(row => [row.left, row.right]).filter(row => row.label && row.label !== "—");
  return <details className={reportStyles.technicalGroup} open={section.title === "Identifikace" || section.title.includes("doklady")}>
    <summary><span>{section.title}<small>{pairs.length} údajů</small></span><ChevronDown size={15} /></summary>
    <dl className={reportStyles.technicalRows}>{pairs.map((row, i) => <div key={`${row.label}-${i}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
  </details>;
}

export default function VehicleAuditPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [vin, setVin] = useState("");
  const [vinFromQuery, setVinFromQuery] = useState("");
  const [showRefineInputs, setShowRefineInputs] = useState(false);
  const [refineMileage, setRefineMileage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [vehicleReport, setVehicleReport] = useState<VehicleReportPayload | null>(null);
  const [vehicleChecks, setVehicleChecks] = useState<VehicleChecks | null>(null);
  const [lookupQuery, setLookupQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<"vin" | "orv" | "tp" | null>(null);
  const [searchActivated, setSearchActivated] = useState(false);
  const [stkExpanded, setStkExpanded] = useState(false);
  const [ownersExpanded, setOwnersExpanded] = useState(false);
  const lookupInFlightRef = useRef(false);
  const lookupVersionRef = useRef(0);

  const autoLookupVinRef = useRef<string | null>(null);
  const compactVinInputRef = useRef<HTMLInputElement | null>(null);
  const resultScrollTargetRef = useRef<HTMLDivElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  const [sautoLoading, setSautoLoading] = useState(false);
  const [sautoError, setSautoError] = useState<string | null>(null);
  const [sautoMarket, setSautoMarket] = useState<SautoMarketResponse | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (authUser) => setUser(authUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queryVin = normalizeVinInput(new URLSearchParams(window.location.search).get("vin"));
    setVinFromQuery(queryVin);
  }, []);

  useEffect(() => {
    if (!vinFromQuery) return;
    setVin(vinFromQuery);
  }, [vinFromQuery]);

  const data = (result?.payload?.Data ?? null) as VehicleData | null;
  const displayedVin = safeStr(result?.vin ?? vin);
  const vehicleSummary = (readObject(vehicleReport?.summary) ?? null) as VehicleReportSummary | null;
  const vehicleStkStatus = (readObject(vehicleReport?.stkStatus) ?? null) as VehicleReportStkStatus | null;
  const vehicleHero = (readObject(vehicleReport?.hero) ?? null) as VehicleReportHero | null;
  const vehicleValuation = (readObject(vehicleReport?.valuation) ?? null) as VehicleReportValuation | null;
  const vehicleTechnical = (readObject(vehicleReport?.technical) ?? null) as VehicleReportTechnical | null;
  const vehicleTechnicalSectionsRaw = useMemo(
    () =>
      Array.isArray(vehicleTechnical?.sections)
        ? (vehicleTechnical.sections as VehicleReportTechnicalSection[])
        : [],
    [vehicleTechnical?.sections]
  );
  const vehicleOwnersRaw = useMemo(
    () =>
      Array.isArray(vehicleReport?.owners)
        ? (vehicleReport.owners as VehicleReportOwnerRow[])
        : [],
    [vehicleReport?.owners]
  );
  const vehicleInspectionsRaw = useMemo(
    () =>
      Array.isArray(vehicleReport?.inspections)
        ? (vehicleReport.inspections as VehicleReportInspectionRow[])
        : [],
    [vehicleReport?.inspections]
  );
  const vehicleOdometerRaw = useMemo(
    () =>
      Array.isArray(vehicleReport?.odometerHistory)
        ? (vehicleReport.odometerHistory as VehicleReportOdometerRow[])
        : [],
    [vehicleReport?.odometerHistory]
  );
  const vehicleValuationRowsRaw = useMemo(
    () =>
      Array.isArray(vehicleValuation?.mileagePriceRows)
        ? (vehicleValuation.mileagePriceRows as VehicleReportValuationMileageRow[])
        : [],
    [vehicleValuation?.mileagePriceRows]
  );

  const summary = useMemo<VehicleSummary | null>(() => {
    if (!data) return null;

    const firstRegistrationRaw = firstOf(data, ["DatumPrvniRegistrace", "PrvniRegistrace"]);
    const firstRegistration = parseDateLoose(firstRegistrationRaw);
    const yearFromApi = toNumber(firstOf(data, ["RokVyroby", "VozidloRokVyroby"]));
    const yearFromVehicle = toNumber(vehicleHero?.yearLabel);
    const year = yearFromVehicle ?? yearFromApi ?? firstRegistration?.getFullYear() ?? null;

    const stkRaw = vehicleStkStatus?.nextDue ?? firstOf(data, [
      "PravidelnaTechnickaProhlidkaDo",
      "StkDo",
      "STKDo",
      "DatumStkDo",
      "TechnickaProhlidkaDo",
      "PlatnostStkDo",
    ]);

    const category = safeStr(firstOf(data, ["Kategorie", "KategorieVozidla"]));
    const body = safeStr(firstOf(data, ["VozidloKaroserieDruh", "DruhVozidla", "Typ"]));
    const fuelFromVehicle = safeStr(vehicleHero?.fuelLabel);
    const powerFromVehicle = parsePowerKwFromLabel(vehicleHero?.powerLabel);
    const colorFromVehicle = safeStr(vehicleHero?.colorLabel);
    const ownerCountFromVehicle = toNumber(vehicleSummary?.ownerCount);
    const ownerCountFromApi = toNumber(firstOf(data, ["PocetVlastniku"]));
    const ownerCount = ownerCountFromVehicle ?? ownerCountFromApi;
    const ownerCountLabel = ownerCount != null ? formatNumber(ownerCount) : safeStr(firstOf(data, ["PocetVlastniku"]));
    const statusFromVehicle = safeStr(vehicleReport?.status);

    return {
      brand: safeStr(firstOf(data, ["TovarniZnacka", "Znacka", "ZnackaVozidla"])),
      model: safeStr(firstOf(data, ["ObchodniOznaceni", "Model", "Typ"])),
      year,
      firstRegistration,
      firstRegistrationLabel: formatDateCs(firstRegistration),
      fuel: fuelFromVehicle !== "—" ? fuelFromVehicle : safeStr(firstOf(data, ["Palivo", "DruhPaliva"])),
      powerKw: powerFromVehicle ?? toNumber(firstOf(data, ["MotorMaxVykon", "Vykon", "MaxVykon"])),
      displacement: toNumber(firstOf(data, ["MotorZdvihObjem", "ZdvihovyObjem", "ObjemMotoru"])),
      category,
      body,
      color: colorFromVehicle !== "—" ? colorFromVehicle : safeStr(firstOf(data, ["VozidloKaroserieBarva", "Barva", "BarvaVozidla"])),
      ownerCount,
      status: statusFromVehicle !== "—" ? statusFromVehicle : statusLabel(data),
      categoryLabel: [category, body].filter((value) => value !== "—").join(" · ") || "—",
      stkDoLabel: formatDateCs(parseDateLoose(stkRaw)),
      ownerCountLabel,
      operatorCountLabel: safeStr(firstOf(data, ["PocetProvozovatelu"])),
    };
  }, [data, vehicleHero, vehicleReport?.status, vehicleStkStatus?.nextDue, vehicleSummary?.ownerCount]);

  const stkRaw = useMemo(
    () =>
      vehicleStkStatus?.nextDue ?? firstOf(data, [
        "PravidelnaTechnickaProhlidkaDo",
        "StkDo",
        "STKDo",
        "DatumStkDo",
        "TechnickaProhlidkaDo",
        "PlatnostStkDo",
      ]),
    [data, vehicleStkStatus?.nextDue]
  );
  const stkDate = useMemo(() => parseDateLoose(stkRaw), [stkRaw]);
  const orvLabel = useMemo(
    () => safeStr(firstOf(data, ["CisloOrv", "CisloORV"])),
    [data]
  );
  const tpLabel = safeStr(firstOf(data, ["CisloTp", "CisloTP"]));

  const mileageSignals = useMemo(() => collectPatternRows(data, MILEAGE_PATTERNS), [data]);

  const bestMileageSignal = useMemo(() => {
    const candidates = mileageSignals.filter((row) => isPlausibleMileage(row.numericValue));
    if (!candidates.length) return null;

    const ordered = [...candidates].sort((a, b) => {
      const ad = a.date?.getTime() ?? -Infinity;
      const bd = b.date?.getTime() ?? -Infinity;
      if (ad !== bd) return bd - ad;
      return (b.numericValue ?? 0) - (a.numericValue ?? 0);
    });

    return ordered[0] ?? null;
  }, [mileageSignals]);

  const vehicleOwnerRecords = useMemo(
    () => normalizeVehicleOwnerRecords(vehicleOwnersRaw),
    [vehicleOwnersRaw]
  );
  const vehicleStkChecks = useMemo(
    () => normalizeVehicleStkChecks(vehicleInspectionsRaw),
    [vehicleInspectionsRaw]
  );
  const vehicleMileageHistory = useMemo(
    () => normalizeVehicleMileageHistory(vehicleOdometerRaw),
    [vehicleOdometerRaw]
  );
  const vehicleMileagePriceRows = useMemo(
    () => normalizeVehicleMileagePriceRows(vehicleValuationRowsRaw),
    [vehicleValuationRowsRaw]
  );

  const mileageKm = useMemo(() => {
    const fromVehicle = toNumber(vehicleSummary?.lastOdometerKm);
    if (isPlausibleMileage(fromVehicle)) return fromVehicle;
    const fromValuation = toNumber(vehicleValuation?.referenceMileageKm);
    if (isPlausibleMileage(fromValuation)) return fromValuation;
    if (isPlausibleMileage(bestMileageSignal?.numericValue)) return bestMileageSignal.numericValue;
    return null;
  }, [bestMileageSignal?.numericValue, vehicleSummary?.lastOdometerKm, vehicleValuation?.referenceMileageKm]);

  const manualMileageKm = useMemo(() => {
    const parsed = toNumber(refineMileage);
    return isPlausibleMileage(parsed) ? parsed : null;
  }, [refineMileage]);

  const estimate = useMemo(
    () =>
      buildVehicleValuationEstimate({
        summary,
        mileageKm: manualMileageKm ?? mileageKm,
        newPrice: null,
        condition: "good",
        serviceHistory: "unknown",
        origin: "unknown",
        equipment: "standard",
        damage: "none",
        usage: "private",
      }),
    [manualMileageKm, mileageKm, summary]
  );

  const ownersCountNum = toNumber(vehicleSummary?.ownerCount) ?? toNumber(summary?.ownerCountLabel);
  const ownerCountLabel = ownersCountNum != null ? formatNumber(ownersCountNum) : safeStr(summary?.ownerCountLabel);

  const resolvedOwnerRecords = vehicleOwnerRecords;

  const stkChecks = vehicleStkChecks;

  const latestStk = stkChecks.find((check) => check.sourceLabel === "STK" && check.date);
  const currentSubjects = resolvedOwnerRecords.filter((row) => row.isCurrent);
  const imported = toBool(vehicleSummary?.wasImported);
  const importCountryLabel = safeStr(vehicleSummary?.importCountry);
  const originValue =
    imported === true ? "Dovoz" : imported === false ? "ČR" : "Původ neuvedený";
  const originSubtitle =
    imported === true
      ? (importCountryLabel !== "—" ? importCountryLabel : "Původ neuveden")
      : (summary?.status ?? "—");

  const vehicleInterpolatedPrice = useMemo(() => {
    if (!isPlausibleMileage(manualMileageKm)) return null;
    if (vehicleMileagePriceRows.length === 0) return null;

    const sorted = [...vehicleMileagePriceRows].sort((a, b) => a.km - b.km);
    if (manualMileageKm <= sorted[0].km) return sorted[0].price;
    if (manualMileageKm >= sorted[sorted.length - 1].km) return sorted[sorted.length - 1].price;

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (manualMileageKm > next.km) continue;
      const span = Math.max(1, next.km - prev.km);
      const ratio = (manualMileageKm - prev.km) / span;
      return Math.round(prev.price + (next.price - prev.price) * ratio);
    }

    return null;
  }, [manualMileageKm, vehicleMileagePriceRows]);

  const valuationRecommended =
    vehicleInterpolatedPrice ??
    toNumber(vehicleValuation?.estimatedPrice) ??
    estimate.recommended;
  const baseValuationRangeLow = toNumber(vehicleValuation?.fairRangeLow) ?? estimate.rangeLow;
  const baseValuationRangeHigh = toNumber(vehicleValuation?.fairRangeHigh) ?? estimate.rangeHigh;
  const valuationFairRangePct = toNumber(vehicleValuation?.fairRangePct);
  const valuationRangeLow = useMemo(() => {
    if (vehicleInterpolatedPrice == null || valuationFairRangePct == null) return baseValuationRangeLow;
    return roundTo(vehicleInterpolatedPrice * (1 - valuationFairRangePct / 100), 1_000);
  }, [baseValuationRangeLow, vehicleInterpolatedPrice, valuationFairRangePct]);
  const valuationRangeHigh = useMemo(() => {
    if (vehicleInterpolatedPrice == null || valuationFairRangePct == null) return baseValuationRangeHigh;
    return roundTo(vehicleInterpolatedPrice * (1 + valuationFairRangePct / 100), 1_000);
  }, [baseValuationRangeHigh, vehicleInterpolatedPrice, valuationFairRangePct]);
  const valuationComparableCount = toNumber(vehicleValuation?.comparableCount);
  const valuationReferenceMileage =
    manualMileageKm ??
    toNumber(vehicleValuation?.referenceMileageKm) ??
    mileageKm;
  const hasVehicleForSauto = !!summary && summary.brand !== "—" && summary.model !== "—";

  const marketRecommendation = useMemo(() => {
    const marketPrice = sautoMarket?.stats.recommended;
    if (marketPrice == null || !Number.isFinite(marketPrice)) return null;
    return roundTo(marketPrice * 0.7 + valuationRecommended * 0.3, 5_000);
  }, [sautoMarket?.stats.recommended, valuationRecommended]);
  const displayedRangeLow = marketRecommendation != null ? sautoMarket?.stats.q1 ?? valuationRangeLow : valuationRangeLow;
  const displayedRangeHigh = marketRecommendation != null ? sautoMarket?.stats.q3 ?? valuationRangeHigh : valuationRangeHigh;

  const sautoVsInternalPct = useMemo(() => {
    const marketPrice = sautoMarket?.stats.recommended;
    if (marketPrice == null || !Number.isFinite(marketPrice) || valuationRecommended <= 0) return null;
    return ((marketPrice - valuationRecommended) / valuationRecommended) * 100;
  }, [sautoMarket?.stats.recommended, valuationRecommended]);

  const fallbackMarketMin = useMemo(() => {
    const min = sautoMarket?.stats.min;
    if (min != null && Number.isFinite(min)) return min;
    return Math.max(0, Math.floor(valuationRangeLow * 0.8 / 1_000) * 1_000);
  }, [sautoMarket?.stats.min, valuationRangeLow]);

  const fallbackMarketMax = useMemo(() => {
    const max = sautoMarket?.stats.max;
    if (max != null && Number.isFinite(max)) return max;
    return roundTo(valuationRangeHigh * 1.25, 1_000);
  }, [sautoMarket?.stats.max, valuationRangeHigh]);

  const marketMin = toNumber(vehicleValuation?.marketMin) ?? fallbackMarketMin;
  const marketMax = toNumber(vehicleValuation?.marketMax) ?? fallbackMarketMax;

  const mileagePriceRows = useMemo(
    () => valuationReferenceMileage == null ? [] : buildMileageScenarios(marketRecommendation ?? valuationRecommended, valuationReferenceMileage),
    [marketRecommendation, valuationRecommended, valuationReferenceMileage]
  );

  const mileageHistory = useMemo<MileagePoint[]>(() => {
    if (vehicleMileageHistory.length >= 1) {
      return vehicleMileageHistory;
    }

    const labelFromDate = (date: Date) =>
      date.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" });

    const fromStk = stkChecks
      .filter(
        (check): check is StkCheck & { date: Date; mileageKm: number } =>
          check.date instanceof Date && isPlausibleMileage(check.mileageKm)
      )
      .map((check) => ({
        label: labelFromDate(check.date),
        date: check.date,
        km: check.mileageKm,
      }));

    const fromSignals = mileageSignals
      .filter(
        (row): row is PatternRow & { date: Date; numericValue: number } =>
          row.date instanceof Date && isPlausibleMileage(row.numericValue)
      )
      .map((row) => ({
        label: labelFromDate(row.date),
        date: row.date,
        km: row.numericValue,
      }));

    const unique = Array.from(
      new Map(
        [...fromStk, ...fromSignals].map((row) => [`${row.date.toISOString()}|${row.km}`, row])
      ).values()
    ).sort((a, b) => a.date.getTime() - b.date.getTime());

    return unique;
  }, [mileageSignals, vehicleMileageHistory, stkChecks]);

  const technicalSections = useMemo<SpecSection[]>(() => {
    return vehicleTechnicalSectionsRaw.flatMap((section) => {
      const title = safeStr(section.title);
      const values = Array.isArray(section.rows) ? section.rows as VehicleReportTechnicalRow[] : [];
      const rows: SpecSection["rows"] = [];
      for (let index = 0; index < values.length; index += 2) {
        rows.push({
          left: { label: safeStr(values[index].label), value: safeStr(values[index].value) },
          right: { label: values[index + 1] ? safeStr(values[index + 1].label) : "", value: values[index + 1] ? safeStr(values[index + 1].value) : "" },
        });
      }
      return rows.length ? [{ title, rows }] : [];
    });
  }, [vehicleTechnicalSectionsRaw]);

  const canSearch = !!user && isValidVehicleQuery(normalizeVehicleQuery(vin));

  const handleSearchByVin = useCallback(async (value: string) => {
    if (!user) {
      setError("Přihlaš se, aby šlo načíst data vozidla.");
      return;
    }

    const queryVin = normalizeVinInput(value);
    if (lookupInFlightRef.current || !isValidVehicleQuery(queryVin)) return;
    lookupInFlightRef.current = true;
    lookupVersionRef.current += 1;
    setLoading(true);
    setError(null);
    setResult(null);
    setVehicleReport(null);
    setVehicleChecks(null);
    setStkExpanded(false);
    setOwnersExpanded(false);
    setSautoError(null);
    setSautoMarket(null);
    setSautoLoading(false);

    try {
      const { response, data } = await fetchAuthedJson<VehicleLookupResponse & { error?: string }>(user, "/api/autokuk/vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryVin }),
      });
      if (!response.ok || data?.ok !== true || !data.result?.vin || !data.report) {
        throw new Error(data?.error || "Nepodařilo se načíst údaje vozidla.");
      }
      setResult(data.result);
      setVehicleReport(data.report);
      setVehicleChecks(data.checks);
      setLookupQuery(queryVin);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Nepodařilo se načíst data vozidla.");
    } finally {
      lookupInFlightRef.current = false;
      setLoading(false);
    }
  }, [user]);

  const handleSearch = useCallback(async () => {
    if (!canSearch || lookupInFlightRef.current) return;
    setSearchActivated(true);
    await handleSearchByVin(vin);
  }, [canSearch, handleSearchByVin, vin]);

  useEffect(() => {
    if (!user) return;
    if (!isValidVehicleQuery(vinFromQuery)) return;
    if (autoLookupVinRef.current === vinFromQuery) return;
    autoLookupVinRef.current = vinFromQuery;
    setSearchActivated(true);
    void handleSearchByVin(vinFromQuery);
  }, [handleSearchByVin, user, vinFromQuery]);

  useEffect(() => {
    if (!searchActivated || loading || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";
      const target = error ? errorRef.current : resultHeadingRef.current ?? resultScrollTargetRef.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, loading, searchActivated]);

  const handleSautoSearch = useCallback(async () => {

    if (!user) {
      setSautoError("Přihlaš se, aby šlo načíst tržní data ze Sauto.");
      return;
    }

    if (!summary || !hasVehicleForSauto) {
      setSautoError("Nejdřív načti vozidlo, aby bylo jasné, jakou značku a model hledat.");
      return;
    }

    const lookupVersion = lookupVersionRef.current;
    setSautoLoading(true);
    setSautoError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/vehicle-market/sauto", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          brand: summary.brand,
          model: summary.model,
          year: summary.year,
          mileageKm: manualMileageKm ?? mileageKm,
          fuel: summary.fuel,
          powerKw: summary.powerKw,
          displacement: summary.displacement,
          limit: 120,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isSautoMarketResponse(payload)) {
        throw new Error(readApiError(payload) ?? "Nepodařilo se načíst tržní data ze Sauto.");
      }

      if (lookupVersion === lookupVersionRef.current) setSautoMarket(payload);
    } catch (err: unknown) {
      if (lookupVersion === lookupVersionRef.current) setSautoError(err instanceof Error ? err.message : "Nepodařilo se načíst tržní data ze Sauto.");
    } finally {
      if (lookupVersion === lookupVersionRef.current) setSautoLoading(false);
    }
  }, [hasVehicleForSauto, manualMileageKm, mileageKm, summary, user]);

  const handleCopyResult = async () => {
    const text = [
      "Proklepka vozidla",
      `${summary?.brand ?? "Vozidlo"} ${summary?.model ?? ""}`.trim(),
      `VIN: ${displayedVin}`,
      `Status: ${summary?.status ?? "—"}`,
      `STK do: ${summary?.stkDoLabel ?? "—"}`,
      `Počet vlastníků: ${ownerCountLabel}`,
      `Nájezd: ${formatKm(mileageKm)}`,
      `Doporučená cena: ${formatCurrency(valuationRecommended)}`,
      `Rozpětí: ${formatCurrency(valuationRangeLow)} - ${formatCurrency(valuationRangeHigh)}`,
      ...(marketRecommendation
        ? [
            `Tržní doporučení Sauto: ${formatCurrency(marketRecommendation)}`,
            `Sauto medián: ${formatCurrency(sautoMarket?.stats.median)}`,
            `Rozdíl Sauto vs základní odhad: ${formatSignedPercent(sautoVsInternalPct)}`,
          ]
        : []),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const handleCopyIdentifier = async (
    id: "vin" | "orv" | "tp",
    value: string
  ) => {
    if (!value || value === "—") return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 1200);
    } catch {
      setCopiedId(null);
    }
  };

  const handleReset = () => {
    if (lookupInFlightRef.current) return;
    lookupVersionRef.current += 1;
    setSearchActivated(false);
    setVin("");
    setRefineMileage("");
    setShowRefineInputs(false);
    setResult(null);
    setError(null);
    setVehicleReport(null);
    setVehicleChecks(null);
    setSautoMarket(null);
    setSautoError(null);
    setSautoLoading(false);
    window.requestAnimationFrame(() => compactVinInputRef.current?.focus());
  };

  const searchForm = (
    <>
      <VehicleSearchForm
        vin={vin}
        onVinChange={(value) => setVin(normalizeVinInput(value))}
        inputRef={compactVinInputRef}
        onSearch={() => void handleSearch()}
        canSearch={canSearch}
        loading={loading}
        compact={searchActivated}
        onReset={handleReset}
        mileage={refineMileage}
        onMileageChange={setRefineMileage}
        showMileage={showRefineInputs}
        onToggleMileage={() => setShowRefineInputs((value) => !value)}
      />
      {!user && <p className={styles.notice}>Pro načtení údajů o vozidle se přihlas.</p>}
      {error && <p ref={errorRef} tabIndex={-1} className={styles.notice} role="alert"><AlertTriangle size={17} aria-hidden="true" />{error}</p>}
    </>
  );

  return (
    <AppLayout active="tools">
      <div className={`${styles.shell} mx-auto w-full max-w-6xl space-y-5 pb-10`}>
        {!searchActivated ? <VehicleIntro>{searchForm}</VehicleIntro> : (
          <div className={reportStyles.searchPanel}>
            <header className={styles.compactHeader}>
              <span><CarFront size={23} strokeWidth={1.7} aria-hidden="true" /></span>
              <div><h1>Proklepka vozidla</h1><p>Historie, technické údaje a odhad ceny</p></div>
            </header>
            <div>{searchForm}</div>
          </div>
        )}

        <div ref={resultScrollTargetRef} className="scroll-mt-8" />
        {searchActivated && loading && <VehicleLoader vin={vin} />}

        {searchActivated && !loading && summary && (
          <div className={reportStyles.report}>
            <section id="vehicle-overview" className={`${reportStyles.hero} vehicle-reveal`} style={revealStyle(40)} aria-label="Přehled vozidla">
              <div className={reportStyles.heroMain}>
                <div className={reportStyles.heroIdentity}>
                  <span className={reportStyles.eyebrow}>Vozidlo pod lupou</span>
                  <div className={reportStyles.heroTop}>
                    {lookupQuery.length <= 8 && <span className={reportStyles.plate}>{lookupQuery}</span>}
                    <Pill tone={statusTone(summary.status)}>{summary.status}</Pill>
                    <Pill>{summary.category}</Pill>
                  </div>
                  <div className={reportStyles.heroName}><VehicleBrandLogo brand={summary.brand} /><h2 ref={resultHeadingRef} tabIndex={-1}>{summary.brand} {summary.model}</h2></div>
                  <div className={reportStyles.heroSpecs}>
                    <span><CalendarDays size={13} />{summary.year ?? "Rok neuveden"}</span>
                    <span><Fuel size={13} />{summary.fuel}</span>
                    <span><Zap size={13} />{formatNumber(summary.powerKw)} kW</span>
                    <span><Palette size={13} />{summary.color}</span>
                  </div>
                </div>
                <div className={reportStyles.heroArt}><VehicleIllustration /><span>Ilustrační vůz</span></div>
              </div>
              <div className={reportStyles.documents}>
                {([{ id: "vin", label: "VIN", value: displayedVin }, { id: "orv", label: "ORV", value: orvLabel }, { id: "tp", label: "TP", value: tpLabel }] as const).map(item => (
                  <button key={item.id} type="button" onClick={() => void handleCopyIdentifier(item.id, item.value)} disabled={item.value === "—"} className={reportStyles.document}
                    aria-label={`${item.label}: ${item.value === "—" ? "Neuvedeno" : `${item.value}, ${copiedId === item.id ? "zkopírováno" : "kopírovat"}`}`}>
                    <span>{item.label}</span><strong>{item.value === "—" ? "Neuvedeno" : item.value}</strong>
                    {copiedId === item.id ? <Check size={14} /> : <ClipboardCopy size={14} />}
                  </button>
                ))}
              </div>
            </section>

            <div className={`${reportStyles.metrics} vehicle-reveal`} style={revealStyle(80)}>
              <Tile title="Poslední STK" value={latestStk?.dateLabel ?? "Neuvedena"}
                subtitle={latestStk ? `${latestStk.resultLabel} · ${stkDate ? `platnost do ${summary.stkDoLabel}` : "Platnost neuvedena"}` : "Záznam STK není dostupný"}
                icon={<CalendarClock size={15} />} tone={latestStk?.isPassed === false ? "rose" : "neutral"} />
              <Tile title="Majitelé" value={`${ownerCountLabel} v ČR`} subtitle={`${resolvedOwnerRecords.length} záznamů v registru`} icon={<Users size={15} />} />
              <Tile title="Tachometr" value={formatKm(mileageKm)} subtitle={vehicleSummary?.lastOdometerDate ? `Záznam z ${formatDateCs(parseDateLoose(vehicleSummary.lastOdometerDate))}` : "Datum záznamu neuvedeno"} icon={<Gauge size={15} />} />
              <Tile title="Původ" value={originValue} subtitle={originSubtitle} icon={<MapPin size={15} />} />
            </div>

            <nav className={reportStyles.navigation} aria-label="Části přehledu vozidla">
              <div className={reportStyles.sectionLinks}>
                <a href="#vehicle-value"><Zap size={14} />Hodnota</a>
                <a href="#vehicle-odometer"><Gauge size={14} />Tachometr</a>
                <a href="#vehicle-history"><History size={14} />Historie</a>
                <a href="#vehicle-technical"><FileText size={14} />Technické údaje</a>
              </div>
              <button type="button" onClick={() => void handleCopyResult()} className={reportStyles.textButton}><ClipboardCopy size={14} />{copied ? "Zkopírováno" : "Kopírovat výstup"}</button>
            </nav>

            <VehicleValuePanels price={marketRecommendation ?? valuationRecommended} low={displayedRangeLow} high={displayedRangeHigh}
              marketMin={marketMin} marketMax={marketMax} mileage={valuationReferenceMileage} scenarios={mileagePriceRows}
              comparableCount={valuationComparableCount ?? sautoMarket?.comparableCount ?? 0} market={marketRecommendation != null}
              loading={sautoLoading} canSearch={!!user && hasVehicleForSauto} onMarketSearch={() => void handleSautoSearch()} error={sautoError} />

            <VehicleMileageHistory points={mileageHistory} />

            <div id="vehicle-history" className={reportStyles.historyGrid}>
              <section className={`${reportStyles.panel} ${reportStyles.historyPanel}`}>
                <CollapsibleSectionHeader icon={<CalendarClock size={18} />} title="STK a emise" subtitle="Historie evidenčních a pravidelných kontrol"
                  expanded={stkExpanded} countLabel={`${stkChecks.length} záznamů`} controlsId="stk-history-list" onToggle={() => setStkExpanded(value => !value)} />
                {!stkExpanded && <div className={reportStyles.historyPreview}><span>Poslední evidovaná STK</span>
                  {latestStk ? <><p><strong>{latestStk.dateLabel}</strong> · {formatKm(latestStk.mileageKm)}</p><p>{latestStk.resultLabel}</p></> : <p>Záznam STK není dostupný.</p>}
                </div>}
                {stkExpanded && <div id="stk-history-list" className={reportStyles.historyList}>{stkChecks.length ? stkChecks.map(check => <StkCard key={check.id} check={check} />) : <p className={reportStyles.empty}>Žádné kontroly nejsou dostupné.</p>}</div>}
              </section>
              <section className={`${reportStyles.panel} ${reportStyles.historyPanel}`}>
                <CollapsibleSectionHeader icon={<Users size={18} />} title="Vlastníci a provozovatelé" subtitle={`${ownerCountLabel} majitelů v ČR`}
                  expanded={ownersExpanded} countLabel={`${resolvedOwnerRecords.length} záznamů`} controlsId="owner-history-list" onToggle={() => setOwnersExpanded(value => !value)} />
                {!ownersExpanded && <div className={reportStyles.historyPreview}><span>Aktuálně v registru</span>
                  {currentSubjects.length ? currentSubjects.map(subject => <p key={subject.id}><strong>{subject.name}</strong><br />{subject.roleLabel} · od {subject.fromLabel}</p>) : <p>Aktuální subjekt není v dostupných údajích uvedený.</p>}
                </div>}
                {ownersExpanded && <div id="owner-history-list" className={reportStyles.historyList}>{resolvedOwnerRecords.length ? resolvedOwnerRecords.map(owner => <OwnerCard key={owner.id} owner={owner} />) : <p className={reportStyles.empty}>Historie není dostupná.</p>}</div>}
              </section>
            </div>

            <section id="vehicle-technical" className={reportStyles.panel}>
              <div className={reportStyles.technicalHeader}><div><span className={reportStyles.eyebrow}>Z technického průkazu</span><h3>Technické údaje</h3><p>Parametry, registrace a doklady na jednom místě.</p></div><VehicleReportIllustration kind="documents" className={reportStyles.documentArt} /></div>
              {technicalSections.map(section => <TechnicalSection key={section.title} section={section} />)}
              {!technicalSections.length && <p className={reportStyles.empty}>Podrobné technické údaje nejsou dostupné.</p>}
            </section>

            {vehicleChecks && <VehicleAdditionalChecks checks={vehicleChecks} />}
            {user && <VehicleVignette key={lookupQuery} user={user} query={lookupQuery} />}
            <footer className={reportStyles.footer}><span><ShieldCheck size={12} />Údaje z dostupných evidencí vozidla</span><a href="https://autokuk.cz" target="_blank" rel="noreferrer">Data: Autokuk.cz</a></footer>
          </div>
        )}

        {searchActivated && !loading && !summary && !error && (
          <section role="status" className="vehicle-reveal rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600" style={revealStyle(60)}>
            Pro tuto SPZ nebo VIN nemáme dostupné údaje. Zkontroluj zadání a zkus vyhledat znovu.
          </section>
        )}
      </div>

    </AppLayout>
  );
}
