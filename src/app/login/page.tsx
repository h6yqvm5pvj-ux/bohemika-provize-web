// src/app/login/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import { evaluateSubscriptionFromProfile } from "@/lib/subscriptionAccess";

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
  "auth/operation-not-allowed",
  "auth/timeout",
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  "auth/missing-continue-uri",
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

type InstallPlatform = "ios" | "android" | "desktop";

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed"; platform: string } | void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
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

function resolvePasswordResetErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "auth/user-not-found") {
    return "Účet s tímto e-mailem neexistuje ve Firebase Authentication.";
  }
  if (code === "auth/invalid-email") {
    return "Zadej platný e-mail.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Firebase Authentication nemá zapnuté přihlašování přes e-mail a heslo.";
  }
  if (code === "auth/too-many-requests") {
    return "Firebase dočasně blokuje další odesílání kvůli příliš mnoha pokusům. Zkus to později.";
  }
  if (code === "auth/network-request-failed") {
    return "Síťová chyba při komunikaci s Firebase.";
  }
  if (code === "auth/unauthorized-continue-uri") {
    return "Doména není povolená ve Firebase Authentication > Settings > Authorized domains.";
  }
  if (code === "auth/invalid-continue-uri" || code === "auth/missing-continue-uri") {
    return "Návratová URL pro Firebase e-mail není správně nastavená.";
  }
  if (code) {
    return `Firebase vrátil chybu ${code}.`;
  }
  return "Nepodařilo se odeslat odkaz pro obnovení.";
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
  });
  const payload = (await response.json().catch(() => null)) as LoginAttemptResponse | null;
  if (payload && typeof payload === "object") return payload;
  throw new Error("Nepodařilo se ověřit bezpečnostní limit přihlášení.");
}

const detectInstallPlatform = (): InstallPlatform => {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
};

const detectIosSafari = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  if (!isIos) return false;
  return /safari/.test(ua) && !/(crios|fxios|edgios|opios)/.test(ua);
};

