import Link from "next/link";
import { AlertCircle, Mail, MapPin, Phone } from "lucide-react";
import { ClientLinkIndicator } from "./ClientLinkIndicator";
import type { ClientDirectoryItem } from "./clientDirectory";

import styles from "./clientDirectory.module.css";

export function ClientRow({ client, query = "" }: { client: ClientDirectoryItem; query?: string }) {
  const color = ["plum", "sage", "blue", "rose"][Array.from(client.slug).reduce((total, char) => total + char.charCodeAt(0), 0) % 4];
  return <Link href={`/klienti/${client.slug}${query ? `?${query}` : ""}`} className={styles.row}>
    <span className={styles.initials} data-color={color}>{client.initials}</span>
    <div className={styles.rowContent}>
      <div className={styles.identity}>
        <h2 className={styles.name}>{client.name}</h2>
        <div className={styles.clientMeta}>{client.address ? <span className={styles.address}><MapPin size={12} aria-hidden="true" /><span>{client.address}</span></span> : <span>{client.products.length} {client.products.length === 1 ? "produkt" : client.products.length < 5 ? "produkty" : "produktů"}</span>}{client.aliases.length > 1 && <span className={styles.aliases}>{client.aliases.length} zápisy jména</span>}</div>
      </div>
      <div className={styles.contacts}>
        {client.phone && <span className={styles.contactItem}><Phone size={13} aria-hidden="true" /><span>{client.phone}</span></span>}
        {client.email && <span className={styles.contactItem}><Mail size={13} aria-hidden="true" /><span>{client.email}</span></span>}
        {client.contactConflicts.length > 0 ? <span className={styles.conflict}><AlertCircle size={12} aria-hidden="true" />Rozdílné kontakty</span> : !client.phone && !client.email ? <span className={styles.missing}>Doplnit kontakt</span> : null}
      </div>
      <div className={styles.contractCount}><strong>{client.contracts.length} {client.contracts.length === 1 ? "smlouva" : client.contracts.length < 5 ? "smlouvy" : "smluv"}</strong><span className={client.activeCount ? styles.activeBadge : styles.archiveBadge}><span className={styles.statusDot} />{client.activeCount ? `${client.activeCount} aktivní` : "Pouze archiv"}</span></div>
    </div>
    <span className={styles.rowArrow}><ClientLinkIndicator /></span>
  </Link>;
}
