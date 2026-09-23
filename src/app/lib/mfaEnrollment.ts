import type { TotpSecret, User } from "firebase/auth";

export type MfaEnrollmentSecret = Pick<TotpSecret, "secretKey" | "generateQrCodeUrl"> & { challengeId: string };
export class MfaEnrollmentRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly retryAfterSeconds = 0) { super(message); }
}
async function request(user: User, body: { action: "start" | "request" | "verify" | "complete"; challengeId?: string; code?: string }) {
  let response: Response;
  try {
    response = await fetch("/api/auth/mfa-enrollment", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new MfaEnrollmentRequestError("Server pro nastavení 2FA neodpovídá. Zkus to prosím znovu.", "mfa/network", 0); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new MfaEnrollmentRequestError(
      typeof payload?.error === "string" ? payload.error : "Nastavení 2FA se nepodařilo ověřit.",
      typeof payload?.code === "string" ? payload.code : "mfa/unavailable", response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(3600, Math.ceil(retryAfter)) : 0,
    );
  }
  return payload;
}
export async function requestMfaEmailCode(user: User): Promise<string> {
  const result = await request(user, { action: "request" });
  if (typeof result.challengeId !== "string") throw new Error("Nepodařilo se vyžádat potvrzovací kód.");
  return result.challengeId;
}
export async function confirmMfaEmailCode(user: User, challengeId: string, code: string): Promise<MfaEnrollmentSecret> {
  const result = await request(user, { action: "verify", challengeId, code });
  return enrollmentSecret(user, result, challengeId);
}
export async function startMfaEnrollment(user: User): Promise<{ challengeId: string; secret?: MfaEnrollmentSecret }> {
  const result = await request(user, { action: "start" });
  if (typeof result.challengeId !== "string") throw new Error("Nepodařilo se zahájit nastavení 2FA.");
  return { challengeId: result.challengeId,
    ...(result.secretKey !== undefined ? { secret: enrollmentSecret(user, result, result.challengeId) } : {}) };
}
function enrollmentSecret(user: User, result: { challengeId?: unknown; secretKey?: unknown }, challengeId: string): MfaEnrollmentSecret {
  if (result.challengeId !== challengeId || typeof result.secretKey !== "string" || !/^[A-Z2-7]+$/.test(result.secretKey)) throw new Error("Nepodařilo se připravit QR kód.");
  const secretKey = result.secretKey;
  return {
    challengeId, secretKey,
    generateQrCodeUrl(accountName = user.email ?? "Bohemka.App", issuer = "Bohemka.App") {
      const params = new URLSearchParams({ secret: secretKey, issuer, algorithm: "SHA1", digits: "6", period: "30" });
      return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params}`;
    },
  };
}
export async function completeMfaEnrollment(user: User, secret: MfaEnrollmentSecret, code: string): Promise<void> {
  const result = await request(user, { action: "complete", challengeId: secret.challengeId, code });
  if (result.enrolled !== true) throw new Error("Nastavení 2FA se nepodařilo potvrdit.");
}