const isStandaloneDisplay = (): boolean => {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const mediaMatch =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false;
  return mediaMatch || nav.standalone === true;
};

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
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>("desktop");
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<DeferredInstallPromptEvent | null>(null);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);

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
        const loginToken = await withTimeout(
          user.getIdToken(),
          10000,
          "Ověření přihlášení trvá příliš dlouho."
        );
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
          clearMfaState();
          router.replace("/");
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
          clearMfaState();
          router.replace("/");
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstallPlatform(detectInstallPlatform());
    setIsIosSafari(detectIosSafari());
    setIsStandaloneApp(isStandaloneDisplay());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as DeferredInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setInstallGuideOpen(false);
      setIsStandaloneApp(true);
      setInstallFeedback("Hotovo. Aplikace je přidaná na plochu.");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setIsStandaloneApp(isStandaloneDisplay());
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!installGuideOpen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInstallGuideOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [installGuideOpen]);

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
      // dál už to řeší onAuthStateChanged výše:
      // ověří subscription a podle toho buď router.replace("/"),
      // nebo signOut + error.
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
      auth.languageCode = "cs";
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetStatus("Poslal jsem odkaz pro obnovení hesla na zadaný e-mail.");
    } catch (err: any) {
      logAuthIssue("handleReset", err);
      setResetStatus(resolvePasswordResetErrorMessage(err));
    }
  };

  const fieldInputClass =
    "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.06)] outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

  const handleInstallCta = async () => {
    setInstallFeedback(null);

    if (isStandaloneApp) {
      setInstallFeedback("Aplikaci už máš nainstalovanou na ploše.");
      return;
    }

    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstallGuideOpen(false);
          setInstallFeedback("Instalace potvrzena. Ikona se zobrazí na ploše.");
        } else {
          setInstallFeedback("Instalaci můžeš dokončit kdykoliv později.");
          setInstallGuideOpen(true);
        }
      } catch (error) {
        console.warn("[PWA] Instalace se nepodařila spustit:", error);
        setInstallFeedback("Instalaci se nepodařilo otevřít. Zkus to znovu.");
        setInstallGuideOpen(true);
      } finally {
        setDeferredInstallPrompt(null);
      }
      return;
    }

    setInstallGuideOpen((prev) => !prev);
  };

  const installCtaLabel = isStandaloneApp
    ? "Aplikace je nainstalovaná"
    : deferredInstallPrompt
      ? "Nainstalovat aplikaci"
      : installPlatform === "ios"
        ? "Jak přidat na plochu"
        : "Jak nainstalovat";

  const installLeadText = isStandaloneApp
    ? "Spouštěj Bohemka.App přímo z plochy jako klasickou aplikaci."
    : deferredInstallPrompt
      ? "Aplikaci můžeš přidat na plochu jedním kliknutím."
      : "Klepni na tlačítko a otevře se krátký návod.";
  const shouldShowInstallAssistant = installPlatform !== "desktop";
  const isInstallGuideForIos = installPlatform === "ios";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(120%_140%_at_20%_0%,#eef2ff_0%,#f8fafc_46%,#ffffff_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_45%,#cbd5e1_100%)]" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[min(80vw,720px)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#c7d2fe_0%,#e2e8f0_44%,transparent_72%)] opacity-60 blur-2xl" />
      <div className="pointer-events-none absolute -left-24 bottom-[-180px] h-[520px] w-[520px] opacity-[0.24] sm:-left-32 sm:h-[680px] sm:w-[680px] lg:-left-40 lg:h-[860px] lg:w-[860px]">
        <Image
          src="/icons/bohemika_logo.png"
          alt=""
          fill
          sizes="(max-width: 640px) 520px, (max-width: 1024px) 680px, 860px"
          className="object-contain saturate-0 contrast-125"
          priority
        />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-xl space-y-7 font-mono">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Přihlášení
            </div>
            <h1 className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
              Bohemka.App
            </h1>
            <p className="text-sm text-slate-600">Přihlaš se do svého účtu.</p>
          </div>

          <section className="relative overflow-hidden rounded-[30px] border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_55%,#eff3f8_100%)] px-7 py-8 shadow-[0_26px_56px_rgba(15,23,42,0.12)] sm:px-9 sm:py-9">
            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_52%,#cbd5e1_100%)]" />
            <form onSubmit={handleSubmit} className="space-y-4">
              {!mfaResolver ? (
                <>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-email"
                      className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
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
                      className={fieldInputClass}
                      placeholder="Zadej e-mail"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password"
                      className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
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
                      className={fieldInputClass}
                      placeholder="••••••••"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={loading}
                        className="text-[11px] font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
                      >
                        Zapomenuté heslo?
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Přihlášení pokračuje přes 2FA.
                    {mfaHintLabel
                      ? ` Faktor: ${mfaHintLabel}.`
                      : " Potvrď ho kódem z Microsoft Authenticator."}
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-otp"
                      className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
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
                      className={fieldInputClass}
                      placeholder="123456"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearMfaState}
                      disabled={loading}
                      className="text-[11px] font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-60"
                    >
                      Zpět na přihlášení heslem
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
              {resetStatus && (
                <p className="rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {resetStatus}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-2xl border border-slate-900/80 bg-gradient-to-r from-slate-900 via-indigo-900 to-blue-900 py-3 text-base font-semibold tracking-[0.01em] text-white shadow-[0_10px_24px_rgba(15,23,42,0.28)] transition duration-200 hover:-translate-y-0.5 hover:from-slate-800 hover:via-indigo-800 hover:to-blue-800 hover:shadow-[0_14px_30px_rgba(37,99,235,0.33)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
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

            {shouldShowInstallAssistant ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      Aplikace na plochu
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{installLeadText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleInstallCta();
                    }}
                    disabled={isStandaloneApp}
                    className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                      isStandaloneApp
                        ? "cursor-default border-emerald-300 bg-emerald-100 text-emerald-800"
                        : "border-slate-900/80 bg-slate-900 text-white hover:bg-black"
                    }`}
                  >
                    {installCtaLabel}
                  </button>
                </div>

                {installFeedback ? (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {installFeedback}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {shouldShowInstallAssistant && installGuideOpen && !isStandaloneApp ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
          onClick={() => setInstallGuideOpen(false)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_64%,#eff4f9_100%)] p-5 shadow-[0_30px_70px_rgba(15,23,42,0.26)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_58%,#06b6d4_100%)]" />
            <button
              type="button"
              onClick={() => setInstallGuideOpen(false)}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg leading-none text-slate-600 transition hover:text-slate-900"
              aria-label="Zavřít návod"
            >
              ×
            </button>

            <div className="pr-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                Rychlý návod
              </p>
              <h3
                id="install-guide-title"
                className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-900"
              >
                {isInstallGuideForIos ? "Přidání na plochu (iPhone)" : "Instalace aplikace"}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {isInstallGuideForIos
                  ? "Trvá to asi 10 sekund. Po přidání ji najdeš na ploše jako klasickou appku."
                  : "Pokud se neukáže systémové okno, projdi rychlé kroky níže."}
              </p>
            </div>

            <ol className="mt-4 space-y-2">
              {isInstallGuideForIos ? (
                <>
                  <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800">
                    1. Otevři stránku v <span className="font-semibold">Safari</span>
                    {!isIosSafari ? " (teď nejsi v Safari)." : "."}
                  </li>
                  <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800">
                    2. Klepni na <span className="font-semibold">Sdílet</span>{" "}
                    <span aria-hidden="true">□↑</span>.
                  </li>
                  <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800">
                    3. Zvol <span className="font-semibold">Přidat na plochu</span> a potvrď{" "}
                    <span className="font-semibold">Přidat</span>.
                  </li>
                </>
              ) : (
                <>
                  <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800">
                    1. Otevři nabídku prohlížeče (⋮ nebo ⋯).
                  </li>
                  <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800">
                    2. Zvol <span className="font-semibold">Nainstalovat aplikaci</span> nebo{" "}
                    <span className="font-semibold">Přidat na plochu</span>.
                  </li>
                  <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800">
                    3. Potvrď instalaci.
                  </li>
                </>
              )}
            </ol>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setInstallGuideOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-900/80 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
              >
                Rozumím
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
