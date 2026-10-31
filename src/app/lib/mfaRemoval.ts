import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "./authenticatedApi";

export async function removeTotp(user: User, reauthenticate: () => Promise<boolean>): Promise<boolean> {
  const request = (body: { action: "prepare" | "complete"; challengeId?: string }) =>
    fetchAuthedJsonOrThrow(user, "/api/auth/mfa-removal", { method: "POST", body: JSON.stringify(body),
      credentials: "omit", redirect: "error", signal: AbortSignal.timeout(30_000) });
  const challenge = await request({ action: "prepare" });
  if (typeof challenge?.challengeId !== "string" || !/^[a-f\d-]{36}$/.test(challenge.challengeId) ||
      typeof challenge.waitMs !== "number" || !Number.isFinite(challenge.waitMs) || challenge.waitMs < 0 || challenge.waitMs > 2000) {
    throw new Error("Nepodařilo se připravit potvrzení odebrání 2FA.");
  }
  await new Promise(resolve => setTimeout(resolve, challenge.waitMs as number));
  if (!await reauthenticate()) return false;
  const result = await request({ action: "complete", challengeId: challenge.challengeId });
  if (result?.removed !== true) throw new Error("Odebrání 2FA se nepodařilo potvrdit.");
  return true;
}
