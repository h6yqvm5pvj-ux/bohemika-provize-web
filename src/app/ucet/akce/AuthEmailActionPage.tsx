"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ActionCodeOperation, applyActionCode, checkActionCode, verifyPasswordResetCode } from "firebase/auth";
import { confirmPasswordReset } from "@/app/lib/passwordReset";
import Link from "next/link";
import { AuthPage } from "@/components/account-setup/AuthPage";
import { PasswordField } from "@/components/account-setup/PasswordField";
import { ArrowLeft, ArrowRight, Check, KeyRound, LoaderCircle, MailCheck, TriangleAlert } from "lucide-react";
import { auth } from "@/app/firebase";
import { AUTH_EMAIL_ACTION_PATH, parseAuthEmailAction, type AuthEmailAction } from "@/lib/authEmailAction";
import styles from "@/components/account-setup/authSurface.module.css";

type Problem = "invalid" | "expired" | "unavailable";
type Screen = "checking" | "verify" | "reset" | "verified" | "reset-done" | Problem;
const problems: Record<Problem, { title: string; description: string }> = {
  invalid: { title: "Odkaz už není platný", description: "Odkaz je neúplný, už byl použitý nebo jeho platnost vypršela." },
  expired: { title: "Platnost odkazu vypršela", description: "Pro ochranu účtu mají tyto odkazy omezenou platnost. Vyžádej si nový e-mail a použij nejnovější odkaz." },
  unavailable: { title: "Odkaz se nepodařilo ověřit", description: "Spojení se službou je momentálně nedostupné. Zkus ověření znovu za chvíli." },
};
function problemFrom(error: unknown): Problem {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "auth/expired-action-code") return "expired";
  if (["auth/invalid-action-code", "auth/user-disabled", "auth/user-not-found"].includes(String(code))) return "invalid";
  return "unavailable";
}

async function inspectAction(action: AuthEmailAction): Promise<"reset" | "verify"> {
  if (action.mode === "resetPassword") {
    await verifyPasswordResetCode(auth, action.code);
    return "reset";
  }
  const info = await checkActionCode(auth, action.code);
  if (info.operation !== ActionCodeOperation.VERIFY_EMAIL) throw { code: "auth/invalid-action-code" };
  return "verify";
}

