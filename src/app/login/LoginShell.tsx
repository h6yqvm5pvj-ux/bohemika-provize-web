import type { ReactNode } from "react";

import styles from "./login.module.css";

type LoginShellProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  busy: boolean;
};

export function LoginShell({ title, description, children, busy }: LoginShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <header className={styles.topbar}>
          <p className={styles.brand}>Bohemka<span>.App</span></p>
        </header>

        <section className={styles.shell} aria-labelledby="auth-title" aria-busy={busy}>
          <div className={styles.formContent}>
            <header className={styles.formHeader} aria-live="polite" aria-atomic="true">
              <h1 id="auth-title">{title}</h1>
              {description && <p>{description}</p>}
            </header>
            <div className={styles.formBody}>{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
