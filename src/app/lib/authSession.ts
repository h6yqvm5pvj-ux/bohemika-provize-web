import { clearLegacyClientCards } from "./clientCardPrivacy";
import { clearContractTerminationPrefills } from "./contractTerminationPrivacy";
import { clearMeetingRecords } from "./meetingRecordPrivacy";

function hasUnsafeLoginPathCharacters(value: string): boolean {
  // URL parsers turn backslashes into slashes and strip some ASCII controls.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x5c || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function normalizeLoginNextPath(value: string | null, origin: string): string | null {
  if (!value || hasUnsafeLoginPathCharacters(value)) return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  try {
    const url = new URL(path, origin);
    const decodedPath = decodeURIComponent(url.pathname);
    if (
      url.origin !== origin ||
      // Removing dot segments can produce //host even from a /safe/..//host input.
      url.pathname.startsWith("//") || decodedPath.startsWith("//") ||
      hasUnsafeLoginPathCharacters(decodedPath) ||
      ["/login", "/ucet/zabezpeceni"].includes(decodedPath.replace(/\/+$/, "").toLowerCase())
    ) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function resolveSafeLoginNextPath(defaultPath = "/"): string {
  try {
    // On the server only rooted local fallbacks are allowed; no URL is requested.
    const origin = typeof window === "undefined" ? "https://login.invalid" : window.location.origin;
    const fallback = normalizeLoginNextPath(defaultPath, origin) ?? "/";
    if (typeof window === "undefined") return fallback;
    const rawNext = new URLSearchParams(window.location.search).get("next");
    return normalizeLoginNextPath(rawNext, origin) ?? fallback;
  } catch {
    return "/";
  }
}

async function readSessionError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
    code?: unknown;
  } | null;
  const message = typeof payload?.error === "string" && payload.error.trim()
    ? payload.error.trim()
    : "Serverovou session se nepodařilo nastavit.";
  return Object.assign(new Error(message), {
    code: typeof payload?.code === "string" ? payload.code : undefined,
  });
}

export async function createServerSessionFromToken(
  idToken: string,
  options: { rememberThisDevice?: boolean } = {}
): Promise<void> {
  const rememberThisDevice = options.rememberThisDevice === true;
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ rememberThisDevice }),
  });

  if (!response.ok) {
    throw await readSessionError(response);
  }
}

export async function clearServerSession(): Promise<void> {
  clearMeetingRecords();
  clearContractTerminationPrefills();
  clearLegacyClientCards();
  const response = await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Odhlášení se nepodařilo dokončit. Zkontroluj připojení a zkus to znovu.");
}
