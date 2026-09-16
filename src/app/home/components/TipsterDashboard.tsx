"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { User } from "firebase/auth";
import { ArrowRight, Building2, Car, Check, CheckCheck, CircleCheck, Clock3, Home, Inbox, Lightbulb, Mail, Package, Plus, RefreshCw, UserRound, Wallet } from "lucide-react";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { TipDetailModal } from "@/app/tipy/TipDetailModal";
import styles from "./tipsterHome.module.css";

type TipProduct = "property" | "vehicle" | "business" | "other";
type RecentTip = {
  id: string;
  productLabel: string;
  status: string;
  fields: Array<{ label: string; value: string }>;
  createdAtMs: number | null;
};
const PRODUCTS = [
  { id: "property", title: "Domov a majetek", description: "Bydlení, domácnost i odpovědnost.", icon: Home },
  { id: "vehicle", title: "Auto a vozidla", description: "Pojištění vozidla a vše kolem něj.", icon: Car },
  { id: "business", title: "Firma a podnikání", description: "Ochrana firmy i samostatného podnikání.", icon: Building2 },
  { id: "other", title: "Něco dalšího", description: "Další potřeby a individuální přání.", icon: Package },
] as const;
const statusLabel = (status: string) => status === "contracted" || status === "paid" ? "Sjednáno" : status === "failed" ? "Neuskutečněno" : "Čeká na zpracování";
const clientName = (tip: RecentTip) => tip.fields.find((field) => /jmeno|klient|nazev|ares/.test(field.label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()))?.value || "Neuvedený klient";

