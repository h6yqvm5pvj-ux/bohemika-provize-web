// src/app/login/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
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
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
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
  const [rememberThisDevice, setRememberThisDevice] = useState(false);
  const loginRememberThisDeviceRef = useRef(false);

  const clearMfaState = () => {
    setMfaResolver(null);
    setMfaCode("");
    setMfaHintUid(null);
    setMfaHintLabel(null);
  };

  const safeSignOut = useCallback(async () => {
    try {
      loginRememberThisDeviceRef.current = false;
      await clearServerSession();
      await withTimeout(signOut(auth), 6000, "Odhlášení trvá příliš dlouho.");
    } catch (err) {
      logAuthIssue("safeSignOut", err);
    }
  }, []);

  const finalizeServerSession = useCallback(
    async (token: string) => {
      await withTimeout(
        createServerSessionFromToken(token, {
          rememberThisDevice: loginRememberThisDeviceRef.current,
        }),
        10000,
        "Nastavuji relaci uživatele trvá příliš dlouho."
      );
      setMfaResolver(null);
      setMfaCode("");
      setMfaHintUid(null);
      setMfaHintLabel(null);
      router.replace(resolveSafeLoginNextPath("/"));
    },
    [router]
  );

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
        const finishLogin = async () => {
          await finalizeServerSession(loginToken);
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
          "Nepodařilo se bezpečně dokončit přihlášení. Zkus to prosím znovu nebo kontaktuj podporu."
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [finalizeServerSession, safeSignOut]);

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

  const handlePasskeyLogin = async () => {
    if (!passkeySupported) {
      setError("Tento prohlížeč nebo zařízení přístupové klíče nepodporuje.");
      return;
    }

    setError(null);
    setResetStatus(null);
    loginRememberThisDeviceRef.current = rememberThisDevice;
    setPasskeyLoading(true);
    setLoading(true);
    clearMfaState();

    try {
      await signInWithPasskey();
      // dokončení přihlášení + kontrolu subscription řeší onAuthStateChanged
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
      setPasskeyLoading(false);
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
    "w-full rounded-2xl border border-violet-300/25 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition placeholder:text-violet-100/38 focus:border-violet-200/70 focus:bg-white/[0.12] focus:ring-2 focus:ring-violet-200/20";

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
    <main className="relative min-h-screen overflow-hidden bg-[#0b0717] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#080513_0%,#130923_48%,#25134a_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:46px_46px] opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,transparent_28%,rgba(168,85,247,0.16)_28%,rgba(168,85,247,0.16)_28.35%,transparent_28.35%,transparent_61%,rgba(99,102,241,0.12)_61%,rgba(99,102,241,0.12)_61.35%,transparent_61.35%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.025)_34%,rgba(0,0,0,0.22)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#160c2a_0%,#7c3aed_52%,#c084fc_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-xl space-y-7 font-mono">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/30 bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-100 shadow-[0_8px_20px_rgba(10,5,30,0.18)]">
              <span className="h-2 w-2 rounded-full bg-violet-300" aria-hidden="true" />
              Přihlášení
            </div>
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Bohemka.App
            </h1>
            <p className="text-sm text-violet-100/72">Přihlaš se do svého účtu.</p>
          </div>

          <section className="relative overflow-hidden rounded-[30px] border border-violet-300/25 bg-[linear-gradient(155deg,#160c2a_0%,#100b21_62%,#0b0717_100%)] px-7 py-8 text-[#f8fafc] shadow-[0_24px_68px_rgba(39,18,67,0.34),inset_0_1px_0_rgba(196,181,253,0.18)] sm:px-9 sm:py-9">
            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#cb85ff_0%,#aa57f5_46%,#8f44e8_100%)]" />
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,32,111,0.62)_0%,rgba(31,18,49,0.78)_42%,rgba(18,12,27,0.98)_100%)]" />
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.15)_0%,rgba(190,92,255,0)_36%,rgba(164,82,244,0.13)_100%)]" />
            <span className="pointer-events-none absolute -top-24 left-16 h-72 w-px rotate-[34deg] bg-[#9d61ca]/14" />
            <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
              {!mfaResolver ? (
                <>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-email"
                      className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-100/75"
                    >
                      E-mail
                    </label>
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

                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password"
                      className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-100/75"
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
                        className="text-[11px] font-medium text-violet-100/68 transition hover:text-white disabled:opacity-60"
                      >
                        Zapomenuté heslo?
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
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-otp"
                      className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-100/75"
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
                      className="text-[11px] font-medium text-violet-100/68 transition hover:text-white disabled:opacity-60"
                    >
                      Zpět na přihlášení heslem
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-2xl border border-rose-300/40 bg-rose-500/12 px-3 py-2 text-xs text-rose-100">
                  {error}
                </p>
              )}
              {resetStatus && (
                <p className="rounded-2xl border border-emerald-300/40 bg-emerald-400/12 px-3 py-2 text-xs text-emerald-100">
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
                    Důvěřovat tomuto zařízení (zůstanu přihlášený déle)
                  </span>
                </label>
              ) : null}

              <button
                type="submit"
                disabled={loading || passkeyLoading}
                className="mt-2 w-full rounded-2xl border border-violet-200/25 bg-[linear-gradient(135deg,#b85cff_0%,#7c3aed_52%,#4338ca_100%)] py-3 text-base font-semibold tracking-[0.01em] text-white shadow-[0_14px_30px_rgba(124,58,237,0.34)] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100b21] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading && !passkeyLoading
                  ? mfaResolver
                    ? "Ověřuji 2FA…"
                    : "Přihlašuji…"
                  : passkeyLoading
                    ? "Ověřuji přístupový klíč…"
                  : mfaResolver
                    ? "Potvrdit 2FA"
                    : "Přihlásit se"}
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
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-violet-200/25 bg-white/[0.1] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(10,5,30,0.18)] transition hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passkeyLoading
                      ? "Otevírám ověření…"
                      : installPlatform === "ios"
                        ? "Přihlásit přes Face ID"
                        : "Přihlásit přes přístupový klíč"}
                  </button>
                </div>
              ) : null}
            </form>

            {shouldShowInstallAssistant ? (
              <div className="relative z-10 mt-4 rounded-2xl border border-violet-300/20 bg-white/[0.06] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100/70">
                      Aplikace na plochu
                    </div>
                    <p className="mt-1 text-sm text-violet-100/82">{installLeadText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleInstallCta();
                    }}
                    disabled={isStandaloneApp}
                    className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                      isStandaloneApp
                        ? "cursor-default border-emerald-300/40 bg-emerald-400/14 text-emerald-100"
                        : "border-violet-200/25 bg-white/12 text-white hover:bg-white/18"
                    }`}
                  >
                    {installCtaLabel}
                  </button>
                </div>

                {installFeedback ? (
                  <p className="mt-3 rounded-xl border border-violet-300/20 bg-white/[0.06] px-3 py-2 text-xs text-violet-100/78">
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
