// src/app/login/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  FactorId,
  getMultiFactorResolver,
  type MultiFactorError,
  type MultiFactorResolver,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import { auth } from "../firebase";
import { getUserProfileCached } from "@/app/lib/userProfileCache";

const EXPECTED_LOGIN_ERROR_CODES = new Set<string>([
  "auth/multi-factor-auth-required",
  "auth/invalid-verification-code",
  "auth/code-expired",
  "auth/too-many-requests",
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/invalid-email",
  "auth/network-request-failed",
  "auth/timeout",
]);

const PASSWORD_ATTEMPT_ERROR_CODES = new Set<string>([
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
]);

const logAuthIssue = (context: string, error: unknown) => {
  const code = (error as { code?: string })?.code;
  if (typeof code === "string" && EXPECTED_LOGIN_ERROR_CODES.has(code)) {
    console.warn(`[Login] ${context}: ${code}`);
    return;
  }
  console.error(`[Login] ${context}:`, error);
};

function timeoutError(message: string) {
  const err = new Error(message) as Error & { code?: string };
  err.code = "auth/timeout";
  return err;
}

async function withTimeout<T>(
  operation: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(timeoutError(message)), ms);
    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

type LoginAttemptAction = "check" | "failure" | "success";

type LoginAttemptResponse = {
  ok?: boolean;
  locked?: boolean;
  limit?: number;
  attemptsRemaining?: number;
  retryAfterSeconds?: number;
  message?: string;
  error?: string;
};

function attemptWord(count: number): string {
  if (count === 1) return "pokus";
  if (count >= 2 && count <= 4) return "pokusy";
  return "pokusů";
}

function formatRetryAfter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "chvíli";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

function buildLoginAttemptMessage(payload: LoginAttemptResponse | null): string {
  if (payload?.locked) {
    const retryAfter = Number(payload.retryAfterSeconds ?? 0);
    return `Příliš mnoho neúspěšných pokusů. Zkus to znovu za ${formatRetryAfter(retryAfter)}.`;
  }

  const attemptsRemaining = Number(payload?.attemptsRemaining);
  if (Number.isFinite(attemptsRemaining) && attemptsRemaining > 0) {
    return `Nesprávný e-mail nebo heslo. Zbývá ${attemptsRemaining} ${attemptWord(attemptsRemaining)}.`;
  }

  return "Nesprávný e-mail nebo heslo.";
}

