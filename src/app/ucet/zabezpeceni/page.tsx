"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Copy, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { AuthPage } from "@/components/account-setup/AuthPage";
import { PasswordField } from "@/components/account-setup/PasswordField";
import { TotpEnrollmentQrCode } from "@/components/account-setup/TotpEnrollmentQrCode";
import { MfaHelpDialog } from "@/components/account-setup/MfaHelpDialog";
import { MfaCodeInput } from "@/components/account-setup/MfaCodeInput";
import styles from "@/components/account-setup/authSurface.module.css";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut, type Auth, type User } from "firebase/auth";
import { completeMfaEnrollment, confirmMfaEmailCode, startMfaEnrollment, MfaEnrollmentRequestError, type MfaEnrollmentSecret } from "@/app/lib/mfaEnrollment";
import { firebaseApp } from "@/app/firebase-app";
import { ACCOUNT_BLOCKED_MESSAGE, isAccountBlockedError } from "@/lib/accountSecurity";
import { resolveAuthEmailErrorMessage } from "@/lib/authEmailMessages";
import { takePendingTotpSetupSession } from "@/app/lib/totpSetupSession";
import { refreshEmailVerificationForMfa } from "@/app/lib/mfaEmailVerification";
import { requestVerificationEmail } from "@/app/lib/authEmailRequest";

