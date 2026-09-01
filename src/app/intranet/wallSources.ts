export const INTRANET_WALL_MAX_SOURCES = 10;
export const INTRANET_WALL_SOURCE_MAX_URL_LENGTH = 2_048;

export type IntranetWallSourceParseResult =
  | { ok: true; sources: string[] }
  | { ok: false; error: string };

const sourceUrlFromUnknown = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const url = (value as { url?: unknown }).url;
    return typeof url === "string" ? url.trim() : "";
  }
  return "";
};

const normalizeSourceUrl = (value: unknown): string | null => {
  const raw = sourceUrlFromUnknown(value);
  if (!raw || raw.length > INTRANET_WALL_SOURCE_MAX_URL_LENGTH) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

export const parseIntranetWallSources = (
  value: unknown
): IntranetWallSourceParseResult => {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Seznam zdrojů má neplatný formát." };
  }

  const nonEmptyValues = value.filter((item) => sourceUrlFromUnknown(item));
  if (nonEmptyValues.length > INTRANET_WALL_MAX_SOURCES) {
    return {
      ok: false,
      error: `Příspěvek může mít maximálně ${INTRANET_WALL_MAX_SOURCES} zdrojů.`,
    };
  }

  const sources: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < nonEmptyValues.length; index += 1) {
    const raw = sourceUrlFromUnknown(nonEmptyValues[index]);
    if (raw.length > INTRANET_WALL_SOURCE_MAX_URL_LENGTH) {
      return {
        ok: false,
        error: `Zdroj č. ${index + 1} je příliš dlouhý.`,
      };
    }
    const normalized = normalizeSourceUrl(raw);
    if (!normalized) {
      return {
        ok: false,
        error: `Zdroj č. ${index + 1} není platný webový odkaz.`,
      };
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    sources.push(normalized);
  }

  return { ok: true, sources };
};

export const parseIntranetWallSourcesJson = (
  value: unknown
): IntranetWallSourceParseResult => {
  if (value == null || value === "") return { ok: true, sources: [] };
  if (typeof value !== "string") {
    return { ok: false, error: "Seznam zdrojů má neplatný formát." };
  }
  try {
    return parseIntranetWallSources(JSON.parse(value));
  } catch {
    return { ok: false, error: "Seznam zdrojů má neplatný formát." };
  }
};

export const sanitizeStoredIntranetWallSources = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const source = normalizeSourceUrl(item);
    if (!source || seen.has(source)) continue;
    seen.add(source);
    normalized.push(source);
    if (normalized.length >= INTRANET_WALL_MAX_SOURCES) break;
  }
  return normalized;
};

export const intranetWallSourceHost = (value: string): string => {
  try {
    return new URL(value).hostname.replace(/^www\./i, "") || value;
  } catch {
    return value;
  }
};
