"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarRange, Check, ChevronDown, CircleHelp, Lightbulb, Wallet } from "lucide-react";
import { formatMoney } from "@/app/lib/formatters";
import type { MonthGroup, YearGroup } from "../types";
import { buildYearMonthSlots } from "../yearChart";
import styles from "../tipsterRewards.module.css";

export function TipsterRewardsHeader({ total, calculating, failed, showPastYears, forecastYears, hasPaidMonthTotals, onTogglePastYears, onOpenHelp }: {
  total: number;
  calculating: boolean;
  failed: boolean;
  showPastYears: boolean;
  forecastYears: number;
  hasPaidMonthTotals: boolean;
  onTogglePastYears: () => void;
  onOpenHelp: () => void;
}) {
  return <>
    <div className={styles.topline}><div><Wallet size={22} /><h1>Moje odměny</h1></div><Link href="/tipy">Zpět na moje tipy<ArrowRight size={14} /></Link></div>
    <header className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>DOPORUČENÍ, KTERÁ MAJÍ HODNOTU</span><h2>Dobré kontakty.<br /><span>Zasloužené odměny.</span></h2><p>Provize ze sjednaných tipů, přehledně po měsících. Otevři měsíc a podívej se, z čeho se tvoje odměna skládá.</p></div>
      <div className={styles.total}><span className={styles.walletIcon}><Wallet size={26} /></span><span>{hasPaidMonthTotals ? "Celkem v přehledu" : "Očekávané odměny"}</span><strong aria-live="polite">{calculating ? "…" : failed ? "—" : formatMoney(total)}</strong><p>{showPastYears ? "Včetně předchozích let" : "Od letošního roku"}<br />Výhled na {forecastYears} let</p></div>
    </header>
    <div className={styles.toolbar}><span><CalendarDays size={16} />Tvůj kalendář odměn</span><div><button type="button" aria-pressed={showPastYears} onClick={onTogglePastYears}><CalendarRange size={15} />Předchozí roky</button><button type="button" onClick={onOpenHelp} aria-label="Otevřít nápovědu k proviznímu kalendáři"><CircleHelp size={16} />Jak to funguje</button></div></div>
  </>;
}

export function TipsterRewardsCalendar({ yearGroups, expandedYears, onToggleYear, onSelectMonth, monthItemLabels }: {
  yearGroups: YearGroup[];
  expandedYears: Record<number, boolean>;
  onToggleYear: (year: number) => void;
  onSelectMonth: (month: MonthGroup) => void;
  monthItemLabels?: Record<string, string>;
}) {
  const now = new Date();
  return <div className={styles.years}>{yearGroups.map((year) => {
    const open = expandedYears[year.year] ?? false;
    const slots = buildYearMonthSlots(year, now);
    const max = Math.max(1, ...year.months.map((month) => Math.abs(month.total)));
    return <section className={styles.year} key={year.year}>
      <button type="button" className={styles.yearHeader} onClick={() => onToggleYear(year.year)} aria-expanded={open} aria-controls={`tip-rewards-${year.year}`}><span className={styles.yearIcon}><CalendarDays size={22} /></span><span className={styles.yearTitle}><small>ODMĚNY ZA TIPY</small><strong>{year.year}{year.year === now.getFullYear() ? <span>Letos</span> : null}</strong></span><span className={styles.yearTotal}><small>Celkem za zobrazené měsíce</small><strong>{year.months.length ? formatMoney(year.total) : "—"}</strong></span><ChevronDown size={18} className={open ? styles.rotated : ""} /></button>
      <div id={`tip-rewards-${year.year}`} hidden={!open}>
        {open ? <div className={styles.months}>{slots.map(({ key, month, monthIndex, label, current }) => <button key={key} type="button" disabled={!month} onClick={() => { if (month) onSelectMonth(month); }} className={styles.month} data-current={current} data-negative={month && month.total < 0} aria-label={`${label}: ${month ? `${formatMoney(month.total)}. Otevřít odměny.` : "bez odměn v přehledu"}`}>
          <div className={styles.monthTop}><span>{String(monthIndex + 1).padStart(2, "0")}</span>{current ? <small>Tento měsíc</small> : month?.totalSource === "paid" ? <small className={styles.paid}><Check size={11} />Dle výpisu</small> : null}</div><h3>{label.replace(/\s+\d{4}$/, "")}</h3><strong className={styles.amount}>{month ? formatMoney(month.total) : "—"}</strong><div className={styles.bar}><span style={{ width: month ? `${Math.max(3, Math.abs(month.total) / max * 100)}%` : "0%" }} /></div><div className={styles.monthBottom}><span>{month ? monthItemLabels?.[month.key] || (month.totalSource === "paid" ? "Dle výpisu" : "Očekávaná odměna") : "Zatím bez odměny"}</span>{month ? <ArrowRight size={14} /> : null}</div>
        </button>)}</div> : null}
      </div>
    </section>;
  })}</div>;
}

export function TipsterRewardsNote() {
  return <aside className={styles.note}><Lightbulb size={20} /><div><strong>Jak číst očekávané odměny</strong><p>Částky jsou předpoklad podle sjednaných smluv. Termín i výše výplaty se mohou změnit například podle úhrady pojistného nebo storna smlouvy. Podrobnosti k odměně s tebou projde tvůj poradce.</p></div></aside>;
}