// Isolated Auth in memory: this recovery page cannot establish an application
// session and does not access profiles, Firestore, or business APIs.
export default function TotpRecoveryPage() {
  const router = useRouter();
  const setupAuth = useRef<Auth | null>(null);
  const setupApp = useRef<FirebaseApp | null>(null);
  const [entryReady, setEntryReady] = useState(false);
  const [manualRecovery, setManualRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<MfaEnrollmentSecret | null>(null);
  const [emailChallengeId, setEmailChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [emailRequested, setEmailRequested] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [isMfaHelpOpen, setIsMfaHelpOpen] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [canRetrySetup, setCanRetrySetup] = useState(false);
  const [useProductionSetup, setUseProductionSetup] = useState(false);

  const showSetupError = useCallback((failure: unknown) => {
    const requestError = failure instanceof MfaEnrollmentRequestError ? failure : null;
    const localMailMissing = requestError?.code === "auth/configuration-not-found" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    setUseProductionSetup(localMailMissing);
    setError(requestError?.message ?? resolveAuthEmailErrorMessage(failure,
      "Nastavení 2FA se nepodařilo zahájit. Zkus to znovu; pokud přihlášení vypršelo, vrať se na přihlášení."));
    const seconds = requestError?.retryAfterSeconds ?? 0;
    setRetrySeconds(seconds);
    setRetryAt(seconds ? Date.now() + seconds * 1000 : 0);
    setCanRetrySetup(requestError?.status !== 401);
  }, []);

  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (!remaining) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const requestEmail = useCallback(async (user: User) => {
    // The email endpoint accepts only a recent setup session and sends an inbox
    // link. Business APIs stay inaccessible until the administrator activates it.
    try {
      await requestVerificationEmail(user);
      setEmailRequested(true);
    } catch (failure) {
      setError(resolveAuthEmailErrorMessage(failure, "Ověřovací e-mail se nepodařilo odeslat. Zkus ho vyžádat znovu."));
    }
  }, []);

  const beginEnrollment = useCallback(async (user: User) => {
    if (!(await refreshEmailVerificationForMfa(user))) {
      setSecret(null);
      setAwaitingEmail(true);
      return false;
    }
    const enrollment = await startMfaEnrollment(user);
    setEmailChallengeId(enrollment.challengeId);
    setSecret(enrollment.secret ?? null);
    setCode("");
    setAwaitingEmail(false);
    return true;
  }, []);

  const continueSetup = useCallback(async (user: User) => {
    setEmail(user.email ?? "");
    setPassword("");
    if (!(await beginEnrollment(user))) await requestEmail(user);
  }, [beginEnrollment, requestEmail]);

  useEffect(() => {
    let cancelled = false;
    // Defer consumption so React's Strict Mode cleanup cannot discard the
    // one-time handoff before the actual mount takes ownership of it.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const session = takePendingTotpSetupSession();
      if (!session) {
        // A reload loses the memory-only handoff. Only an explicit recovery
        // link may show the administrator-assisted credential form.
        if (new URLSearchParams(window.location.search).get("recovery") === "1") {
          setManualRecovery(true);
          setEntryReady(true);
        } else {
          router.replace("/login");
        }
        return;
      }
      setupAuth.current = session.auth;
      setupApp.current = session.app;
      const user = session.auth.currentUser;
      if (!user) {
        router.replace("/login");
        return;
      }
      setBusy(true);
      try { await continueSetup(user); }
      catch (failure) {
        if (!cancelled) showSetupError(failure);
      } finally {
        if (!cancelled) {
          setBusy(false);
          setEntryReady(true);
        }
      }
    });
    return () => {
      cancelled = true;
      const auth = setupAuth.current, app = setupApp.current;
      setupAuth.current = null; setupApp.current = null;
      if (auth && app) void signOut(auth).catch(() => {}).finally(() => deleteApp(app));
    };
  }, [continueSetup, router, showSetupError]);

  async function retrySetup() {
    const user = setupAuth.current?.currentUser;
    if (busy || retrySeconds > 0 || !user) return;
    setBusy(true); setError("");
    try { await continueSetup(user); }
    catch (failure) { showSetupError(failure); }
    finally { setBusy(false); }
  }

  async function start(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      if (!setupAuth.current) {
        setupApp.current = initializeApp(firebaseApp.options, `totp-setup-${crypto.randomUUID()}`);
        setupAuth.current = initializeAuth(setupApp.current, { persistence: inMemoryPersistence });
      }
      const { user } = await signInWithEmailAndPassword(setupAuth.current, email.trim(), password);
      await continueSetup(user);
    } catch (failure) {
      if (failure instanceof MfaEnrollmentRequestError) {
        showSetupError(failure);
        return;
      }
      const authCode = (failure as { code?: string }).code;
      setError(isAccountBlockedError(failure) ? ACCOUNT_BLOCKED_MESSAGE : authCode === "auth/multi-factor-auth-required"
        ? "Dvoufázové ověření už je zapnuté. Pro odblokování účtu kontaktuj administrátora a potom se přihlas běžným způsobem."
        : "Nastavení se nepodařilo zahájit. Zkontroluj e-mail a heslo nebo kontaktuj administrátora.");
    } finally { setBusy(false); }
  }

  async function continueAfterEmail(event: FormEvent) {
    event.preventDefault();
    const user = setupAuth.current?.currentUser;
    if (busy || !user) return;
    setBusy(true); setError("");
    try {
      if (!(await beginEnrollment(user))) {
        setError("E-mail ještě není ověřený. Otevři odkaz ve své schránce a potom klikni znovu.");
      }
    } catch (failure) {
      showSetupError(failure);
    } finally { setBusy(false); }
  }

  async function resendEmail() {
    const user = setupAuth.current?.currentUser;
    if (busy || !user) return;
    setBusy(true); setError("");
    try { await requestEmail(user); }
    finally { setBusy(false); }
  }

  async function enroll(event: FormEvent) {
    event.preventDefault(); if (busy || !secret || !setupAuth.current?.currentUser) return;
    if (!/^[0-9]{6}$/.test(code)) {
      setError("Zadej všech šest číslic z ověřovací aplikace.");
      return;
    }
    setBusy(true); setError("");
    try {
      const user = setupAuth.current.currentUser;
      if (!(await refreshEmailVerificationForMfa(user))) {
        setSecret(null); setCode(""); setAwaitingEmail(true);
        await requestEmail(user);
        return;
      }
      await completeMfaEnrollment(user, secret, code);
      setSecret(null); setEmailChallengeId(null); setCode(""); setDone(true);
      await signOut(setupAuth.current);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Kód se nepodařilo ověřit. Zadej aktuální kód z ověřovací aplikace.");
    } finally { setBusy(false); }
  }

  async function confirmInbox(event: FormEvent) {
    event.preventDefault();
    const user = setupAuth.current?.currentUser;
    if (busy || !user || !emailChallengeId) return;
    if (!/^\d{6}$/.test(code)) { setError("Zadej všech šest číslic z potvrzovacího e-mailu."); return; }
    setBusy(true); setError("");
    try { setSecret(await confirmMfaEmailCode(user, emailChallengeId, code)); setCode(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Potvrzení se nepodařilo ověřit."); }
    finally { setBusy(false); }
  }

  async function resendInboxCode() {
    const user = setupAuth.current?.currentUser;
    if (busy || retrySeconds > 0 || !user) return;
    setBusy(true); setError("");
    try { await beginEnrollment(user); }
    catch (failure) { showSetupError(failure); }
    finally { setBusy(false); }
  }

  async function copySecret() {
    if (!secret) return;
    setCopyError(false);
    try { await navigator.clipboard.writeText(secret.secretKey); setCopiedKey(secret.secretKey); }
    catch { setCopyError(true); }
  }

  if (useProductionSetup || !entryReady || ((!manualRecovery || canRetrySetup) && !secret && !emailChallengeId && !awaitingEmail && !done)) {
    return <AuthPage title={useProductionSetup ? "Dokonči zabezpečení na Bohemka.App" : error ? "Nastavení se nepodařilo zahájit" : "Připravuji zabezpečení"}
      description={useProductionSetup ? "Tato místní verze nemá nastavené odesílání potvrzovacích e-mailů." : error ? canRetrySetup ? "Přihlášení heslem proběhlo. Nastavení můžeš zkusit znovu tady." : "Pro pokračování se přihlas znovu." : "Ověřuji rozpracované nastavení účtu."}
      busy={!entryReady || busy} icon={<ShieldCheck size={24} />}>
      {useProductionSetup ? <>
        <p className={styles.notice}>Na bohemka.app se přihlas stejným e-mailem a heslem. Potom potvrď kód z e-mailu a nastav novou ověřovací aplikaci.</p>
        <a href="https://bohemka.app/login" className={`${styles.primary} ${styles.fullWidth}`}>Pokračovat na bohemka.app <ArrowRight size={18} aria-hidden="true" /></a>
      </> : error ? <p role="alert" className={`${styles.notice} ${styles.noticeError}`}>{error}</p>
        : <p role="status" className={styles.hint}><LoaderCircle size={18} className={styles.spinner} aria-hidden="true" /> Chvíli strpení…</p>}
      {canRetrySetup && !useProductionSetup && <button type="button" disabled={busy || retrySeconds > 0} onClick={() => void retrySetup()} className={`${styles.primary} ${styles.fullWidth}`}>
        {busy ? "Připravuji…" : retrySeconds > 0 ? `Zkusit znovu za ${retrySeconds} s` : "Zkusit nastavení znovu"}
      </button>}
      <Link href="/login" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" /> Zpět na přihlášení</Link>
    </AuthPage>;
  }

  const title = done ? "Zabezpečení je nastavené" : secret ? "Přidej ověřovací aplikaci" : awaitingEmail ? "Ověř svůj e-mail" : emailChallengeId ? "Potvrď nastavení 2FA" : "Obnov si zabezpečení";
  const description = done
    ? "Požádej administrátora o odblokování účtu. Potom se můžeš znovu přihlásit."
    : secret ? "Propoj svůj účet s Microsoft Authenticatorem nebo jinou aplikací pro jednorázové kódy."
      : awaitingEmail ? "Před nastavením 2FA potvrď, že e-mailová adresa patří tobě."
      : emailChallengeId ? "Než zobrazíme QR kód, potvrď přístup ke své e-mailové schránce."
      : "Nové dvoufázové ověření nastav podle pokynů administrátora.";
  return <AuthPage title={title} description={description} busy={busy} tone={done ? "success" : "neutral"}
    icon={done ? <Check size={24} /> : <ShieldCheck size={24} />}>
    {done ? <Link href="/login" className={`${styles.primary} ${styles.fullWidth}`}>Přejít na přihlášení <ArrowRight size={18} aria-hidden="true" /></Link> :
      <form onSubmit={secret ? enroll : awaitingEmail ? continueAfterEmail : emailChallengeId ? confirmInbox : start} className={styles.fields}>
        {secret ? <>
          <div className={styles.fieldGroup}>
            <p className={styles.label}>1. Přidej Bohemka.App do Authenticatoru</p>
            <p className={styles.hint}>V telefonu otevři Microsoft Authenticator, klepni na ikonu QR kódu a naskenuj kód níže.</p>
            <button type="button" onClick={() => setIsMfaHelpOpen(true)} className={styles.secondary} aria-haspopup="dialog">
              <CircleHelp size={17} aria-hidden="true" /> Návod s obrázkem
            </button>
            <TotpEnrollmentQrCode secret={secret} accountName={email.trim().toLowerCase() || "bohemika-user"} />
            <details className={`${styles.notice} ${styles.manualSetup}`}>
              <summary>Nemůžeš skenovat? Zadej klíč ručně</summary>
              <p className={styles.hint}>V ověřovací aplikaci zvol ruční zadání a vlož tento klíč. Klíč nikomu neposílej.</p>
              <code className={styles.secretKey}>{secret.secretKey}</code>
              <button type="button" onClick={() => void copySecret()} className={styles.secondary} disabled={busy}>
                <Copy size={16} aria-hidden="true" />{copiedKey === secret.secretKey ? "Klíč zkopírován" : "Kopírovat klíč"}
              </button>
              <p role="status" className={styles.hint}>{copyError ? "Kopírování není dostupné. Označ a zkopíruj klíč ručně." : copiedKey === secret.secretKey ? "Klíč můžeš vložit do ověřovací aplikace." : ""}</p>
            </details>
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="recovery-code" className={styles.label}>2. Zadej šestimístný kód</label>
            <MfaCodeInput id="recovery-code" value={code} required disabled={busy}
              onChange={value => { setCode(value); setError(""); }}
              describedBy="recovery-code-help recovery-error" />
            <p id="recovery-code-help" className={styles.hint}>V Authenticatoru otevři přidaný účet Bohemka.App. Jeho aktuální šestimístný kód opiš sem a klikni na „Potvrdit kód“.</p>
            <button type="button" disabled={busy || retrySeconds > 0} className={styles.secondary} onClick={() => void resendInboxCode()}>{retrySeconds > 0 ? `Zkusit znovu za ${retrySeconds} s` : "Začít nastavení znovu"}</button>
          </div>
        </> : awaitingEmail ? <>
          <p role="status" className={styles.notice}>{emailRequested
            ? "Ověřovací e-mail byl vyžádán. Otevři odkaz ve své schránce (zkontroluj i spam) a vrať se na tuto stránku. Doručení může trvat několik minut."
            : "Vyžádej si ověřovací e-mail, otevři odkaz ve schránce a potom se vrať na tuto stránku."}</p>
          <button type="button" onClick={() => void resendEmail()} disabled={busy} className={styles.secondary}>
            {emailRequested ? "Poslat ověřovací e-mail znovu" : "Poslat ověřovací e-mail"}
          </button>
        </> : emailChallengeId ? <>
          <p role="status" className={styles.notice}>Na {email} jsme odeslali jednorázový kód pro toto nastavení 2FA. Potvrzení potřebujeme i u dříve ověřené adresy.</p>
          <div className={styles.fieldGroup}>
            <label htmlFor="mfa-email-code" className={styles.label}>Kód z e-mailu</label>
            <MfaCodeInput id="mfa-email-code" value={code} required disabled={busy} label="kódu z e-mailu"
              onChange={value => { setCode(value); setError(""); }} describedBy="mfa-email-help recovery-error" />
            <p id="mfa-email-help" className={styles.hint}>Kód platí 10 minut. Použij poslední doručený e-mail a zkontroluj i spam.</p>
          </div>
          <button type="button" disabled={busy || retrySeconds > 0} className={styles.secondary} onClick={() => void resendInboxCode()}>{retrySeconds > 0 ? `Nový kód za ${retrySeconds} s` : "Poslat nový kód"}</button>
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
          {busy ? <><LoaderCircle size={18} className={styles.spinner} aria-hidden="true" /> Ověřuji…</> : <>{secret ? "Potvrdit kód" : awaitingEmail ? "E-mail je ověřený, pokračovat" : emailChallengeId ? "Potvrdit e-mail a zobrazit QR" : "Pokračovat"}<ArrowRight size={18} aria-hidden="true" /></>}
        </button>
      </form>}
    {!done && <Link href="/login" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" /> Zpět na přihlášení</Link>}
    {secret && isMfaHelpOpen && <MfaHelpDialog onClose={() => setIsMfaHelpOpen(false)} />}
  </AuthPage>;
}
