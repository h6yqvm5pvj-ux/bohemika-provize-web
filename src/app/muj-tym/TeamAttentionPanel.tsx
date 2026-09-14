import { ArrowUpRight, Bell, Mail, PhoneCall, ShieldCheck } from "lucide-react";

import type { TeamAttentionItem } from "./teamDashboard";
import styles from "./team.module.css";

type TeamAttentionPanelProps = {
  items: TeamAttentionItem[];
  onOpenDetail: (email: string) => void;
  statsUnavailable?: boolean;
};

const phoneHref = (phoneNumber: string | null): string | null => {
  const raw = String(phoneNumber ?? "").trim();
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  return `tel:${raw.startsWith("+") ? "+" : ""}${digits}`;
};

export function TeamAttentionPanel({
  items,
  onOpenDetail,
  statsUnavailable = false,
}: TeamAttentionPanelProps) {
  const visibleItems = items.slice(0, 8);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <section className={styles.panel} aria-label="Doporučené kontakty">
      <div className={styles.panelHeading}>
        <div className={styles.panelTitleGroup}>
          <span className={styles.panelIcon} data-tone="amber"><Bell size={17} aria-hidden="true" /></span>
          <div>
            <h3 className={styles.panelTitle}>Komu se teď ozvat</h3>
            <p className={styles.panelDescription}>Malá podpora může přinést velký posun.</p>
          </div>
        </div>
        <span className={styles.attentionCount} aria-label="Počet členů vyžadujících pozornost">{statsUnavailable ? "—" : items.length}</span>
      </div>

      {statsUnavailable ? (
        <div className={`${styles.empty} mt-4`}>Doporučení se zobrazí po načtení týmových dat.</div>
      ) : visibleItems.length === 0 ? (
        <div className={styles.attentionEmpty}>
          <ShieldCheck size={24} className="shrink-0" aria-hidden="true" />
          <div>
            <strong>Nikdo teď nevyžaduje pozornost.</strong>
            <p>Tým je aktivní a drží tempo proti minulému měsíci.</p>
          </div>
        </div>
      ) : (
        <div className={styles.attentionList}>
          {visibleItems.map((item) => {
            const tel = phoneHref(item.phoneNumber);
            const initials = item.name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).filter((_, index, parts) => index === 0 || index === parts.length - 1).join("").toUpperCase();
            return (
              <article key={item.email} className={styles.attentionRow}>
                <div className={styles.attentionMember}>
                  <span className={styles.attentionAvatar} aria-hidden="true">{initials}</span>
                  <div className="min-w-0">
                    <div className={styles.attentionName}>{item.name}</div>
                    <div className={styles.reasons}>{item.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
                  </div>
                </div>
                <div className={styles.contactActions}>
                  {tel ? (
                    <a href={tel} className={styles.contactAction} aria-label={`Zavolat: ${item.name}`}>
                      <PhoneCall size={12} aria-hidden="true" /> Zavolat
                    </a>
                  ) : (
                    <span title="Telefon není vyplněný" aria-disabled="true" className={styles.contactAction}>
                      <PhoneCall size={12} aria-hidden="true" /> Zavolat
                    </span>
                  )}
                  <a href={`mailto:${item.email}`} className={styles.contactAction} aria-label={`Napsat: ${item.name}`}>
                    <Mail size={12} aria-hidden="true" /> Napsat
                  </a>
                  <button type="button" onClick={() => onOpenDetail(item.email)} className={styles.detailAction} aria-label={`Otevřít detail: ${item.name}`}>
                    Detail <ArrowUpRight size={13} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
          {hiddenCount > 0 ? <div className="pt-2 text-center text-xs text-slate-500">A dalších {hiddenCount} členů týmu.</div> : null}
        </div>
      )}
    </section>
  );
}
