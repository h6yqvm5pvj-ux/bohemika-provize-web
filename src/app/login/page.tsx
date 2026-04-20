// src/app/login/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Smartphone, X } from "lucide-react";
import {
  FactorId,
  getMultiFactorResolver,
  multiFactor,
  type MultiFactorError,
  type MultiFactorResolver,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import { auth } from "../firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

const EXPECTED_LOGIN_ERROR_CODES = new Set<string>([
  "auth/multi-factor-auth-required",
  "auth/invalid-verification-code",
  "auth/code-expired",
  "auth/too-many-requests",
  "auth/user-not-found",
  "auth/wrong-password",
]);

const logAuthIssue = (context: string, error: unknown) => {
  const code = (error as { code?: string })?.code;
  if (typeof code === "string" && EXPECTED_LOGIN_ERROR_CODES.has(code)) {
    console.warn(`[Login] ${context}: ${code}`);
    return;
  }
  console.error(`[Login] ${context}:`, error);
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
  const [showMissing2FaModal, setShowMissing2FaModal] = useState(false);
  const [missing2FaEmail, setMissing2FaEmail] = useState<string | null>(null);

  const clearMfaState = () => {
    setMfaResolver(null);
    setMfaCode("");
    setMfaHintUid(null);
    setMfaHintLabel(null);
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
        setShowMissing2FaModal(false);
        setMissing2FaEmail(null);
        return;
      }

      const rawEmail = user.email;
      if (!rawEmail) {
        // nějaký divný user bez emailu – raději odhlásit
        await signOut(auth);
        return;
      }

      const normalizedEmail = rawEmail.trim().toLowerCase();

      try {
        const response = await fetchAuthedJsonOrThrow<{
          ok?: boolean;
          hasProfile?: boolean;
          profile?: Record<string, unknown>;
        }>(user, "/api/user/profile", { method: "GET" });
        if (response?.hasProfile !== true) {
          await signOut(auth);
          setError("Tento účet nemá aktivní předplatné.");
          return;
        }
        const data = response?.profile ?? {};
        const hasActive = evaluateSubscription(data);

        if (hasActive) {
          const hasTotpFactor = multiFactor(user).enrolledFactors.some(
            (factor) => factor.factorId === FactorId.TOTP
          );

          if (!hasTotpFactor) {
            clearMfaState();
            setError(null);
            setResetStatus(null);
            setMissing2FaEmail(normalizedEmail);
            setShowMissing2FaModal(true);
            return;
          }

          // OK → pustíme na hlavní stránku
          setShowMissing2FaModal(false);
          setMissing2FaEmail(null);
          clearMfaState();
          router.replace("/");
        } else {
          // žádné / expirované předplatné → odhlásit a ukázat hlášku
          await signOut(auth);
          setError("Tento účet nemá aktivní (platné) předplatné.");
        }
      } catch (e) {
        console.error("Chyba při ověřování předplatného:", e);
        await signOut(auth);
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
      await mfaResolver.resolveSignIn(assertion);
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

      await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
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
      } else if (authErr?.code === "auth/user-not-found") {
        msg = "Účet s tímto e-mailem neexistuje.";
      } else if (authErr?.code === "auth/wrong-password") {
        msg = "Nesprávné heslo.";
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

  const handleContinueWithout2Fa = () => {
    setShowMissing2FaModal(false);
    router.replace("/");
  };

  const handleOpen2FaSetup = () => {
    setShowMissing2FaModal(false);
    router.push("/nastaveni");
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
                  <label className="text-xs font-medium text-slate-700">
                    E-mail
                  </label>
                  <input
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
                  <label className="text-xs font-medium text-slate-700">
                    Heslo
                  </label>
                  <input
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
                  <label className="text-xs font-medium text-slate-700">
                    Jednorázový kód (2FA)
                  </label>
                  <input
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

      {showMissing2FaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4"
          onClick={handleContinueWithout2Fa}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.3)] sm:px-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.16em] text-slate-900">
                <ShieldCheck size={14} strokeWidth={2.2} className="text-slate-600" />
                2faktorové ověření
              </h3>
              <button
                type="button"
                onClick={handleContinueWithout2Fa}
                className="rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100"
                aria-label="Zavřít upozornění"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">
              Účet <span className="font-semibold text-slate-900">{missing2FaEmail}</span>{" "}
              zatím nemá aktivní 2FA. Pro vyšší bezpečnost doporučujeme zapnout ověřování hned.
            </p>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="inline-flex items-start gap-2 text-xs leading-relaxed text-slate-700">
                <Smartphone size={14} className="mt-0.5 shrink-0 text-slate-600" />
                Pro zapnutí 2FA potřebuješ aplikaci{" "}
                <span className="font-semibold text-slate-900">Microsoft Authenticator</span>.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleContinueWithout2Fa}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Pokračovat bez 2FA
              </button>
              <button
                type="button"
                onClick={handleOpen2FaSetup}
                className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
              >
                Nastavit 2FA teď
              </button>
            </div>
          </div>
        </div>
      )}
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
