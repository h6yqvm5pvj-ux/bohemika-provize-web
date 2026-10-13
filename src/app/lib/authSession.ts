import { clearPrivateMemory, purgePrivateBrowserCaches } from "./privateMemory";
import { clearLegacyClientCards } from "./clientCardPrivacy";
import { clearContractTerminationPrefills } from "./contractTerminationPrivacy";
import { clearMeetingRecords } from "./meetingRecordPrivacy";

let pendingSessionMutation: Promise<void> = Promise.resolve();

export const SERVER_SESSION_REQUEST_TIMEOUT_MS = 10_000;

function mutateServerSession(
  operation: (signal: AbortSignal) => Promise<void>,
  timeoutMessage: string,
): Promise<void> {
  // A guest redirect can leave DELETE in flight while passkey login starts.
  // Serialize cookie writes so its late response cannot erase the new session
  // (and a late POST cannot undo a subsequent logout).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(
    Object.assign(new Error(timeoutMessage), { code: "auth/timeout" }),
  ), SERVER_SESSION_REQUEST_TIMEOUT_MS);
  const mutation = pendingSessionMutation.then(() => {
    // A login that expired while waiting must not create a session later.
    controller.signal.throwIfAborted();
    return operation(controller.signal);
  }).finally(() => clearTimeout(timer));
  pendingSessionMutation = mutation.catch(() => {});
  return mutation;
}

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
  await mutateServerSession(async signal => {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ rememberThisDevice }),
      signal,
    });

    if (!response.ok) {
      throw await readSessionError(response);
    }
  }, "Nastavení relace uživatele trvá příliš dlouho.");
}

export async function clearServerSession(): Promise<void> {
  clearPrivateMemory();
  purgePrivateBrowserCaches();
  clearMeetingRecords();
  clearContractTerminationPrefills();
  clearLegacyClientCards();
  await mutateServerSession(async signal => {
    const response = await fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error("Odhlášení se nepodařilo dokončit. Zkontroluj připojení a zkus to znovu.");
  }, "Odhlášení trvá příliš dlouho. Zkus to znovu.");
}