export function TipsterDashboard({ user, effectiveEmail, displayName, recipientName, recipientEmail, refreshKey, hasDraft, status, onStart }: {
  user: User;
  effectiveEmail: string | null | undefined;
  displayName: string;
  recipientName: string;
  recipientEmail: string;
  refreshKey: number;
  hasDraft: boolean;
  status: string | null;
  onStart: (product?: TipProduct) => void;
}) {
  const [snapshot, setSnapshot] = useState<{ key: string; tips: RecentTip[]; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<{ id: string; client: string } | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  const refresh = useCallback(() => setRetry((value) => value + 1), []);

  const requestKey = `${user.uid}:${effectiveEmail}:${refreshKey}:${retry}`;
  const loading = snapshot?.key !== requestKey;
  const tips = loading ? [] : snapshot.tips;
  const error = loading ? null : snapshot.error;

  useEffect(() => {
    let cancelled = false;
    void fetchAuthedJsonOrThrow<{ items?: RecentTip[] }>(user, "/api/tipster-tips?limit=200")
      .then((payload) => { if (!cancelled) setSnapshot({ key: requestKey, tips: Array.isArray(payload.items) ? payload.items : [], error: null }); })
      .catch(() => { if (!cancelled) setSnapshot({ key: requestKey, tips: [], error: "Přehled tipů se nepodařilo načíst." }); });
    return () => { cancelled = true; };
  }, [user, requestKey]);

  const pending = tips.filter((tip) => !["contracted", "paid", "failed"].includes(tip.status)).length;
  const contracted = tips.filter((tip) => ["contracted", "paid"].includes(tip.status)).length;
  const latest = [...tips].sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)).slice(0, 3);

  return (
    <div className={styles.dashboard}>
      <header className={styles.topline}><div><Lightbulb size={21} /><h1>Můj tipařský prostor</h1></div><span><UserRound size={14} />{displayName}</span></header>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>DOBRÉ KONTAKTY MAJÍ HODNOTU</span>
          <h2>Dobrý tip<br />začíná <span>u tebe.</span></h2>
          <p>Znáš někoho, kdo potřebuje poradit s pojištěním? Propoj ho s námi. O další kroky se postará tvůj poradce.</p>
          <div className={styles.heroActions}><button type="button" onClick={() => onStart()} className={styles.primary}><Plus size={17} />{hasDraft ? "Pokračovat v rozepsaném tipu" : "Poslat nový tip"}<ArrowRight size={16} /></button><Link href="/tipy">Moje tipy<ArrowRight size={15} /></Link></div>
        </div>
        <div className={styles.heroArt} aria-hidden="true"><div /><Image src="/illustrations/tips/referral-lightbulb.webp" alt="" width={800} height={800} sizes="(max-width: 600px) 145px, 340px" priority /><span><CheckCheck size={15} />Ty doporučíš. My se postaráme.</span></div>
      </section>
      {status ? <div className={styles.success} role="status"><CircleCheck size={21} /><div><strong>Tip je na cestě!</strong><p>{status}</p></div><Link href="/tipy">Zobrazit tipy<ArrowRight size={15} /></Link></div> : null}
      <div className={styles.stats} aria-label="Výsledky tvých doporučení">
        {[
          { label: "Odeslané tipy", value: tips.length, note: "Každý kontakt je příležitost", icon: Inbox, tone: "all" },
          { label: "Čeká na zpracování", value: pending, note: "Další krok je na poradci", icon: Clock3, tone: "pending" },
          { label: "Úspěšně sjednáno", value: contracted, note: "Doporučení, která pomohla", icon: CircleCheck, tone: "contracted" },
        ].map(({ label, value, note, icon: Icon, tone }) => <div key={tone} className={styles.stat} data-tone={tone}><span className={styles.statIcon}><Icon size={19} /></span><div><span>{label}</span><strong>{loading ? "…" : error ? "—" : value}</strong><p>{note}</p></div></div>)}
      </div>
      {tips.length === 200 ? <p className={styles.limitNote}>Přehled vychází z posledních 200 odeslaných tipů.</p> : null}
      <div className={styles.workspace}>
        <div className={styles.main}>
          <section aria-labelledby="tip-products-title"><div className={styles.sectionHeading}><div><h2 id="tip-products-title">S čím můžeme pomoct?</h2><p>Vyber oblast a rovnou vyplň kontakt.</p></div><span>RYCHLÝ START</span></div><div className={styles.products}>
            {PRODUCTS.map(({ id, title, description, icon: Icon }) => <button type="button" key={id} onClick={() => onStart(id)} data-product={id}><span className={styles.productIcon}><Icon size={24} /></span><h3>{title}</h3><p>{description}</p><span className={styles.productCta}>Doporučit kontakt<ArrowRight size={14} /></span></button>)}
          </div></section>
          <section className={styles.recent} aria-labelledby="recent-tips-title"><div className={styles.sectionHeading}><h2 id="recent-tips-title">Tvoje poslední tipy</h2><Link href="/tipy">Všechny tipy<ArrowRight size={14} /></Link></div>
            {loading ? <div className={styles.recentState} role="status"><RefreshCw size={20} className={styles.spinning} /><p>Načítám tvoje doporučení…</p></div> : error ? <div className={styles.recentState} role="alert"><p>{error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></div> : !latest.length ? <div className={styles.recentState}><Lightbulb size={31} /><h3>První dobrý kontakt čeká na tebe</h3><p>Odešli svůj první tip. Tady pak uvidíš, jak se mu daří.</p><button type="button" onClick={() => onStart()}>Poslat první tip<ArrowRight size={15} /></button></div> : <div className={styles.recentList}>{latest.map((tip) => {
              const client = clientName(tip);
              return <Link key={tip.id} href={`/tipy/${encodeURIComponent(tip.id)}`} aria-haspopup="dialog" onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); setDetail({ id: tip.id, client }); }}><span className={styles.recentAvatar}><UserRound size={18} /></span><div><strong>{client}</strong><span>{tip.productLabel}</span></div><span className={styles.recentBadge} data-status={tip.status}>{statusLabel(tip.status)}</span><ArrowRight size={16} /></Link>;
            })}</div>}
          </section>
          <section className={styles.howItWorks} aria-label="Jak fungují tipy">{[{ title: "Doporučíš kontakt", text: "Vybereš oblast a předáš základní údaje." }, { title: "Poradce se ozve", text: "S klientem probere potřeby a možnosti." }, { title: "Sleduješ výsledek", text: "Stav i případnou odměnu najdeš v účtu." }].map((item, index) => <div key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3><p>{item.text}</p></div>)}</section>
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.advisor}><span className={styles.eyebrow}>JSTE NA TO DVA</span><h2>Tvůj poradce</h2><span className={styles.advisorAvatar}><UserRound size={31} /></span><h3>{recipientEmail ? recipientName : "Poradce zatím není přiřazený"}</h3><p>{recipientEmail ? "Sem putují tvoje tipy. Poradce se postará o kontakt i další průběh." : "Pro přiřazení poradce se obrať na správce účtu. Potom můžeš odeslat první tip."}</p>{recipientEmail ? <a href={`mailto:${encodeURIComponent(recipientEmail)}`}><Mail size={15} /><span>{recipientEmail}</span></a> : null}<div><Check size={13} />{recipientEmail ? "Příjemce tvých doporučení" : "Čeká na nastavení"}</div></section>
          <Link href="/cashflow" className={styles.rewards}><span><Wallet size={23} /></span><h2>Tvoje tipy.<br />Tvoje odměny.</h2><p>Provize ze sjednaných tipů a výhled na další měsíce přehledně pohromadě.</p><strong>Prohlédnout odměny<ArrowRight size={15} /></strong></Link>
        </aside>
      </div>
      {detail ? <TipDetailModal key={detail.id} {...detail} onClose={closeDetail} onChanged={refresh} /> : null}
    </div>
  );
}
