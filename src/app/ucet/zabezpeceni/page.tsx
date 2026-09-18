"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, multiFactor, signInWithEmailAndPassword, signOut, TotpMultiFactorGenerator, type Auth, type TotpSecret } from "firebase/auth";
import { firebaseApp } from "@/app/firebase-app";
import { ACCOUNT_BLOCKED_MESSAGE, isAccountBlockedError } from "@/lib/accountSecurity";

// Isolated Auth in memory: this recovery page cannot establish an application
// session and does not access profiles, Firestore, or business APIs.
export default function TotpRecoveryPage() {
  const setupAuth = useRef<Auth | null>(null);
  const setupApp = useRef<FirebaseApp | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => () => {
    const auth = setupAuth.current, app = setupApp.current;
    if (auth && app) void signOut(auth).catch(() => {}).finally(() => deleteApp(app));
  }, []);

  async function start(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      if (!setupAuth.current) {
        setupApp.current = initializeApp(firebaseApp.options, `totp-setup-${crypto.randomUUID()}`);
        setupAuth.current = initializeAuth(setupApp.current, { persistence: inMemoryPersistence });
      }
      const { user } = await signInWithEmailAndPassword(setupAuth.current, email.trim(), password);
      setPassword("");
      if (!user.emailVerified) {
        await signOut(setupAuth.current);
        setError("Nejdříve je nutné ověřit e-mail. Kontaktujte administrátora."); return;
      }
      const session = await multiFactor(user).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
    } catch (failure) {
      const authCode = (failure as { code?: string }).code;
      setError(isAccountBlockedError(failure) ? ACCOUNT_BLOCKED_MESSAGE : authCode === "auth/multi-factor-auth-required"
        ? "TOTP už je aktivní. Pro odblokování účtu kontaktujte administrátora a poté použijte běžné přihlášení."
        : "Nastavení se nepodařilo zahájit. Zkontrolujte přihlašovací údaje nebo kontaktujte administrátora.");
    } finally { setBusy(false); }
  }

  async function enroll(event: FormEvent) {
    event.preventDefault(); if (busy || !secret || !setupAuth.current?.currentUser) return;
    setBusy(true); setError("");
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
      await multiFactor(setupAuth.current.currentUser).enroll(assertion, "Autentizační aplikace");
      setSecret(null); setCode(""); setDone(true);
      await signOut(setupAuth.current);
    } catch {
      setError("Kód se nepodařilo ověřit. Zadejte aktuální šestimístný kód. Pokud relace vypršela, obnovte stránku.");
    } finally { setBusy(false); }
  }

  const inputClass = "w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-white";
  return <main className="min-h-screen bg-slate-950 px-5 py-16 text-slate-100">
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-semibold">Nastavení dvoufázového ověření</h1>
      <p className="text-sm text-slate-300">Tuto stránku použijte podle pokynů administrátora. Nastavení TOTP samo neodblokuje účet, který administrátor zablokoval.</p>
      {error && <p role="alert" className="rounded-xl bg-red-950 p-4">{error}</p>}
      {done ? <p role="status" className="rounded-xl bg-emerald-950 p-4">TOTP je nastavené. Požádejte administrátora o odblokování účtu a poté se znovu přihlaste.</p> : secret ?
        <form onSubmit={enroll} className="space-y-4">
          <p>V autentizační aplikaci přidejte účet pomocí tohoto klíče. Klíč nikomu neposílejte.</p>
          <code className="block break-all rounded-xl bg-slate-800 p-4 select-all">{secret.secretKey}</code>
          <label className="block">Šestimístný kód<input className={inputClass} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" /></label>
          <button disabled={busy} className="rounded-xl bg-blue-600 px-5 py-3 disabled:opacity-50">{busy ? "Ověřuji…" : "Potvrdit TOTP"}</button>
        </form> :
        <form onSubmit={start} className="space-y-4">
          <label className="block">E-mail<input className={inputClass} type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label className="block">Heslo<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          <button disabled={busy} className="rounded-xl bg-blue-600 px-5 py-3 disabled:opacity-50">{busy ? "Ověřuji…" : "Zahájit nastavení"}</button>
        </form>}
      <Link href="/login" className="inline-block text-blue-300 underline">Zpět na přihlášení</Link>
    </div>
  </main>;
}
