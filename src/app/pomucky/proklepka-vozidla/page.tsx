"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
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
  MapPin,
  Search,
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

const STK_PATTERNS = ["stk", "technick", "prohlidk", "kontrol", "evidencni"];

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

function confidenceToneClass(value: string): string {
  const normalized = normalizeText(value);
  if (normalized.includes("velmi") || normalized.includes("vysoka")) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  if (normalized.includes("stred")) return "border-violet-200 bg-violet-50 text-violet-700";
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
      <div className={`mt-3 text-2xl font-semibold leading-tight tracking-tight ${valueTone}`}>{value}</div>
      {subtitle && <div className="mt-2 text-xs leading-relaxed text-slate-500">{subtitle}</div>}
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
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : estimatePos <= fairEnd
        ? "border-violet-200 bg-violet-50 text-violet-700"
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
            <div className="absolute inset-y-0 left-0 bg-violet-500" style={{ width: `${underPct}%` }} />
            <div className="absolute inset-y-0 bg-pink-400" style={{ left: `${underPct}%`, width: `${fairPct}%` }} />
            <div className="absolute inset-y-0 bg-rose-500" style={{ left: `${overLeft}%`, width: `${overPct}%` }} />
            <div
              className="absolute inset-y-0 rounded-full border border-violet-700/45 bg-violet-700/15"
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
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-700">
          <Dot className="h-4 w-4" />
          PODHODNOCENÉ {underShare} %
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-700">
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
              <div className={`text-right text-sm font-semibold ${row.highlighted ? "text-violet-700" : "text-slate-500"}`}>
                {formatNumber(row.km)} km
              </div>
              <div className="h-10 overflow-hidden rounded-xl bg-slate-100">
                <div
                  className={`h-full rounded-xl ${row.highlighted ? "bg-violet-600" : "bg-violet-300"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className={`text-right text-sm font-semibold ${row.highlighted ? "text-violet-700" : "text-slate-800"}`}>
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
  const surfaceClass = expanded
    ? "border-violet-300 bg-violet-50/70 shadow-sm shadow-violet-100/80"
    : "border-slate-200 bg-slate-50";
  const countClass = expanded
    ? "border-violet-200 bg-white text-violet-700"
    : "border-slate-200 bg-white text-slate-600";
  const arrowClass = expanded
    ? "border-violet-200 bg-white text-violet-600"
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

  const stkSignals = useMemo(() => collectPatternRows(data, STK_PATTERNS), [data]);
  const mileageSignals = useMemo(() => collectPatternRows(data, MILEAGE_PATTERNS), [data]);

  const stkObjects = useMemo(() => collectObjectRows(data, STK_PATTERNS), [data]);
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

  const stkChecks = useMemo(
    () =>
      vehicleStkChecks.length > 0
        ? vehicleStkChecks
        : buildStkChecks(stkObjects, stkSignals, mileageSignals, stkDate, mileageKm),
    [mileageKm, mileageSignals, vehicleStkChecks, stkDate, stkObjects, stkSignals]
  );

  const latestStk = stkChecks.find((check) => check.sourceLabel === "STK" && check.date);
  const currentSubjects = resolvedOwnerRecords.filter((row) => row.isCurrent);
  const averageAnnualKm = useMemo(() => {
    const first = vehicleMileageHistory[0];
    const last = vehicleMileageHistory.at(-1);
    if (!first?.date || !last?.date || last.km < first.km) return null;
    const years = (last.date.getTime() - first.date.getTime()) / (365.25 * 86400_000);
    return years >= 1 ? Math.round((last.km - first.km) / years) : null;
  }, [vehicleMileageHistory]);
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
  const valuationConfidenceRaw = safeStr(vehicleValuation?.confidenceLabel);
  const valuationConfidenceLabel =
    valuationConfidenceRaw !== "—"
      ? valuationConfidenceRaw
      : `${confidenceLabel(estimate.confidenceScore)} spolehlivost`;
  const valuationInfoTitle = safeStr(vehicleValuation?.infoTitle);
  const valuationInfoText = safeStr(vehicleValuation?.infoText);
  const valuationMarkerPct = manualMileageKm != null ? null : toNumber(vehicleValuation?.markerPct);
  const valuationSegmentUnderPct = toNumber(vehicleValuation?.segmentUnderPct);
  const valuationSegmentFairPct = toNumber(vehicleValuation?.segmentFairPct);
  const valuationSegmentOverPct = toNumber(vehicleValuation?.segmentOverPct);
  const valuationHighlightedMileageKm = manualMileageKm ?? toNumber(vehicleValuation?.highlightedMileageKm);

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
    return Math.max(50_000, roundTo(valuationRangeLow * 0.8, 1_000));
  }, [sautoMarket?.stats.min, valuationRangeLow]);

  const fallbackMarketMax = useMemo(() => {
    const max = sautoMarket?.stats.max;
    if (max != null && Number.isFinite(max)) return max;
    return roundTo(valuationRangeHigh * 1.25, 1_000);
  }, [sautoMarket?.stats.max, valuationRangeHigh]);

  const marketMin = toNumber(vehicleValuation?.marketMin) ?? fallbackMarketMin;
  const marketMax = toNumber(vehicleValuation?.marketMax) ?? fallbackMarketMax;

  const mileagePriceRows = useMemo<MileagePriceRow[]>(() => {
    if (vehicleMileagePriceRows.length > 0) {
      const highlightedKm = isPlausibleMileage(valuationHighlightedMileageKm)
        ? valuationHighlightedMileageKm
        : null;

      return vehicleMileagePriceRows.map((row) => ({
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
    vehicleMileagePriceRows,
    valuationHighlightedMileageKm,
    valuationReferenceMileage,
  ]);

  const mileageHistory = useMemo<MileagePoint[]>(() => {
    if (vehicleMileageHistory.length >= 1) {
      return vehicleMileageHistory.slice(-12);
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

    return unique.slice(-12);
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
    setSautoPanelActivated(false);

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
    setSautoPanelActivated(true);

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
    setSautoPanelActivated(false);
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
          <>
            <header className={styles.compactHeader}>
              <span><CarFront size={23} strokeWidth={1.7} aria-hidden="true" /></span>
              <div><h1>Proklepka vozidla</h1><p>Historie, technické údaje a odhad ceny</p></div>
            </header>
            {searchForm}
          </>
        )}

        <div ref={resultScrollTargetRef} className="scroll-mt-8" />
        {searchActivated && loading && <VehicleLoader vin={vin} />}

        {searchActivated && !loading && summary && (
          <>
            <section className="vehicle-reveal" style={revealStyle(40)} aria-label="Přehled vozidla">
              <div className={styles.overviewHeading}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={statusTone(summary.status)}>{summary.status}</Pill>
                    <Pill>{safeStr(firstOf(data, ["Kategorie", "KategorieVozidla"]))}</Pill>
                  </div>
                  <h2 ref={resultHeadingRef} tabIndex={-1}>{summary.brand} {summary.model}</h2>
                  <p>Údaje z registru silničních vozidel</p>
                </div>
                <div className={styles.resultCar}><VehicleIllustration /></div>
              </div>

              <div className={styles.facts}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-5 text-sm sm:grid-cols-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rok</div>
                      <div className="text-xl font-semibold text-slate-900">{summary.year ?? "—"}</div>
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
                      className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">VIN</span>
                      <span className={`${styles.identifier} font-semibold text-slate-900`}>{displayedVin}</span>
                      <ClipboardCopy className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-[11px] text-slate-500">
                        {copiedId === "vin" ? "Zkopírováno" : "Kopírovat"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopyIdentifier("orv", orvLabel)}
                      disabled={orvLabel === "—"}
                      className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">ORV</span>
                      <span className={`${styles.identifier} font-semibold text-slate-900`}>{orvLabel}</span>
                      <ClipboardCopy className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-[11px] text-slate-500">
                        {copiedId === "orv" ? "Zkopírováno" : "Kopírovat"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopyIdentifier("tp", tpLabel)}
                      disabled={tpLabel === "—"}
                      className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">TP</span>
                      <span className={`${styles.identifier} font-semibold text-slate-900`}>{tpLabel === "—" ? "Neuvedeno" : tpLabel}</span>
                      <ClipboardCopy className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-[11px] text-slate-500">{copiedId === "tp" ? "Zkopírováno" : "Kopírovat"}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Tile
                    title="Poslední STK"
                    value={latestStk?.dateLabel ?? "Neuvedena"}
                    subtitle={latestStk ? `${latestStk.resultLabel} · ${stkDate ? `platnost do ${summary.stkDoLabel}` : "Platnost neuvedena"}` : "Záznam STK není dostupný"}
                    icon={<CalendarClock className="h-3.5 w-3.5" />}
                    tone={latestStk?.isPassed === false ? "rose" : "neutral"}
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
                    subtitle={vehicleSummary?.lastOdometerDate ? `Záznam z ${formatDateCs(parseDateLoose(vehicleSummary.lastOdometerDate))}` : "Datum záznamu neuvedeno"}
                    icon={<Gauge className="h-3.5 w-3.5" />}
                    tone="neutral"
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
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Search className="h-4 w-4" />
                  {sautoLoading ? "Načítám SAUTO..." : "Dopočítat ze SAUTO"}
                </button>
              </div>
              {sautoError && <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{sautoError}</p>}
            </section>

            {vehicleChecks && <VehicleAdditionalChecks checks={vehicleChecks} />}

            <section className="vehicle-reveal rounded-3xl border border-slate-200 bg-white p-5" style={revealStyle(120)}>
              <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
                <LineChart className="h-5 w-5 text-slate-500" />
                Odhadovaná tržní cena
              </h3>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <div className="text-4xl font-semibold leading-none tracking-tight text-violet-700 sm:text-5xl">{formatCurrency(marketRecommendation ?? valuationRecommended)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${confidenceToneClass(valuationConfidenceLabel)}`}>
                      {marketRecommendation != null ? "Podle nabídek SAUTO" : valuationConfidenceLabel}
                    </span>
                    <span>
                      {(valuationComparableCount ?? sautoMarket?.comparableCount ?? 0) > 0
                        ? `${valuationComparableCount ?? sautoMarket?.comparableCount} srovnatelných vozidel`
                        : "interní model"}
                    </span>
                    <span>při {formatKm(valuationReferenceMileage)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold text-slate-700">
                    <span>
                      {marketRecommendation != null ? "Rozmezí nabídek" : "Orientační rozmezí"} {formatCurrency(displayedRangeLow)} - {formatCurrency(displayedRangeHigh)}
                      {valuationFairRangePct != null ? ` ± ${formatNumber(valuationFairRangePct)} %` : ""}
                    </span>
                    {averageAnnualKm != null && <span>Ø nájezd {formatNumber(averageAnnualKm)} km/rok</span>}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="inline-flex items-center gap-2 font-semibold text-slate-700">
                    <AlertTriangle className="h-4 w-4 text-violet-700" />
                    {marketRecommendation != null ? "Srovnání s trhem" : valuationInfoTitle !== "—" ? valuationInfoTitle : "Odhad na základě registru"}
                  </div>
                  <div className="mt-1">
                    {marketRecommendation != null ? "Odhad zohledňuje srovnatelné nabídky ze SAUTO. Inzerované ceny se mohou lišit od konečné prodejní ceny." : valuationInfoText !== "—"
                      ? valuationInfoText
                      : "Orientační výpočet podle parametrů vozidla a nájezdu. Pro srovnání s aktuálními nabídkami použij Dopočítat ze SAUTO."}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <PriceBand
                  marketMin={marketMin}
                  marketMax={marketMax}
                  estimate={marketRecommendation ?? valuationRecommended}
                  rangeLow={displayedRangeLow}
                  rangeHigh={displayedRangeHigh}
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
                title="Vlastníci a provozovatelé"
                subtitle={`${ownerCountLabel} majitelů v ČR / ${resolvedOwnerRecords.length} záznamů v registru`}
                expanded={ownersExpanded}
                countLabel={`${formatNumber(resolvedOwnerRecords.length)} záznamů`}
                controlsId="owner-history-list"
                onToggle={() => setOwnersExpanded((value) => !value)}
              />

              <div className="rounded-3xl border border-violet-200 bg-violet-50 p-4 text-sm text-slate-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Aktuální stav</div>
                <div className="mt-2 space-y-1">
                  {currentSubjects.length > 0 ? currentSubjects.map((subject) => (
                    <div key={subject.id}><span className="font-semibold">{subject.name}</span> · {subject.roleLabel} · od {subject.fromLabel}</div>
                  )) : <div>Aktuální subjekt není v dostupných údajích uvedený.</div>}
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

            {user && <VehicleVignette key={lookupQuery} user={user} query={lookupQuery} />}

            <section className="vehicle-reveal rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3" style={revealStyle(500)}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-violet-700" />
                  <span>VIN: {displayedVin}</span>
                </div>
                <a href="https://autokuk.cz" target="_blank" rel="noreferrer" className="underline underline-offset-4">Data: Autokuk.cz</a>
              </div>
            </section>
          </>
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
