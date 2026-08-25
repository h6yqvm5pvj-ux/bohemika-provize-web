import {
  ADMIN_IMPERSONATION_HEADER,
  normalizeImpersonationEmail,
} from "@/lib/adminImpersonationShared";
import { clearPersistedHomeCache } from "@/app/home/homeCacheStorage";

export type AdminImpersonationState = {
  email: string;
  name: string | null;
  startedAtMs: number;
};

export const ADMIN_IMPERSONATION_STORAGE_KEY = "admin_impersonation_v1";
export const ADMIN_IMPERSONATION_EVENT = "admin-impersonation:changed";
export { ADMIN_IMPERSONATION_HEADER, normalizeImpersonationEmail };

const ALLOWED_API_PREFIXES = [
  "/api/advisor-tips",
  "/api/commission-statements",
  "/api/contracts",
  "/api/intranet/wall",
  "/api/manager-snapshot",
  "/api/team-overview",
  "/api/tip-payouts",
  "/api/tips",
  "/api/tipster-tips",
  "/api/user-stats",
] as const;

const ALLOWED_EXACT_API_REQUESTS = new Map<string, ReadonlySet<string>>([
  ["/api/export-produkce/share", new Set(["POST"])],
  ["/api/mailbox/compose", new Set(["POST"])],
  ["/api/online-card/analytics", new Set(["GET"])],
  ["/api/online-card/office-photo", new Set(["POST"])],
  ["/api/plan-produkce/share", new Set(["POST"])],
  ["/api/team-message", new Set(["POST"])],
]);

export function shouldImpersonateApiRequest(
  pathname: string,
  method: string
): boolean {
  const normalizedMethod = method.trim().toUpperCase() || "GET";
  if (pathname === "/api/user/profile") {
    return normalizedMethod === "GET";
  }
  if (pathname === "/api/subscription/me") {
    return normalizedMethod === "GET";
  }
  if (pathname === "/api/mailbox") {
    return (
      normalizedMethod === "GET" ||
      normalizedMethod === "PATCH" ||
      normalizedMethod === "DELETE"
    );
  }
  if (pathname === "/api/mailbox/attachment") {
    return normalizedMethod === "GET";
  }
  if (pathname === "/api/mailbox/shared-preview") {
    return normalizedMethod === "GET";
  }
  if (ALLOWED_EXACT_API_REQUESTS.get(pathname)?.has(normalizedMethod)) {
    return true;
  }
  return ALLOWED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function readAdminImpersonationState(): AdminImpersonationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminImpersonationState> | null;
    const email = normalizeImpersonationEmail(parsed?.email);
    if (!email) return null;
    return {
      email,
      name:
        typeof parsed?.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : null,
      startedAtMs:
        typeof parsed?.startedAtMs === "number" && Number.isFinite(parsed.startedAtMs)
          ? parsed.startedAtMs
          : Date.now(),
    };
  } catch {
    return null;
  }
}

const broadcastChange = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_IMPERSONATION_EVENT));
  window.dispatchEvent(new Event("app:refresh-user-profile"));
  window.dispatchEvent(new Event("contracts:updated"));
};

export function clearImpersonationCaches() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem("contracts_cache_v3");
    window.sessionStorage.removeItem("contracts_view_state_v1");
    window.localStorage.setItem("contracts_last_updated", String(Date.now()));
    clearPersistedHomeCache();
  } catch {
    // Best effort cache invalidation.
  }
}

export function setAdminImpersonationState(state: {
  email: string;
  name?: string | null;
}) {
  if (typeof window === "undefined") return;
  const email = normalizeImpersonationEmail(state.email);
  if (!email) return;
  const payload: AdminImpersonationState = {
    email,
    name: state.name?.trim() || null,
    startedAtMs: Date.now(),
  };
  window.localStorage.setItem(ADMIN_IMPERSONATION_STORAGE_KEY, JSON.stringify(payload));
  clearImpersonationCaches();
  broadcastChange();
}

export function clearAdminImpersonationState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_IMPERSONATION_STORAGE_KEY);
  clearImpersonationCaches();
  broadcastChange();
}

export function resolveUserProfilePatchRequest(): {
  url: string;
  headers?: Record<string, string>;
  targetEmail: string | null;
} {
  const targetEmail = readAdminImpersonationState()?.email ?? null;
  if (!targetEmail) {
    return { url: "/api/user/profile", targetEmail: null };
  }
  return {
    url: `/api/user/profile?targetEmail=${encodeURIComponent(targetEmail)}`,
    headers: { [ADMIN_IMPERSONATION_HEADER]: targetEmail },
    targetEmail,
  };
}

const requestMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  const direct = init?.method;
  if (direct) return direct.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
};

const requestUrl = (input: RequestInfo | URL): URL | null => {
  if (typeof window === "undefined") return null;
  try {
    if (typeof input === "string") return new URL(input, window.location.origin);
    if (input instanceof URL) return input;
    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url, window.location.origin);
    }
  } catch {
    return null;
  }
  return null;
};

const shouldAttachImpersonationHeader = (
  input: RequestInfo | URL,
  init?: RequestInit
): boolean => {
  const url = requestUrl(input);
  if (!url || url.origin !== window.location.origin) return false;
  const { pathname } = url;
  const method = requestMethod(input, init);
  return shouldImpersonateApiRequest(pathname, method);
};

export function installAdminImpersonationFetchPatch() {
  if (typeof window === "undefined") return;
  const win = window as typeof window & {
    __bohemikaImpersonationFetchPatched?: boolean;
    __bohemikaOriginalFetch?: typeof window.fetch;
  };
  if (win.__bohemikaImpersonationFetchPatched) return;

  const originalFetch = window.fetch.bind(window);
  win.__bohemikaOriginalFetch = originalFetch;
  win.__bohemikaImpersonationFetchPatched = true;

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const state = readAdminImpersonationState();
    if (!state || !shouldAttachImpersonationHeader(input, init)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ??
        (typeof Request !== "undefined" && input instanceof Request
          ? input.headers
          : undefined)
    );
    headers.set(ADMIN_IMPERSONATION_HEADER, state.email);

    return originalFetch(input, {
      ...(init ?? {}),
      headers,
      cache: init?.cache ?? "no-store",
    });
  };
}
