"use client";
import { useRef, useState } from "react";
import { EmailAuthProvider, FactorId, getMultiFactorResolver, reauthenticateWithCredential, TotpMultiFactorGenerator, type MultiFactorError, type MultiFactorResolver, type User } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import { getPasswordPolicyFailure } from "./passwordPolicy";

type Step = "password" | "totp" | "email" | "done" | "expired" | "unknown";
type Result = { ok: true; challengeId?: string; method?: "email" | "totp"; waitMs?: number; notificationSent?: boolean; changed?: boolean };
export class PasswordChangeRequestError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
async function request(user: User, body: Record<string, string>): Promise<Result> {
  let response: Response;
  try {
    response = await fetch("/api/auth/password-change", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new PasswordChangeRequestError(body.action === "complete" ? "change/outcome-unknown" : "change/network", "Spojení se serverem se nepodařilo dokončit.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new PasswordChangeRequestError(payload?.code ?? (body.action === "complete" ? "change/outcome-unknown" : "change/unavailable"),
      payload?.error ?? "Požadavek se nepodařilo dokončit. Zkus to prosím později.");
  }
  return payload;
}
const errorMessage = (error: unknown) => {
  if (error instanceof PasswordChangeRequestError) return error.message;
  switch ((error as { code?: string })?.code) {
    case "auth/wrong-password": case "auth/invalid-credential": return "Původní heslo není správné.";
    case "auth/invalid-verification-code": return "Kód z Authenticatoru není správný. Zadej aktuální kód.";
    case "auth/too-many-requests": return "Příliš mnoho pokusů. Zkus to prosím později.";
    case "auth/network-request-failed": return "Zkontroluj připojení a zkus to znovu.";
    default: return "Ověření se nepodařilo. Zkus to prosím znovu.";
  }
};

export function usePasswordChange(user: User, fullName: string) {
  const [step, setStep] = useState<Step>("password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const challenge = useRef("");
  const resolver = useRef<MultiFactorResolver | null>(null);
  const inFlight = useRef(false);
  const clearSecrets = () => { setCurrentPassword(""); setPassword(""); setConfirmPassword(""); setCode(""); resolver.current = null; challenge.current = ""; };
  const reset = () => { if (inFlight.current) return; clearSecrets(); setError(""); setStep("password"); };
  const submit = async () => {
    if (inFlight.current || !["password", "totp", "email"].includes(step)) return;
    const failure = getPasswordPolicyFailure({ password, confirmPassword, userEmail: user.email ?? "", userFullName: fullName });
    if (failure || (step === "password" && !currentPassword)) { setError(failure ?? "Zadej původní heslo."); return; }
    if (step !== "password" && !/^\d{6}$/.test(code)) { setError("Zadej šestimístný kód."); return; }
    inFlight.current = true; setBusy(true); setError("");
    const authorize = () => request(user, { action: "authorize", challengeId: challenge.current });
    const finish = async (emailCode: string) => {
      const result = await request(user, { action: "complete", challengeId: challenge.current, password, code: emailCode });
      if (result.changed !== true) throw new PasswordChangeRequestError("change/outcome-unknown", "Výsledek změny se nepodařilo ověřit.");
      setNotificationSent(result.notificationSent === true); clearSecrets(); setStep("done");
    };
    try {
      if (step === "password") {
        const prepared = await request(user, { action: "prepare" });
        if (!prepared.challengeId || !["email", "totp"].includes(prepared.method ?? "") || !Number.isFinite(prepared.waitMs) || prepared.waitMs! < 0 || prepared.waitMs! > 2000) {
          throw new PasswordChangeRequestError("change/unavailable", "Ověření se nepodařilo připravit.");
        }
        challenge.current = prepared.challengeId;
        await new Promise(resolve => setTimeout(resolve, prepared.waitMs));
        try {
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, currentPassword));
        } catch (error) {
          if ((error as { code?: string })?.code !== "auth/multi-factor-auth-required") throw error;
          const nextResolver = getMultiFactorResolver(auth, error as MultiFactorError);
          if (!nextResolver.hints.some(h => h.factorId === FactorId.TOTP)) throw new PasswordChangeRequestError("change/expired", "Účet vyžaduje jiný druh 2FA. Obrať se na správce aplikace.");
          resolver.current = nextResolver; setStep("totp"); return;
        } finally { setCurrentPassword(""); }
        const authorized = await authorize();
        if (authorized.method === "email") setStep("email");
        else if (authorized.method === "totp") await finish("");
        else throw new PasswordChangeRequestError("change/expired", "Nepodařilo se ověřit způsob potvrzení.");
      } else if (step === "totp") {
        const nextResolver = resolver.current;
        const hint = nextResolver?.hints.find(h => h.factorId === FactorId.TOTP);
        if (!nextResolver || !hint) throw new PasswordChangeRequestError("change/expired", "Ověření vypršelo. Začni znovu.");
        await nextResolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
        const authorized = await authorize();
        if (authorized.method !== "totp") throw new PasswordChangeRequestError("change/expired", "Zabezpečení účtu se změnilo. Začni znovu.");
        await finish("");
      } else { await finish(code); }
    } catch (error) {
      const errorCode = (error as { code?: string })?.code;
      if (errorCode === "change/outcome-unknown") { clearSecrets(); setStep("unknown"); }
      else if (["change/expired", "change/unauthorized", "change/email-failed", "auth/invalid-multi-factor-session", "auth/multi-factor-session-expired", "auth/session-expired", "auth/user-token-expired"].includes(errorCode ?? "")) { clearSecrets(); setStep("expired"); }
      setError(errorMessage(error));
    } finally { inFlight.current = false; setBusy(false); }
  };
  return { step, currentPassword, setCurrentPassword, password, setPassword, confirmPassword, setConfirmPassword, code,
    setCode: (value: string) => setCode(value.replace(/\D/g, "").slice(0, 6)), error, busy, notificationSent, submit, reset };
}
