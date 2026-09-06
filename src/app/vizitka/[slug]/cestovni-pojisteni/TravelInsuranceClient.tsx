"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CarFront, Check, CheckCircle2, ChevronDown, Compass, FileCheck2, LifeBuoy, Loader2, MapPin, Mountain, Phone, Plane, ShieldCheck, Snowflake, Sun, UsersRound, Waves } from "lucide-react";
import { trackOnlineCardEvent, trackOnlineCardVisit } from "@/lib/onlineCardTracking";
import { EMPTY_TRAVEL_DRAFT, TRAVEL_ACTIVITIES, TRAVEL_FACTS_CHECKED, TRAVEL_OPTIONS, pragueToday, travelAges, travelComparisons, travelPriorities, travelTripSummary, validateTravelActivities, validateTravelTrip, type TravelActivity, type TravelDraft, type TravelInquiry } from "@/lib/travelInsurance";
import styles from "./travel.module.css";

const ACTIVITY_ICONS = { relax: Sun, family: UsersRound, hiking: Mountain, diving: Waves, winter: Snowflake, rental: CarFront, work: BriefcaseBusiness, storno: FileCheck2 };
const STEPS = ["Vaše cesta", "Vaše plány", "Co ohlídat", "Nabídka pro vás"];
const EMPTY_CONTACT = { fullName: "", email: "", phone: "", company: "" };

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{children}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}

