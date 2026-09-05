import { clearLegacyClientCards } from "./clientCardPrivacy";

export function resolveSafeLoginNextPath(defaultPath = "/"): string {
  if (typeof window === "undefined") return defaultPath;
  try {
    const rawNext = new URLSearchParams(window.location.search).get("next");
    if (!rawNext) return defaultPath;
    const next = rawNext.trim();
    if (!next.startsWith("/") || next.startsWith("//")) return defaultPath;
    if (next === "/login" || next.startsWith("/login?")) return defaultPath;
    return next;
  } catch {
    return defaultPath;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof payload?.error === "string" && payload.error.trim()
    ? payload.error.trim()
    : "Serverovou session se nepodařilo nastavit.";
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
    throw new Error(await readErrorMessage(response));
  }
}

export async function clearServerSession(): Promise<void> {
  clearLegacyClientCards();
  const response = await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Odhlášení se nepodařilo dokončit. Zkontroluj připojení a zkus to znovu.");
}
