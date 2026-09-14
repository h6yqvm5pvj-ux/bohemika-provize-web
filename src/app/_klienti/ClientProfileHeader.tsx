import { Archive, Check, FileText, IdCard, LoaderCircle, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { clientNameWithoutTitles } from "./clientIdentity";
import styles from "./clientCard.module.css";

type Props = {
  name: string;
  phone: string;
  email: string;
  address: string;
  total: number;
  active: number;
  archived: number;
  totalLoading: boolean;
  totalIncomplete: boolean;
  actions: ReactNode;
  status?: ReactNode;
};

function Contact({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: string; href?: string }) {
  const content = <><span className={styles.contactIcon}><Icon size={16} strokeWidth={1.7} aria-hidden="true" /></span>
    <span className={styles.contactText}><small>{label}</small><strong>{value || "Zatím nevyplněno"}</strong></span></>;
  return href && value ? <a href={href} className={styles.contact}>{content}</a>
    : <div className={styles.contact} data-empty={!value}>{content}</div>;
}

export function ClientProfileHeader({ name, phone, email, address, total, active, archived, totalLoading, totalIncomplete, actions, status }: Props) {
  const initials = clientNameWithoutTitles(name).split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase("cs-CZ");
  return <header className={styles.profile}>
    <div className={styles.profileMain}>
      <span className={styles.avatar} aria-hidden="true">{initials || <IdCard size={28} />}</span>
      <div className={styles.identity}>
        <span className={styles.eyebrow}>Karta klienta</span>
        <h1>{name || "Klientský přehled"}</h1>
        <p>Kontakty, smlouvy a všechna jednání na jednom místě.</p>
      </div>
      <div className={styles.profileActions}>{actions}</div>
    </div>
    <div className={styles.contacts}>
      <Contact icon={Phone} label="Telefon" value={phone} href={`tel:${phone.replace(/[^+\d]/g, "")}`} />
      <Contact icon={Mail} label="E-mail" value={email} href={`mailto:${email}`} />
      <Contact icon={MapPin} label="Trvalá adresa" value={address} />
    </div>
    {status}
    <div className={styles.stats}>
      <div className={styles.stat}><span className={styles.statValue}><FileText aria-hidden="true" />{totalLoading ? <LoaderCircle aria-label="Načítání celkového počtu smluv" className="animate-spin motion-reduce:animate-none" /> : `${total}${totalIncomplete ? "+" : ""}`}</span><span className={styles.statLabel}>Smluv celkem</span></div>
      <div className={styles.stat}><span className={styles.statValue} data-tone="green"><Check aria-hidden="true" />{active}</span><span className={styles.statLabel}>Aktivních s přístupem</span></div>
      <div className={styles.stat}><span className={styles.statValue} data-tone="muted"><Archive aria-hidden="true" />{archived}</span><span className={styles.statLabel}>V archivu s přístupem</span></div>
    </div>
  </header>;
}
