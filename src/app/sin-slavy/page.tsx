"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, CalendarDays, CarFront, Check, ChevronDown, Crown, Globe2, Home, Medal, Search, ShieldCheck, Sparkles, Trophy, X } from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { AppLayout } from "@/components/AppLayout";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { formatMoney } from "@/app/lib/formatters";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import type { HallCategory, HallOfFameResponse, HallPeriod, HallRow } from "./hallOfFame.types";
import styles from "./hallOfFame.module.css";
import { HallOfFameLoader } from "./HallOfFameLoader";

const CATEGORIES = [
  { key: "life", label: "Životní pojištění", icon: ShieldCheck },
  { key: "auto", label: "Auto", icon: CarFront },
  { key: "property", label: "Majetek a odpovědnost", icon: Home },
  { key: "gold", label: "Zlato", icon: Sparkles },
] as const;
const PERIODS: { key: HallPeriod; label: string }[] = [
  { key: "month", label: "Aktuální měsíc" },
  { key: "3months", label: "Poslední 3 měsíce" },
  { key: "6months", label: "Posledních 6 měsíců" },
  { key: "year", label: "Poslední rok" },
];
const PAGE_SIZE = 10;
const number = (value: number) => value.toLocaleString("cs-CZ");
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs").trim();
const dateLabel = (value: string) => value.split("-").reverse().map(Number).join(". ");
const premiumLabel = (category: HallCategory) => category === "life" ? "Měsíční pojistné" : "Roční pojistné";
const formatPremium = (annualPremium: number, category: HallCategory) => formatMoney(category === "life" ? annualPremium / 12 : annualPremium);

function WinnerCard({ row, isMe, category }: { row: HallRow; isMe: boolean; category: HallCategory }) {
  return (
    <article className={styles.winner} data-rank={row.rank} aria-label={`${row.rank}. místo: ${row.name}`}>
      <div className={styles.winnerBody}>
        <span className={styles.winnerLabel}>
          {row.rank === 1 ? <Crown size={14} aria-hidden="true" /> : <Medal size={14} aria-hidden="true" />}
          {row.rank === 1 ? "Lídr kategorie" : row.rank === 2 ? "Stříbrná příčka" : "Bronzová příčka"}
        </span>
        <div className={styles.winnerPortrait}>
          <ProfileAvatar src={row.profileAvatar} name={row.name} alt="" sizes="80px" className={styles.winnerAvatar} />
          <span className={styles.medallion} aria-hidden="true">{row.rank}</span>
        </div>
        <h3>{row.name}{isMe && <span className={styles.you}>Ty</span>}</h3>
        <span className={styles.premiumLabel}>{premiumLabel(category)}</span>
        <strong className={styles.winnerAmount}>{formatPremium(row.annualPremium, category)}</strong>
        <span className={styles.winnerContracts}>Počet smluv <b>{number(row.contracts)}</b></span>
      </div>
      <div className={styles.podiumStep} aria-hidden="true"><span>{String(row.rank).padStart(2, "0")}</span><Trophy size={22} strokeWidth={1.25} /></div>
    </article>
  );
}

