// src/app/login/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebase";
import Plasma from "@/components/Plasma";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pokud už je přihlášený, pošli ho rovnou na /
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/");
      }
    });
    return () => unsub();
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/");
    } catch (err: any) {
      console.error(err);
      let msg = "Nepodařilo se přihlásit. Zkontroluj e-mail a heslo.";

      if (err?.code === "auth/user-not-found") {
        msg = "Účet s tímto e-mailem neexistuje.";
      } else if (err?.code === "auth/wrong-password") {
        msg = "Nesprávné heslo.";
      }

      setError(msg);
    } finally {
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