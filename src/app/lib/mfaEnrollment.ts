import type { TotpSecret, User } from "firebase/auth";

export type MfaEnrollmentSecret = Pick<TotpSecret, "secretKey" | "generateQrCodeUrl"> & { challengeId: string };
async function request(user: User, body: { action: "request" | "verify" | "complete"; challengeId?: string; code?: string }) {
  let response: Response;
  try {
    response = await fetch("/api/auth/mfa-enrollment", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new Error("Server pro nastavení 2FA neodpovídá. Zkus to prosím znovu."); }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) throw new Error(typeof payload?.error === "string" ? payload.error : "Nastavení 2FA se nepodařilo ověřit.");
  return payload;
}
export async function requestMfaEmailCode(user: User): Promise<string> {
  const result = await request(user, { action: "request" });
  if (typeof result.challengeId !== "string") throw new Error("Nepodařilo se vyžádat potvrzovací kód.");
  return result.challengeId;
}
export async function confirmMfaEmailCode(user: User, challengeId: string, code: string): Promise<MfaEnrollmentSecret> {
  const result = await request(user, { action: "verify", challengeId, code });
  if (result.challengeId !== challengeId || typeof result.secretKey !== "string" || !/^[A-Z2-7]+$/.test(result.secretKey)) throw new Error("Nepodařilo se připravit QR kód.");
  return {
    challengeId, secretKey: result.secretKey,
    generateQrCodeUrl(accountName = user.email ?? "Bohemka.App", issuer = "Bohemka.App") {
      const params = new URLSearchParams({ secret: result.secretKey, issuer, algorithm: "SHA1", digits: "6", period: "30" });
      return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params}`;
    },
  };
}
export async function completeMfaEnrollment(user: User, secret: MfaEnrollmentSecret, code: string): Promise<void> {
  const result = await request(user, { action: "complete", challengeId: secret.challengeId, code });
  if (result.enrolled !== true) throw new Error("Nastavení 2FA se nepodařilo potvrdit.");
}
