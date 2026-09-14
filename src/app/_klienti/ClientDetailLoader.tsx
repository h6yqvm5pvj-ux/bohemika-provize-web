import { IdCard, LoaderCircle } from "lucide-react";
import styles from "./clientCard.module.css";

export function ClientDetailLoader({ loadedContracts = 0 }: { loadedContracts?: number }) {
  return <section role="status" aria-live="polite" aria-busy="true" aria-label="Načítání klientské karty" className="space-y-5">
    <div className={styles.profile}>
      <div className={styles.profileMain}>
        <span aria-hidden="true" className={styles.avatar}><IdCard size={28} strokeWidth={1.4} /></span>
        <div className={styles.identity}>
          <span className={styles.eyebrow}>Karta klienta</span>
          <h1>Načítám klienta</h1>
          <p>{loadedContracts ? `Propojuji ${loadedContracts.toLocaleString("cs-CZ")} smluv…` : "Připravuji kontakty a přehled smluv."}</p>
        </div>
        <LoaderCircle size={22} className="animate-spin text-purple-300 motion-reduce:animate-none" aria-hidden="true" />
      </div>
      <div className={styles.contacts} aria-hidden="true">
        {[1, 2, 3].map(item => <div key={item} className={styles.contact}><span className={`${styles.contactIcon} ${styles.skeleton}`} /><div className="flex-1 space-y-2"><div className={styles.skeleton} style={{ width: "36%", height: 7 }} /><div className={styles.skeleton} style={{ width: "78%", height: 11 }} /></div></div>)}
      </div>
      <div className={styles.stats} aria-hidden="true">
        {[1, 2, 3].map(item => <div key={item} className={styles.stat}><span className={styles.skeleton} style={{ width: 27, height: 26 }} /><span className={styles.skeleton} style={{ width: 75, height: 8 }} /></div>)}
      </div>
    </div>
    <div aria-hidden="true" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="h-5 w-40 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
      <div className="grid gap-3 sm:grid-cols-2">{[1, 2].map((item) => <div key={item} className="flex animate-pulse gap-3 rounded-xl border border-slate-100 p-4 motion-reduce:animate-none"><div className="h-12 w-12 shrink-0 rounded-xl bg-slate-100" /><div className="flex-1 space-y-3 py-1"><div className="h-3 w-3/4 rounded bg-slate-100" /><div className="h-2.5 w-full rounded bg-slate-50" /><div className="h-2.5 w-1/2 rounded bg-slate-50" /></div></div>)}</div>
    </div>
  </section>;
}