async function postLoginAttempt(
  action: LoginAttemptAction,
  email: string
): Promise<LoginAttemptResponse> {
  const response = await fetch("/api/auth/login-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, email }),
  });
  const payload = (await response.json().catch(() => null)) as LoginAttemptResponse | null;
  if (payload && typeof payload === "object") return payload;
  throw new Error("Nepodařilo se ověřit bezpečnostní limit přihlášení.");
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaHintUid, setMfaHintUid] = useState<string | null>(null);
  const [mfaHintLabel, setMfaHintLabel] = useState<string | null>(null);

  const clearMfaState = () => {
    setMfaResolver(null);
    setMfaCode("");
    setMfaHintUid(null);
    setMfaHintLabel(null);
  };

  const safeSignOut = async () => {
    try {
      await withTimeout(signOut(auth), 6000, "Odhlášení trvá příliš dlouho.");
    } catch (err) {
      logAuthIssue("safeSignOut", err);
    }
  };

  // pomocná funkce: vyhodnotí, jestli má user aktivní předplatné
  function evaluateSubscription(data: any): boolean {
    const statusRaw = (data?.subscriptionStatus as string | undefined)?.trim().toLowerCase();
    return statusRaw !== "expired"; // povolíme vše kromě explicitně expirovaného
  }

  // pokud už je přihlášený, zkusíme ověřit předplatné a podle toho pustíme dál
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        return;
      }

      const rawEmail = user.email;
      if (!rawEmail) {
        // nějaký divný user bez emailu – raději odhlásit
        await safeSignOut();
        return;
      }

      try {
        const response = await withTimeout(
          getUserProfileCached(user, { force: true }),
          10000,
          "Ověření účtu trvá příliš dlouho."
        );
        if (response?.hasProfile !== true) {
          await safeSignOut();
          setError("Tento účet nemá aktivní předplatné.");
          return;
        }
        const data = response?.profile ?? {};
        const hasActive = evaluateSubscription(data);

        if (hasActive) {
          // OK → pustíme na hlavní stránku
          clearMfaState();
          router.replace("/");
        } else {
          // žádné / expirované předplatné → odhlásit a ukázat hlášku
          await safeSignOut();
          setError("Tento účet nemá aktivní (platné) předplatné.");
        }
      } catch (e) {
        console.error("Chyba při ověřování předplatného:", e);
        await safeSignOut();
        setError(
          "Nepodařilo se ověřit předplatné. Zkus to prosím znovu nebo kontaktuj podporu."
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const handleMfaSubmit = async () => {
    if (!mfaResolver || !mfaHintUid) {
      setError("Dvoufázové ověření se nepodařilo inicializovat. Zkus přihlášení znovu.");
      return;
    }

    const oneTimePassword = mfaCode.trim();
    if (!oneTimePassword) {
      setError("Zadej jednorázový kód z Microsoft Authenticator.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        mfaHintUid,
        oneTimePassword
      );
      await withTimeout(
        mfaResolver.resolveSignIn(assertion),
        20000,
        "2FA ověření trvá příliš dlouho."
      );
      // dokončení přihlášení + kontrolu subscription řeší onAuthStateChanged
    } catch (err: unknown) {
      logAuthIssue("handleMfaSubmit", err);
      const authErr = err as { code?: string };

      let msg = "Nepodařilo se ověřit jednorázový kód.";
      if (authErr?.code === "auth/invalid-verification-code") {
        msg = "Neplatný 2FA kód. Zkus aktuální kód z aplikace.";
      } else if (authErr?.code === "auth/code-expired") {
        msg = "2FA kód vypršel. Zadej nový aktuální kód.";
      } else if (authErr?.code === "auth/too-many-requests") {
        msg = "Příliš mnoho pokusů. Zkus to prosím za chvíli.";
      } else if (authErr?.code === "auth/network-request-failed") {
        msg = "Síťová chyba při 2FA ověření. Zkontroluj připojení a zkus to znovu.";
      } else if (authErr?.code === "auth/timeout") {
        msg = "2FA ověření trvá příliš dlouho. Zkus to prosím znovu.";
      }

      setError(msg);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (mfaResolver) {
      await handleMfaSubmit();
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      if (!trimmedEmail || !trimmedPassword) {
        setError("Zadej e-mail i heslo.");
        setLoading(false);
        return;
      }

      const gate = await postLoginAttempt("check", trimmedEmail);
      if (!gate.ok || gate.locked) {
        setError(buildLoginAttemptMessage(gate));
        setLoading(false);
        return;
      }

      await withTimeout(
        signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword),
        20000,
        "Přihlášení trvá příliš dlouho."
      );
      void postLoginAttempt("success", trimmedEmail).catch((successError) =>
        logAuthIssue("loginAttemptSuccess", successError)
      );
      // dál už to řeší onAuthStateChanged výše:
      // ověří subscription a podle toho buď router.replace("/"),
      // nebo signOut + error.
    } catch (err: unknown) {
      logAuthIssue("handleSubmit", err);
      const authErr = err as { code?: string };
      let msg = "Nepodařilo se přihlásit. Zkontroluj e-mail a heslo.";

      if (authErr?.code === "auth/multi-factor-auth-required") {
        try {
          await postLoginAttempt("success", email.trim().toLowerCase()).catch((successError) =>
            logAuthIssue("loginAttemptMfaSuccess", successError)
          );

          const resolver = getMultiFactorResolver(auth, authErr as MultiFactorError);
          const totpHint = resolver.hints.find(
            (hint) => hint.factorId === FactorId.TOTP
          );

          if (!totpHint) {
            setError(
              "Účet vyžaduje 2FA, ale nebyl nalezen TOTP faktor. Kontaktuj podporu."
            );
            setLoading(false);
            return;
          }

          setMfaResolver(resolver);
          setMfaHintUid(totpHint.uid);
          setMfaHintLabel(totpHint.displayName ?? null);
          setMfaCode("");
          setResetStatus(null);
          setError(null);
          setLoading(false);
          return;
        } catch (resolverError) {
          logAuthIssue("handleSubmitResolver", resolverError);
          msg = "Nepodařilo se zahájit 2FA ověření. Zkus přihlášení znovu.";
        }
      } else if (authErr?.code && PASSWORD_ATTEMPT_ERROR_CODES.has(authErr.code)) {
        const attemptState = await postLoginAttempt(
          "failure",
          email.trim().toLowerCase()
        ).catch((attemptError) => {
          logAuthIssue("loginAttemptFailure", attemptError);
          return null;
        });
        msg = buildLoginAttemptMessage(attemptState);
      } else if (authErr?.code === "auth/invalid-email") {
        msg = "Zadej platný e-mail.";
      } else if (authErr?.code === "auth/network-request-failed") {
        msg = "Síťová chyba při přihlášení. Zkontroluj připojení a zkus to znovu.";
      } else if (authErr?.code === "auth/timeout") {
        msg = "Přihlášení trvá příliš dlouho. Zkus to prosím znovu.";
      }

      setError(msg);
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setResetStatus(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setResetStatus("Zadej e-mail, kam ti máme poslat odkaz na nové heslo.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetStatus("Poslal jsem odkaz pro obnovení hesla na zadaný e-mail.");
    } catch (err: any) {
      logAuthIssue("handleReset", err);
      let msg = "Nepodařilo se odeslat odkaz pro obnovení.";
      if (err?.code === "auth/user-not-found") {
        msg = "Účet s tímto e-mailem neexistuje.";
      }
      setResetStatus(msg);
    }
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl space-y-8">
          <div className="space-y-2 text-center">
            <AnimatedHeading text="Bohemka.App" className="font-mono" />
            <p className="text-sm text-slate-600">Přihlaš se do svého účtu.</p>
          </div>

          <div className="w-full rounded-3xl border border-slate-900 bg-white px-8 py-9 sm:px-10 sm:py-11">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!mfaResolver ? (
              <>
                <div className="space-y-1">
                  <label
                    htmlFor="login-email"
                    className="text-xs font-medium text-slate-700"
                  >
                    E-mail
                  </label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                    placeholder="Zadej email"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="login-password"
                    className="text-xs font-medium text-slate-700"
                  >
                    Heslo
                  </label>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                    placeholder="••••••••"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={loading}
                      className="text-[11px] text-slate-600 hover:text-slate-900 transition disabled:opacity-60"
                    >
                      Zapomenuté heslo?
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Přihlášení pokračuje přes 2FA.
                  {mfaHintLabel
                    ? ` Faktor: ${mfaHintLabel}.`
                    : " Potvrď ho kódem z Microsoft Authenticator."}
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="login-otp"
                    className="text-xs font-medium text-slate-700"
                  >
                    Jednorázový kód (2FA)
                  </label>
                  <input
                    id="login-otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={mfaCode}
                    onChange={(e) =>
                      setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                    }
                    className="w-full rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                    placeholder="123456"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearMfaState}
                    disabled={loading}
                    className="text-[11px] text-slate-600 hover:text-slate-900 transition disabled:opacity-60"
                  >
                    Zpět na přihlášení heslem
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-rose-600 bg-rose-100 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
            {resetStatus && (
              <p className="rounded-xl border border-emerald-600 bg-emerald-100 px-3 py-2 text-xs text-emerald-900">
                {resetStatus}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? mfaResolver
                  ? "Ověřuji 2FA…"
                  : "Přihlašuji…"
                : mfaResolver
                  ? "Potvrdit 2FA"
                  : "Přihlásit se"}
            </button>
          </form>
          </div>
        </div>
      </div>

    </main>
  );
}

function AnimatedHeading({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const chars = Array.from(text);
  return (
    <div
      className={`text-5xl sm:text-6xl font-semibold text-slate-900 leading-tight flex flex-wrap justify-center gap-x-[2px] ${
        className ?? ""
      }`}
    >
      <style jsx>{`
        @keyframes floatUpLogin {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.98);
            filter: blur(4px);
          }
          65% {
            opacity: 1;
            transform: translateY(-4px) scale(1.01);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>
      {chars.map((ch, idx) => (
        <span
          key={`${ch}-${idx}`}
          className="inline-block"
          style={{
            animation: "floatUpLogin 1200ms ease-out forwards",
            animationDelay: `${idx * 32}ms`,
            opacity: 0,
          }}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </div>
  );
}