export default function HallOfFamePage() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hall, setHall] = useState<HallOfFameResponse | null>(null);
  const [retry, setRetry] = useState(0);
  const [activeCategory, setActiveCategory] = useState<HallCategory>("life");
  const [period, setPeriod] = useState<HallPeriod>("month");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [locateRequest, setLocateRequest] = useState(0);
  const locatePending = useRef(false);
  const effectiveEmail = useEffectiveUserEmail(authUser?.email);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setAuthUser(user);
    if (!user) { setLoading(false); setHall(null); }
  }), []);

  useEffect(() => {
    let cancelled = false;
    if (!authUser || !effectiveEmail) return;
    const load = async () => {
      setLoading(true); setError(null); setHall(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<HallOfFameResponse>(authUser, `/api/team-overview?action=hallOfFame&period=${period}`);
        if (!cancelled) setHall(payload);
      } catch {
        if (!cancelled) setError("Síň slávy se nepodařilo načíst.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authUser, effectiveEmail, retry, period]);

  const rankedRows = useMemo(() => hall?.rankings[activeCategory] ?? [], [hall, activeCategory]);
  const filteredRows = useMemo(() => rankedRows.filter((row) => normalize(row.name).includes(normalize(query))), [rankedRows, query]);
  const myRow = rankedRows.find((row) => row.id === hall?.currentUserId);
  const activeTab = CATEGORIES.find((category) => category.key === activeCategory)!;
  const rankingLabel = activeCategory === "life" ? "měsíčního pojistného" : "ročního pojistného";
  const overallContracts = rankedRows.reduce((sum, row) => sum + row.contracts, 0);
  const overallPremium = rankedRows.reduce((sum, row) => sum + row.annualPremium, 0);
  const rangeLabel = hall ? `${dateLabel(hall.period.startDate)} – ${dateLabel(hall.period.endDate)}` : "";

  useEffect(() => {
    if (!locatePending.current || !hall) return;
    const row = document.getElementById(`hall-member-${hall.currentUserId}`);
    if (!row) return;
    locatePending.current = false;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [locateRequest, hall]);

  function findMe() {
    if (!myRow) return;
    setQuery("");
    setVisibleCount(Math.max(PAGE_SIZE, Math.ceil((rankedRows.indexOf(myRow) + 1) / PAGE_SIZE) * PAGE_SIZE));
    locatePending.current = true;
    setLocateRequest((value) => value + 1);
  }

  return (
    <AppLayout active="hall">
      <div className={styles.page}>
        <div className={styles.topline}>
          <span><Trophy size={14} aria-hidden="true" /> Úspěchy napříč celou aplikací</span>
          <Link href="/"><ArrowLeft size={14} aria-hidden="true" /> Zpět na přehled</Link>
        </div>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Prostor pro výjimečné výsledky</span>
            <h1>Síň slávy<span>.</span></h1>
            <p>Skvělé výsledky si zaslouží být vidět.<br />Objev ty nejlepší napříč všemi týmy.</p>
            <div className={styles.heroMeta}><Globe2 size={14} aria-hidden="true" /> Společný žebříček všech uživatelů</div>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <div className={styles.heroOrbit} />
            <div className={styles.heroTrophy}>
              <Image src="/illustrations/team/hall-trophy-modern-transparent-v2.webp" alt="" width={390} height={390} sizes="(max-width: 360px) 125px, (max-width: 540px) 154px, (max-width: 1100px) 237px, 258px" priority className={styles.heroImage} />
              <span className={styles.trophyBrand} />
            </div>
          </div>
        </header>

        <div className={styles.filters}>
          <div className={styles.periods} role="group" aria-label="Období síně slávy">
            {PERIODS.map((item) => <button key={item.key} type="button" aria-pressed={period === item.key} onClick={() => { setPeriod(item.key); setQuery(""); setVisibleCount(PAGE_SIZE); }}>{item.label}</button>)}
          </div>
          <span className={styles.dateRange}><CalendarDays size={14} aria-hidden="true" />{rangeLabel || "Výsledky za zvolené období"}</span>
        </div>
        <div className={styles.categories} role="group" aria-label="Kategorie síně slávy">
          {CATEGORIES.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-pressed={activeCategory === key} onClick={() => { setActiveCategory(key); setQuery(""); setVisibleCount(PAGE_SIZE); }}>
              <Icon size={18} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span>{activeCategory === key && <Check size={14} className={styles.categoryCheck} aria-hidden="true" />}
            </button>
          ))}
        </div>

        {loading ? (
          <HallOfFameLoader />
        ) : error ? (
          <div className={styles.state} role="alert"><Trophy size={32} strokeWidth={1.4} aria-hidden="true" /><h2>{error}</h2><p>Zkus to prosím ještě jednou.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Zkusit znovu</button></div>
        ) : !authUser ? (
          <div className={styles.state}><Trophy size={32} aria-hidden="true" /><h2>Síň slávy čeká na tebe</h2><p>Pro zobrazení výsledků se přihlas.</p><Link href="/">Přejít na přihlášení</Link></div>
        ) : !rankedRows.length ? (
          <div className={styles.state} role="status"><span className={styles.emptyMedal}><Trophy size={34} strokeWidth={1.4} aria-hidden="true" /></span><span className={styles.eyebrow}>{activeTab.label}</span><h2>První příčka zatím čeká</h2><p>V této kategorii za zvolené období není žádná produkce.<br />Zkus jiné období nebo se podívej na další kategorii.</p></div>
        ) : (
          <>
            <section className={styles.champions} aria-labelledby="champions-title">
              <div className={styles.sectionHeading}><div><span className={styles.sectionKicker}>Nejlepší v kategorii</span><h2 id="champions-title">{activeTab.label}</h2></div><span className={styles.rankingRule}><ArrowDown size={13} aria-hidden="true" /> Podle {rankingLabel}</span></div>
              <div className={styles.podium} data-count={Math.min(rankedRows.length, 3)}>{rankedRows.slice(0, 3).map((row) => <WinnerCard key={row.id} row={row} category={activeCategory} isMe={row.id === hall?.currentUserId} />)}</div>
            </section>

            <section className={styles.myPosition} aria-label="Tvoje umístění">
              <div className={styles.myRank}>{myRow ? <strong>{myRow.rank}<span>.</span></strong> : <Medal size={25} aria-hidden="true" />}</div>
              <div className={styles.myCopy}><h2>Tvoje umístění{myRow && <span>{myRow.rank <= 3 ? "Na stupních vítězů" : `${myRow.rank}. místo z ${number(rankedRows.length)}`}</span>}</h2><p>{myRow ? <>{formatPremium(myRow.annualPremium, activeCategory)} <span>· Počet smluv: {number(myRow.contracts)}</span></> : "V této kategorii za zvolené období zatím nemáš produkci."}</p></div>
              {myRow && <button type="button" onClick={findMe}>Najít mě v žebříčku <ArrowDown size={15} aria-hidden="true" /></button>}
            </section>

            <section className={styles.leaderboard} aria-labelledby="leaderboard-title">
              <div className={styles.listHeader}>
                <div><h2 id="leaderboard-title">Celkové pořadí <span>{number(rankedRows.length)}</span></h2><p>Všichni uživatelé s produkcí za zvolené období.</p></div>
                <div className={styles.search}><Search size={16} aria-hidden="true" /><input type="search" value={query} aria-label="Hledat v žebříčku" placeholder="Hledat podle jména…" onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} />{query && <button type="button" aria-label="Vymazat hledání" onClick={() => { setQuery(""); setVisibleCount(PAGE_SIZE); }}><X size={15} aria-hidden="true" /></button>}</div>
              </div>
              {filteredRows.length ? (
                <table className={styles.table}>
                  <caption className={styles.srOnly}>{activeTab.label} – pořadí podle {rankingLabel}, {rangeLabel}</caption>
                  <thead><tr><th scope="col">Pořadí</th><th scope="col">Jméno</th><th scope="col" className={styles.contractsColumn}>Smlouvy</th><th scope="col" className={styles.amountColumn}>{premiumLabel(activeCategory)} <ArrowDown size={12} aria-hidden="true" /></th><th scope="col" className={styles.progressColumn}>Výkon vůči lídrovi</th></tr></thead>
                  <tbody>{filteredRows.slice(0, visibleCount).map((row) => (
                    <tr key={row.id} id={`hall-member-${row.id}`} tabIndex={-1} data-current={row.id === hall?.currentUserId}>
                      <td><span className={styles.listRank} data-rank={row.rank}>{row.rank <= 3 ? <><Medal size={30} strokeWidth={1.3} aria-hidden="true" /><b>{row.rank}</b><span className={styles.srOnly}>. místo</span></> : `${row.rank}.`}</span></td>
                      <th scope="row"><div className={styles.listIdentity}><ProfileAvatar src={row.profileAvatar} name={row.name} alt="" sizes="36px" className={styles.listAvatar} /><div><span className={styles.listName}>{row.name}{row.id === hall?.currentUserId && <span className={styles.you}>Ty</span>}</span><span className={styles.mobileContracts}>Počet smluv: {number(row.contracts)}</span></div></div></th>
                      <td className={styles.contractsColumn}>{number(row.contracts)}</td>
                      <td className={styles.amountColumn}>{formatPremium(row.annualPremium, activeCategory)}</td>
                      <td className={styles.progressColumn}><div className={styles.performance}><span aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, row.leaderRatioPct))}%` }} /></span><b>{number(row.leaderRatioPct)} %</b></div></td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : (
                <div className={styles.noResults} role="status"><Search size={26} aria-hidden="true" /><h3>Nikdo neodpovídá hledání</h3><p>Zkus jiné jméno nebo hledání vymaž.</p><button type="button" onClick={() => setQuery("")}>Zobrazit všechny</button></div>
              )}
              <div className={styles.listFooter}><span aria-live="polite">Zobrazeno {number(Math.min(visibleCount, filteredRows.length))} z {number(filteredRows.length)}{query ? " nalezených" : " umístění"}</span>{filteredRows.length > visibleCount && <button type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}>Zobrazit další <ChevronDown size={15} aria-hidden="true" /></button>}</div>
            </section>
            <footer className={styles.summary}><span><Globe2 size={14} aria-hidden="true" /> Celá aplikace · {activeTab.label}</span><span>Celkem <strong>{formatPremium(overallPremium, activeCategory)}</strong><i>·</i>Počet smluv <strong>{number(overallContracts)}</strong></span><p>Počítají se smlouvy sjednané ve zvoleném období. Delší období zahrnují aktuální a předchozí kalendářní měsíce.</p></footer>
          </>
        )}
      </div>
    </AppLayout>
  );
}
