import type { ReactNode } from "react";
import styles from "./authSurface.module.css";

type AuthPageProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  titleId?: string;
  busy?: boolean;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "error";
};

/** Shared frame for sign-in, email actions and administrator-assisted recovery. */
export function AuthPage({ title, description, children, titleId = "auth-title", busy = false, icon, tone = "neutral" }: AuthPageProps) {
  return <main className={`${styles.page} ${styles.login}`}>
    <div className={styles.loginInner}>
      <header className={styles.loginHeader}>
        <p className={styles.brand}>Bohemka.App</p>
        {icon && <div className={styles.stateIcon} data-tone={tone} aria-hidden="true">{icon}</div>}
        <div aria-live="polite" aria-atomic="true">
          <h1 id={titleId}>{title}</h1>
          <div className={styles.muted}>{description}</div>
        </div>
      </header>
      <section className={`${styles.card} ${styles.loginCard}`} aria-labelledby={titleId} aria-busy={busy}>
        {children}
      </section>
    </div>
  </main>;
}
