"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { Space_Grotesk } from "next/font/google";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  CarFront,
  ChevronRight,
  ClipboardCopy,
  Dot,
  Gauge,
  History,
  LineChart,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJson } from "@/app/lib/authenticatedApi";
import { rsvVehicleLookupByVin } from "@/app/lib/rsv";
import { type SautoMarketResponse } from "../naceneni-vozidla/types";
import {
  buildVehicleValuationEstimate,
  roundTo,
  type VehicleValuationSummary,
} from "../naceneni-vozidla/valuation";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

const VEHICLE_LOADING_PHASES = [
  "Načítám data z STK",
  "Načítám vlastníky a provozovatele",
  "Skládám technická data vozidla",
  "Počítám tržní cenu",
] as const;

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

type ObjectRow = {
  path: string;
  key: string;
  row: Record<string, unknown>;
  date: Date | null;
};

type StkCheck = {
  id: string;
  date: Date | null;
  dateLabel: string;
  mileageKm: number | null;
  typeLabel: string;
  resultLabel: string;
  isPassed: boolean;
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

type ProklepniOwnerRow = {
  name?: unknown;
  roleLabel?: unknown;
  icoLabel?: unknown;
  addressLabel?: unknown;
  fromIso?: unknown;
  toIso?: unknown;
  isCurrent?: unknown;
};

type ProklepniOwnersResponse = {
  ok?: unknown;
  recordCount?: unknown;
  records?: unknown;
};

type ProklepniReportSummary = {
  ownerCount?: unknown;
  ownerRecordCount?: unknown;
  ownerPartyCount?: unknown;
  wasImported?: unknown;
  importCountry?: unknown;
  importDate?: unknown;
  totalDefects?: unknown;
  lastOdometerKm?: unknown;
  lastOdometerDate?: unknown;
  avgAnnualKm?: unknown;
};

type ProklepniReportStkStatus = {
  state?: unknown;
  nextDue?: unknown;
  daysRemaining?: unknown;
  note?: unknown;
  scorePenalty?: unknown;
};

type ProklepniReportHero = {
  score?: unknown;
  letter?: unknown;
  label?: unknown;
  yearLabel?: unknown;
  fuelLabel?: unknown;
  powerLabel?: unknown;
  colorLabel?: unknown;
};

type ProklepniReportOdometerRow = {
  dateIso?: unknown;
  km?: unknown;
  deltaKm?: unknown;
  deltaDays?: unknown;
  protocolLabel?: unknown;
  result?: unknown;
  quality?: unknown;
};

type ProklepniReportInspectionRow = {
  protocolLabel?: unknown;
  dateIso?: unknown;
  stationNumber?: unknown;
  stationTown?: unknown;
  inspectionType?: unknown;
  inspectionTypeLabel?: unknown;
  result?: unknown;
  resultLabel?: unknown;
  mileageKm?: unknown;
  durationMin?: unknown;
  defectCount?: unknown;
  worstSeverity?: unknown;
  sameDayGroupId?: unknown;
};

type ProklepniReportOwnerRow = {
  roleLabel?: unknown;
  isCurrent?: unknown;
  name?: unknown;
  icoLabel?: unknown;
  addressLabel?: unknown;
  fromIso?: unknown;
  toIso?: unknown;
};

type ProklepniReportValuationMileageRow = {
  km?: unknown;
  price?: unknown;
  widthPercent?: unknown;
  highlighted?: unknown;
};

type ProklepniReportValuation = {
  estimatedPrice?: unknown;
  confidenceLabel?: unknown;
  comparableCount?: unknown;
  referenceMileageKm?: unknown;
  fairRangeLow?: unknown;
  fairRangeHigh?: unknown;
  fairRangePct?: unknown;
  marketMin?: unknown;
  marketMax?: unknown;
  segmentUnderPct?: unknown;
  segmentFairPct?: unknown;
  segmentOverPct?: unknown;
  markerPct?: unknown;
  infoTitle?: unknown;
  infoText?: unknown;
  highlightedMileageKm?: unknown;
  mileagePriceRows?: unknown;
};

type ProklepniReportTechnicalRow = {
  label?: unknown;
  value?: unknown;
};

type ProklepniReportTechnicalSection = {
  title?: unknown;
  rows?: unknown;
};

type ProklepniReportTechnical = {
  sections?: unknown;
};

type ProklepniReportPayload = {
  status?: unknown;
  summary?: unknown;
  stkStatus?: unknown;
  hero?: unknown;
  valuation?: unknown;
  technical?: unknown;
  odometerHistory?: unknown;
  inspections?: unknown;
  owners?: unknown;
};

type ProklepniReportResponse = {
  ok?: unknown;
  report?: unknown;
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

const STK_PATTERNS = ["stk", "technick", "prohlidk", "kontrol", "evidencni"];
const OWNER_PATTERNS = [
  "vlastnik",
  "vlastnici",
  "vlastnictv",
  "provozovatel",
  "provozovatele",
  "owner",
  "owners",
  "drzitel",
  "majitel",
  "subjekt",
];
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

function normalizeVinInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

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

function collectObjectRows(data: VehicleData | null, patterns: string[], limit = MAX_PATTERN_ROWS): ObjectRow[] {
  if (!data) return [];

  const out: ObjectRow[] = [];
  const seen = new Set<string>();

  const pushRow = (path: string[], key: string, row: Record<string, unknown>, fallbackDate: Date | null) => {
    const date = findDateInObject(row) ?? fallbackDate;
    const signature = path.join(" › ");
    if (seen.has(signature)) return;
    seen.add(signature);
    out.push({ path: path.join(" › "), key, row, date });
  };

  const walk = (node: unknown, path: string[], parentDate: Date | null) => {
    if (out.length >= limit) return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path, `[${index}]`], parentDate));
      return;
    }

    const row = readObject(node);
    if (!row) return;

    const ownDate = findDateInObject(row) ?? parentDate;

    for (const [key, value] of Object.entries(row)) {
      const keyPath = [...path, key];
      const nested = readObject(value);
      if (hasPattern(key, patterns)) {
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            const listRow = readObject(item);
            if (listRow) pushRow([...keyPath, `[${index}]`], key, listRow, ownDate);
          });
        } else if (nested) {
          pushRow(keyPath, key, nested, ownDate);
        } else if (hasValue(value)) {
          pushRow(keyPath, key, { hodnota: value }, ownDate);
        }
      }

      walk(value, keyPath, ownDate);
      if (out.length >= limit) return;
    }
  };

  walk(data, [], null);
  return out;
}

function hasRowHint(row: Record<string, unknown>, hints: string[]): boolean {
  return Object.keys(row).some((key) => hasPattern(key, hints));
}

function hasValueHint(row: Record<string, unknown>, hints: string[]): boolean {
  return Object.values(row).some((value) => {
    if (value == null) return false;
    if (typeof value === "string") return hasPattern(value, hints);
    if (typeof value === "number" || typeof value === "boolean") return false;
    if (Array.isArray(value)) {
      return value.some((item) => typeof item === "string" && hasPattern(item, hints));
    }
    const nested = readObject(value);
    if (!nested) return false;
    return hasRowHint(nested, hints) || hasValueHint(nested, hints);
  });
}

function collectAllObjectRows(data: VehicleData | null, limit = MAX_PATTERN_ROWS): ObjectRow[] {
  if (!data) return [];

  const out: ObjectRow[] = [];
  const seen = new Set<string>();

  const pushRow = (path: string[], key: string, row: Record<string, unknown>, fallbackDate: Date | null) => {
    if (!path.length) return;
    const signature = path.join(" › ");
    if (seen.has(signature)) return;
    seen.add(signature);
    const date = findDateInObject(row) ?? fallbackDate;
    out.push({ path: signature, key, row, date });
  };

  const walk = (node: unknown, path: string[], parentDate: Date | null) => {
    if (out.length >= limit) return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        const itemPath = [...path, `[${index}]`];
        const itemRow = readObject(item);
        if (itemRow) {
          pushRow(itemPath, path[path.length - 1] ?? "item", itemRow, parentDate);
        }
        walk(item, itemPath, parentDate);
      });
      return;
    }

    const row = readObject(node);
    if (!row) return;

    const ownDate = findDateInObject(row) ?? parentDate;
    if (path.length) {
      pushRow(path, path[path.length - 1] ?? "obj", row, ownDate);
    }

    for (const [key, value] of Object.entries(row)) {
      walk(value, [...path, key], ownDate);
      if (out.length >= limit) return;
    }
  };

  walk(data, [], null);
  return out;
}

