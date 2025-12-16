// src/app/login/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, db } from "../firebase";
import Plasma from "@/components/Plasma";
import { doc, getDoc } from "firebase/firestore";
import { Sora } from "next/font/google";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  // pomocná funkce: vyhodnotí, jestli má user aktivní předplatné
  function evaluateSubscription(data: any): boolean {
    const statusRaw = data?.subscriptionStatus as string | undefined;
    const paidUntilTS = (data as any)?.paidUntil;

    if (statusRaw !== "active") {
      return false;
    }

    // active + bez paidUntil = neomezený přístup
    if (!paidUntilTS || typeof paidUntilTS.toDate !== "function") {
      return true;
    }

    const paidUntil: Date = paidUntilTS.toDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return paidUntil >= today;
  }

  // pokud už je přihlášený, zkusíme ověřit předplatné a podle toho pustíme dál
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      const rawEmail = user.email;
      if (!rawEmail) {
        // nějaký divný user bez emailu – raději odhlásit
        await signOut(auth);
        return;
      }

      const normalizedEmail = rawEmail.trim().toLowerCase();

      try {
        const ref = doc(db, "users", normalizedEmail);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          // nemáme user dok → bereme jako bez předplatného
          await signOut(auth);
          setError("Tento účet nemá aktivní předplatné.");
          return;
        }

        const data = snap.data();
        const hasActive = evaluateSubscription(data);

        if (hasActive) {
          // OK → pustíme na hlavní stránku
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
      // dál už to řeší onAuthStateChanged výše:
      // ověří subscription a podle toho buď router.replace("/"),
      // nebo signOut + error.
    } catch (err: any) {
      console.error(err);
      let msg = "Nepodařilo se přihlásit. Zkontroluj e-mail a heslo.";

      if (err?.code === "auth/user-not-found") {
        msg = "Účet s tímto e-mailem neexistuje.";
      } else if (err?.code === "auth/wrong-password") {
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
      console.error("reset error", err);
      let msg = "Nepodařilo se odeslat odkaz pro obnovení.";
      if (err?.code === "auth/user-not-found") {
        msg = "Účet s tímto e-mailem neexistuje.";
      }
      setResetStatus(msg);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-50">
      {/* Černé pozadí + plasma jako všude */}
      <div className="fixed inset-0 -z-10 bg-black">
        <Plasma
          color="#6366f1"
          speed={0.6}
          direction="forward"
          scale={1.2}
          opacity={0.96}
          mouseInteractive={true}
        />
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center px-4 gap-8">
        <AnimatedHeading
          text="Bohemka.App"
          className={sora.className}
        />

        {/* Glassy login karta */}
        <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-8 py-9 sm:px-10 sm:py-11 shadow-[0_30px_90px_rgba(0,0,0,0.9)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                E-mail
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80"
                placeholder="Zadej email"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-200">
                Heslo
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80"
                placeholder="••••••••"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  className="text-[11px] text-sky-200 hover:text-sky-100 transition disabled:opacity-60"
                >
                  Zapomenuté heslo?
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            {resetStatus && (
              <p className="text-xs text-sky-200 bg-sky-500/10 border border-sky-400/40 rounded-xl px-3 py-2">
                {resetStatus}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-white text-slate-900 py-2.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Přihlašuji…" : "Přihlásit se"}
            </button>
          </form>
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
      className={`text-6xl sm:text-7xl font-semibold text-white leading-tight flex flex-wrap gap-x-[2px] ${
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
