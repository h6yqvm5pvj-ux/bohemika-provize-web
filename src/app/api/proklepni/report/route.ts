import { NextResponse, type NextRequest } from "next/server";

import {
  requireIpRateLimited,
  withIpRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{11,25}$/;
const UPSTREAM_BASE_URL = "https://proklepni.cz/check/";
const PROKLEPNI_REPORT_RATE_LIMIT = 30;
const PROKLEPNI_REPORT_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

type JsonObject = Record<string, unknown>;

type ProklepniSummaryRaw = {
  inspection_count?: unknown;
  failed_inspection_count?: unknown;
  owner_count?: unknown;
  party_analysis?: {
    party_count?: unknown;
    record_count?: unknown;
  } | null;
  was_imported?: unknown;
  import_country?: unknown;
  import_date?: unknown;
  total_defects?: unknown;
  last_odometer_km?: unknown;
  last_odometer_date?: unknown;
  avg_annual_km?: unknown;
} | null;

type ProklepniStkStatusRaw = {
  state?: unknown;
  nextDue?: unknown;
  daysRemaining?: unknown;
  note?: unknown;
  scorePenalty?: unknown;
} | null;

type ProklepniHero = {
  score: number | null;
  letter: string | null;
  label: string | null;
  yearLabel: string | null;
  fuelLabel: string | null;
  powerLabel: string | null;
  colorLabel: string | null;
};

type ProklepniOdometerRow = {
  datum?: unknown;
  odometr_km?: unknown;
  delta_km?: unknown;
  delta_days?: unknown;
  cislo_protokolu?: unknown;
  vysledek?: unknown;
  quality?: unknown;
};

type ProklepniInspectionRow = {
  cislo_protokolu?: unknown;
  datum?: unknown;
  stanice_cislo?: unknown;
  stanice_obec?: unknown;
  druh_prohlidky?: unknown;
  druh_text?: unknown;
  vysledek?: unknown;
  vysledek_text?: unknown;
  odometr_km?: unknown;
  trvani_min?: unknown;
  defect_count?: unknown;
  worst_severity?: unknown;
  same_day_group_id?: unknown;
};

type ProklepniOwnerRow = {
  typ_subjektu?: unknown;
  vztah?: unknown;
  aktualni?: unknown;
  ico?: unknown;
  nazev?: unknown;
  adresa?: unknown;
  datum_od?: unknown;
  datum_do?: unknown;
  display_name?: unknown;
  vztah_label?: unknown;
};

type ProklepniValuationMileageRow = {
  km: number | null;
  price: number | null;
  widthPercent: number | null;
  highlighted: boolean;
};

type ProklepniValuation = {
  estimatedPrice: number | null;
  confidenceLabel: string | null;
  comparableCount: number | null;
  referenceMileageKm: number | null;
  fairRangeLow: number | null;
  fairRangeHigh: number | null;
  fairRangePct: number | null;
  marketMin: number | null;
  marketMax: number | null;
  segmentUnderPct: number | null;
  segmentFairPct: number | null;
  segmentOverPct: number | null;
  markerPct: number | null;
  infoTitle: string | null;
  infoText: string | null;
  highlightedMileageKm: number | null;
  mileagePriceRows: ProklepniValuationMileageRow[];
};

type ProklepniTechnicalRow = {
  label: string;
  value: string;
};

type ProklepniTechnicalSection = {
  title: string;
  rows: ProklepniTechnicalRow[];
};

function normalizeVin(value: string | null): string {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function readObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\u00a0/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    const parsed = Number(normalized.replace(/,/g, "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toInt(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

function toIntLoose(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d.,\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const match = normalized.match(/-?\d[\d\s.,]*/);
  if (!match?.[0]) return null;

  let chunk = match[0].replace(/\s+/g, "");
  const hasComma = chunk.includes(",");
  const hasDot = chunk.includes(".");

  if (hasComma && hasDot) {
    const lastComma = chunk.lastIndexOf(",");
    const lastDot = chunk.lastIndexOf(".");
    chunk = lastComma > lastDot ? chunk.replace(/\./g, "").replace(",", ".") : chunk.replace(/,/g, "");
  } else if (hasComma) {
    chunk = /,\d{1,2}$/.test(chunk) ? chunk.replace(",", ".") : chunk.replace(/,/g, "");
  } else if (hasDot) {
    chunk = /\.\d{1,2}$/.test(chunk) ? chunk : chunk.replace(/\./g, "");
  }

  const parsed = Number(chunk);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function toPercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!match?.[0]) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readRegexGroup(haystack: string, regex: RegExp): string | null {
  const match = haystack.match(regex);
  if (!match || !match[1]) return null;
  const trimmed = match[1].trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeHtmlText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = decodeHtmlEntities(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function extractHero(html: string): ProklepniHero {
  const score =
    toInt(
      readRegexGroup(
        html,
        /<span[^>]*>\s*([0-9]{1,3})\s*<\/span>\s*<span[^>]*>\s*\/\s*100\s*<\/span>/i
      )
    ) ?? null;

  const letter = readRegexGroup(
    html,
    /w-12 h-12[^>]*>\s*([A-D])\s*<\/span>/i
  );

  const label = readRegexGroup(
    html,
    /<div class="text-xl font-bold leading-tight"[^>]*>([^<]+)<\/div>\s*<div class="text-xs mt-0\.5"[^>]*>Zdravotní skóre vozidla<\/div>/i
  );

  const readField = (fieldLabel: string) => {
    const pattern = new RegExp(
      `>${escapeRegex(fieldLabel)}<\\/div><div[^>]*title="([^"]+)"[^>]*>`,
      "i"
    );
    return readRegexGroup(html, pattern);
  };

  return {
    score,
    letter,
    label,
    yearLabel: readField("Rok"),
    fuelLabel: readField("Palivo"),
    powerLabel: readField("Výkon"),
    colorLabel: readField("Barva"),
  };
}

function sliceBalanced(text: string, start: number, open: string, close: string): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) return null;
  return text.slice(start, end + 1);
}

function extractFlightStrings(html: string, max = 120): string[] {
  const marker = 'self.__next_f.push([1,"';
  const out: string[] = [];

  let cursor = 0;
  while (out.length < max) {
    const markerIdx = html.indexOf(marker, cursor);
    if (markerIdx < 0) break;

    let i = markerIdx + marker.length;
    let escaped = false;
    let encoded = "";

    for (; i < html.length; i += 1) {
      const ch = html[i];
      if (escaped) {
        encoded += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        encoded += ch;
        escaped = true;
        continue;
      }
      if (ch === "\"") break;
      encoded += ch;
    }

    if (i >= html.length) break;

    try {
      const decoded = JSON.parse(`"${encoded}"`) as unknown;
      if (typeof decoded === "string" && decoded.length > 0) {
        out.push(decoded);
      }
    } catch {
      // ignore malformed push chunks
    }

    cursor = i + 1;
  }

  return out;
}

function extractSummaryContainer(joinedPayload: string): JsonObject | null {
  const summaryPos = joinedPayload.indexOf("\"summary\":");
  if (summaryPos < 0) return null;

  const objectStart = joinedPayload.lastIndexOf("{", summaryPos);
  if (objectStart < 0) return null;

  const objectRaw = sliceBalanced(joinedPayload, objectStart, "{", "}");
  if (!objectRaw) return null;

  try {
    const parsed = JSON.parse(objectRaw) as unknown;
    return readObject(parsed);
  } catch {
    return null;
  }
}

function extractInitialDataArrays(joinedPayload: string, max = 12): unknown[][] {
  const marker = "\"initialData\":";
  const out: unknown[][] = [];

  let cursor = 0;
  while (out.length < max) {
    const markerIdx = joinedPayload.indexOf(marker, cursor);
    if (markerIdx < 0) break;

    let valueStart = markerIdx + marker.length;
    while (valueStart < joinedPayload.length && /\s/.test(joinedPayload[valueStart] ?? "")) {
      valueStart += 1;
    }

    // Newer Proklepni payloads can store initialData as a string reference.
    // We only parse direct array payloads and skip everything else.
    if (joinedPayload[valueStart] !== "[") {
      cursor = valueStart + 1;
      continue;
    }

    const raw = sliceBalanced(joinedPayload, valueStart, "[", "]");
    if (!raw) {
      cursor = valueStart + 1;
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) out.push(parsed);
    } catch {
      // ignore malformed array
    }

    cursor = valueStart + raw.length;
  }

  return out;
}

function looksLikeOdometerRow(value: unknown): value is ProklepniOdometerRow {
  const row = readObject(value);
  if (!row) return false;
  const hasCore = "datum" in row && "odometr_km" in row;
  const hasDeltaOrQuality = "delta_km" in row || "delta_days" in row || "quality" in row;
  const looksLikeInspection = "stanice_cislo" in row || "druh_prohlidky" in row || "defect_count" in row;
  return hasCore && hasDeltaOrQuality && !looksLikeInspection;
}

function looksLikeInspectionRow(value: unknown): value is ProklepniInspectionRow {
  const row = readObject(value);
  if (!row) return false;
  return "stanice_cislo" in row || "druh_prohlidky" in row || "defect_count" in row;
}

function looksLikeOwnerRow(value: unknown): value is ProklepniOwnerRow {
  const row = readObject(value);
  if (!row) return false;
  return "vztah" in row || "datum_od" in row || "vztah_label" in row;
}

function mapOwnerRole(raw: ProklepniOwnerRow): string {
  const label = safeText(raw.vztah_label);
  if (label) return label;

  const relationNum = toInt(raw.vztah);
  const relationText = safeText(raw.vztah)?.toLowerCase();
  if (relationNum === 3 || relationText === "both") return "vlastník + provozovatel";
  if (relationNum === 1 || relationText === "1") return "vlastník";
  if (relationNum === 2 || relationText === "2") return "provozovatel";
  return "vlastník + provozovatel";
}

function pickInitialDataArrays(arrays: unknown[][]): {
  odometer: ProklepniOdometerRow[];
  inspections: ProklepniInspectionRow[];
  owners: ProklepniOwnerRow[];
} {
  const picked = {
    odometer: [] as ProklepniOdometerRow[],
    inspections: [] as ProklepniInspectionRow[],
    owners: [] as ProklepniOwnerRow[],
  };

  for (const arr of arrays) {
    if (!arr.length) continue;
    const sample = arr[0];

    // STK arrays also contain odometer values; prefer explicit inspection mapping first.
    if (!picked.inspections.length && looksLikeInspectionRow(sample)) {
      picked.inspections = arr.filter(looksLikeInspectionRow);
      continue;
    }
    if (!picked.odometer.length && looksLikeOdometerRow(sample)) {
      picked.odometer = arr.filter(looksLikeOdometerRow);
      continue;
    }
    if (!picked.owners.length && looksLikeOwnerRow(sample)) {
      picked.owners = arr.filter(looksLikeOwnerRow);
    }
  }

  return picked;
}

function findSection(joinedPayload: string, heading: string, length = 36_000): string {
  const idx = joinedPayload.indexOf(heading);
  if (idx < 0) return joinedPayload;
  return joinedPayload.slice(idx, idx + length);
}

function extractValuation(joinedPayload: string): ProklepniValuation {
  const priceSection = findSection(joinedPayload, "\"children\":\"Odhadovaná tržní cena\"");
  const mileageSection = findSection(joinedPayload, "\"children\":\"Cena podle nájezdu\"");

  const estimatedPrice =
    toIntLoose(readRegexGroup(priceSection, /"estimated_price":(\d+)/)) ??
    toIntLoose(readRegexGroup(priceSection, /"text-4xl sm:text-5xl font-extrabold tabular-nums"[^]*?"children":"([^"]+ Kč)"/));

  const confidenceLabel = readRegexGroup(priceSection, /"children":"([^"]*spolehlivost)"/i);
  const comparableCount = toIntLoose(readRegexGroup(priceSection, /"children":\[(\d+)," ","srovnatelných vozidel"\]/));
  const referenceMileageKm = toIntLoose(readRegexGroup(priceSection, /"children":\["při ","([^"]+ km)"\]/));

  const fairRangeMatch = priceSection.match(
    /"children":\["([0-9\u00a0 ]+)"," - ","([0-9\u00a0 ]+)"," Kč"\]/
  );
  const fairRangeLow = toIntLoose(fairRangeMatch?.[1] ?? null);
  const fairRangeHigh = toIntLoose(fairRangeMatch?.[2] ?? null);
  const fairRangePct = toIntLoose(readRegexGroup(priceSection, /"children":"±\s*([0-9\u00a0 ]+)\s*%"/));

  const marketRangeMatch = joinedPayload.match(
    /"className":"flex justify-between mt-2 text-\[11px\] tabular-nums"[\s\S]*?"children":"([0-9\u00a0 ]+ Kč)"[\s\S]*?"children":"([0-9\u00a0 ]+ Kč)"/
  );
  const marketMin = toIntLoose(marketRangeMatch?.[1] ?? null);
  const marketMax = toIntLoose(marketRangeMatch?.[2] ?? null);

  const segmentMatch = priceSection.match(
    /"className":"flex h-2 rounded-full"[\s\S]*?"width":"([0-9.]+)%","backgroundColor":"#10B981"[\s\S]*?"width":"([0-9.]+)%","backgroundColor":"#3B82F6"[\s\S]*?"width":"([0-9.]+)%","backgroundColor":"#EF4444"/
  );
  const segmentUnderPct = toPercent(segmentMatch?.[1] ?? null);
  const segmentFairPct = toPercent(segmentMatch?.[2] ?? null);
  const segmentOverPct = toPercent(segmentMatch?.[3] ?? null);
  const markerPct = toPercent(
    readRegexGroup(
      priceSection,
      /"className":"absolute pointer-events-none","style":\{"left":"([0-9.]+)%","top":0,"bottom":0,"transform":"translateX\(-50%\)"\}/
    )
  );

  const infoTitle = readRegexGroup(priceSection, /"children":"(Odhad na základě[^"]+)"/);
  const infoText = readRegexGroup(priceSection, /"children":"(Zadejte aktuální nájezd[^"]+)"/);
  const highlightedMileageKm = toIntLoose(
    readRegexGroup(mileageSection, /"children":\["Zvýrazněno pro nájezd ~","([0-9\u00a0 ]+)"," km"\]/)
  );

  const fallbackWidth = toPercent(
    readRegexGroup(
      joinedPayload,
      /[0-9a-z]+:\["\$","div",null,\{"className":"flex-1 h-7 rounded-lg overflow-hidden"[\s\S]*?"width":"([0-9.]+)%","backgroundColor":"#059669","opacity":0.35\}/
    )
  );
  const fallbackPrice = toIntLoose(
    readRegexGroup(
      joinedPayload,
      /[0-9a-z]+:\["\$","span",null,\{"className":"text-xs font-bold tabular-nums w-24 text-right shrink-0"[\s\S]*?"children":"([0-9\u00a0 ]+) Kč"\}\]/
    )
  );

  const rows: ProklepniValuationMileageRow[] = [];
  const seen = new Set<string>();
  const rowChunks = mileageSection.split("[\"$\",\"div\",\"");
  for (const chunk of rowChunks) {
    if (!chunk.includes("\"className\":\"flex items-center gap-3\"")) continue;
    if (!chunk.includes("k km")) continue;

    const key = readRegexGroup(
      chunk,
      /^(\d+)","\{"className":"flex items-center gap-3"/
    );
    const kmRounded = toIntLoose(readRegexGroup(chunk, /"children":\["(\d+)","k km"\]/));
    const widthPercent = toPercent(readRegexGroup(chunk, /"width":"([0-9.]+)%"/));
    const opacity = toPercent(readRegexGroup(chunk, /"opacity":([0-9.]+)/));
    const price = toIntLoose(readRegexGroup(chunk, /"children":"([0-9\u00a0 ]+) Kč"/));
    const fontWeight = toIntLoose(readRegexGroup(chunk, /"fontWeight":([0-9.]+)/));

    const kmFromKey = toIntLoose(key);
    const km = kmFromKey ?? (kmRounded != null ? kmRounded * 1_000 : null);
    if (km == null) continue;

    const row = {
      km,
      price,
      widthPercent,
      highlighted: (opacity != null && opacity >= 0.75) || (fontWeight != null && fontWeight >= 700),
    } satisfies ProklepniValuationMileageRow;

    const signature = `${row.km}|${row.price ?? "x"}|${row.widthPercent ?? "x"}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    rows.push(row);
  }

  rows.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));

  const completedRows = rows.map((row) => {
    if (row.widthPercent != null && row.price != null) return row;
    return {
      ...row,
      widthPercent: row.widthPercent ?? fallbackWidth,
      price: row.price ?? fallbackPrice,
    };
  });

  return {
    estimatedPrice,
    confidenceLabel,
    comparableCount,
    referenceMileageKm,
    fairRangeLow,
    fairRangeHigh,
    fairRangePct,
    marketMin,
    marketMax,
    segmentUnderPct,
    segmentFairPct,
    segmentOverPct,
    markerPct,
    infoTitle,
    infoText,
    highlightedMileageKm,
    mileagePriceRows: completedRows.filter((row) => row.price != null),
  };
}

function extractTechnicalSectionsFromHtml(html: string): ProklepniTechnicalSection[] {
  const marker = '<div class="mb-6 spec-group">';
  if (!html.includes(marker)) return [];

  const chunks = html.split(marker).slice(1);
  const sections: ProklepniTechnicalSection[] = [];

  for (const chunk of chunks) {
    const body = chunk.split("</div></div></div></div><script>$RS(")[0] ?? chunk;
    const titleRaw = readRegexGroup(body, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = normalizeHtmlText(titleRaw ? stripTags(titleRaw) : null);
    if (!title) continue;

    const rows: ProklepniTechnicalRow[] = [];
    const rowRe = /<div class="flex items-baseline justify-between py-1">([\s\S]*?)<\/div>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRe.exec(body)) !== null) {
      const rowChunk = rowMatch[1] ?? "";
      const spanMatches = Array.from(
        rowChunk.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)
      );
      if (spanMatches.length < 2) continue;

      const label = normalizeHtmlText(stripTags(spanMatches[0][1] ?? ""));
      const value = normalizeHtmlText(stripTags(spanMatches[1][1] ?? ""));
      if (!label || !value) continue;

      rows.push({ label, value });
    }

    if (rows.length > 0) {
      sections.push({ title, rows });
    }
  }

  return sections;
}

export async function GET(req: NextRequest) {
  const guard = requireIpRateLimited(req, {
    namespace: "api:proklepni:report:get",
    limit: PROKLEPNI_REPORT_RATE_LIMIT,
    windowMs: PROKLEPNI_REPORT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const withRateLimit = (response: NextResponse) =>
    withIpRateLimitHeaders(response, guard.ctx);

  const vin = normalizeVin(new URL(req.url).searchParams.get("vin"));
  if (!VIN_RE.test(vin)) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "VIN není ve validním formátu." },
        { status: 400 }
      )
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const upstream = await fetch(`${UPSTREAM_BASE_URL}${encodeURIComponent(vin)}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "sec-ch-ua": "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
    });

    if (!upstream.ok) {
      return withRateLimit(
        NextResponse.json(
          { ok: false, error: `Nepodařilo se načíst proklepni data (${upstream.status}).` },
          { status: 502 }
        )
      );
    }

    const html = await upstream.text();
    const flightStrings = extractFlightStrings(html);
    const joined = flightStrings.join("\n");

    const summaryContainer = extractSummaryContainer(joined);
    const summaryRaw = (readObject(summaryContainer)?.summary ?? null) as ProklepniSummaryRaw;
    const status = safeText(readObject(summaryContainer)?.status) ?? null;
    const stkStatusRaw = (readObject(summaryContainer)?.stkStatus ?? null) as ProklepniStkStatusRaw;
    const initialDataArrays = extractInitialDataArrays(joined);
    const arrays = pickInitialDataArrays(initialDataArrays);
    const hero = extractHero(html);
    const valuation = extractValuation(joined);
    const technicalSections = extractTechnicalSectionsFromHtml(html);

    const summary = {
      inspectionCount: toInt(summaryRaw?.inspection_count),
      failedInspectionCount: toInt(summaryRaw?.failed_inspection_count),
      ownerCount: toInt(summaryRaw?.owner_count),
      ownerRecordCount: toInt(summaryRaw?.party_analysis?.record_count),
      ownerPartyCount: toInt(summaryRaw?.party_analysis?.party_count),
      wasImported: toBool(summaryRaw?.was_imported),
      importCountry: safeText(summaryRaw?.import_country),
      importDate: safeText(summaryRaw?.import_date),
      totalDefects: toInt(summaryRaw?.total_defects),
      lastOdometerKm: toInt(summaryRaw?.last_odometer_km),
      lastOdometerDate: safeText(summaryRaw?.last_odometer_date),
      avgAnnualKm: toInt(summaryRaw?.avg_annual_km),
    };

    const stkStatus = {
      state: safeText(stkStatusRaw?.state),
      nextDue: safeText(stkStatusRaw?.nextDue),
      daysRemaining: toInt(stkStatusRaw?.daysRemaining),
      note: safeText(stkStatusRaw?.note),
      scorePenalty: toInt(stkStatusRaw?.scorePenalty),
    };

    const odometerHistory = arrays.odometer.map((row) => ({
      dateIso: safeText(row.datum),
      km: toInt(row.odometr_km),
      deltaKm: toInt(row.delta_km),
      deltaDays: toInt(row.delta_days),
      protocolLabel: safeText(row.cislo_protokolu),
      result: toInt(row.vysledek),
      quality: safeText(row.quality),
    }));

    const inspections = arrays.inspections.map((row) => ({
      protocolLabel: safeText(row.cislo_protokolu),
      dateIso: safeText(row.datum),
      stationNumber: toInt(row.stanice_cislo),
      stationTown: safeText(row.stanice_obec),
      inspectionType: toInt(row.druh_prohlidky),
      inspectionTypeLabel: safeText(row.druh_text),
      result: toInt(row.vysledek),
      resultLabel: safeText(row.vysledek_text),
      mileageKm: toInt(row.odometr_km),
      durationMin: toInt(row.trvani_min),
      defectCount: toInt(row.defect_count),
      worstSeverity: safeText(row.worst_severity),
      sameDayGroupId: safeText(row.same_day_group_id),
    }));

    const owners = arrays.owners.map((row) => ({
      roleLabel: mapOwnerRole(row),
      isCurrent: toBool(row.aktualni) ?? safeText(row.datum_do) == null,
      name: safeText(row.display_name) ?? safeText(row.nazev) ?? "Neuvedený subjekt",
      icoLabel: safeText(row.ico) ?? "IČO neuvedeno",
      addressLabel: safeText(row.adresa) ?? "Adresa neuvedena",
      fromIso: safeText(row.datum_od),
      toIso: safeText(row.datum_do),
    }));

    return withRateLimit(
      NextResponse.json(
        {
          ok: true,
          source: "proklepni",
          vin,
          report: {
            status,
            summary,
            stkStatus,
            hero,
            valuation,
            technical: {
              sections: technicalSections,
            },
            odometerHistory,
            inspections,
            owners,
          },
        },
        {
          status: 200,
          headers: { "Cache-Control": "private, no-store, max-age=0" },
        }
      )
    );
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    return withRateLimit(
      NextResponse.json(
        {
          ok: false,
          error: isTimeout
            ? "Načítání proklepni reportu vypršelo."
            : "Nepodařilo se načíst proklepni report.",
        },
        { status: 504 }
      )
    );
  } finally {
    clearTimeout(timeout);
  }
}
