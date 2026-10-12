import type { ReactNode } from "react";
import { ArrowUpRight, ChartNoAxesCombined, Files, Fingerprint, ShieldCheck, UsersRound } from "lucide-react";

import styles from "./login.module.css";

type LoginShellProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  busy: boolean;
};

export function LoginShell({ title, description, children, busy }: LoginShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <header className={styles.topbar}>
          <p className={styles.brand}>bohemka<span>.app</span></p>
          <span className={styles.topbarNote}>Tvůj prostor pro poradenství</span>
        </header>

        <div className={styles.shell}>
          <section className={styles.intro} aria-labelledby="login-intro-title">
            <div className={styles.introContent}>
              <p className={styles.eyebrow}><span /> VŠECHNO DŮLEŽITÉ. NA JEDNOM MÍSTĚ.</p>
              <h2 id="login-intro-title">Méně administrativy.<br /><span>Více prostoru<br />pro klienty.</span></h2>
              <p className={styles.introDescription}>Smlouvy, provize i každodenní pomůcky.<br />Měj svou práci přehledně pod kontrolou.</p>
            </div>

            <div className={styles.workspace} aria-hidden="true">
              <div className={styles.workspaceGlow} />
              <div className={styles.chartCard}>
                <div className={styles.previewHeading}><span><ChartNoAxesCombined size={17} /> Cashflow</span><ArrowUpRight size={17} /></div>
                <div className={styles.chartBars}>{[28, 45, 36, 64, 54, 82, 72, 100].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
                <div className={styles.chartRule} />
                <p>Tvůj provizní kalendář</p>
              </div>
              <div className={styles.clientCard}><span className={styles.previewIcon}><UsersRound size={19} /></span><div><strong>Klienti & smlouvy</strong><span>Všechno propojené</span></div><span className={styles.previewDot} /></div>
              <div className={styles.toolsCard}><span className={styles.previewIcon}><Files size={18} /></span><div><strong>Pomůcky po ruce</strong><span>Pro každý pracovní den</span></div></div>
            </div>

            <div className={styles.introFooter}><span className={styles.footerLine} /><p>Od první schůzky až po vyplacenou provizi.</p></div>
          </section>

          <section className={styles.signIn} aria-labelledby="auth-title" aria-busy={busy}>
            <div className={styles.formContent}>
              <span className={styles.welcomeIcon} aria-hidden="true"><Fingerprint size={25} strokeWidth={1.5} /></span>
              <header className={styles.formHeader} aria-live="polite" aria-atomic="true">
                <p className={styles.formEyebrow}>TVŮJ PRACOVNÍ PROSTOR</p>
                <h1 id="auth-title">{title}<span aria-hidden="true">.</span></h1>
                <p>{description}</p>
              </header>
              <div className={styles.formBody}>{children}</div>
              <p className={styles.securityNote}><ShieldCheck size={15} aria-hidden="true" /> Přístup chráněný dvoufázovým ověřením</p>
            </div>
          </section>
        </div>

        <footer className={styles.pageFooter}><span>Bohemika SmartApp</span><span>Více přehledu. Každý den.</span></footer>
      </div>
    </main>
  );
}
