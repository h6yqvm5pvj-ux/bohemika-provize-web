// src/app/login/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, db } from "../firebase";
import Plasma from "@/components/Plasma";
import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <div className="flex min-h-screen items-center justify-center px-4">
        {/* Glassy login karta */}
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-7 sm:px-7 sm:py-8 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
          <header className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Image
                src="/icons/bohemika_logo.png"
                alt="Bohemika logo"
                width={280}
                height={80}
                className="h-16 w-auto"
                priority
              />
              <div>
                <h1 className="text-lg sm:text-xl font-semibold">
                  Bohemika Provize
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  Webová verze výpočtu provizí
                </p>
              </div>
            </div>
          </header>

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
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2">
                {error}
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