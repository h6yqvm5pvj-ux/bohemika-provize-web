"use client";
import { useEffect, useRef, useState } from "react";
import { Check, KeyRound, Mail, ShieldCheck, X } from "lucide-react";
import { signOut, type User } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import { clearServerSession } from "@/app/lib/authSession";
import { getPasswordPolicyChecks } from "../passwordPolicy";
import { usePasswordChange } from "../usePasswordChange";
import styles from "./passwordChange.module.css";

export function PasswordChangeDialog({ user, userFullName, onClose }: { user: User; userFullName: string; onClose: () => void }) {
  const flow = usePasswordChange(user, userFullName);
  const dialog = useRef<HTMLFormElement>(null);
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef(onClose);
  const terminal = flow.step === "done" || flow.step === "unknown";
  const busyRef = useRef(false);
  useEffect(() => { closeRef.current = onClose; busyRef.current = flow.busy || terminal || leaving; }, [onClose, flow.busy, terminal, leaving]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? [])];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  useEffect(() => { dialog.current?.querySelector<HTMLElement>('input, [data-step-focus]')?.focus(); }, [flow.step]);
  const goToLogin = async () => {
    if (leaving) return; setLeaving(true);
    try { await clearServerSession(); } catch { /* Firebase revokes previous tokens on password change. */ }
    try { await signOut(auth); } catch { /* The login page can recover an expired local session. */ }
    // A full navigation drops all private in-memory UI after a security change.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Security logout must discard the current JS context.
    window.location.href = "/login";
  };
  const checks = getPasswordPolicyChecks({ password: flow.password, confirmPassword: flow.confirmPassword, userEmail: user.email ?? "", userFullName });
  const title = flow.step === "password" ? "Nastavit nové heslo" : flow.step === "totp" ? "Potvrď změnu přes 2FA" : flow.step === "email" ? "Zkontroluj svůj e-mail" : flow.step === "done" ? "Heslo je změněné" : flow.step === "unknown" ? "Ověř přihlášení" : "Potvrzení je potřeba zopakovat";
  const Icon = flow.step === "email" ? Mail : flow.step === "totp" ? ShieldCheck : flow.step === "done" ? Check : KeyRound;
  const disabled = flow.busy || (flow.step === "password" ? !flow.currentPassword || !checks.every(c => c.passed) : flow.code.length !== 6);
  return <div className={styles.overlay}>
    <div className={styles.backdrop} onClick={() => { if (!busyRef.current) onClose(); }} aria-hidden="true" />
    <form ref={dialog} role="dialog" aria-modal="true" aria-labelledby="password-change-title" aria-describedby="password-change-description" className={styles.dialog}
      onSubmit={event => { event.preventDefault(); if (!disabled) void flow.submit(); }}>
      <div className={styles.hero}>
        <div className={styles.icon}><Icon size={22} aria-hidden="true" /></div>
        <div><p className={styles.eyebrow}>Zabezpečení účtu</p><h2 id="password-change-title">{title}</h2></div>
        {!terminal ? <button type="button" className={styles.close} aria-label="Zavřít změnu hesla" onClick={onClose} disabled={flow.busy}><X size={20} /></button> : null}
      </div>
      <div className={styles.body}>
        <p id="password-change-description" className={styles.description}>
          {flow.step === "password" ? "Nejdřív ověříme původní heslo. Změnu pak potvrdíš kódem z Authenticatoru, nebo e-mailem, pokud 2FA nepoužíváš." :
            flow.step === "totp" ? "Zadej aktuální šestimístný kód z Authenticatoru. Heslo změníme až po úspěšném ověření." :
            flow.step === "email" ? "Na e-mail tvého účtu jsme odeslali šestimístný potvrzovací kód. Platí nejvýše 10 minut a lze ho použít pouze jednou." :
            flow.step === "done" ? "Z bezpečnostních důvodů se přihlas znovu a použij nové heslo." :
            flow.step === "unknown" ? "Spojení se přerušilo a změna už mohla proběhnout. Zkus se přihlásit novým heslem. Pokud nefunguje, použij Zapomenuté heslo." : "Z bezpečnostních důvodů začni změnu znovu. Znovu zadáš hesla a dostaneš nové potvrzení."}
        </p>
        {flow.step === "password" ? <>
          <label className={styles.label}>Původní heslo<input type="password" autoComplete="current-password" value={flow.currentPassword} onChange={e => flow.setCurrentPassword(e.target.value)} disabled={flow.busy} required /></label>
          <label className={styles.label}>Nové heslo<input type="password" autoComplete="new-password" maxLength={128} value={flow.password} onChange={e => flow.setPassword(e.target.value)} disabled={flow.busy} required /></label>
          <label className={styles.label}>Potvrď nové heslo<input type="password" autoComplete="new-password" maxLength={128} value={flow.confirmPassword} onChange={e => flow.setConfirmPassword(e.target.value)} disabled={flow.busy} required /></label>
          <ul className={styles.checks}>{checks.map(check => <li key={check.id} data-passed={check.passed}><span aria-hidden="true">{check.passed ? "✓" : "•"}</span>{check.label}</li>)}</ul>
        </> : flow.step === "totp" || flow.step === "email" ? <>
          <label className={styles.label}>{flow.step === "email" ? "Kód z e-mailu" : "Kód z Authenticatoru"}<input className={styles.code} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={12} pattern="[0-9]{6}" value={flow.code} onChange={e => flow.setCode(e.target.value)} disabled={flow.busy} required /></label>
          {flow.step === "email" ? <p className={styles.note}>Pokud e-mail nedorazil, zkontroluj Spam. Nový kód získáš tlačítkem Začít znovu.</p> : null}
        </> : null}
        {flow.step === "done" ? <p className={styles.notice} role="status">{flow.notificationSent ? "Upozornění na změnu jsme odeslali na e-mail účtu." : "Heslo je změněné. Odeslání upozornění se zatím nepodařilo potvrdit; může dorazit později."}</p> : null}
        {flow.error && !terminal ? <p className={styles.error} role="alert">{flow.error}</p> : null}
      </div>
      <div className={styles.footer}>
        {terminal ? <button type="button" data-step-focus className={styles.primary} onClick={() => void goToLogin()} disabled={leaving}>{leaving ? "Odhlašuji…" : "Přejít na přihlášení"}</button> : <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={flow.busy}>Zrušit</button>
          {flow.step !== "password" ? <button type="button" data-step-focus className={styles.secondary} onClick={flow.reset} disabled={flow.busy}>Začít znovu</button> : null}
          {flow.step !== "expired" ? <button type="submit" className={styles.primary} disabled={disabled}>{flow.busy ? "Ověřuji…" : flow.step === "password" ? "Pokračovat k ověření" : "Potvrdit změnu hesla"}</button> : null}
        </>}
      </div>
    </form>
  </div>;
}