function looksLikeOwnerObject(item: ObjectRow): boolean {
  const roleHints = ["vlast", "provoz", "owner", "drzitel", "majitel"];
  const identityHints = ["nazev", "jmeno", "firma", "subjekt", "ico", "adresa", "ulice", "mesto", "obec", "psc", "sidlo"];
  const periodHints = ["od", "do", "datum", "from", "to", "platnost"];

  const pathNorm = normalizeText(`${item.key} ${item.path}`);
  const hasSubjectInPath = pathNorm.includes("subjekt");
  const hasRoleInPath = roleHints.some((hint) => pathNorm.includes(hint));
  const hasRoleInRow = hasRowHint(item.row, roleHints);
  const hasRoleInValues = hasValueHint(item.row, roleHints);
  const hasIdentityInRow = hasRowHint(item.row, identityHints);
  const hasIdentityInValues = hasValueHint(item.row, identityHints);
  const hasPeriodInRow = hasRowHint(item.row, periodHints) || item.date != null;

  const hasRoleSignal = hasRoleInPath || hasRoleInRow || hasRoleInValues || hasSubjectInPath;
  const hasIdentityOrPeriod = hasIdentityInRow || hasIdentityInValues || hasPeriodInRow;

  return hasRoleSignal && hasIdentityOrPeriod;
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

function isProklepniReportResponse(payload: unknown): payload is ProklepniReportResponse {
  const row = readObject(payload);
  return row?.ok === true && readObject(row.report) != null;
}

function parsePowerKwFromLabel(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*kW/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function resolveStkToneWithState(stateRaw: unknown, nextDueRaw: unknown): "green" | "amber" | "rose" {
  const state = normalizeText(safeStr(stateRaw));
  if (state.includes("expired") || state.includes("invalid") || state.includes("neplat")) return "rose";
  if (state.includes("expiring") || state.includes("soon")) return "amber";
  if (state.includes("valid") || state.includes("pending")) return "green";
  return stkTone(nextDueRaw);
}

function normalizeProklepniOwnerRecords(rows: ProklepniReportOwnerRow[]): OwnerRecord[] {
  const mapped = rows
    .map((raw, idx, arr) => {
      const row = raw as ProklepniReportOwnerRow;
      const fromDate = parseDateLoose(row.fromIso);
      const toDate = parseDateLoose(row.toIso);
      const name = safeStr(row.name);
      const roleLabel = safeStr(row.roleLabel);
      const icoLabel = safeStr(row.icoLabel);
      const addressLabel = safeStr(row.addressLabel);

      return {
        id: `proklepni-owner-${idx}-${name}-${roleLabel}-${formatDateCs(fromDate)}-${formatDateCs(toDate)}`,
        order: arr.length - idx,
        name: name === "—" ? "Neuvedený subjekt" : name,
        roleLabel: roleLabel === "—" ? "vlastník + provozovatel" : roleLabel,
        icoLabel: icoLabel === "—" ? "IČO neuvedeno" : icoLabel,
        addressLabel: addressLabel === "—" ? "Adresa neuvedena" : addressLabel,
        fromDate,
        toDate,
        fromLabel: formatDateCs(fromDate),
        toLabel: toDate ? formatDateCs(toDate) : "dosud",
        isCurrent: row.isCurrent === true || toDate == null,
      } satisfies OwnerRecord;
    })
    .filter((row) => row.fromDate != null || row.toDate != null || row.name !== "Neuvedený subjekt");

  return mapped
    .sort((a, b) => (b.fromDate?.getTime() ?? -Infinity) - (a.fromDate?.getTime() ?? -Infinity))
    .map((row, idx, arr) => ({ ...row, order: arr.length - idx }));
}

function normalizeProklepniStkChecks(rows: ProklepniReportInspectionRow[]): StkCheck[] {
  type ParsedStkRow = StkCheck & {
    groupKey: string;
    _defectCount: number | null;
    _severity: string;
  };

  const mapped: ParsedStkRow[] = rows.map((raw, idx) => {
    const row = raw as ProklepniReportInspectionRow;
    const date = parseDateLoose(row.dateIso);
    const mileageRaw = toNumber(row.mileageKm);
    const mileage = isPlausibleMileage(mileageRaw) ? mileageRaw : null;
    const resultText = safeStr(row.resultLabel);
    const resultNum = toNumber(row.result);
    const resultNorm = normalizeText(resultText);
    const isPassed =
      resultNum === 1 ||
      (!resultNorm.includes("nezpus") && !resultNorm.includes("nevyhov") && !resultNorm.includes("zavada"));

    const typeLabelRaw = safeStr(row.inspectionTypeLabel);
    const typeNorm = normalizeText(typeLabelRaw);
    const typeLabel =
      typeLabelRaw === "—"
        ? "Pravidelná"
        : typeNorm.includes("evidenc")
          ? "Evidenční"
          : "Pravidelná";

    const sourceLabel =
      typeNorm.includes("sme") || safeStr(row.protocolLabel).startsWith("CZ-440")
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
      id: `proklepni-stk-${idx}-${protocolLabel}-${formatDateCs(date)}-${mileage ?? "no-km"}`,
      date,
      dateLabel: formatDateCs(date),
      mileageKm: mileage,
      typeLabel,
      resultLabel: isPassed ? "Bez závad" : (resultText === "—" ? "Nezpůsobilé" : resultText),
      isPassed,
      stationLabel,
      protocolLabel,
      sourceLabel,
      groupKey,
      _defectCount: defectCount,
      _severity: worstSeverity,
    };
  });

  const groupedMap = new Map<string, ParsedStkRow[]>();
  for (const row of mapped) {
    const bucket = groupedMap.get(row.groupKey);
    if (bucket) bucket.push(row);
    else groupedMap.set(row.groupKey, [row]);
  }

  const grouped = Array.from(groupedMap.values()).map((group, idx) => {
    const primary = [...group].sort((a, b) => {
      const score = (row: ParsedStkRow) => {
        let points = 0;
        if (row.sourceLabel === "STK") points += 2;
        if (row.stationLabel !== "Stanice neuvedena") points += 1;
        if (row.protocolLabel !== "Protokol neuveden") points += 1;
        return points;
      };
      return score(b) - score(a);
    })[0];

    const hasSme = group.some((row) => row.sourceLabel === "SME");
    const hasStk = group.some((row) => row.sourceLabel === "STK");
    const sourceLabel = hasSme && hasStk ? "STK + SME" : hasSme ? "SME" : "STK";
    const typeLabel = group.some((row) => row.typeLabel === "Evidenční") ? "Evidenční" : "Pravidelná";
    const isPassed = group.every((row) => row.isPassed);
    const firstFailed = group.find((row) => !row.isPassed);
    const mileageCandidates = group
      .map((row) => row.mileageKm)
      .filter((value): value is number => isPlausibleMileage(value));
    const mileageKm =
      mileageCandidates.length > 0 ? Math.max(...mileageCandidates) : primary.mileageKm;
    const defectCount = group.reduce((sum, row) => sum + (row._defectCount != null && row._defectCount > 0 ? row._defectCount : 0), 0);
    const severity =
      group.map((row) => row._severity).find((label) => label && label !== "—") ?? "—";

    return {
      ...primary,
      id: `proklepni-stk-group-${idx}-${primary.groupKey}`,
      mileageKm,
      typeLabel,
      isPassed,
      resultLabel: isPassed ? "Bez závad" : (firstFailed?.resultLabel ?? "Nezpůsobilé"),
      sourceLabel,
      stationLabel:
        group.length > 1 && primary.stationLabel !== "Stanice neuvedena"
          ? `${primary.stationLabel} (+${group.length - 1})`
          : primary.stationLabel,
      protocolLabel:
        group.length > 1 && primary.protocolLabel !== "Protokol neuveden"
          ? `${primary.protocolLabel} (+${group.length - 1})`
          : primary.protocolLabel,
      _defectCount: defectCount > 0 ? defectCount : null,
      _severity: severity,
    } satisfies ParsedStkRow;
  });

  return grouped
    .sort((a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity))
    .map((row) => {
      const defectCount = row._defectCount;
      const severity = row._severity;
      if (!row.isPassed && defectCount != null && defectCount > 0) {
        return {
          ...row,
          resultLabel: `Závady: ${formatNumber(defectCount)}${severity && severity !== "—" ? ` (${severity})` : ""}`,
        };
      }
      return row;
    });
}

function normalizeProklepniMileageHistory(rows: ProklepniReportOdometerRow[]): MileagePoint[] {
  const points = rows
    .map((raw) => {
      const row = raw as ProklepniReportOdometerRow;
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

function normalizeProklepniMileagePriceRows(rows: ProklepniReportValuationMileageRow[]): MileagePriceRow[] {
  const out: MileagePriceRow[] = [];
  for (const raw of rows) {
    const row = raw as ProklepniReportValuationMileageRow;
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
  if (status.includes("PROVOZ") || status.includes("AKTIV")) return "green";
  return "amber";
}

function stkTone(stkDateRaw: unknown): "green" | "amber" | "rose" {
  const date = parseDateLoose(stkDateRaw);
  if (!date) return "amber";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "rose";
  if (diffDays <= 60) return "amber";
  return "green";
}

function confidenceLabel(score: number): string {
  if (score >= 85) return "Velmi vysoká";
  if (score >= 70) return "Vysoká";
  if (score >= 55) return "Střední";
  return "Nižší";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function revealStyle(delayMs: number): CSSProperties {
  return { animationDelay: `${delayMs}ms` };
}

function findRowString(row: Record<string, unknown>, keyPatterns: string[]): string | null {
  for (const [key, value] of Object.entries(row)) {
    if (!hasPattern(key, keyPatterns)) continue;
    const label = safeStr(value);
    if (label !== "—") return label;
  }
  return null;
}

function findRowNumber(row: Record<string, unknown>, keyPatterns: string[]): number | null {
  for (const [key, value] of Object.entries(row)) {
    if (!hasPattern(key, keyPatterns)) continue;
    const num = toNumber(value);
    if (num != null && num > 0) return num;
  }
  return null;
}

function findRowDate(row: Record<string, unknown>, keyPatterns: string[]): Date | null {
  for (const [key, value] of Object.entries(row)) {
    if (!hasPattern(key, keyPatterns)) continue;
    const date = parseDateLoose(value);
    if (date) return date;
  }
  return null;
}

function buildStkChecks(
  stkObjects: ObjectRow[],
  stkSignals: PatternRow[],
  mileageSignals: PatternRow[],
  fallbackStkDate: Date | null,
  fallbackMileage: number | null
): StkCheck[] {
  const out: StkCheck[] = [];
  const seen = new Set<string>();

  const mileageCandidates = mileageSignals
    .filter((row) => isPlausibleMileage(row.numericValue))
    .map((row) => ({ date: row.date, km: row.numericValue as number }));

  const nearestMileage = (date: Date | null): number | null => {
    if (!mileageCandidates.length) return fallbackMileage;
    if (!date) return mileageCandidates[0]?.km ?? fallbackMileage;

    const sorted = [...mileageCandidates].sort((a, b) => {
      const ad = Math.abs((a.date?.getTime() ?? date.getTime()) - date.getTime());
      const bd = Math.abs((b.date?.getTime() ?? date.getTime()) - date.getTime());
      return ad - bd;
    });
    return sorted[0]?.km ?? fallbackMileage;
  };

  for (const row of stkObjects) {
    const date = row.date ?? findRowDate(row.row, ["datum", "do", "od"]);
    const mileageRaw = findRowNumber(row.row, ["najet", "najezd", "tachometr", "kilometr"]);
    const mileage = isPlausibleMileage(mileageRaw) ? mileageRaw : nearestMileage(date);

    const typeRaw = findRowString(row.row, ["typ", "druh", "kontrol", "stk", "sme"])
      ?? row.key;
    const typeNorm = normalizeText(typeRaw);
    const typeLabel = typeNorm.includes("evid") ? "Evidenční" : "Pravidelná";

    const resultRaw = findRowString(row.row, ["vysle", "stav", "zpusobil", "zavad", "vada"]) ?? "Způsobilé";
    const resultNorm = normalizeText(resultRaw);
    const isPassed = !resultNorm.includes("nezpus") && !resultNorm.includes("nevyhov") && !resultNorm.includes("vada");
    const resultLabel = isPassed ? "Bez závad" : safeStr(resultRaw);

    const stationLabel =
      findRowString(row.row, ["stanic", "misto", "obec", "mesto"]) ?? "Stanice neuvedena";
    const protocolLabel =
      findRowString(row.row, ["protokol", "cislo", "id", "kod"]) ?? "Protokol neuveden";
    const sourceLabel = typeNorm.includes("sme") ? "SME" : typeNorm.includes("stk") ? "STK" : "STK";

    const key = `${date?.toISOString() ?? "no-date"}|${mileage ?? "no-km"}|${stationLabel}|${typeLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: key,
      date,
      dateLabel: formatDateCs(date),
      mileageKm: mileage,
      typeLabel,
      resultLabel,
      isPassed,
      stationLabel,
      protocolLabel,
      sourceLabel,
    });
  }

  if (!out.length) {
    out.push({
      id: "fallback-stk",
      date: fallbackStkDate,
      dateLabel: formatDateCs(fallbackStkDate),
      mileageKm: fallbackMileage,
      typeLabel: "Pravidelná",
      resultLabel: "Bez závad",
      isPassed: true,
      stationLabel: "Stanice neuvedena",
      protocolLabel: "Protokol neuveden",
      sourceLabel: "STK",
    });
  }

  out.sort((a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity));
  return out.slice(0, 16);
}

function buildOwnerRecords(objects: ObjectRow[], ownerCount: number | null): OwnerRecord[] {
  const out: OwnerRecord[] = [];
  const seen = new Set<string>();

  for (const item of objects) {
    if (!looksLikeOwnerObject(item)) continue;

    const roleFromValue = findRowString(item.row, ["role", "typ", "druh", "postaveni", "vztah", "subjekt"]);
    const roleRaw = `${item.key} ${item.path} ${roleFromValue ?? ""}`;
    const roleNorm = normalizeText(roleRaw);
    let roleLabel = "vlastník + provozovatel";
    if (roleNorm.includes("vlast") && !roleNorm.includes("provoz")) roleLabel = "vlastník";
    if (!roleNorm.includes("vlast") && roleNorm.includes("provoz")) roleLabel = "provozovatel";

    const fromDate = findRowDate(item.row, ["od", "datumod", "from", "platnostod"]) ?? item.date;
    const toDate = findRowDate(item.row, ["do", "datumdo", "to", "platnostdo"]);

    const nameFromKeys =
      findRowString(item.row, ["nazev", "jmeno", "subjekt", "firma", "vlastnik", "provozovatel", "name"]);
    const nameFallback = Object.values(item.row)
      .map((value) => safeStr(value))
      .find((value) => value !== "—" && value.length > 2 && !/^\d+$/.test(value));

    const name = nameFromKeys ?? nameFallback ?? "Neuvedený subjekt";

    const icoLabel = findRowString(item.row, ["ico", "ic", "ident"]) ?? "IČO neuvedeno";
    const addressLabel =
      findRowString(item.row, ["adresa", "ulice", "mesto", "obec", "sidlo", "psc"]) ?? "Adresa neuvedena";

    const id = `${name}|${roleLabel}|${formatDateCs(fromDate)}|${formatDateCs(toDate)}|${icoLabel}|${addressLabel}`;
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      order: out.length + 1,
      name,
      roleLabel,
      icoLabel,
      addressLabel,
      fromDate,
      toDate,
      fromLabel: formatDateCs(fromDate),
      toLabel: toDate ? formatDateCs(toDate) : "dosud",
      isCurrent: toDate == null,
    });
  }

  out.sort((a, b) => (b.fromDate?.getTime() ?? -Infinity) - (a.fromDate?.getTime() ?? -Infinity));

  if (!out.length) {
    const fallbackCount = Math.max(1, ownerCount ?? 1);
    for (let i = 0; i < Math.min(10, fallbackCount); i += 1) {
      out.push({
        id: `fallback-owner-${i}`,
        order: fallbackCount - i,
        name: "Neuvedený subjekt",
        roleLabel: "vlastník + provozovatel",
        icoLabel: "IČO neuvedeno",
        addressLabel: "Adresa neuvedena",
        fromDate: null,
        toDate: i === 0 ? null : null,
        fromLabel: "—",
        toLabel: i === 0 ? "dosud" : "—",
        isCurrent: i === 0,
      });
    }
  }

  return out.slice(0, 20).map((row, idx) => ({ ...row, order: out.length - idx }));
}

function ownerHistoryKey(row: OwnerRecord): string {
  const role = normalizeText(row.roleLabel);
  const from = row.fromDate ? row.fromDate.toISOString().slice(0, 10) : row.fromLabel;
  const to = row.toDate ? row.toDate.toISOString().slice(0, 10) : row.toLabel;
  return `${role}|${from}|${to}`;
}

function ownerDataScore(row: OwnerRecord): number {
  let score = 0;
  if (row.name !== "Neuvedený subjekt") score += 3;
  if (row.icoLabel !== "IČO neuvedeno") score += 2;
  if (row.addressLabel !== "Adresa neuvedena") score += 2;
  if (row.fromDate) score += 1;
  if (row.toDate) score += 1;
  if (row.roleLabel.includes("vlast") || row.roleLabel.includes("provoz")) score += 1;
  return score;
}

function mergeOwnerHistory(primary: OwnerRecord[], fallback: OwnerRecord[]): OwnerRecord[] {
  const merged = new Map<string, OwnerRecord>();

  for (const row of [...primary, ...fallback]) {
    const key = ownerHistoryKey(row);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      continue;
    }

    if (ownerDataScore(row) > ownerDataScore(existing)) {
      merged.set(key, row);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => (b.fromDate?.getTime() ?? -Infinity) - (a.fromDate?.getTime() ?? -Infinity))
    .slice(0, 30)
    .map((row, idx, arr) => ({ ...row, order: arr.length - idx }));
}

function confidenceToneClass(value: string): string {
  const normalized = normalizeText(value);
  if (normalized.includes("velmi") || normalized.includes("vysoka")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized.includes("stred")) return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
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
  const borderTone = {
    neutral: "border-slate-200",
    green: "border-emerald-200",
    rose: "border-rose-200",
    amber: "border-amber-200",
  }[tone];

  const valueTone = {
    neutral: "text-slate-900",
    green: "text-emerald-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
  }[tone];

  return (
    <div className={`rounded-2xl border bg-white px-4 py-3 ${borderTone}`}>
      <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        <span>{title}</span>
      </div>
      <div className={`mt-2 text-4xl font-semibold leading-none tracking-tight ${valueTone}`}>{value}</div>
      {subtitle && <div className="mt-2 text-sm text-slate-500">{subtitle}</div>}
    </div>
  );
}

function PriceBand({
  marketMin,
  marketMax,
  estimate,
  rangeLow,
  rangeHigh,
  segmentUnderPct,
  segmentFairPct,
  segmentOverPct,
  markerPct,
}: {
  marketMin: number;
  marketMax: number;
  estimate: number;
  rangeLow: number;
  rangeHigh: number;
  segmentUnderPct?: number | null;
  segmentFairPct?: number | null;
  segmentOverPct?: number | null;
  markerPct?: number | null;
}) {
  const spread = Math.max(1, marketMax - marketMin);
  const estimatePos =
    markerPct != null && Number.isFinite(markerPct)
      ? clamp(markerPct, 0, 100)
      : clamp(((estimate - marketMin) / spread) * 100, 0, 100);
  const lowPos = clamp(((rangeLow - marketMin) / spread) * 100, 0, 100);
  const highPos = clamp(((rangeHigh - marketMin) / spread) * 100, 0, 100);
  const fairRangeStart = Math.min(lowPos, highPos);
  const fairRangeEnd = Math.max(lowPos, highPos);
  const underPct = clamp(segmentUnderPct ?? 42, 0, 100);
  const fairPct = clamp(segmentFairPct ?? 16, 0, Math.max(0, 100 - underPct));
  const overPct = clamp(segmentOverPct ?? 42, 0, Math.max(0, 100 - underPct - fairPct));
  const fairEnd = clamp(underPct + fairPct, 0, 100);
  const overLeft = clamp(underPct + fairPct, 0, 100);
  const estimateLabelPos = clamp(estimatePos, 10, 90);
  const fairRangeWidth = Math.max(2, fairRangeEnd - fairRangeStart);
  const segmentTotal = Math.max(1, underPct + fairPct + overPct);
  const underShare = Math.round((underPct / segmentTotal) * 100);
  const fairShare = Math.round((fairPct / segmentTotal) * 100);
  const overShare = Math.max(0, 100 - underShare - fairShare);
  const zone = estimatePos < underPct ? "PODHODNOCENÉ PÁSMO" : estimatePos <= fairEnd ? "FÉROVÉ PÁSMO" : "PŘEDRAŽENÉ PÁSMO";
  const zoneClass =
    estimatePos < underPct
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : estimatePos <= fairEnd
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700">Rozpětí srovnatelných inzerátů</div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${zoneClass}`}>
          {zone}
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 sm:px-4">
        <div className="relative pb-8 pt-2">
          <div className="relative h-4 overflow-hidden rounded-full bg-slate-200">
            <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${underPct}%` }} />
            <div className="absolute inset-y-0 bg-blue-500" style={{ left: `${underPct}%`, width: `${fairPct}%` }} />
            <div className="absolute inset-y-0 bg-rose-500" style={{ left: `${overLeft}%`, width: `${overPct}%` }} />
            <div
              className="absolute inset-y-0 rounded-full border border-blue-600/45 bg-blue-700/15"
              style={{ left: `${fairRangeStart}%`, width: `${fairRangeWidth}%` }}
            />
          </div>

          <div className="pointer-events-none absolute -top-1 bottom-0 border-l-2 border-slate-900/90" style={{ left: `${estimatePos}%` }} />
          <div className="pointer-events-none absolute top-0 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.7)]" style={{ left: `${estimatePos}%` }} />

          <div className="absolute -top-8 -translate-x-1/2" style={{ left: `${estimateLabelPos}%` }}>
            <span className="inline-flex whitespace-nowrap rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm">
              Náš odhad {formatCurrency(estimate)}
            </span>
          </div>
        </div>

        <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs text-slate-500 sm:text-sm">
          <span className="font-medium">{formatCurrency(marketMin)}</span>
          <span className="text-center font-semibold text-slate-700">
            Férové rozpětí {formatCurrency(rangeLow)} - {formatCurrency(rangeHigh)}
          </span>
          <span className="font-medium">{formatCurrency(marketMax)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
          <Dot className="h-4 w-4" />
          PODHODNOCENÉ {underShare} %
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
          <Dot className="h-4 w-4" />
          FÉROVÉ {fairShare} %
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
          <Dot className="h-4 w-4" />
          PŘEDRAŽENÉ {overShare} %
        </span>
      </div>
    </div>
  );
}

function MileagePriceBars({
  rows,
  highlightedMileageKm,
}: {
  rows: MileagePriceRow[];
  highlightedMileageKm?: number | null;
}) {
  const maxPrice = Math.max(...rows.map((row) => row.price));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
        <BarChart3 className="h-5 w-5 text-slate-500" />
        <span>Cena podle nájezdu</span>
      </h3>

      <div className="space-y-2.5">
        {rows.map((row, idx) => {
          const computedWidth = clamp((row.price / Math.max(1, maxPrice)) * 100, 10, 100);
          const width =
            row.widthPercent != null && Number.isFinite(row.widthPercent)
              ? clamp(row.widthPercent, 10, 100)
              : computedWidth;
          return (
            <div key={`${row.km}-${row.price}-${idx}`} className="grid grid-cols-[92px_1fr_124px] items-center gap-3">
              <div className={`text-right text-sm font-semibold ${row.highlighted ? "text-emerald-700" : "text-slate-500"}`}>
                {formatNumber(row.km)} km
              </div>
              <div className="h-10 overflow-hidden rounded-xl bg-slate-100">
                <div
                  className={`h-full rounded-xl ${row.highlighted ? "bg-emerald-600" : "bg-emerald-300"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className={`text-right text-sm font-semibold ${row.highlighted ? "text-emerald-700" : "text-slate-800"}`}>
                {formatCurrency(row.price)}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {isPlausibleMileage(highlightedMileageKm)
          ? `Zvýrazněno pro nájezd ~${formatNumber(highlightedMileageKm)} km`
          : "Zvýrazněno pro aktuální nájezd."}
      </p>
    </div>
  );
}

function MileageChart({ points }: { points: MileagePoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const safeActiveIndex =
    activeIndex != null && activeIndex >= 0 && activeIndex < points.length ? activeIndex : null;

  if (!points.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Historie tachometru zatím není dostupná.
      </div>
    );
  }

  const tickStep = 60_000;
  const width = 960;
  const height = 360;
  const paddingX = 56;
  const paddingY = 34;

  const maxKmRaw = Math.max(...points.map((point) => point.km), tickStep);
  const chartMax = Math.max(tickStep * 2, Math.ceil(maxKmRaw / tickStep) * tickStep);
  const chartMin = 0;
  const range = Math.max(1, chartMax - chartMin);

  const stepX = points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : 0;
  const mapped = points.map((point, index) => {
    const x = paddingX + stepX * index;
    const y = height - paddingY - ((point.km - chartMin) / range) * (height - paddingY * 2);
    return { x, y, point, index };
  });

  const smoothPath = mapped.reduce((acc, item, idx, arr) => {
    if (idx === 0) return `M ${item.x} ${item.y}`;
    const prev = arr[idx - 1];
    const prevPrev = arr[idx - 2] ?? prev;
    const next = arr[idx + 1] ?? item;
    const smoothing = 0.2;
    const cp1x = prev.x + (item.x - prevPrev.x) * smoothing;
    const cp1y = prev.y + (item.y - prevPrev.y) * smoothing;
    const cp2x = item.x - (next.x - prev.x) * smoothing;
    const cp2y = item.y - (next.y - prev.y) * smoothing;
    return `${acc} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${item.x} ${item.y}`;
  }, "");

  const active = safeActiveIndex == null ? null : mapped[safeActiveIndex] ?? null;
  const previous = safeActiveIndex != null && safeActiveIndex > 0 ? points[safeActiveIndex - 1] : null;

  const tooltipDate = active?.point.date?.toLocaleDateString("cs-CZ") ?? active?.point.label ?? "";
  const tooltipKm = active ? formatKm(active.point.km) : "";
  const tooltipDelta = (() => {
    if (!active || !previous || !active.point.date || !previous.date) return null;
    const days = Math.round((active.point.date.getTime() - previous.date.getTime()) / 86_400_000);
    if (days <= 0) return null;
    const kmDiff = active.point.km - previous.km;
    const sign = kmDiff > 0 ? "+" : "";
    return `${sign}${formatNumber(kmDiff)} km za ${formatNumber(days)} dní`;
  })();

  const tooltipWidth = 180;
  const tooltipHeight = tooltipDelta ? 92 : 74;
  const tooltipX = active
    ? clamp(active.x + 16, paddingX + 8, width - paddingX - tooltipWidth - 8)
    : 0;
  const tooltipY = active
    ? clamp(active.y - tooltipHeight - 14, paddingY + 6, height - paddingY - tooltipHeight - 6)
    : 0;

  const yTicks = Array.from({ length: Math.floor(chartMax / tickStep) + 1 }, (_unused, idx) => idx * tickStep);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
        <Gauge className="h-5 w-5 text-slate-500" />
        Historie tachometru
      </h3>

      <div
        className="overflow-x-auto"
        onMouseLeave={() => setActiveIndex(null)}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] w-full">
          <defs>
            <filter id="chart-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#94a3b8" floodOpacity="0.25" />
            </filter>
          </defs>
          <rect x="0" y="0" width={width} height={height} fill="white" />

          {yTicks.map((tick) => {
            const y = height - paddingY - ((tick - chartMin) / range) * (height - paddingY * 2);
            return <line key={`y-${tick}`} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 8" />;
          })}

          {mapped.map((item) => (
            <line
              key={`x-${item.index}`}
              x1={item.x}
              x2={item.x}
              y1={paddingY}
              y2={height - paddingY}
              stroke="#e2e8f0"
              strokeDasharray="4 8"
            />
          ))}

          {active && (
            <line
              x1={active.x}
              x2={active.x}
              y1={paddingY}
              y2={height - paddingY}
              stroke="#cbd5e1"
              strokeWidth="2"
            />
          )}

          <path d={smoothPath} fill="none" stroke="#3e9a6d" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />

          {mapped.map((item, idx) => (
            <g key={`${item.point.label}-${idx}`}>
              <circle
                cx={item.x}
                cy={item.y}
                r={safeActiveIndex === idx ? "8" : "6.5"}
                fill="#3e9a6d"
                stroke="#ffffff"
                strokeWidth={safeActiveIndex === idx ? "3" : "2.5"}
              />
              <circle
                cx={item.x}
                cy={item.y}
                r="16"
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
              />
              <text x={item.x} y={height - 12} textAnchor="middle" fontSize="12" fill="#64748b">
                {item.point.label}
              </text>
            </g>
          ))}

          {active && (
            <g transform={`translate(${tooltipX}, ${tooltipY})`} filter="url(#chart-tooltip-shadow)">
              <rect x="0" y="0" width={tooltipWidth} height={tooltipHeight} rx="14" fill="#ffffff" stroke="#e2e8f0" />
              <text x="16" y="28" fontSize="12.5" fontWeight="700" fill="#0f172a">{tooltipDate}</text>
              <text x="16" y="51" fontSize="11.5" fill="#334155">{tooltipKm}</text>
              {tooltipDelta && <text x="16" y="71" fontSize="11.5" fill="#64748b">{tooltipDelta}</text>}
            </g>
          )}

          {yTicks.map((tick) => {
            const y = height - paddingY - ((tick - chartMin) / range) * (height - paddingY * 2);
            return (
              <text key={`yt-${tick}`} x={paddingX - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill="#64748b">
                {formatNumber(tick / 1000)}k
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function StkCard({ check }: { check: StkCheck }) {
  return (
    <article className="rounded-3xl border border-emerald-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-xl font-semibold text-slate-900">{check.dateLabel}</div>
          <div className="text-base font-semibold text-slate-600">{formatKm(check.mileageKm)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={check.sourceLabel === "SME" ? "amber" : "green"}>{check.sourceLabel}</Pill>
          <Pill>{check.typeLabel}</Pill>
          <Pill tone={check.isPassed ? "green" : "rose"}>{check.resultLabel}</Pill>
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
      </div>
    </article>
  );
}

function OwnerCard({ owner }: { owner: OwnerRecord }) {
  return (
    <article className={`rounded-3xl border bg-white p-4 ${owner.isCurrent ? "border-emerald-300" : "border-slate-200"}`}>
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
  const surfaceClass = expanded
    ? "border-emerald-300 bg-emerald-50/70 shadow-sm shadow-emerald-100/80"
    : "border-slate-200 bg-slate-50";
  const countClass = expanded
    ? "border-emerald-200 bg-white text-emerald-700"
    : "border-slate-200 bg-white text-slate-600";
  const arrowClass = expanded
    ? "border-emerald-200 bg-white text-emerald-600"
    : "border-slate-200 bg-white text-slate-500";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className={`group flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white ${surfaceClass}`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
          {icon}
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-slate-500">{subtitle}</span>
      </span>
      <span className="ml-3 inline-flex shrink-0 items-center gap-2">
        <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold ${countClass}`}>
          {countLabel}
        </span>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition group-hover:text-slate-700 ${arrowClass}`}>
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </span>
      </span>
    </button>
  );
}

function TechnicalSection({ section }: { section: SpecSection }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xl font-semibold text-slate-900">{section.title}</h4>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/80">
        <div className="divide-y divide-slate-100">
          {section.rows.map((row, idx) => (
            <div key={`${section.title}-${idx}`} className="grid grid-cols-1 gap-3 px-5 py-3 text-sm sm:grid-cols-2 sm:gap-6 sm:text-base">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="text-slate-500">{row.left.label}</span>
                <span className="font-semibold text-slate-900">{row.left.value}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="text-slate-500">{row.right.label}</span>
                <span className="font-semibold text-slate-900">{row.right.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VehicleAuditLoadingState({
  phaseIndex,
  progress,
}: {
  phaseIndex: number;
  progress: number;
}) {
  const safePhaseIndex = clamp(phaseIndex, 0, VEHICLE_LOADING_PHASES.length - 1);
  const progressPct = clamp(Math.round(progress), 0, 99);
  const phase = VEHICLE_LOADING_PHASES[safePhaseIndex];

  return (
    <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,#ffffff_0%,#ffffff_36%,#fff1ff_36%,#fff8ff_56%,#ffffff_56%,#ffffff_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#020617_0%,#bd00c9_56%,#ff79f2_100%)]" />

      <div className="relative grid min-h-[390px] gap-8 px-7 py-8 sm:px-10 sm:py-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
        <div className="min-w-0">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-700 shadow-[0_10px_24px_rgba(189,0,201,0.1)]">
            <CarFront className="h-3.5 w-3.5" />
            Proklepka vozidla
          </div>

          <div className="mt-8 flex items-end gap-2">
            <span className="text-[92px] font-black leading-[0.82] tracking-tight text-black sm:text-[122px]">
              {progressPct}
            </span>
            <span className="pb-2 text-4xl font-black leading-none text-[#bd00c9] sm:text-5xl">
              %
            </span>
          </div>

          <div className="mt-7 space-y-2">
            <h2 className="text-3xl font-black leading-tight tracking-tight text-black sm:text-4xl">
              Prověřuji vozidlo
            </h2>
            <p className="min-h-[28px] text-base font-bold text-slate-500 sm:text-lg">
              {phase}
            </p>
          </div>

          <div className="mt-8 max-w-md">
            <div className="h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#020617_0%,#bd00c9_62%,#ff79f2_100%)] transition-[width] duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-3 h-px w-full bg-[linear-gradient(90deg,rgba(2,6,23,0.22),rgba(189,0,201,0.34),rgba(2,6,23,0))]" />
          </div>
        </div>

        <div className="relative flex min-h-[270px] items-center justify-center overflow-hidden px-5 py-8">
          <div className="absolute inset-0 opacity-[0.34] [background-image:linear-gradient(rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="absolute inset-x-8 bottom-10 h-3 rounded-full bg-slate-950/10 blur-md" />

          <div className="relative h-[230px] w-full max-w-[560px]">
            <svg
              viewBox="0 0 560 240"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="vehicle-loader-body" x1="86" y1="64" x2="484" y2="178" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#020617" />
                  <stop offset="0.52" stopColor="#111827" />
                  <stop offset="1" stopColor="#020617" />
                </linearGradient>
                <linearGradient id="vehicle-loader-window" x1="200" y1="64" x2="378" y2="120" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.96" />
                  <stop offset="1" stopColor="#e5e7eb" stopOpacity="0.86" />
                </linearGradient>
                <linearGradient id="vehicle-loader-fuchsia" x1="108" y1="139" x2="164" y2="139" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ff79f2" />
                  <stop offset="1" stopColor="#bd00c9" />
                </linearGradient>
                <filter id="vehicle-loader-shadow" x="-8%" y="-24%" width="116%" height="156%">
                  <feDropShadow dx="0" dy="20" stdDeviation="18" floodColor="#020617" floodOpacity="0.22" />
                </filter>
                <filter id="vehicle-loader-glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <ellipse cx="282" cy="204" rx="218" ry="16" fill="#020617" opacity="0.1" />
              <g filter="url(#vehicle-loader-shadow)">
                <path
                  d="M83 148c3-31 20-45 54-45h33l44-49c13-14 31-21 54-21h91c24 0 41 9 53 27l26 40h24c27 0 45 13 52 38l7 29c4 17-8 34-25 34H72c-15 0-26-13-23-27l4-18c3-6 13-8 30-8Z"
                  fill="url(#vehicle-loader-body)"
                />
                <path
                  d="M195 101l35-38c8-8 19-13 33-13h32v51H195Z"
                  fill="url(#vehicle-loader-window)"
                />
                <path
                  d="M314 50h42c14 0 25 6 33 18l22 33h-97V50Z"
                  fill="url(#vehicle-loader-window)"
                />
                <path
                  d="M306 50v51"
                  stroke="#020617"
                  strokeOpacity="0.35"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M228 59c9-8 20-12 34-12h94c14 0 26 7 35 19"
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0.22"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <rect x="107" y="133" width="56" height="15" rx="7.5" fill="url(#vehicle-loader-fuchsia)" filter="url(#vehicle-loader-glow)" />
                <rect x="456" y="132" width="44" height="15" rx="7.5" fill="#f8fafc" opacity="0.96" />
                <path
                  d="M178 129h45"
                  stroke="#ffffff"
                  strokeOpacity="0.13"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <path
                  d="M349 128h36"
                  stroke="#ffffff"
                  strokeOpacity="0.13"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <circle cx="160" cy="190" r="43" fill="#020617" />
                <circle cx="160" cy="190" r="26" fill="#ffffff" />
                <circle cx="160" cy="190" r="12" fill="#cbd5e1" />
                <circle cx="426" cy="190" r="43" fill="#020617" />
                <circle cx="426" cy="190" r="26" fill="#ffffff" />
                <circle cx="426" cy="190" r="12" fill="#cbd5e1" />
              </g>
            </svg>

            <div className="vehicle-scan-lens absolute top-1/2 z-10 flex h-28 w-28 items-center justify-center rounded-full border border-fuchsia-300/80 bg-white/65 shadow-[0_22px_50px_rgba(189,0,201,0.2)] backdrop-blur-md">
              <Search className="h-11 w-11 text-[#bd00c9]" strokeWidth={2.6} />
              <span className="absolute -bottom-8 right-2 h-12 w-4 rotate-[-38deg] rounded-full bg-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.24)]" />
            </div>

            <div className="vehicle-scan-beam absolute top-[12%] z-[9] h-[76%] w-[2px] rounded-full bg-[#bd00c9] shadow-[0_0_18px_rgba(189,0,201,0.72),0_0_42px_rgba(255,121,242,0.45)]" />
          </div>
        </div>
      </div>
    </section>
  );
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
  const [proklepniReport, setProklepniReport] = useState<ProklepniReportPayload | null>(null);
  const [ownerFallbackRecords, setOwnerFallbackRecords] = useState<OwnerRecord[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<"vin" | "orv" | null>(null);
  const [searchActivated, setSearchActivated] = useState(false);
  const [stkExpanded, setStkExpanded] = useState(false);
  const [ownersExpanded, setOwnersExpanded] = useState(false);
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const autoLookupVinRef = useRef<string | null>(null);
  const compactVinInputRef = useRef<HTMLInputElement | null>(null);
  const resultScrollTargetRef = useRef<HTMLDivElement | null>(null);

  const [sautoLoading, setSautoLoading] = useState(false);
  const [sautoError, setSautoError] = useState<string | null>(null);
  const [sautoMarket, setSautoMarket] = useState<SautoMarketResponse | null>(null);
  const [sautoPanelActivated, setSautoPanelActivated] = useState(false);

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

  useEffect(() => {
    if (!loading) {
      const resetFrame = window.requestAnimationFrame(() => {
        setLoadingPhaseIndex(0);
        setLoadingProgress(0);
      });
      return () => window.cancelAnimationFrame(resetFrame);
    }

    setLoadingPhaseIndex(0);
    setLoadingProgress(7);

    const phaseInterval = window.setInterval(() => {
      setLoadingPhaseIndex((current) => (current + 1) % VEHICLE_LOADING_PHASES.length);
    }, 1200);
    const progressInterval = window.setInterval(() => {
      setLoadingProgress((current) => {
        if (current < 34) return Math.min(current + 5, 34);
        if (current < 68) return Math.min(current + 3, 68);
        if (current < 92) return Math.min(current + 2, 92);
        return Math.min(current + 1, 97);
      });
    }, 170);

    return () => {
      window.clearInterval(phaseInterval);
      window.clearInterval(progressInterval);
    };
  }, [loading]);

  const data = (result?.payload?.Data ?? null) as VehicleData | null;
  const displayedVin = safeStr(result?.vin ?? vin);
  const proklepniSummary = (readObject(proklepniReport?.summary) ?? null) as ProklepniReportSummary | null;
  const proklepniStkStatus = (readObject(proklepniReport?.stkStatus) ?? null) as ProklepniReportStkStatus | null;
  const proklepniHero = (readObject(proklepniReport?.hero) ?? null) as ProklepniReportHero | null;
  const proklepniValuation = (readObject(proklepniReport?.valuation) ?? null) as ProklepniReportValuation | null;
  const proklepniTechnical = (readObject(proklepniReport?.technical) ?? null) as ProklepniReportTechnical | null;
  const proklepniTechnicalSectionsRaw = useMemo(
    () =>
      Array.isArray(proklepniTechnical?.sections)
        ? (proklepniTechnical.sections as ProklepniReportTechnicalSection[])
        : [],
    [proklepniTechnical?.sections]
  );
  const proklepniOwnersRaw = useMemo(
    () =>
      Array.isArray(proklepniReport?.owners)
        ? (proklepniReport.owners as ProklepniReportOwnerRow[])
        : [],
    [proklepniReport?.owners]
  );
  const proklepniInspectionsRaw = useMemo(
    () =>
      Array.isArray(proklepniReport?.inspections)
        ? (proklepniReport.inspections as ProklepniReportInspectionRow[])
        : [],
    [proklepniReport?.inspections]
  );
  const proklepniOdometerRaw = useMemo(
    () =>
      Array.isArray(proklepniReport?.odometerHistory)
        ? (proklepniReport.odometerHistory as ProklepniReportOdometerRow[])
        : [],
    [proklepniReport?.odometerHistory]
  );
  const proklepniValuationRowsRaw = useMemo(
    () =>
      Array.isArray(proklepniValuation?.mileagePriceRows)
        ? (proklepniValuation.mileagePriceRows as ProklepniReportValuationMileageRow[])
        : [],
    [proklepniValuation?.mileagePriceRows]
  );

  const summary = useMemo<VehicleSummary | null>(() => {
    if (!data) return null;

    const firstRegistrationRaw = firstOf(data, ["DatumPrvniRegistrace", "PrvniRegistrace"]);
    const firstRegistration = parseDateLoose(firstRegistrationRaw);
    const yearFromApi = toNumber(firstOf(data, ["RokVyroby", "VozidloRokVyroby"]));
    const yearFromProklepni = toNumber(proklepniHero?.yearLabel);
    const year = yearFromProklepni ?? yearFromApi ?? firstRegistration?.getFullYear() ?? null;

    const stkRaw = proklepniStkStatus?.nextDue ?? firstOf(data, [
      "PravidelnaTechnickaProhlidkaDo",
      "StkDo",
      "STKDo",
      "DatumStkDo",
      "TechnickaProhlidkaDo",
      "PlatnostStkDo",
    ]);

    const category = safeStr(firstOf(data, ["Kategorie", "KategorieVozidla"]));
    const body = safeStr(firstOf(data, ["DruhVozidla", "Typ", "VozidloKaroserieDruh"]));
    const fuelFromProklepni = safeStr(proklepniHero?.fuelLabel);
    const powerFromProklepni = parsePowerKwFromLabel(proklepniHero?.powerLabel);
    const colorFromProklepni = safeStr(proklepniHero?.colorLabel);
    const ownerCountFromProklepni = toNumber(proklepniSummary?.ownerCount);
    const ownerCountFromApi = toNumber(firstOf(data, ["PocetVlastniku"]));
    const ownerCount = ownerCountFromProklepni ?? ownerCountFromApi;
    const ownerCountLabel = ownerCount != null ? formatNumber(ownerCount) : safeStr(firstOf(data, ["PocetVlastniku"]));
    const statusFromProklepni = safeStr(proklepniReport?.status);

    return {
      brand: safeStr(firstOf(data, ["TovarniZnacka", "Znacka", "ZnackaVozidla"])),
      model: safeStr(firstOf(data, ["ObchodniOznaceni", "Model", "Typ"])),
      year,
      firstRegistration,
      firstRegistrationLabel: formatDateCs(firstRegistration),
      fuel: fuelFromProklepni !== "—" ? fuelFromProklepni : safeStr(firstOf(data, ["Palivo", "DruhPaliva"])),
      powerKw: powerFromProklepni ?? toNumber(firstOf(data, ["MotorMaxVykon", "Vykon", "MaxVykon"])),
      displacement: toNumber(firstOf(data, ["MotorZdvihObjem", "ZdvihovyObjem", "ObjemMotoru"])),
      category,
      body,
      color: colorFromProklepni !== "—" ? colorFromProklepni : safeStr(firstOf(data, ["VozidloKaroserieBarva", "Barva", "BarvaVozidla"])),
      ownerCount,
      status: statusFromProklepni !== "—" ? statusFromProklepni : statusLabel(data),
      categoryLabel: [category, body].filter((value) => value !== "—").join(" · ") || "—",
      stkDoLabel: formatDateCs(parseDateLoose(stkRaw)),
      ownerCountLabel,
      operatorCountLabel: safeStr(firstOf(data, ["PocetProvozovatelu"])),
    };
  }, [data, proklepniHero, proklepniReport?.status, proklepniStkStatus?.nextDue, proklepniSummary?.ownerCount]);

  const stkRaw = useMemo(
    () =>
      proklepniStkStatus?.nextDue ?? firstOf(data, [
        "PravidelnaTechnickaProhlidkaDo",
        "StkDo",
        "STKDo",
        "DatumStkDo",
        "TechnickaProhlidkaDo",
        "PlatnostStkDo",
      ]),
    [data, proklepniStkStatus?.nextDue]
  );
  const stkDate = useMemo(() => parseDateLoose(stkRaw), [stkRaw]);
  const stkState = useMemo(
    () => resolveStkToneWithState(proklepniStkStatus?.state, stkRaw),
    [proklepniStkStatus?.state, stkRaw]
  );
  const orvLabel = useMemo(
    () => safeStr(firstOf(data, ["CisloOrv", "CisloORV"])),
    [data]
  );

  const stkSignals = useMemo(() => collectPatternRows(data, STK_PATTERNS), [data]);
  const mileageSignals = useMemo(() => collectPatternRows(data, MILEAGE_PATTERNS), [data]);

  const stkObjects = useMemo(() => collectObjectRows(data, STK_PATTERNS), [data]);
  const ownerObjects = useMemo(() => {
    const byKey = collectObjectRows(data, OWNER_PATTERNS, 400);
    const byStructure = collectAllObjectRows(data, 900);
    const merged = Array.from(new Map([...byKey, ...byStructure].map((row) => [row.path, row])).values());
    return merged;
  }, [data]);

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

  const proklepniOwnerRecords = useMemo(
    () => normalizeProklepniOwnerRecords(proklepniOwnersRaw),
    [proklepniOwnersRaw]
  );
  const proklepniStkChecks = useMemo(
    () => normalizeProklepniStkChecks(proklepniInspectionsRaw),
    [proklepniInspectionsRaw]
  );
  const proklepniMileageHistory = useMemo(
    () => normalizeProklepniMileageHistory(proklepniOdometerRaw),
    [proklepniOdometerRaw]
  );
  const proklepniMileagePriceRows = useMemo(
    () => normalizeProklepniMileagePriceRows(proklepniValuationRowsRaw),
    [proklepniValuationRowsRaw]
  );

  const mileageKm = useMemo(() => {
    const fromProklepni = toNumber(proklepniSummary?.lastOdometerKm);
    if (isPlausibleMileage(fromProklepni)) return fromProklepni;
    const fromValuation = toNumber(proklepniValuation?.referenceMileageKm);
    if (isPlausibleMileage(fromValuation)) return fromValuation;
    if (isPlausibleMileage(bestMileageSignal?.numericValue)) return bestMileageSignal.numericValue;
    return null;
  }, [bestMileageSignal?.numericValue, proklepniSummary?.lastOdometerKm, proklepniValuation?.referenceMileageKm]);

  const estimate = useMemo(
    () =>
      buildVehicleValuationEstimate({
        summary,
        mileageKm,
        newPrice: null,
        condition: "good",
        serviceHistory: "unknown",
        origin: "unknown",
        equipment: "standard",
        damage: "none",
        usage: "private",
      }),
    [mileageKm, summary]
  );

  const ownersCountNum = toNumber(proklepniSummary?.ownerCount) ?? toNumber(summary?.ownerCountLabel);
  const ownerCountLabel = ownersCountNum != null ? formatNumber(ownersCountNum) : safeStr(summary?.ownerCountLabel);

  const ownerRecords = useMemo(
    () => buildOwnerRecords(ownerObjects, ownersCountNum),
    [ownerObjects, ownersCountNum]
  );

  useEffect(() => {
    setOwnerFallbackRecords(null);
  }, [displayedVin]);

  useEffect(() => {
    const queryVin = normalizeVinInput(displayedVin);
    const expectedCount = ownersCountNum ?? summary?.ownerCount ?? null;
    const historicalCount = ownerRecords.filter((row) => row.toDate != null || !row.isCurrent).length;
    const needsFallback =
      ownerRecords.length <= 2
      || (expectedCount != null && ownerRecords.length < expectedCount)
      || (historicalCount === 0 && (expectedCount == null || expectedCount > 2));

    if (!result || !summary || loading) return;
    if (!queryVin || queryVin.length < 11) return;
    if (proklepniOwnerRecords.length > 0) return;
    if (!needsFallback) return;
    if (ownerFallbackRecords && ownerFallbackRecords.length >= ownerRecords.length) return;
    if (!user) return;

    const controller = new AbortController();
    let cancelled = false;

    const loadFallbackOwners = async () => {
      try {
        const { response, data } = await fetchAuthedJson<ProklepniOwnersResponse>(user, `/api/proklepni/owners?vin=${encodeURIComponent(queryVin)}`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const payload = data;
        if (!payload || payload.ok !== true || !Array.isArray(payload.records) || cancelled) return;

        const mapped = payload.records
          .map((item, idx, arr) => {
            const row = item as ProklepniOwnerRow;
            const fromDate = parseDateLoose(row.fromIso);
            const toDate = parseDateLoose(row.toIso);
            const name = safeStr(row.name);
            const roleLabel = safeStr(row.roleLabel);
            const icoLabel = safeStr(row.icoLabel);
            const addressLabel = safeStr(row.addressLabel);

            return {
              id: `fallback-proklepni-${idx}-${name}-${roleLabel}-${formatDateCs(fromDate)}-${formatDateCs(toDate)}`,
              order: arr.length - idx,
              name: name === "—" ? "Neuvedený subjekt" : name,
              roleLabel: roleLabel === "—" ? "vlastník + provozovatel" : roleLabel,
              icoLabel: icoLabel === "—" ? "IČO neuvedeno" : icoLabel,
              addressLabel: addressLabel === "—" ? "Adresa neuvedena" : addressLabel,
              fromDate,
              toDate,
              fromLabel: formatDateCs(fromDate),
              toLabel: toDate ? formatDateCs(toDate) : "dosud",
              isCurrent: row.isCurrent === true || toDate == null,
            } satisfies OwnerRecord;
          })
          .filter((row) => row.fromDate != null || row.toDate != null || row.name !== "Neuvedený subjekt");

        if (mapped.length > 0 && !cancelled) {
          setOwnerFallbackRecords(mapped);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    };

    void loadFallbackOwners();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [displayedVin, loading, ownerFallbackRecords, ownerRecords, ownersCountNum, proklepniOwnerRecords.length, result, summary, user]);

  const resolvedOwnerRecords = useMemo(() => {
    if (proklepniOwnerRecords.length > 0) return proklepniOwnerRecords;
    return mergeOwnerHistory(ownerRecords, ownerFallbackRecords ?? []);
  }, [ownerFallbackRecords, ownerRecords, proklepniOwnerRecords]);

  const stkChecks = useMemo(
    () =>
      proklepniStkChecks.length > 0
        ? proklepniStkChecks
        : buildStkChecks(stkObjects, stkSignals, mileageSignals, stkDate, mileageKm),
    [mileageKm, mileageSignals, proklepniStkChecks, stkDate, stkObjects, stkSignals]
  );

  const currentOwner = resolvedOwnerRecords.find((row) => row.roleLabel.includes("vlast") && row.isCurrent) ?? resolvedOwnerRecords[0] ?? null;
  const currentOperator =
    resolvedOwnerRecords.find((row) => row.roleLabel.includes("provoz") && row.isCurrent) ?? resolvedOwnerRecords[1] ?? resolvedOwnerRecords[0] ?? null;
  const averageAnnualKm =
    toNumber(proklepniSummary?.avgAnnualKm) ??
    Math.round(estimate.expectedMileage / Math.max(1, estimate.ageYears || 1));
  const stkNoteLabel = safeStr(proklepniStkStatus?.note);
  const imported = toBool(proklepniSummary?.wasImported);
  const importCountryLabel = safeStr(proklepniSummary?.importCountry);
  const originValue =
    imported === true ? "Dovoz" : imported === false ? "ČR" : (summary?.categoryLabel ?? "—");
  const originSubtitle =
    imported === true
      ? (importCountryLabel !== "—" ? importCountryLabel : "Původ neuveden")
      : (summary?.status ?? "—");

  const manualMileageKm = useMemo(() => {
    const parsed = toNumber(refineMileage);
    return isPlausibleMileage(parsed) ? parsed : null;
  }, [refineMileage]);

  const proklepniInterpolatedPrice = useMemo(() => {
    if (!isPlausibleMileage(manualMileageKm)) return null;
    if (proklepniMileagePriceRows.length === 0) return null;

    const sorted = [...proklepniMileagePriceRows].sort((a, b) => a.km - b.km);
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
  }, [manualMileageKm, proklepniMileagePriceRows]);

  const valuationRecommended =
    proklepniInterpolatedPrice ??
    toNumber(proklepniValuation?.estimatedPrice) ??
    estimate.recommended;
  const baseValuationRangeLow = toNumber(proklepniValuation?.fairRangeLow) ?? estimate.rangeLow;
  const baseValuationRangeHigh = toNumber(proklepniValuation?.fairRangeHigh) ?? estimate.rangeHigh;
  const valuationFairRangePct = toNumber(proklepniValuation?.fairRangePct);
  const valuationRangeLow = useMemo(() => {
    if (proklepniInterpolatedPrice == null || valuationFairRangePct == null) return baseValuationRangeLow;
    return roundTo(proklepniInterpolatedPrice * (1 - valuationFairRangePct / 100), 1_000);
  }, [baseValuationRangeLow, proklepniInterpolatedPrice, valuationFairRangePct]);
  const valuationRangeHigh = useMemo(() => {
    if (proklepniInterpolatedPrice == null || valuationFairRangePct == null) return baseValuationRangeHigh;
    return roundTo(proklepniInterpolatedPrice * (1 + valuationFairRangePct / 100), 1_000);
  }, [baseValuationRangeHigh, proklepniInterpolatedPrice, valuationFairRangePct]);
  const valuationComparableCount = toNumber(proklepniValuation?.comparableCount);
  const valuationReferenceMileage =
    manualMileageKm ??
    toNumber(proklepniValuation?.referenceMileageKm) ??
    mileageKm;
  const valuationConfidenceRaw = safeStr(proklepniValuation?.confidenceLabel);
  const valuationConfidenceLabel =
    valuationConfidenceRaw !== "—"
      ? valuationConfidenceRaw
      : `${confidenceLabel(estimate.confidenceScore)} spolehlivost`;
  const valuationInfoTitle = safeStr(proklepniValuation?.infoTitle);
  const valuationInfoText = safeStr(proklepniValuation?.infoText);
  const valuationMarkerPct = manualMileageKm != null ? null : toNumber(proklepniValuation?.markerPct);
  const valuationSegmentUnderPct = toNumber(proklepniValuation?.segmentUnderPct);
  const valuationSegmentFairPct = toNumber(proklepniValuation?.segmentFairPct);
  const valuationSegmentOverPct = toNumber(proklepniValuation?.segmentOverPct);
  const valuationHighlightedMileageKm = manualMileageKm ?? toNumber(proklepniValuation?.highlightedMileageKm);

  const hasVehicleForSauto = !!summary && summary.brand !== "—" && summary.model !== "—";

  const marketRecommendation = useMemo(() => {
    const marketPrice = sautoMarket?.stats.recommended;
    if (marketPrice == null || !Number.isFinite(marketPrice)) return null;
    return roundTo(marketPrice * 0.7 + valuationRecommended * 0.3, 5_000);
  }, [sautoMarket?.stats.recommended, valuationRecommended]);

  const sautoVsInternalPct = useMemo(() => {
    const marketPrice = sautoMarket?.stats.recommended;
    if (marketPrice == null || !Number.isFinite(marketPrice) || valuationRecommended <= 0) return null;
    return ((marketPrice - valuationRecommended) / valuationRecommended) * 100;
  }, [sautoMarket?.stats.recommended, valuationRecommended]);

  const fallbackMarketMin = useMemo(() => {
    const min = sautoMarket?.stats.min;
    if (min != null && Number.isFinite(min)) return min;
    return Math.max(50_000, roundTo(valuationRangeLow * 0.8, 1_000));
  }, [sautoMarket?.stats.min, valuationRangeLow]);

  const fallbackMarketMax = useMemo(() => {
    const max = sautoMarket?.stats.max;
    if (max != null && Number.isFinite(max)) return max;
    return roundTo(valuationRangeHigh * 1.25, 1_000);
  }, [sautoMarket?.stats.max, valuationRangeHigh]);

  const marketMin = toNumber(proklepniValuation?.marketMin) ?? fallbackMarketMin;
  const marketMax = toNumber(proklepniValuation?.marketMax) ?? fallbackMarketMax;

  const mileagePriceRows = useMemo<MileagePriceRow[]>(() => {
    if (proklepniMileagePriceRows.length > 0) {
      const highlightedKm = isPlausibleMileage(valuationHighlightedMileageKm)
        ? valuationHighlightedMileageKm
        : null;

      return proklepniMileagePriceRows.map((row) => ({
        ...row,
        highlighted:
          row.highlighted ||
          (highlightedKm != null && Math.abs(row.km - highlightedKm) <= 9_000) ||
          (valuationReferenceMileage != null && Math.abs(row.km - valuationReferenceMileage) <= 9_000),
      }));
    }

    const baseMileage = mileageKm ?? estimate.expectedMileage;
    const safeBase = Math.max(30_000, baseMileage || 120_000);

    const offsets = [-150_000, -120_000, -90_000, -60_000, -30_000, 0, 30_000, 60_000, 90_000, 120_000, 150_000];

    return offsets.map((offset) => {
      const km = Math.max(15_000, roundTo(safeBase + offset, 1_000));
      const relative = (km - safeBase) / Math.max(40_000, safeBase);
      const price = roundTo(estimate.recommended * (1 - relative * 0.55), 1_000);
      return {
        label: formatNumber(km),
        km,
        price: Math.max(60_000, price),
        highlighted: Math.abs(km - safeBase) <= 8_000,
        widthPercent: null,
      };
    });
  }, [
    estimate.expectedMileage,
    estimate.recommended,
    mileageKm,
    proklepniMileagePriceRows,
    valuationHighlightedMileageKm,
    valuationReferenceMileage,
  ]);

  const mileageHistory = useMemo<MileagePoint[]>(() => {
    if (proklepniMileageHistory.length >= 1) {
      return proklepniMileageHistory.slice(-12);
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

    if (unique.length >= 2) return unique.slice(-12);

    const fallbackBase = mileageKm ?? estimate.expectedMileage ?? 120_000;
    const now = new Date();
    const generated: MileagePoint[] = [];
    for (let i = 0; i < 8; i += 1) {
      const dt = new Date(now.getFullYear() - (7 - i), 1, 1);
      const km = Math.max(20_000, Math.round(fallbackBase * (0.45 + i * 0.09)));
      generated.push({
        label: dt.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" }),
        date: dt,
        km,
      });
    }
    return generated;
  }, [estimate.expectedMileage, mileageKm, mileageSignals, proklepniMileageHistory, stkChecks]);

  const technicalSections = useMemo<SpecSection[]>(() => {
    const lookupKey = (value: string) =>
      normalizeText(value)
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const proklepniLookup = new Map<string, Map<string, string>>();
    for (const sectionRaw of proklepniTechnicalSectionsRaw) {
      const sectionObj = readObject(sectionRaw);
      const sectionTitle = safeStr(sectionObj?.title);
      if (sectionTitle === "—") continue;

      const rowMap = new Map<string, string>();
      const rowsRaw = Array.isArray(sectionObj?.rows)
        ? (sectionObj?.rows as ProklepniReportTechnicalRow[])
        : [];

      for (const rowRaw of rowsRaw) {
        const rowObj = readObject(rowRaw);
        const label = safeStr(rowObj?.label);
        const value = safeStr(rowObj?.value);
        if (label === "—" || value === "—") continue;
        rowMap.set(lookupKey(label), value);
      }

      if (rowMap.size > 0) {
        proklepniLookup.set(lookupKey(sectionTitle), rowMap);
      }
    }

    const fromProklepni = (sectionTitles: string[], labels: string[]): string | null => {
      for (const sectionTitle of sectionTitles) {
        const sectionRows = proklepniLookup.get(lookupKey(sectionTitle));
        if (!sectionRows) continue;
        for (const label of labels) {
          const value = sectionRows.get(lookupKey(label));
          if (value && value !== "—") return value;
        }
      }
      return null;
    };

    const v = (
      keys: string[],
      fallback?: { sectionTitles: string[]; labels: string[] }
    ) => {
      const dataValue = safeStr(firstOf(data, keys));
      if (dataValue !== "—") return dataValue;
      if (!fallback) return "—";
      return fromProklepni(fallback.sectionTitles, fallback.labels) ?? "—";
    };

    const vn = (
      keys: string[],
      fallback?: { sectionTitles: string[]; labels: string[] }
    ) => {
      const dataNumber = toNumber(firstOf(data, keys));
      if (dataNumber != null) return formatNumber(dataNumber);
      if (!fallback) return "—";
      const fallbackValue = fromProklepni(fallback.sectionTitles, fallback.labels);
      const fallbackNumber = toNumber(fallbackValue);
      return fallbackNumber != null ? formatNumber(fallbackNumber) : "—";
    };

    const vnUnit = (
      keys: string[],
      unit: string,
      fallback?: { sectionTitles: string[]; labels: string[] }
    ) => {
      const numeric = vn(keys, fallback);
      return numeric === "—" ? "—" : `${numeric} ${unit}`;
    };

    return [
      {
        title: "Motor a výkon",
        rows: [
          {
            left: { label: "Palivo", value: summary?.fuel ?? "—" },
            right: { label: "Výkon", value: summary?.powerKw != null ? `${formatNumber(summary.powerKw)} kW` : "—" },
          },
          {
            left: {
              label: "Otáčky max. výkonu",
              value: v(
                ["MotorOtackyMaxVykon", "OtackyMaxVykon"],
                { sectionTitles: ["Motor a výkon"], labels: ["Otáčky max. výkonu"] }
              ),
            },
            right: { label: "Objem motoru", value: summary?.displacement != null ? `${formatNumber(summary.displacement)} cm³` : "—" },
          },
          {
            left: {
              label: "Kód motoru",
              value: v(
                ["CisloMotoru", "KodMotoru", "MotorKod"],
                { sectionTitles: ["Motor a výkon"], labels: ["Kód motoru"] }
              ),
            },
            right: {
              label: "Max. rychlost",
              value: vnUnit(
                ["NejvyssiRychlost", "MaxRychlost"],
                "km/h",
                { sectionTitles: ["Motor a výkon"], labels: ["Max. rychlost"] }
              ),
            },
          },
        ],
      },
      {
        title: "Spotřeba a emise",
        rows: [
          {
            left: {
              label: "Město",
              value: v(
                ["SpotrebaMesto", "SpotrebaMestska"],
                { sectionTitles: ["Spotřeba paliva (l/100 km)"], labels: ["Město"] }
              ),
            },
            right: {
              label: "Mimo město",
              value: v(
                ["SpotrebaMimoMesto", "SpotrebaMimomestska"],
                { sectionTitles: ["Spotřeba paliva (l/100 km)"], labels: ["Mimo město"] }
              ),
            },
          },
          {
            left: {
              label: "Kombinovaná",
              value: v(
                ["SpotrebaKomb", "SpotrebaKombinovana", "Spotreba"],
                { sectionTitles: ["Spotřeba paliva (l/100 km)"], labels: ["Kombinovaná"] }
              ),
            },
            right: {
              label: "CO₂ kombinované",
              value: v(
                ["EmiseCo2Komb", "Co2", "CO2"],
                { sectionTitles: ["Emise CO₂ (g/km)"], labels: ["Kombinované"] }
              ),
            },
          },
          {
            left: {
              label: "CO₂ město",
              value: v(
                ["EmiseCo2Mesto"],
                { sectionTitles: ["Emise CO₂ (g/km)"], labels: ["Město"] }
              ),
            },
            right: {
              label: "CO₂ mimo město",
              value: v(
                ["EmiseCo2MimoMesto"],
                { sectionTitles: ["Emise CO₂ (g/km)"], labels: ["Mimo město"] }
              ),
            },
          },
        ],
      },
      {
        title: "Rozměry a hmotnost",
        rows: [
          {
            left: {
              label: "Délka",
              value: vnUnit(
                ["Delka", "VozidloDelka", "RozmeryDelka", "DelkaVozidla"],
                "mm",
                { sectionTitles: ["Rozměry a hmotnost"], labels: ["Délka"] }
              ),
            },
            right: {
              label: "Šířka",
              value: vnUnit(
                ["Sirka", "VozidloSirka", "RozmerySirka", "SirkaVozidla"],
                "mm",
                { sectionTitles: ["Rozměry a hmotnost"], labels: ["Šířka"] }
              ),
            },
          },
          {
            left: {
              label: "Výška",
              value: vnUnit(
                ["Vyska", "VozidloVyska", "RozmeryVyska", "VyskaVozidla"],
                "mm",
                { sectionTitles: ["Rozměry a hmotnost"], labels: ["Výška"] }
              ),
            },
            right: {
              label: "Provozní hmotnost",
              value: vnUnit(
                ["HmotnostiProvozni", "ProvozniHmotnost"],
                "kg",
                { sectionTitles: ["Rozměry a hmotnost"], labels: ["Provozní hmotnost"] }
              ),
            },
          },
          {
            left: {
              label: "Počet náprav",
              value: v(
                ["PocetNaprav"],
                { sectionTitles: ["Rozměry a hmotnost"], labels: ["Počet náprav"] }
              ),
            },
            right: {
              label: "Nejv. povolená hmotnost",
              value: vnUnit(
                ["HmotnostiPripPov", "HmotnostiPripPovJS", "NejvetsiPovolenaHmotnost"],
                "kg"
              ),
            },
          },
        ],
      },
      {
        title: "Obsaditelnost a identifikace",
        rows: [
          {
            left: {
              label: "Počet míst celkem",
              value: v(
                ["VozidloKaroserieMist", "PocetMist"],
                { sectionTitles: ["Obsaditelnost"], labels: ["Počet míst celkem"] }
              ),
            },
            right: {
              label: "Míst k sezení",
              value: v(
                ["PocetMistSezeni", "MistaKSezeni"],
                { sectionTitles: ["Obsaditelnost"], labels: ["Míst k sezení"] }
              ),
            },
          },
          {
            left: { label: "Rok výroby", value: summary?.year != null ? String(summary.year) : "—" },
            right: { label: "1. registrace", value: summary?.firstRegistrationLabel ?? "—" },
          },
          {
            left: { label: "1. registrace v ČR", value: formatDateCs(parseDateLoose(firstOf(data, ["DatumPrvniRegistraceVCr", "PrvniRegistraceVCr"]))) },
            right: { label: "Barva", value: summary?.color ?? "—" },
          },
          {
            left: { label: "Typ / varianta", value: `${v(["Typ"], { sectionTitles: ["Identifikace"], labels: ["Typ"] })} / ${v(["Varianta"], { sectionTitles: ["Identifikace"], labels: ["Varianta"] })}` },
            right: { label: "Kategorie / status", value: `${v(["Kategorie", "KategorieVozidla"])} / ${summary?.status ?? "—"}` },
          },
        ],
      },
    ];
  }, [data, proklepniTechnicalSectionsRaw, summary]);

  const canSearch = !!user && vin.trim().length >= 11;

  const handleSearchByVin = useCallback(async (value: string) => {
    if (!user) {
      setError("Přihlaš se, aby šlo načíst data vozidla.");
      return;
    }

    const queryVin = normalizeVinInput(value);
    setLoading(true);
    setError(null);
    setResult(null);
    setProklepniReport(null);
    setStkExpanded(false);
    setOwnersExpanded(false);
    setSautoError(null);
    setSautoMarket(null);

    try {
      const [rsvResult, proklepniResult] = await Promise.allSettled([
        rsvVehicleLookupByVin(queryVin),
        fetchAuthedJson<ProklepniReportResponse>(user, `/api/proklepni/report?vin=${encodeURIComponent(queryVin)}`, {
          method: "GET",
        }),
      ]);

      if (proklepniResult.status === "fulfilled") {
        const { response, data } = proklepniResult.value;
        if (response.ok) {
          const payload = data;
          if (isProklepniReportResponse(payload)) {
            setProklepniReport(payload.report as ProklepniReportPayload);
          }
        }
      }

      if (rsvResult.status !== "fulfilled") {
        throw rsvResult.reason;
      }

      setResult(rsvResult.value as LookupResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Nepodařilo se načíst data vozidla.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleSearch = useCallback(async () => {
    setSearchActivated(true);
    await handleSearchByVin(vin);
  }, [handleSearchByVin, vin]);

  useEffect(() => {
    if (!user) return;
    if (vinFromQuery.length < 11) return;
    if (autoLookupVinRef.current === vinFromQuery) return;
    autoLookupVinRef.current = vinFromQuery;
    setSearchActivated(true);
    void handleSearchByVin(vinFromQuery);
  }, [handleSearchByVin, user, vinFromQuery]);

  useEffect(() => {
    if (!searchActivated || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      const input = compactVinInputRef.current;
      if (!input) return;
      input.focus();
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchActivated]);

  useEffect(() => {
    if (!searchActivated || loading || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      resultScrollTargetRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, searchActivated]);

  const handleSautoSearch = useCallback(async () => {
    setSautoPanelActivated(true);

    if (!user) {
      setSautoError("Přihlaš se, aby šlo načíst tržní data ze Sauto.");
      return;
    }

    if (!summary || !hasVehicleForSauto) {
      setSautoError("Nejdřív načti VIN, aby bylo jasné, jakou značku a model hledat.");
      return;
    }

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
          mileageKm,
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

      setSautoMarket(payload);
    } catch (err: unknown) {
      setSautoError(err instanceof Error ? err.message : "Nepodařilo se načíst tržní data ze Sauto.");
    } finally {
      setSautoLoading(false);
    }
  }, [hasVehicleForSauto, mileageKm, summary, user]);

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
    id: "vin" | "orv",
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

  return (
    <AppLayout active="tools">
      <div className="vehicle-audit-shell mx-auto w-full max-w-6xl space-y-5 pb-10 md:[zoom:0.92] xl:[zoom:0.86]">
        <section className="vehicle-reveal px-2 py-10 sm:px-4 sm:py-14" style={revealStyle(20)}>
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <div className="vehicle-float inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                Oficiální data z registru ČR
              </div>
              <h1 className={`${headingFont.className} vehicle-hero-title mx-auto mt-5 max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight text-slate-900 sm:text-6xl md:text-7xl`}>
                Prověř historii vozu
                <span className="block text-sky-600">během vteřiny</span>
              </h1>
            </div>

            <div className="vehicle-glow mx-auto mt-8 w-full max-w-3xl rounded-[30px] border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/60">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2">
                  <Search className="h-8 w-8 text-slate-400" />
                  <input
                    ref={compactVinInputRef}
                    type="text"
                    value={vin}
                    onChange={(event) => setVin(normalizeVinInput(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canSearch && !loading) void handleSearch();
                    }}
                    className="w-full border-none bg-transparent text-xl font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    placeholder="Zadejte VIN vozidla"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={loading || !canSearch}
                  className="vehicle-cta group inline-flex h-16 items-center justify-center gap-3 rounded-[22px] border border-emerald-900/30 bg-[linear-gradient(135deg,#0f766e_0%,#059669_48%,#22c55e_100%)] px-8 text-lg font-semibold tracking-tight text-white shadow-[0_16px_36px_rgba(5,150,105,0.34),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 sm:text-2xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? "Načítám..." : "Proklepnout"}
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/25 transition group-hover:translate-x-0.5">
                    {loading ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : <ChevronRight className="h-5 w-5" />}
                  </span>
                </button>
              </div>
            </div>

            <div className="mx-auto mt-5 max-w-3xl text-center">
              <button
                type="button"
                onClick={() => setShowRefineInputs((value) => !value)}
                className="inline-flex items-center gap-2 text-base font-semibold text-slate-500 transition hover:text-slate-700 sm:text-2xl"
              >
                <ChevronRight className={`h-6 w-6 transition-transform ${showRefineInputs ? "rotate-90" : ""}`} />
                Přidej nájezd pro přesnější odhad!
              </button>
              {showRefineInputs && (
                <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={refineMileage}
                    onChange={(event) => setRefineMileage(event.target.value)}
                    className="mx-auto h-12 w-full max-w-xs rounded-xl border border-slate-200 px-3 text-base font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="Nájezd (km)"
                  />
                </div>
              )}

              {!user && (
                <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Přihlaš se, aby šlo volat data o vozidle.
                </p>
              )}
              {error && (
                <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>

        <div ref={resultScrollTargetRef} className="scroll-mt-28" />

        {searchActivated && loading && (
          <div className="vehicle-reveal" style={revealStyle(60)}>
            <VehicleAuditLoadingState
              phaseIndex={loadingPhaseIndex}
              progress={loadingProgress}
            />
          </div>
        )}

        {searchActivated && !loading && summary && (
          <>
            <section className="vehicle-reveal rounded-3xl border border-slate-200 bg-white p-5" style={revealStyle(40)}>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={statusTone(summary.status)}>{summary.status}</Pill>
                <Pill>{safeStr(firstOf(data, ["Kategorie", "KategorieVozidla"]))}</Pill>
              </div>

              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                {summary.brand} <span className="text-slate-700">{summary.model}</span>
              </h2>

              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <div className="inline-flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-4 w-4" />
                  Neevidováno jako odcizené
                </div>
                <div className="mt-1 text-emerald-700">Zdroj: Policie ČR (interní ověření přes registr)</div>
              </div>

              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-3">
                  <div className="grid gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rok</div>
                      <div className="text-xl font-semibold text-slate-900">{formatNumber(summary.year)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Palivo</div>
                      <div className="text-xl font-semibold text-slate-900">{summary.fuel}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Výkon</div>
                      <div className="text-xl font-semibold text-slate-900">{formatNumber(summary.powerKw)} kW</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Barva</div>
                      <div className="text-xl font-semibold text-slate-900">{summary.color}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyIdentifier("vin", displayedVin)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">VIN</span>
                      <span className="font-semibold text-slate-900">{displayedVin}</span>
                      <ClipboardCopy className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-[11px] text-slate-500">
                        {copiedId === "vin" ? "Zkopírováno" : "Kopírovat"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopyIdentifier("orv", orvLabel)}
                      disabled={orvLabel === "—"}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">ORV</span>
                      <span className="font-semibold text-slate-900">{orvLabel}</span>
                      <ClipboardCopy className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-[11px] text-slate-500">
                        {copiedId === "orv" ? "Zkopírováno" : "Kopírovat"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Tile
                    title="STK kontroly"
                    value={summary.stkDoLabel}
                    subtitle={stkNoteLabel !== "—" ? stkNoteLabel : stkState === "rose" ? "Po termínu" : stkState === "amber" ? "Brzy končí" : "Platná"}
                    icon={<CalendarClock className="h-3.5 w-3.5" />}
                    tone={stkState === "green" ? "green" : stkState === "rose" ? "rose" : "amber"}
                  />
                  <Tile
                    title="Majitelé"
                    value={`${ownerCountLabel} v ČR`}
                    subtitle={`${resolvedOwnerRecords.length} záznamů v registru`}
                    icon={<Users className="h-3.5 w-3.5" />}
                    tone={ownersCountNum != null && ownersCountNum > 5 ? "rose" : "neutral"}
                  />
                  <Tile
                    title="Tachometr"
                    value={formatKm(mileageKm)}
                    subtitle={`Ø ${formatNumber(averageAnnualKm)} km/rok`}
                    icon={<Gauge className="h-3.5 w-3.5" />}
                    tone="green"
                  />
                  <Tile
                    title="Původ"
                    value={originValue}
                    subtitle={originSubtitle}
                    icon={<MapPin className="h-3.5 w-3.5" />}
                    tone="neutral"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyResult()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                >
                  <ClipboardCopy className="h-4 w-4" />
                  {copied ? "Zkopírováno" : "Kopírovat výstup"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSautoSearch()}
                  disabled={sautoLoading || !user || !hasVehicleForSauto}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Search className="h-4 w-4" />
                  {sautoLoading ? "Načítám SAUTO..." : "Dopočítat ze SAUTO"}
                </button>
              </div>
              {sautoError && <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{sautoError}</p>}
            </section>

            <section className="vehicle-reveal rounded-3xl border border-slate-200 bg-white p-5" style={revealStyle(120)}>
              <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
                <LineChart className="h-5 w-5 text-slate-500" />
                Odhadovaná tržní cena
              </h3>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <div className="text-6xl font-semibold leading-none tracking-tight text-emerald-600">{formatCurrency(valuationRecommended)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidenceToneClass(valuationConfidenceLabel)}`}>
                      {valuationConfidenceLabel}
                    </span>
                    <span>
                      {(valuationComparableCount ?? sautoMarket?.comparableCount ?? 0) > 0
                        ? `${valuationComparableCount ?? sautoMarket?.comparableCount} srovnatelných vozidel`
                        : "interní model"}
                    </span>
                    <span>při {formatKm(valuationReferenceMileage)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-6 text-xl font-semibold text-slate-800">
                    <span>
                      Férové rozmezí {formatCurrency(valuationRangeLow)} - {formatCurrency(valuationRangeHigh)}
                      {valuationFairRangePct != null ? ` ± ${formatNumber(valuationFairRangePct)} %` : ""}
                    </span>
                    <span>Ø nájezd {formatNumber(averageAnnualKm)} km/rok</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="inline-flex items-center gap-2 font-semibold text-slate-700">
                    <AlertTriangle className="h-4 w-4 text-sky-600" />
                    {valuationInfoTitle !== "—" ? valuationInfoTitle : "Odhad na základě registru"}
                  </div>
                  <div className="mt-1">
                    {valuationInfoText !== "—"
                      ? valuationInfoText
                      : "Výpočet používá poslední známý nájezd a historii STK. Po ruční korekci nájezdu bude výsledek přesnější."}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <PriceBand
                  marketMin={marketMin}
                  marketMax={marketMax}
                  estimate={marketRecommendation ?? valuationRecommended}
                  rangeLow={valuationRangeLow}
                  rangeHigh={valuationRangeHigh}
                  segmentUnderPct={valuationSegmentUnderPct}
                  segmentFairPct={valuationSegmentFairPct}
                  segmentOverPct={valuationSegmentOverPct}
                  markerPct={valuationMarkerPct}
                />
              </div>

              {sautoPanelActivated && (sautoMarket || sautoLoading || sautoError) && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold">SAUTO srovnání</div>
                  {sautoLoading && <div className="mt-1">Načítám tržní data…</div>}
                  {!sautoLoading && sautoMarket && (
                    <div className="mt-2 space-y-1">
                      <div>Medián SAUTO: <span className="font-semibold">{formatCurrency(sautoMarket.stats.median)}</span></div>
                      <div>Tržní doporučení: <span className="font-semibold">{formatCurrency(marketRecommendation)}</span></div>
                      <div>Rozdíl proti základnímu odhadu: <span className="font-semibold">{formatSignedPercent(sautoVsInternalPct)}</span></div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="vehicle-reveal" style={revealStyle(200)}>
              <MileagePriceBars
                rows={mileagePriceRows}
                highlightedMileageKm={valuationHighlightedMileageKm ?? valuationReferenceMileage}
              />
            </div>

            <div className="vehicle-reveal" style={revealStyle(260)}>
              <MileageChart points={mileageHistory} />
            </div>

            <section className="vehicle-reveal space-y-3" style={revealStyle(320)}>
              <CollapsibleSectionHeader
                icon={<CalendarClock className="h-5 w-5 text-slate-500" />}
                title="STK kontroly"
                subtitle="Historie evidenčních a pravidelných kontrol"
                expanded={stkExpanded}
                countLabel={`${formatNumber(stkChecks.length)} záznamů`}
                controlsId="stk-history-list"
                onToggle={() => setStkExpanded((value) => !value)}
              />
              {stkExpanded && (
                <div id="stk-history-list" className="space-y-3">
                  {stkChecks.map((check) => (
                    <StkCard key={check.id} check={check} />
                  ))}
                </div>
              )}
            </section>

            <section className="vehicle-reveal space-y-3" style={revealStyle(380)}>
              <CollapsibleSectionHeader
                icon={<Users className="h-5 w-5 text-slate-500" />}
                title="Vlastníci"
                subtitle={`${ownerCountLabel} majitelů v ČR / ${resolvedOwnerRecords.length} záznamů v registru`}
                expanded={ownersExpanded}
                countLabel={`${formatNumber(resolvedOwnerRecords.length)} záznamů`}
                controlsId="owner-history-list"
                onToggle={() => setOwnersExpanded((value) => !value)}
              />

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Aktuální stav</div>
                <div className="mt-2 space-y-1">
                  <div><span className="font-semibold">Vlastník:</span> {currentOwner?.name ?? "Neuvedený subjekt"} ({currentOwner?.fromLabel ?? "—"})</div>
                  <div><span className="font-semibold">Provozovatel:</span> {currentOperator?.name ?? "Neuvedený subjekt"} ({currentOperator?.fromLabel ?? "—"})</div>
                </div>
              </div>

              {ownersExpanded && (
                <div id="owner-history-list" className="space-y-3">
                  {resolvedOwnerRecords.map((owner) => (
                    <OwnerCard key={owner.id} owner={owner} />
                  ))}
                </div>
              )}
            </section>

            <section className="vehicle-reveal space-y-3" style={revealStyle(440)}>
              <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
                <CarFront className="h-5 w-5 text-slate-500" />
                Technické parametry
              </h3>
              <div className="space-y-5">
                {technicalSections.map((section) => (
                  <TechnicalSection key={section.title} section={section} />
                ))}
              </div>
            </section>

            <section className="vehicle-reveal rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3" style={revealStyle(500)}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>VIN: {displayedVin}</span>
                </div>
                <span>Uživatel: {safeStr(result?.forUser)}</span>
                <span>Status odpovědi: {safeStr(result?.payload?.Status)}</span>
              </div>
            </section>
          </>
        )}

        {searchActivated && !loading && !summary && (
          <section className="vehicle-reveal rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600" style={revealStyle(60)}>
            Zatím nejsou načtená validní data z registru.
          </section>
        )}
      </div>
      <style jsx global>{`
        @keyframes vehicle-bg-pan {
          0% {
            transform: translate3d(-10%, -12%, 0) scale(1);
            opacity: 0.52;
          }
          50% {
            transform: translate3d(8%, 4%, 0) scale(1.06);
            opacity: 0.7;
          }
          100% {
            transform: translate3d(16%, -10%, 0) scale(1.03);
            opacity: 0.5;
          }
        }

        @keyframes vehicle-reveal-up {
          0% {
            opacity: 0;
            transform: translateY(26px) scale(0.985);
            filter: blur(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes vehicle-float-y {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes vehicle-glow-pulse {
          0%,
          100% {
            box-shadow: 0 12px 28px rgba(2, 132, 199, 0.08), 0 0 0 1px rgba(16, 185, 129, 0.08);
          }
          50% {
            box-shadow: 0 16px 34px rgba(2, 132, 199, 0.16), 0 0 0 1px rgba(16, 185, 129, 0.18);
          }
        }

        @keyframes vehicle-cta-shimmer {
          0% {
            transform: translateX(-130%);
          }
          50%,
          100% {
            transform: translateX(130%);
          }
        }

        @keyframes vehicle-scan-lens-move {
          0% {
            left: 9%;
            transform: translate3d(0, -50%, 0) rotate(-9deg) scale(0.98);
          }
          42% {
            left: 49%;
            transform: translate3d(-50%, -50%, 0) rotate(2deg) scale(1.03);
          }
          74% {
            left: 76%;
            transform: translate3d(-50%, -50%, 0) rotate(-4deg) scale(1);
          }
          100% {
            left: 9%;
            transform: translate3d(0, -50%, 0) rotate(-9deg) scale(0.98);
          }
        }

        @keyframes vehicle-scan-beam-move {
          0% {
            left: 12%;
            opacity: 0.3;
          }
          42% {
            left: 49%;
            opacity: 0.95;
          }
          74% {
            left: 78%;
            opacity: 0.65;
          }
          100% {
            left: 12%;
            opacity: 0.3;
          }
        }

        .vehicle-audit-shell {
          position: relative;
          isolation: isolate;
        }

        .vehicle-audit-shell::before {
          content: "";
          position: absolute;
          inset: 32px 16px auto 16px;
          height: 300px;
          z-index: -1;
          border-radius: 44px;
          background: radial-gradient(50% 60% at 18% 44%, rgba(16, 185, 129, 0.16), transparent 74%),
            radial-gradient(58% 62% at 82% 36%, rgba(14, 165, 233, 0.18), transparent 78%);
          filter: blur(18px);
          animation: vehicle-bg-pan 14s ease-in-out infinite alternate;
        }

        .vehicle-reveal {
          opacity: 0;
          animation: vehicle-reveal-up 760ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .vehicle-float {
          animation: vehicle-float-y 4.6s ease-in-out infinite;
        }

        .vehicle-glow {
          animation: vehicle-glow-pulse 4.2s ease-in-out infinite;
        }

        .vehicle-hero-title {
          text-wrap: balance;
        }

        .vehicle-cta {
          position: relative;
          overflow: hidden;
        }

        .vehicle-cta::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 34%, rgba(255, 255, 255, 0.35) 50%, transparent 66%);
          transform: translateX(-130%);
          animation: vehicle-cta-shimmer 3.3s ease-in-out infinite;
          pointer-events: none;
        }

        .vehicle-cta:disabled::after {
          animation: none;
        }

        .vehicle-scan-lens {
          left: 49%;
          transform: translate3d(-50%, -50%, 0);
          animation: vehicle-scan-lens-move 4.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }

        .vehicle-scan-beam {
          left: 49%;
          animation: vehicle-scan-beam-move 4.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }

        :root[data-motion="off"] .vehicle-audit-shell::before,
        :root[data-motion="off"] .vehicle-reveal,
        :root[data-motion="off"] .vehicle-float,
        :root[data-motion="off"] .vehicle-glow,
        :root[data-motion="off"] .vehicle-cta::after {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
          filter: none !important;
        }

        :root[data-motion="off"] .vehicle-scan-lens {
          left: 49% !important;
          animation: none !important;
          opacity: 1 !important;
          transform: translate3d(-50%, -50%, 0) !important;
          filter: none !important;
        }

        :root[data-motion="off"] .vehicle-scan-beam {
          left: 49% !important;
          animation: none !important;
          opacity: 0.8 !important;
          filter: none !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .vehicle-audit-shell::before,
          .vehicle-reveal,
          .vehicle-float,
          .vehicle-glow,
          .vehicle-cta::after {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }

          .vehicle-scan-lens {
            left: 49% !important;
            animation: none !important;
            opacity: 1 !important;
            transform: translate3d(-50%, -50%, 0) !important;
            filter: none !important;
          }

          .vehicle-scan-beam {
            left: 49% !important;
            animation: none !important;
            opacity: 0.8 !important;
            filter: none !important;
          }
        }
      `}</style>
    </AppLayout>
  );
}
