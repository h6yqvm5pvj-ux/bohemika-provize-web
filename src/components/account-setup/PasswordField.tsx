"use client";

import { useState, type InputHTMLAttributes } from "react";
import { LockKeyhole } from "lucide-react";
import styles from "./authSurface.module.css";

export function PasswordField({ id, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  return <>
    <div className={styles.password}>
      <LockKeyhole className={styles.passwordIcon} aria-hidden="true" />
      <input {...props} id={id} type={visible ? "text" : "password"} spellCheck={false} autoCapitalize="none"
        className={`${styles.field} ${className ?? ""}`}
        aria-describedby={[props["aria-describedby"], capsLock ? `${id}-caps` : null].filter(Boolean).join(" ") || undefined}
        onKeyDown={event => { setCapsLock(event.getModifierState("CapsLock")); props.onKeyDown?.(event); }}
        onKeyUp={event => { setCapsLock(event.getModifierState("CapsLock")); props.onKeyUp?.(event); }}
        onBlur={event => { setCapsLock(false); props.onBlur?.(event); }} />
      <button type="button" className={styles.reveal} disabled={props.disabled} aria-controls={id}
        aria-label={visible ? "Skrýt heslo" : "Zobrazit heslo"} onClick={() => setVisible(value => !value)}>
        {visible ? "Skrýt" : "Zobrazit"}
      </button>
    </div>
    {capsLock && <p id={`${id}-caps`} role="status" className={styles.capsLock}>Máš zapnutý Caps Lock.</p>}
  </>;
}
