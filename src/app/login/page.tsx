// src/app/login/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { AuthPage } from "@/components/account-setup/AuthPage";
import { PasswordField } from "@/components/account-setup/PasswordField";
import surface from "@/components/account-setup/authSurface.module.css";
import {
  FactorId,
  getMultiFactorResolver,
  type MultiFactorError,
  type MultiFactorResolver,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../firebase";
import { PASSWORD_RESET_REQUESTED_MESSAGE, resolveAuthEmailErrorMessage, safeAuthEmailErrorCode } from "@/lib/authEmailMessages";
import { requestPasswordResetEmail } from "@/app/lib/authEmailRequest";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import {
  clearServerSession,
  createServerSessionFromToken,
  resolveSafeLoginNextPath,
} from "@/app/lib/authSession";
import { evaluateSubscriptionFromProfile } from "@/lib/subscriptionAccess";
import {
  getPasskeyAvailability,
  resolvePasskeyErrorMessage,
  signInWithPasskey,
} from "@/app/lib/passkeys";
import { PasskeyLoginLoader, type PasskeyLoginStage } from "./PasskeyLoginLoader";
import passkeyStyles from "./passkeyLoginLoader.module.css";
import { ACCOUNT_BLOCKED_MESSAGE, isAccountBlockedError, MFA_REAUTH_REQUIRED_CODE, MFA_REAUTH_REQUIRED_MESSAGE } from "@/lib/accountSecurity";

const EXPECTED_LOGIN_ERROR_CODES = new Set<string>([
  "auth/multi-factor-auth-required",
  "auth/user-disabled",
  "auth/account-blocked",
  "auth/invalid-verification-code",
  "auth/code-expired",
  "auth/too-many-requests",
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/invalid-email",
  "auth/network-request-failed",
  "auth/operation-not-allowed",
  "auth/timeout",
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  "auth/missing-continue-uri",
]);

const recordSuccessfulMfaVerification = async (user: FirebaseUser | null) => {
  if (!user) return;
  try {
    await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({ mfaLastVerifiedPing: true }),
    });
  } catch (error) {
    // Záznam času nesmí zablokovat již úspěšné přihlášení.
    console.warn("Nepodařilo se uložit čas posledního 2FA ověření.", error);
  }
};

const PASSWORD_ATTEMPT_ERROR_CODES = new Set<string>([
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
]);