export function AuthEmailActionPage() {
  const [screen, setScreen] = useState<Screen>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const action = useRef<AuthEmailAction | null | undefined>(undefined);
  const inspection = useRef<Promise<"reset" | "verify"> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    // Opening another email in the same tab may be a fragment-only navigation.
    // Reload to give the new code its own lifecycle, including any pending writes.
    let reloadScheduled = false;
    const openNewLink = () => {
      if (window.location.hash && !reloadScheduled) {
        reloadScheduled = true;
        window.location.reload();
      }
    };
    window.addEventListener("hashchange", openNewLink);
    return () => window.removeEventListener("hashchange", openNewLink);
  }, []);

  useEffect(() => {
    let active = true;
    if (action.current === undefined) {
      action.current = parseAuthEmailAction(window.location.search, window.location.hash);
      // Remove codes, foreign redirects and other supplied parameters from this history entry.
      window.history.replaceState(window.history.state, "", AUTH_EMAIL_ACTION_PATH);
    }
    if (!action.current) { setScreen("invalid"); return; }
    inspection.current ??= inspectAction(action.current);
    void inspection.current.then(
      (next) => { if (active) setScreen(next); },
      (error: unknown) => { if (active) setScreen(problemFrom(error)); },
    );
    return () => { active = false; };
  }, []);

  async function retryInspection() {
    if (!action.current || inFlight.current) return;
    inFlight.current = true;
    setScreen("checking");
    try { setScreen(await inspectAction(action.current)); }
    catch (error) { setScreen(problemFrom(error)); }
    finally { inFlight.current = false; }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !action.current || (screen !== "reset" && screen !== "verify")) return;
    setFormError("");
    if (screen === "reset") {
      if (password.length < 8) { setFormError("Nové heslo musí mít alespoň 8 znaků."); return; }
      if (password !== confirmation) { setFormError("Hesla se neshodují. Zkontroluj obě pole."); return; }
    }
    inFlight.current = true;
    setBusy(true);
    try {
      if (screen === "reset") {
        await confirmPasswordReset(action.current.code, password);
        setScreen("reset-done");
      } else {
        await applyActionCode(auth, action.current.code);
        setScreen("verified");
      }
      action.current = null;
      setPassword(""); setConfirmation("");
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") {
        setFormError("Heslo nesplňuje požadavky účtu. Použij delší heslo s velkými i malými písmeny, číslem a symbolem.");
      } else if (problemFrom(error) === "unavailable") {
        setFormError("Změnu se nepodařilo potvrdit. Zkontroluj připojení a zkus to za chvíli znovu.");
      } else {
        setScreen(problemFrom(error));
        action.current = null;
        setPassword(""); setConfirmation("");
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  const success = screen === "verified" || screen === "reset-done";
  const problem = screen === "invalid" || screen === "expired" || screen === "unavailable" ? problems[screen] : null;
  const title = problem?.title ?? ({ checking: "Kontroluji odkaz…", verify: "Potvrď svůj e-mail", reset: "Nastav si nové heslo", verified: "E-mail je ověřený", "reset-done": "Nové heslo je nastavené" } as const)[screen as "checking" | "verify" | "reset" | "verified" | "reset-done"];
  const Icon = screen === "checking" ? LoaderCircle : success ? Check : problem ? TriangleAlert : screen === "verify" ? MailCheck : KeyRound;

  const description = problem?.description ?? {
    checking: "Chvilku strpení, ověřujeme platnost odkazu.",
    verify: "Potvrď přístup ke své e-mailové schránce a pokračuj v nastavení účtu.",
    reset: "Zvol nové heslo pro svůj účet. Pro kontrolu ho zadej ještě jednou.",
    verified: "Vrať se do původní karty aplikace a pokračuj v nastavení účtu. Pokud už ji nemáš otevřenou, přihlas se.",
    "reset-done": "Teď se můžeš přihlásit novým heslem.",
  }[screen as Exclude<Screen, Problem>];

  return (
    <AuthPage title={title} titleId="action-title" description={description}
      busy={screen === "checking" || busy} tone={success ? "success" : problem ? "error" : "neutral"}
      icon={<Icon size={24} className={screen === "checking" ? styles.spinner : undefined} />}>
      {screen === "checking" && <p className={styles.hint}>Stránka bude za chvíli připravená. Můžeš ji nechat otevřenou.</p>}
      {(screen === "reset" || screen === "verify") && <form onSubmit={(event) => void submit(event)} className={styles.fields}>
        {screen === "reset" && <>
          <div className={styles.fieldGroup}>
            <label htmlFor="new-password" className={styles.label}>Nové heslo</label>
            <PasswordField id="new-password" name="new-password" autoComplete="new-password" required minLength={8} maxLength={4096}
              value={password} onChange={(event) => { setPassword(event.target.value); setFormError(""); }} disabled={busy}
              aria-describedby="password-help form-error" />
            <p id="password-help" className={styles.hint}>Alespoň 8 znaků. Použij delší heslo, které nemáš v jiné službě.</p>
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="confirm-password" className={styles.label}>Nové heslo znovu</label>
            <PasswordField id="confirm-password" name="confirm-password" autoComplete="new-password" required minLength={8} maxLength={4096}
              value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setFormError(""); }} disabled={busy} aria-describedby="form-error" />
          </div>
        </>}
        {screen === "verify" && <p className={styles.hint}>Ověření dokončíš tlačítkem níže.</p>}
        <div id="form-error" role="alert" hidden={!formError}>{formError && <p className={`${styles.notice} ${styles.noticeError}`}>{formError}</p>}</div>
        <button className={`${styles.primary} ${styles.fullWidth}`} type="submit" disabled={busy}>
          {busy ? <><LoaderCircle size={18} className={styles.spinner} aria-hidden="true" /> {screen === "reset" ? "Ukládám heslo…" : "Potvrzuji…"}</> :
            <>{screen === "reset" ? "Uložit nové heslo" : "Potvrdit e-mail"}<ArrowRight size={18} aria-hidden="true" /></>}
        </button>
      </form>}
      {screen === "unavailable" && <button type="button" className={`${styles.primary} ${styles.fullWidth}`} onClick={() => void retryInspection()}>Zkusit znovu</button>}
      {(screen === "invalid" || screen === "expired") && <div className={styles.fields}>
        <p className={styles.muted}>Pro nové heslo přejdi na přihlášení a zvol „Zapomenuté heslo?“.</p>
        <p className={styles.hint}>Pokud ověřuješ e-mail, nový odkaz si vyžádej v aplikaci při dokončování účtu nebo v jeho nastavení.</p>
      </div>}
      {screen !== "checking" && <Link href="/login" className={success ? `${styles.primary} ${styles.fullWidth}` : styles.backLink}>
        {!success && <ArrowLeft size={16} aria-hidden="true" />}{success ? "Přejít na přihlášení" : "Zpět na přihlášení"}
        {success && <ArrowRight size={18} aria-hidden="true" />}
      </Link>}
      <noscript>Pro potvrzení e-mailu nebo nastavení hesla zapni JavaScript v prohlížeči.</noscript>
    </AuthPage>
  );
}