export default function TravelInsuranceClient({ slug, advisorName, advisorPhone }: { slug: string; advisorName: string; advisorPhone: string }) {
  const [trip, setTrip] = useState<TravelDraft>(() => ({ ...EMPTY_TRAVEL_DRAFT, activities: [] }));
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [intent, setIntent] = useState<TravelInquiry["intent"]>("offer");
  const [preferredContact, setPreferredContact] = useState<TravelInquiry["preferredContact"]>("email");
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const guideRef = useRef<HTMLElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const trackedPlan = useRef(false);
  const submissionLock = useRef(false);
  const today = pragueToday();
  const priorities = useMemo(() => travelPriorities(trip), [trip]);
  const comparisons = useMemo(() => travelComparisons(trip), [trip]);
  const phoneHref = advisorPhone.replace(/[^\d+]/g, "");
  const update = <K extends keyof TravelDraft>(key: K, value: TravelDraft[K]) => { setTrip(prev => ({ ...prev, [key]: value })); setError(null); };
  const toggleActivity = (id: TravelActivity) => update("activities", trip.activities.includes(id) ? trip.activities.filter(item => item !== id) : [...trip.activities, id]);

  useEffect(() => { void trackOnlineCardVisit(slug, "travel_visit"); }, [slug]);
  useEffect(() => {
    if (!started) return;
    stepHeading.current?.focus({ preventScroll: true });
    guideRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [step, started, submitted]);

  const start = (mode: TravelInquiry["intent"] = "offer", activity?: TravelActivity) => {
    if (submitting) return;
    setIntent(mode);
    if (activity && !trip.activities.includes(activity)) update("activities", [...trip.activities, activity]);
    setStarted(true);
    guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const navigate = (next: number) => { setStep(next); setError(null); };
  const continueForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || submitted) return;
    if (step === 0) {
      const validation = validateTravelTrip(trip);
      if (validation) { setError(validation); return; }
    }
    if (step === 1) {
      const validation = validateTravelActivities(trip);
      if (validation) { setError(validation); return; }
      if (!trackedPlan.current) { trackedPlan.current = true; void trackOnlineCardEvent(slug, "travel_plan"); }
    }
    if (step < 3) { navigate(step + 1); return; }
    void sendInquiry();
  };
  const sendInquiry = async () => {
    if (submissionLock.current) return;
    const tripError = validateTravelTrip(trip) || validateTravelActivities(trip);
    if (tripError) { navigate(0); setError(tripError); return; }
    if (contact.fullName.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) || contact.phone.replace(/\D/g, "").length < 6) {
      setError("Vyplňte jméno, platný e-mail a telefon pro přípravu nabídky."); return;
    }
    submissionLock.current = true;
    setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/online-card/meeting-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...contact, locale: "cs", travel: { trip, intent, preferredContact, note } satisfies TravelInquiry }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Poptávku se nepodařilo odeslat. Zkuste to prosím znovu.");
      setSubmitted(true); setContact(EMPTY_CONTACT); setNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Poptávku se nepodařilo odeslat. Zkuste to prosím znovu.");
    } finally { submissionLock.current = false; setSubmitting(false); }
  };

  const detailSelect = (key: keyof typeof TRAVEL_OPTIONS, label: string) => <Field key={key} id={`travel-${key}`} label={label}>
    <select id={`travel-${key}`} value={trip[key]} onChange={event => update(key, event.target.value)}>{TRAVEL_OPTIONS[key].map(value => <option key={value}>{value}</option>)}</select>
  </Field>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.back} href={`/vizitka/${slug}`}><ArrowLeft size={17} /><span>Zpět na vizitku</span></a>
      <a className={styles.advisor} href={`/vizitka/${slug}`}><span className={styles.avatar}>{advisorName.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("")}</span><span>{advisorName}<small>Váš osobní poradce</small></span></a>
      {phoneHref && <a className={styles.phone} href={`tel:${phoneHref}`} onClick={() => void trackOnlineCardEvent(slug, "phone_click")}><Phone size={16} /><span>Zavolat</span></a>}
    </header>

    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="travel-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><Plane size={16} /> CESTOVNÍ POJIŠTĚNÍ</p>
          <h1 id="travel-title">Dovolená podle vás.<br /><em>Pojištění taky.</em></h1>
          <p className={styles.lead}>Kam jedete, je začátek. Co tam budete dělat, rozhoduje. Vyberte své plány a zjistěte, co má vaše pojištění opravdu pokrývat.</p>
          <div className={styles.heroActions}><button className={styles.primary} onClick={() => start()}>Připravit plán pro mou cestu <ArrowRight size={18} /></button><button className={styles.textButton} onClick={() => start("review")}>Už pojištění mám <ArrowUpRight size={16} /></button></div>
          <div className={styles.heroProof}><span><Check size={14} /> Bez registrace</span><span><Check size={14} /> Podle vašich aktivit</span><span><Check size={14} /> S pomocí poradce</span></div>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.artLabel}><Compass size={17} /> PRO VŠECHNY VAŠE PLÁNY</div>
          <svg className={styles.landscape} viewBox="0 0 520 360" fill="none">
            <defs><linearGradient id="travel-sky" x2="520" y2="360" gradientUnits="userSpaceOnUse"><stop stopColor="#ece7ff"/><stop offset="1" stopColor="#c4d9ef"/></linearGradient><linearGradient id="travel-sea" y1="215" y2="360" gradientUnits="userSpaceOnUse"><stop stopColor="#9ed8d5"/><stop offset="1" stopColor="#c8eeea"/></linearGradient></defs>
            <rect width="520" height="360" rx="26" fill="url(#travel-sky)"/><circle cx="398" cy="78" r="37" fill="#fff8e7"/>
            <path d="M0 241L131 62L214 182L286 113L431 277H0Z" fill="#a29ac4"/><path d="M78 135L131 62L171 120L145 108L131 127L112 112Z" fill="#f9f7ff"/>
            <path d="M0 262L93 177L172 239L283 124L395 255L520 213V360H0Z" fill="#c3badb"/><path d="M247 165L283 124L319 166L295 157L281 169L266 151Z" fill="#f9f7ff"/>
            <path d="M0 258C152 207 191 307 331 255C428 219 465 235 520 249V360H0Z" fill="url(#travel-sea)"/><path d="M0 312C113 271 170 339 280 297C390 257 454 290 520 275" stroke="white" strokeOpacity=".55" strokeWidth="2"/>
            <path d="M82 251C68 92 310 28 403 162" stroke="#7953be" strokeDasharray="5 7" strokeWidth="2"/><circle cx="82" cy="251" r="7" fill="#7953be"/><circle cx="82" cy="251" r="13" stroke="#7953be" strokeOpacity=".3"/>
          </svg>
          <span className={styles.artPlane}><Plane size={35} strokeWidth={1.5} /></span>
          <div className={styles.ticket}><div><span>VAŠE DALŠÍ CESTA</span><strong>Moře, hory,<br />nebo obojí?</strong></div><span className={styles.ticketIcon}><ShieldCheck size={28} /></span><p>Jeden plán. Všechny důležité detaily.</p></div>
        </div>
      </section>

      {!started && <section className={styles.inspiration} aria-label="Inspirace pro vaši cestu"><span>CO VÁS LÁKÁ?</span>{(["relax", "hiking", "diving", "rental"] as TravelActivity[]).map(id => { const Icon = ACTIVITY_ICONS[id]; return <button key={id} onClick={() => start("offer", id)}><Icon size={18} />{TRAVEL_ACTIVITIES.find(item => item.id === id)?.title}<ArrowUpRight size={14} /></button>; })}<button className={styles.allPlans} onClick={() => start()}>Všechny plány <ArrowDown size={15} /></button></section>}

      <section ref={guideRef} className={styles.guide} aria-labelledby="travel-guide-title">
        <div className={styles.guideTop}><div><p className={styles.eyebrow}>VÁŠ CESTOVNÍ PLÁN</p><h2 id="travel-guide-title">Dobré pojištění začíná vaší cestou.</h2></div><span className={styles.privateNote}><ShieldCheck size={16} /> Nezávazně, bez registrace</span></div>
        {submitted ? <div className={styles.success} role="status"><CheckCircle2 size={48} /><h2 ref={stepHeading} tabIndex={-1}>Poptávka je u vašeho poradce.</h2><p>{advisorName} dostal údaje o cestě i vaše plány. Ozve se vám a upřesní nabídku nebo kontrolu stávajícího pojištění.</p><p className={styles.finePrint}>Odesláním poptávky ještě nevzniká pojištění.</p><a className={styles.primary} href={`/vizitka/${slug}`}>Zpět na vizitku <ArrowRight size={17} /></a></div> : <>
          <ol className={styles.steps}>{STEPS.map((label, index) => <li key={label} data-active={step === index} data-done={step > index}><button type="button" disabled={index > step || submitting} onClick={() => { setStarted(true); navigate(index); }} aria-current={step === index ? "step" : undefined}><span>{step > index ? <Check size={15} /> : index + 1}</span>{label}</button></li>)}</ol>
          <form onSubmit={continueForm} noValidate>
            <fieldset disabled={submitting} className={styles.formFields}>
              <div className={styles.stepTitle}><div><p>KROK {step + 1} ZE 4</p><h3 ref={stepHeading} tabIndex={-1}>{["Kam se chystáte?", "Co chcete na cestě zažít?", "Tohle si pohlídáme.", intent === "review" ? "Nechte si ověřit své pojištění." : "Proměňme plán v konkrétní nabídku."][step]}</h3></div><span>{step === 1 ? "Můžete vybrat více možností." : step === 2 ? "Podle toho, co jste vybrali." : ""}</span></div>
              {step === 0 && <div className={styles.formGrid}>
                <Field id="travel-destination" label="Cílová země nebo země" hint="Uveďte i další země, ve kterých budete pobývat."><input id="travel-destination" autoComplete="off" placeholder="Například Itálie a Rakousko" maxLength={100} value={trip.destination} onChange={e => update("destination", e.target.value)} aria-describedby="travel-destination-hint" /></Field>
                <Field id="travel-ages" label="Věk cestujících" hint="Každého zvlášť, oddělené čárkou. Například 35, 32, 7."><input id="travel-ages" placeholder="35, 32, 7" maxLength={70} value={trip.ages} onChange={e => update("ages", e.target.value)} aria-describedby="travel-ages-hint" /></Field>
                <Field id="travel-departure" label="Odjezd"><input id="travel-departure" type="date" min={trip.alreadyAbroad ? undefined : today} value={trip.departure} onChange={e => update("departure", e.target.value)} /></Field>
                <Field id="travel-return" label="Návrat"><input id="travel-return" type="date" min={trip.departure > today ? trip.departure : today} value={trip.returnDate} onChange={e => update("returnDate", e.target.value)} /></Field>
                <label className={styles.checkField}><input type="checkbox" checked={trip.alreadyAbroad} onChange={e => update("alreadyAbroad", e.target.checked)} />Už jsem v zahraničí</label>
                {trip.alreadyAbroad && <p className={styles.notice}>Ověříme možnost sjednání po odjezdu a skutečný počátek krytí.</p>}
              </div>}
              {step === 1 && <>
                <div className={styles.activities}>{TRAVEL_ACTIVITIES.map(activity => { const Icon = ACTIVITY_ICONS[activity.id]; const selected = trip.activities.includes(activity.id); return <button className={styles.activity} type="button" key={activity.id} aria-pressed={selected} onClick={() => toggleActivity(activity.id)}><span className={styles.activityIcon}><Icon size={23} /></span><strong>{activity.title}</strong><small>{activity.description}</small><span className={styles.checkMark}>{selected && <Check size={13} />}</span></button>; })}</div>
                {(trip.activities.some(id => ["hiking", "diving", "winter", "rental", "storno"].includes(id))) && <div className={styles.details}><h4>Ještě pár detailů, které dělají rozdíl.</h4><div className={styles.formGrid}>
                  {trip.activities.includes("hiking") && <>{detailSelect("ferrata", "Obtížnost ferraty")}{detailSelect("altitude", "Nejvyšší plánovaná nadmořská výška")}</>}
                  {trip.activities.includes("diving") && detailSelect("diving", "Jak se budete potápět?")}
                  {trip.activities.includes("winter") && detailSelect("winter", "Kde budete lyžovat nebo jezdit?")}
                  {trip.activities.includes("rental") && detailSelect("rental", "Co si budete půjčovat?")}
                  {trip.activities.includes("storno") && <><Field id="travel-cost" label="Celková cena cesty v Kč (nepovinné)"><input id="travel-cost" inputMode="numeric" maxLength={9} placeholder="Například 60000" value={trip.tripCost} onChange={e => update("tripCost", e.target.value)} /></Field><Field id="travel-payment" label="Datum první platby (nepovinné)"><input id="travel-payment" type="date" max={today} value={trip.paymentDate} onChange={e => update("paymentDate", e.target.value)} /></Field></>}
                </div></div>}
              </>}
              {step === 2 && <>
                <div className={styles.planBanner}><div><span><MapPin size={15} /> VAŠE CESTA</span><h4>{trip.destination}</h4><p>{trip.departure.split("-").reverse().join(". ")} – {trip.returnDate.split("-").reverse().join(". ")} · {travelAges(trip.ages).length} cestujících</p></div><div><strong>{priorities.length}</strong><span>oblastí k ověření</span></div></div>
                <div className={styles.priorities}>{priorities.map((priority, index) => <article key={priority.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h4>{priority.title}</h4><p>{priority.text}</p></div></article>)}</div>
                <div className={styles.comparisonHeading}><h4>Rozdíly, které stojí za pozornost</h4><p>Konkrétní rozsah a cenu potvrdí poradce podle vaší cesty. Toto je přehled podkladů pro výběr.</p></div>
                <div className={styles.comparisons}>{comparisons.map(item => <article key={item.name}><span className={styles.insurer}>{item.name}</span><h4>{item.title}</h4><p>{item.text}</p><a href={item.source} target="_blank" rel="noopener noreferrer">Zdroj a podmínky <ArrowUpRight size={14} /></a></article>)}</div>
                <p className={styles.finePrint}>Podklady ověřené {TRAVEL_FACTS_CHECKED}. Rozhodují podmínky konkrétní smlouvy, připojištění, limity a výluky. U kombinace aktivit ověříme všechny vybrané činnosti.</p>
              </>}
              {step === 3 && <div className={styles.contactLayout}>
                <div><div className={styles.modeChoice}><button type="button" aria-pressed={intent === "offer"} onClick={() => setIntent("offer")}>Chci nabídku</button><button type="button" aria-pressed={intent === "review"} onClick={() => setIntent("review")}>Chci kontrolu pojištění</button></div>
                  <div className={styles.formGrid}><Field id="travel-name" label="Jméno a příjmení"><input id="travel-name" autoComplete="name" maxLength={120} value={contact.fullName} onChange={e => setContact({ ...contact, fullName: e.target.value })} /></Field><Field id="travel-email" label="E-mail"><input id="travel-email" type="email" autoComplete="email" maxLength={200} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></Field><Field id="travel-phone" label="Telefon"><input id="travel-phone" type="tel" autoComplete="tel" maxLength={40} value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} /></Field><Field id="travel-preference" label="Jak vás má poradce kontaktovat?"><select id="travel-preference" value={preferredContact} onChange={e => setPreferredContact(e.target.value as TravelInquiry["preferredContact"])}><option value="email">Raději e-mailem</option><option value="phone">Raději telefonicky</option></select></Field></div>
                  <Field id="travel-note" label={intent === "review" ? "Pojišťovna, varianta a co chcete ověřit" : "Ještě něco důležitého? (nepovinné)"}><textarea id="travel-note" rows={3} maxLength={250} value={note} onChange={e => setNote(e.target.value)} placeholder={intent === "review" ? "Například pojištění ke kartě nebo balíček od cestovky. Podklady si poradce následně vyžádá." : "Například přesná trasa, název aktivity nebo požadavek na krytí."} /></Field>
                  <div className={styles.honeypot} aria-hidden="true"><label htmlFor="travel-company">Společnost</label><input id="travel-company" tabIndex={-1} autoComplete="off" value={contact.company} onChange={e => setContact({ ...contact, company: e.target.value })} /></div>
                  <p className={styles.finePrint}>Údaje budou předány poradci {advisorName} k vyřízení vaší poptávky. Odesláním nic neplatíte a neuzavíráte pojistnou smlouvu.</p>
                </div><aside className={styles.summary}><p className={styles.eyebrow}>ZADÁNÍ PRO PORADCE</p><h4>{trip.destination}</h4>{travelTripSummary(trip).slice(1).map(line => <p key={line}>{line}</p>)}<button type="button" className={styles.textButton} onClick={() => navigate(0)}>Upravit cestu <ArrowUpRight size={14} /></button><div className={styles.summaryAdvisor}><span className={styles.avatar}>{advisorName.trim()[0]}</span><span>{advisorName}<small>Vaši cestu společně doladíme.</small></span></div></aside>
              </div>}
            </fieldset>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.formFooter}>{step > 0 ? <button type="button" className={styles.textButton} disabled={submitting} onClick={() => navigate(step - 1)}><ArrowLeft size={16} />Zpět</button> : <span className={styles.footerHint}>Kontakt vyplníte až na konci.</span>}<button className={styles.primary} type="submit" disabled={submitting} onClick={() => setStarted(true)}>{submitting ? <><Loader2 size={17} className={styles.spin} />Odesílám…</> : <>{["Pokračovat k aktivitám", "Ukázat, co si pohlídat", "Chci pomoc s výběrem", intent === "review" ? "Požádat o kontrolu" : "Odeslat nezávaznou poptávku"][step]}<ArrowRight size={17} /></>}</button></div>
          </form>
        </>}
      </section>

      <section className={styles.explain}><div><span className={styles.iconBox}><LifeBuoy size={24} /></span><h2>Klid začíná<br />dobrou otázkou.</h2><p>Balíček od cestovky i pojištění ke kartě může být dobrý základ. Společně ověříme, jestli odpovídá tomu, co plánujete vy.</p><button className={styles.textButton} onClick={() => start("review")}>Chci ověřit své pojištění <ArrowUpRight size={17} /></button></div><div className={styles.faq}>
        {[
          ["Stačí pojištění, které už mám ke kartě?", "Záleží na konkrétním produktu, pojištěných osobách, délce cesty, aktivitách a podmínkách aktivace. Poradce si vyžádá podklady a porovná je s vaším plánem."],
          ["Uvidím hned cenu pojištění?", "Nejprve dostanete přehled toho, co pro svou cestu ohlídat. Konkrétní cenu a nabídku připraví poradce podle aktuálních sazeb a doplněných údajů."],
          ["Co když nevím přesnou obtížnost nebo hloubku?", "Vyberte „Nevím“. Poradce s vámi upřesní plánované aktivity. Nejasný údaj nepovažujeme za potvrzení, že je aktivita pojištěná."],
          ["Je odesláním poptávky cesta pojištěná?", "Ještě ne. Poptávka zahájí konzultaci. Vznik a počátek pojištění se řídí následně sjednanou smlouvou a podmínkami úhrady pojistného."],
        ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}
      </div></section>
      <footer className={styles.bottom}><span>Cestovní pojištění · {advisorName}</span><a href={`/vizitka/${slug}`}>Zpět na vizitku <ArrowUpRight size={14} /></a></footer>
    </div>
    <div className={styles.mobileBar}>{phoneHref && <a href={`tel:${phoneHref}`} aria-label="Zavolat poradci" onClick={() => void trackOnlineCardEvent(slug, "phone_click")}><Phone size={19} /></a>}<button onClick={() => start(intent)} disabled={submitting}>{started ? "Zpět k mému plánu" : "Připravit můj plán"}<ArrowRight size={16} /></button></div>
  </main>;
}
