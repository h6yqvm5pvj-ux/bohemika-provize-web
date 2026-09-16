import type { ReactNode } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { ADMIN_SECTIONS, type AdminPage } from "./adminSections";
import styles from "../zadosti/adminConsole.module.css";

export function AdminPageHeader({ page, actions, meta }: { page: AdminPage; actions?: ReactNode; meta?: ReactNode }) {
  const section = ADMIN_SECTIONS.find(section => section.id === page)!;
  const Icon = section.icon;
  return (
    <header className={styles.hero}>
      <div className={styles.heroMain}>
        <div className={styles.eyebrow}><ShieldCheck size={14} aria-hidden="true" /> Bohemka · Administrace</div>
        <h1>{section.title}</h1>
        <p className={styles.heroDescription}>{section.description}</p>
        {meta ? <div className={styles.heroMeta}>{meta}</div> : null}
        {actions ? <div className={styles.heroActions}>{actions}</div> : null}
      </div>
      <div className={styles.heroArt} aria-hidden="true">
        <span className={styles.heroOrbit} />
        <span className={styles.heroIcon}><Icon /></span>
        <Sparkles className={styles.heroSpark} />
        <span className={styles.heroDot} />
      </div>
    </header>
  );
}
