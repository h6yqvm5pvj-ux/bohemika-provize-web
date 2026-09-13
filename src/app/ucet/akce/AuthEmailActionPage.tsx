"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ActionCodeOperation, applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { ArrowRight, Check, Eye, EyeOff, KeyRound, LoaderCircle, MailCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import { auth } from "@/app/firebase";
import { AUTH_EMAIL_ACTION_PATH, parseAuthEmailAction, type AuthEmailAction } from "@/lib/authEmailAction";
import styles from "./authEmailAction.module.css";

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
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const action = useRef<AuthEmailAction | null | undefined>(undefined);
  const inspection = useRef<Promise<"reset" | "verify"> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    // Opening another email in the same tab may be a fragment-only navigation.
    // Reload to give the new code its own lifecycle, including any pending writes.
    const openNewLink = () => { if (window.location.hash) window.location.reload(); };
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
        await confirmPasswordReset(auth, action.current.code, password);
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

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.brand}>
          <span className={styles.eyebrow}><ShieldCheck size={15} aria-hidden="true" /> Tvůj účet</span>
          <a href="/login" className={styles.wordmark}>Bohemka.App</a>
        </header>
        <section className={styles.card} aria-labelledby="action-title" aria-busy={screen === "checking" || busy}>
          <div className={`${styles.icon} ${success ? styles.successIcon : ""}`}><Icon size={28} aria-hidden="true" className={screen === "checking" ? styles.spin : undefined} /></div>
          <div aria-live="polite" aria-atomic="true">
            <h1 id="action-title">{title}</h1>
            {screen === "checking" && <p className={styles.description}>Chvilku strpení, ověřujeme platnost odkazu.</p>}
            {screen === "verify" && <p className={styles.description}>Potvrď, že máš přístup k této e-mailové schránce. Pak můžeš pokračovat v nastavení účtu.</p>}
            {screen === "reset" && <p className={styles.description}>Zvol nové heslo pro svůj účet. Pro kontrolu ho zadej ještě jednou.</p>}
            {screen === "verified" && <p className={styles.description}>Děkujeme za potvrzení. Vrať se do původní záložky aplikace a pokračuj v nastavení. Pokud už ji nemáš otevřenou, přihlas se.</p>}
            {screen === "reset-done" && <p className={styles.description}>Heslo jsme úspěšně změnili. Teď se můžeš přihlásit novým heslem.</p>}
            {problem && <p className={styles.description}>{problem.description}</p>}
          </div>
          {(screen === "reset" || screen === "verify") && <form onSubmit={(event) => void submit(event)} className={styles.form}>
            {screen === "reset" && <>
              <div className={styles.field}>
                <label htmlFor="new-password">Nové heslo</label>
                <div className={styles.inputWrap}>
                  <input id="new-password" name="new-password" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={4096} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} aria-describedby="password-help form-error" />
                  <button type="button" className={styles.reveal} aria-label={visible ? "Skrýt hesla" : "Zobrazit hesla"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
                </div>
                <p id="password-help" className={styles.hint}>Alespoň 8 znaků. Doporučujeme delší, jedinečné heslo.</p>
              </div>
              <div className={styles.field}>
                <label htmlFor="confirm-password">Nové heslo znovu</label>
                <input id="confirm-password" name="confirm-password" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={4096} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} aria-describedby="form-error" />
              </div>
            </>}
            <div id="form-error" role="alert">{formError && <p className={styles.error}>{formError}</p>}</div>
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? <><LoaderCircle size={18} className={styles.spin} /> {screen === "reset" ? "Ukládám heslo…" : "Potvrzuji…"}</> : <>{screen === "reset" ? "Uložit nové heslo" : "Potvrdit e-mail"}<ArrowRight size={18} /></>}</button>
          </form>}
          {screen === "unavailable" && <button type="button" className={styles.primary} onClick={() => void retryInspection()}>Zkusit znovu</button>}
          {(screen === "invalid" || screen === "expired") && <p className={styles.help}>Nový odkaz pro obnovu hesla získáš přes „Zapomenuté heslo?“ na přihlašovací stránce. Ověřovací e-mail si můžeš poslat znovu po přihlášení v nastavení účtu.</p>}
          {screen !== "checking" && <a href="/login" className={success ? styles.primary : styles.back}>{success ? "Přejít k přihlášení" : "Zpět na přihlášení"}{success && <ArrowRight size={18} aria-hidden="true" />}</a>}
          <noscript>Pro potvrzení e-mailu nebo nastavení hesla zapni JavaScript v prohlížeči.</noscript>
        </section>
        <p className={styles.footer}><ShieldCheck size={14} aria-hidden="true" /> Bezpečné nastavení účtu Bohemka.App</p>
      </div>
    </main>
  );
}
