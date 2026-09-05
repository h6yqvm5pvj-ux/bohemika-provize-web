import {
  parseCommissionAuditCodeFilter,
  parseCommissionAuditMode,
} from "@/app/lib/commissionAudit";
import { CATEGORY_DEFS, INSTITUTION_DEFS } from "./contractsPageFilters";
import type {
  ContractsApiResponse,
  ContractsCache,
  ContractsViewState,
  ProductCategory,
  Institution,
} from "./contractsPageTypes";

export const CONTRACTS_CACHE_KEY = "contracts_cache_v3";
export const CONTRACTS_UPDATED_KEY = "contracts_last_updated";
export const CONTRACTS_VIEW_STATE_KEY = "contracts_view_state_v1";
export const CONTRACTS_SILENT_REFRESH_COOLDOWN_MS = 60_000;
export const CONTRACT_LIST_WINDOWING_THRESHOLD = 90;
export const CONTRACT_LIST_ESTIMATED_COMPACT_ROW_HEIGHT = 92;
export const CONTRACT_LIST_OVERSCAN_ROWS = 3;

export const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeSearchValue = (value?: string | null): string =>
  stripDiacritics((value ?? "").trim().toLowerCase());

export const normalizeContractNumberForSearch = (value?: string | null): string =>
  normalizeSearchValue(value).replace(/[^a-z0-9]/g, "");

export const normalizeCursorToken = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

export const cursorFromApi = (
  token: string | null | undefined,
  legacyMillis: number | null | undefined
): string | null => normalizeCursorToken(token ?? legacyMillis ?? null);

export async function readContractsApiResponseSafe(
  response: Response
): Promise<ContractsApiResponse | null> {
  try {
    return (await response.json()) as ContractsApiResponse;
  } catch {
    return null;
  }
}

export function readContractsCache(
  email: string | null | undefined
): ContractsCache | null {
  if (!email || typeof window === "undefined") return null;
  const normalized = email.toLowerCase();
  try {
    const raw = sessionStorage.getItem(CONTRACTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContractsCache;
    if (parsed.userEmail !== normalized) return null;
    const updatedRaw = localStorage.getItem(CONTRACTS_UPDATED_KEY);
    const updatedAt = Number(updatedRaw);
    if (Number.isFinite(updatedAt) && (parsed.savedAt ?? 0) < updatedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeContractsCache(cache: ContractsCache) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CONTRACTS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort cache
  }
}

export function readContractsViewState(
  userEmail: string | null | undefined
): ContractsViewState | null {
  if (typeof window === "undefined") return null;
  const normalized = normalizeEmail(userEmail);
  if (!normalized) return null;
  try {
    const key = `${CONTRACTS_VIEW_STATE_KEY}:${normalized}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContractsViewState>;
    return {
      userEmail: normalized,
      showTeam: Boolean(parsed.showTeam),
      filterMode: parsed.filterMode === "anniversary" ? "anniversary" : "latest",
      searchText: typeof parsed.searchText === "string" ? parsed.searchText : "",
      showUnpaidOnly: Boolean(parsed.showUnpaidOnly),
      showRefreshOnly: Boolean(parsed.showRefreshOnly),
      showActiveOnly: Boolean(parsed.showActiveOnly),
      showStornoOnly: Boolean(parsed.showStornoOnly),
      showMaturedOnly: Boolean(parsed.showMaturedOnly),
      commissionAuditMode: parseCommissionAuditMode(
        typeof parsed.commissionAuditMode === "string"
          ? parsed.commissionAuditMode
          : null
      ),
      commissionAuditCodeFilter: parseCommissionAuditCodeFilter(
        typeof parsed.commissionAuditCodeFilter === "string"
          ? parsed.commissionAuditCodeFilter
          : null
      ),
      selectedCategories: Array.isArray(parsed.selectedCategories)
        ? parsed.selectedCategories.filter((v): v is ProductCategory =>
            CATEGORY_DEFS.some((d) => d.id === v)
          )
        : [],
      selectedInstitutions: Array.isArray(parsed.selectedInstitutions)
        ? parsed.selectedInstitutions.filter((v): v is Institution =>
            INSTITUTION_DEFS.some((d) => d.id === v)
          )
        : [],
      selectedSubordinates: Array.isArray(parsed.selectedSubordinates)
        ? Array.from(
            new Set(
              parsed.selectedSubordinates
                .map((v) => (typeof v === "string" ? normalizeEmail(v) : ""))
                .filter(Boolean)
            )
          )
        : [],
      scrollY:
        typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
          ? Math.max(0, parsed.scrollY)
          : 0,
    };
  } catch {
    return null;
  }
}

export function writeContractsViewState(
  userEmail: string | null | undefined,
  state: Omit<ContractsViewState, "userEmail">
) {
  if (typeof window === "undefined") return;
  const normalized = normalizeEmail(userEmail);
  if (!normalized) return;
  try {
    const key = `${CONTRACTS_VIEW_STATE_KEY}:${normalized}`;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...state,
        userEmail: normalized,
      } satisfies ContractsViewState)
    );
    sessionStorage.removeItem(CONTRACTS_VIEW_STATE_KEY);
  } catch {
    // best effort
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const msg = error.message?.trim();
    if (msg) return msg;
  }
  return fallback;
}
