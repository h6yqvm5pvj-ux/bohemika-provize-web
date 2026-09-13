import type { User } from "firebase/auth";
import { resolveAuthEmailErrorMessage, safeAuthEmailErrorCode } from "@/lib/authEmailMessages";

async function requestEmail(path: string, options: { email?: string; token?: string }) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify(options.email ? { email: options.email } : {}),
      credentials: "omit", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw Object.assign(new Error("Žádost o e-mail se nepodařila."), { code: "auth/network-request-failed" });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    const code = response.status === 429 ? "auth/too-many-requests"
      : response.status === 401 ? "auth/invalid-user-token" : safeAuthEmailErrorCode(payload);
    throw Object.assign(new Error(resolveAuthEmailErrorMessage({ code }, "Nepodařilo se vyžádat e-mail.")), { code });
  }
  return payload as { ok: true; alreadyVerified?: boolean };
}

export async function requestPasswordResetEmail(email: string): Promise<void> {
  await requestEmail("/api/auth/password-reset", { email });
}

export async function requestVerificationEmail(user: User): Promise<boolean> {
  const result = await requestEmail("/api/auth/email-verification-link", { token: await user.getIdToken() });
  return result.alreadyVerified === true;
}