const logAuthIssue = (context: string, error: unknown) => {
  const name = (error as { name?: string })?.name;
  if (name === "AbortError" || name === "NotAllowedError") return;
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

const MFA_CODE_LENGTH = 6;

const createEmptyMfaDigits = () => Array.from({ length: MFA_CODE_LENGTH }, () => "");

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
  if (payload?.ok === false && !payload.locked) {
    const message =
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : typeof payload.message === "string" && payload.message.trim()
          ? payload.message.trim()
          : "";
    if (message) return message;
  }

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
  email: string,
  authToken?: string
): Promise<LoginAttemptResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch("/api/auth/login-attempts", {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({ action, email }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as LoginAttemptResponse | null;
  if (payload && typeof payload === "object") return payload;
  throw new Error("Nepodařilo se ověřit bezpečnostní limit přihlášení.");
}

const detectIosDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyStage, setPasskeyStage] = useState<PasskeyLoginStage | null>(null);
  const passkeyLoading = passkeyStage !== null;
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const resetInFlight = useRef(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaDigits, setMfaDigits] = useState<string[]>(createEmptyMfaDigits);
  const [mfaHintUid, setMfaHintUid] = useState<string | null>(null);
  const [mfaHintLabel, setMfaHintLabel] = useState<string | null>(null);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [rememberThisDevice, setRememberThisDevice] = useState(false);
  const loginRememberThisDeviceRef = useRef(false);
  const loginAttemptInFlightRef = useRef(false);
  const passkeyAttemptRef = useRef<AbortController | null>(null);
  const mfaInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => () => {
    passkeyAttemptRef.current?.abort();
    passkeyAttemptRef.current = null;
  }, []);

  const clearMfaState = () => {
    setMfaResolver(null);
    setMfaDigits(createEmptyMfaDigits());
    setMfaHintUid(null);
    setMfaHintLabel(null);
  };

  const safeSignOut = useCallback(async () => {
    try {
      loginRememberThisDeviceRef.current = false;
      try {
        await clearServerSession();
      } finally {
        await withTimeout(signOut(auth), 6000, "Odhlášení trvá příliš dlouho.");
      }
    } catch (err) {
      logAuthIssue("safeSignOut", err);
    }
  }, []);

  const finalizeServerSession = useCallback(
    async () => {
      setMfaResolver(null);
      setMfaDigits(createEmptyMfaDigits());
      setMfaHintUid(null);
      setMfaHintLabel(null);
      router.replace(resolveSafeLoginNextPath("/"));
    },
    [router]
  );

  // Firebase can restore an old user (or receive one from another tab) while a
  // passkey / MFA prompt is still pending. Only a credential returned by the
  // current sign-in operation may create the server session and navigate away.
  const completeLogin = useCallback(async (user: FirebaseUser) => {
    const rawEmail = user.email;
    if (!rawEmail) {
      // nějaký divný user bez emailu – raději odhlásit
      await safeSignOut();
      setError("Účet nemá přiřazený e-mail. Kontaktuj podporu.");
      setLoading(false);
      return;
    }

    try {
      const loginToken = await withTimeout(
        user.getIdToken(),
        10000,
        "Ověření přihlášení trvá příliš dlouho."
      );
      // Account eligibility comes from the live server record, not potentially
      // stale MFA metadata restored by the browser (especially after passkeys).
      await withTimeout(
        createServerSessionFromToken(loginToken, {
          rememberThisDevice: loginRememberThisDeviceRef.current,
        }),
        10000,
        "Nastavení relace uživatele trvá příliš dlouho."
      );
      const finishLogin = async () => {
        await finalizeServerSession();
      };
      const loginAttemptState = await postLoginAttempt("success", rawEmail, loginToken);
      if (!loginAttemptState.ok || loginAttemptState.locked) {
        await safeSignOut();
        setError(buildLoginAttemptMessage(loginAttemptState));
        return;
      }

      const response = await withTimeout(
        getUserProfileCached(user, { force: true }),
        10000,
        "Ověření účtu trvá příliš dlouho."
      );

      if (response?.hasProfile !== true) {
        await finishLogin();
        return;
      }
      const data = response?.profile ?? {};
      const subscription = evaluateSubscriptionFromProfile(
        data as Record<string, unknown>
      );
      const hasActive =
        subscription.state === "active" || subscription.state === "grace";

      if (hasActive) {
        // OK → pustíme na hlavní stránku
        await finishLogin();
      } else {
        // žádné / expirované předplatné → odhlásit a ukázat hlášku
        await safeSignOut();
        setError(
          subscription.reason === "unpaid"
            ? "Tento účet je označený jako nezaplacený. Pro přístup je potřeba uhradit předplatné."
            : "Tento účet nemá aktivní (platné) předplatné."
        );
      }
    } catch (e) {
      console.error("Chyba při ověřování přihlášení/předplatného:", e);
      await safeSignOut();
      setError(
        isAccountBlockedError(e) ? ACCOUNT_BLOCKED_MESSAGE :
          (e as { code?: string })?.code === MFA_REAUTH_REQUIRED_CODE ? MFA_REAUTH_REQUIRED_MESSAGE :
          "Nepodařilo se bezpečně dokončit přihlášení. Zkus to prosím znovu nebo kontaktuj podporu."
      );
    } finally {
      setLoading(false);
    }
  }, [finalizeServerSession, safeSignOut]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsIosDevice(detectIosDevice());
    if (new URLSearchParams(window.location.search).get("reason") === "account-blocked") {
      setError(ACCOUNT_BLOCKED_MESSAGE);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverscrollBehavior = root.style.overscrollBehavior;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      root.style.overscrollBehavior = previousRootOverscrollBehavior;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    void getPasskeyAvailability().then((availability) => {
      if (isCancelled) return;
      setPasskeySupported(availability.supported);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mfaResolver) return;
    const frame = window.requestAnimationFrame(() => mfaInputRefs.current[0]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mfaResolver]);

  const handleMfaSubmit = async () => {
    if (loginAttemptInFlightRef.current) return;
    if (!mfaResolver || !mfaHintUid) {
      setError("Dvoufázové ověření se nepodařilo inicializovat. Zkus přihlášení znovu.");
      return;
    }

    const oneTimePassword = mfaDigits.join("");
    if (oneTimePassword.length !== MFA_CODE_LENGTH) {
      setError("Zadej všech 6 číslic jednorázového kódu.");
      mfaInputRefs.current[mfaDigits.findIndex((digit) => !digit) || 0]?.focus();
      return;
    }

    loginAttemptInFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        mfaHintUid,
        oneTimePassword
      );
      const credential = await withTimeout(
        mfaResolver.resolveSignIn(assertion),
        20000,
        "2FA ověření trvá příliš dlouho."
      );
      void recordSuccessfulMfaVerification(credential.user);
      await completeLogin(credential.user);
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
    } finally {
      loginAttemptInFlightRef.current = false;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loginAttemptInFlightRef.current) return;

    if (mfaResolver) {
      await handleMfaSubmit();
      return;
    }

    loginAttemptInFlightRef.current = true;
    setError(null);
    setLoading(true);
    loginRememberThisDeviceRef.current = rememberThisDevice;

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

      const credential = await withTimeout(
        signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword),
        20000,
        "Přihlášení trvá příliš dlouho."
      );
      await completeLogin(credential.user);
    } catch (err: unknown) {
      logAuthIssue("handleSubmit", err);
      const authErr = err as { code?: string };
      let msg = "Nepodařilo se přihlásit. Zkontroluj e-mail a heslo.";

      if (authErr?.code === "auth/multi-factor-auth-required") {
        try {
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
          setMfaDigits(createEmptyMfaDigits());
          setResetStatus(null);
          setError(null);
          setLoading(false);
          return;
        } catch (resolverError) {
          logAuthIssue("handleSubmitResolver", resolverError);
          msg = "Nepodařilo se zahájit 2FA ověření. Zkus přihlášení znovu.";
        }
      } else if (isAccountBlockedError(err)) {
        msg = ACCOUNT_BLOCKED_MESSAGE;
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
    } finally {
      loginAttemptInFlightRef.current = false;
    }
  };

  const handlePasskeyLogin = async () => {
    if (loginAttemptInFlightRef.current) return;
    if (!passkeySupported) {
      setError("Tento prohlížeč nebo zařízení přístupové klíče nepodporuje.");
      return;
    }

    loginAttemptInFlightRef.current = true;
    setError(null);
    setResetStatus(null);
    loginRememberThisDeviceRef.current = rememberThisDevice;
    const attempt = new AbortController();
    passkeyAttemptRef.current = attempt;
    setPasskeyStage("preparation");
    setLoading(true);
    clearMfaState();

    try {
      const credential = await signInWithPasskey({
        signal: attempt.signal,
        onStage: stage => {
          if (passkeyAttemptRef.current === attempt && !attempt.signal.aborted) setPasskeyStage(stage);
        },
      });
      attempt.signal.throwIfAborted();
      setPasskeyStage("session");
      await completeLogin(credential.user);
    } catch (error) {
      logAuthIssue("handlePasskeyLogin", error);
      setError(
        resolvePasskeyErrorMessage(
          error,
          "Přihlášení přes přístupový klíč se nepodařilo dokončit."
        )
      );
      setLoading(false);
    } finally {
      if (passkeyAttemptRef.current === attempt) passkeyAttemptRef.current = null;
      loginAttemptInFlightRef.current = false;
      setPasskeyStage(null);
    }
  };

  const handleReset = async () => {
    if (resetInFlight.current) return;
    setError(null);
    setResetStatus(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setResetStatus("Zadej e-mail, kam ti máme poslat odkaz na nové heslo.");
      return;
    }
    resetInFlight.current = true;
    setResetBusy(true);
    try {
      await requestPasswordResetEmail(trimmedEmail);
      setResetStatus(PASSWORD_RESET_REQUESTED_MESSAGE);
    } catch (err: unknown) {
      console.warn("[AuthEmail] password-reset:", safeAuthEmailErrorCode(err));
      setError(resolveAuthEmailErrorMessage(err, "Nepodařilo se vyžádat obnovení hesla. Zkus to znovu nebo kontaktuj podporu."));
    } finally {
      resetInFlight.current = false;
      setResetBusy(false);
    }
  };

  const fieldInputClass = `${surface.field} ${surface.withIcon}`;

  const focusMfaInput = (index: number) => {
    window.requestAnimationFrame(() => mfaInputRefs.current[index]?.focus());
  };

  const applyMfaDigits = (startIndex: number, rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, MFA_CODE_LENGTH - startIndex);
    if (!digits) return;

    setMfaDigits((current) => {
      const next = [...current];
      for (const [offset, digit] of Array.from(digits).entries()) {
        next[startIndex + offset] = digit;
      }
      return next;
    });
    setError(null);
    focusMfaInput(Math.min(startIndex + digits.length, MFA_CODE_LENGTH - 1));
  };

  const handleMfaDigitChange = (index: number, rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "");
    if (digits.length > 1) {
      applyMfaDigits(index, digits);
      return;
    }

    setMfaDigits((current) => {
      const next = [...current];
      next[index] = digits;
      return next;
    });
    setError(null);
    if (digits && index < MFA_CODE_LENGTH - 1) focusMfaInput(index + 1);
  };

  return (
    <AuthPage
      title={mfaResolver ? "Ověř své přihlášení" : "Vítej zpátky"}
      description={mfaResolver ? "Už jen kód z tvé ověřovací aplikace." : "Přihlas se do svého pracovního prostoru."}
    >
            <form
              onSubmit={handleSubmit}
              inert={passkeyLoading}
              aria-hidden={passkeyLoading || undefined}
              className={`relative z-10 space-y-4 ${passkeyLoading ? passkeyStyles.pendingForm : ""}`}
            >
              {!mfaResolver ? (
                <>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-email"
                      className="text-sm font-medium text-violet-100/80"
                    >
                      E-mail
                    </label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-100/48"
                        aria-hidden="true"
                      />
                      <input
                        id="login-email"
                        name="email"
                        type="email"
                        autoComplete="username webauthn"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={fieldInputClass}
                        placeholder="Zadej e-mail"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password"
                      className="text-sm font-medium text-violet-100/80"
                    >
                      Heslo
                    </label>
                      <PasswordField
                        id="login-password"
                        name="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={loading || resetBusy}
                        className="text-[11px] font-medium text-violet-100/68 transition hover:text-white disabled:opacity-60"
                      >
                        {resetBusy ? "Odesílám žádost…" : "Zapomenuté heslo?"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-violet-300/25 bg-white/[0.07] px-3 py-2 text-xs text-violet-100/82">
                    Přihlášení pokračuje přes 2FA.
                    {mfaHintLabel
                      ? ` Faktor: ${mfaHintLabel}.`
                      : " Potvrď ho kódem z Microsoft Authenticator."}
                  </div>
                  <fieldset className="space-y-3" aria-describedby="mfa-code-help">
                    <legend className="flex items-center gap-2 text-sm font-medium text-violet-100/80">
                      <ShieldCheck className="h-4 w-4 text-violet-200/75" aria-hidden="true" />
                      Jednorázový kód (2FA)
                    </legend>
                    <div className="grid grid-cols-6 gap-2 sm:gap-3">
                      {mfaDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(element) => {
                            mfaInputRefs.current[index] = element;
                          }}
                          id={index === 0 ? "login-otp" : undefined}
                          name={`otp-${index + 1}`}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          disabled={loading}
                          aria-label={`Číslice ${index + 1} z ${MFA_CODE_LENGTH}`}
                          onChange={(event) => handleMfaDigitChange(index, event.target.value)}
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={(event) => {
                            if (event.key === "Backspace" && !digit && index > 0) {
                              event.preventDefault();
                              setMfaDigits((current) => {
                                const next = [...current];
                                next[index - 1] = "";
                                return next;
                              });
                              focusMfaInput(index - 1);
                            }
                            if (event.key === "ArrowLeft" && index > 0) {
                              event.preventDefault();
                              focusMfaInput(index - 1);
                            }
                            if (event.key === "ArrowRight" && index < MFA_CODE_LENGTH - 1) {
                              event.preventDefault();
                              focusMfaInput(index + 1);
                            }
                          }}
                          onPaste={(event) => {
                            event.preventDefault();
                            applyMfaDigits(index, event.clipboardData.getData("text"));
                          }}
                          className="h-14 min-w-0 w-full [min-inline-size:0] rounded-2xl border border-violet-300/30 bg-white/[0.08] text-center text-xl font-bold tabular-nums text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition placeholder:text-violet-100/38 hover:border-violet-200/45 focus:border-violet-200/80 focus:bg-white/[0.13] focus:ring-2 focus:ring-violet-200/25 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      ))}
                    </div>
                    <p id="mfa-code-help" className="text-xs text-violet-100/58">
                      Kód z Microsoft Authenticatoru má 6 číslic.
                    </p>
                  </fieldset>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearMfaState}
                      disabled={loading}
                      className="text-[11px] font-medium text-violet-100/68 transition hover:text-white disabled:opacity-60"
                    >
                      Zpět na přihlášení heslem
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className={`${surface.notice} ${surface.noticeError}`}>
                  {error}
                </p>
              )}
              {resetStatus && (
                <p role="status" className={`${surface.notice} ${surface.noticeSuccess}`}>
                  {resetStatus}
                </p>
              )}

              {!mfaResolver ? (
                <label className="flex items-center gap-3 rounded-xl px-1 pt-1 text-xs">
                  <input
                    type="checkbox"
                    checked={rememberThisDevice}
                    onChange={(event) => setRememberThisDevice(event.target.checked)}
                    disabled={loading}
                    className="h-4 w-4 rounded border-violet-200/60 bg-transparent text-violet-500 focus:ring-violet-200/60 focus:ring-offset-0 focus:ring-offset-transparent"
                  />
                  <span className="text-violet-100/82">
                    Zůstat přihlášený na tomto zařízení
                  </span>
                </label>
              ) : null}

              <button
                type="submit"
                disabled={loading || passkeyLoading}
                className={`${surface.primary} mt-2 w-full`}
              >
                <span>
                  {loading && !passkeyLoading
                    ? mfaResolver
                      ? "Ověřuji kód…"
                      : "Přihlašuji…"
                    : passkeyLoading
                      ? "Ověřuji přístupový klíč…"
                    : mfaResolver
                      ? "Potvrdit kód"
                      : "Přihlásit se"}
                </span>
                {!loading && !passkeyLoading ? (
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                ) : null}
              </button>

              {!mfaResolver && passkeySupported ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100/45">
                    <span className="h-px flex-1 bg-violet-200/15" />
                    <span>nebo</span>
                    <span className="h-px flex-1 bg-violet-200/15" />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handlePasskeyLogin()}
                    disabled={loading || passkeyLoading}
                    className={`${surface.secondary} w-full`}
                  >
                    <KeyRound className="h-4 w-4 text-violet-100/82" aria-hidden="true" />
                    {passkeyLoading
                      ? "Otevírám ověření…"
                      : isIosDevice
                        ? "Přihlásit přes Face ID"
                        : "Přihlásit přes přístupový klíč"}
                  </button>
                </div>
              ) : null}
            </form>
            {passkeyStage && <PasskeyLoginLoader stage={passkeyStage} onCancel={passkeyStage === "session" ? undefined : () => passkeyAttemptRef.current?.abort()} />}
    </AuthPage>
  );
}
