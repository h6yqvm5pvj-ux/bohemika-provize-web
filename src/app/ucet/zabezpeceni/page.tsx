"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { AuthPage } from "@/components/account-setup/AuthPage";
import { PasswordField } from "@/components/account-setup/PasswordField";
import styles from "@/components/account-setup/authSurface.module.css";
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);

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
        setError("Nejdřív je potřeba ověřit e-mail. Kontaktuj administrátora."); return;
      }
      const session = await multiFactor(user).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
    } catch (failure) {
      const authCode = (failure as { code?: string }).code;
      setError(isAccountBlockedError(failure) ? ACCOUNT_BLOCKED_MESSAGE : authCode === "auth/multi-factor-auth-required"
        ? "Dvoufázové ověření už je zapnuté. Pro odblokování účtu kontaktuj administrátora a potom se přihlas běžným způsobem."
        : "Nastavení se nepodařilo zahájit. Zkontroluj e-mail a heslo nebo kontaktuj administrátora.");
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
      setError("Kód se nepodařilo ověřit. Zadej aktuální šestimístný kód z ověřovací aplikace. Pokud platnost nastavení vypršela, obnov stránku a začni znovu.");
    } finally { setBusy(false); }
  }

  async function copySecret() {
    if (!secret) return;
    setCopyError(false);
    try { await navigator.clipboard.writeText(secret.secretKey); setCopiedKey(secret.secretKey); }
    catch { setCopyError(true); }
  }

  const title = done ? "Zabezpečení je nastavené" : secret ? "Přidej ověřovací aplikaci" : "Obnov si zabezpečení";
  const description = done
    ? "Požádej administrátora o odblokování účtu. Potom se můžeš znovu přihlásit."
    : secret ? "Propoj svůj účet s Microsoft Authenticatorem nebo jinou aplikací pro jednorázové kódy."
      : "Nové dvoufázové ověření nastav podle pokynů administrátora.";
  return <AuthPage title={title} description={description} busy={busy} tone={done ? "success" : "neutral"}
    icon={done ? <Check size={24} /> : <ShieldCheck size={24} />}>
    {done ? <Link href="/login" className={`${styles.primary} ${styles.fullWidth}`}>Přejít na přihlášení <ArrowRight size={18} aria-hidden="true" /></Link> :
      <form onSubmit={secret ? enroll : start} className={styles.fields}>
        {secret ? <>
          <div className={styles.notice}>
            <p className={styles.label}>1. Přidej účet pomocí klíče</p>
            <p className={styles.hint}>V ověřovací aplikaci zvol ruční zadání a vlož tento klíč. Klíč nikomu neposílej.</p>
            <code className={styles.secretKey}>{secret.secretKey}</code>
            <button type="button" onClick={() => void copySecret()} className={styles.secondary} disabled={busy}>
              <Copy size={16} aria-hidden="true" />{copiedKey === secret.secretKey ? "Klíč zkopírován" : "Kopírovat klíč"}
            </button>
            <p role="status" className={styles.hint}>{copyError ? "Kopírování není dostupné. Označ a zkopíruj klíč ručně." : copiedKey === secret.secretKey ? "Klíč můžeš vložit do ověřovací aplikace." : ""}</p>
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="recovery-code" className={styles.label}>2. Zadej šestimístný kód</label>
            <input id="recovery-code" name="one-time-code" className={`${styles.field} ${styles.codeField}`} value={code}
              onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} disabled={busy} aria-describedby="recovery-code-help recovery-error" />
            <p id="recovery-code-help" className={styles.hint}>Použij aktuální kód z právě přidaného účtu.</p>
          </div>
        </> : <>
          <p className={styles.notice}>Nastavení ověřovací aplikace samo neodblokuje účet. Obnovení přístupu dokončí administrátor.</p>
          <div className={styles.fieldGroup}>
            <label htmlFor="recovery-email" className={styles.label}>E-mail</label>
            <div className="relative">
              <Mail className={styles.passwordIcon} aria-hidden="true" />
              <input id="recovery-email" name="email" className={`${styles.field} ${styles.withIcon}`} type="email" autoComplete="username"
                value={email} onChange={event => { setEmail(event.target.value); setError(""); }} required disabled={busy} aria-describedby="recovery-error" />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="recovery-password" className={styles.label}>Heslo</label>
            <PasswordField id="recovery-password" name="password" autoComplete="current-password" value={password}
              onChange={event => { setPassword(event.target.value); setError(""); }} required disabled={busy} aria-describedby="recovery-error" />
          </div>
        </>}
        <div id="recovery-error" role="alert" hidden={!error}>{error && <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p>}</div>
        <button type="submit" disabled={busy} className={`${styles.primary} ${styles.fullWidth}`}>
          {busy ? <><LoaderCircle size={18} className={styles.spinner} aria-hidden="true" /> Ověřuji…</> : <>{secret ? "Potvrdit kód" : "Pokračovat"}<ArrowRight size={18} aria-hidden="true" /></>}
        </button>
      </form>}
    {!done && <Link href="/login" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" /> Zpět na přihlášení</Link>}
  </AuthPage>;
}
