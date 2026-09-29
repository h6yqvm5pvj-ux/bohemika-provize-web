"use client";

import { useEffect, useReducer, useRef, useState, type CSSProperties, type TextareaHTMLAttributes } from "react";
import type { User } from "firebase/auth";
import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, Check, ChevronDown, Copy, Download, Eye, FilePlus2, FileUp, Layers3, LoaderCircle, Plus, Redo2, Save, Search, Settings2, Sparkles, Trash2, Undo2, UserRound } from "lucide-react";
import Image from "next/image";
import { PdfDocumentPreview } from "@/components/PdfDocumentPreview";
import { auth } from "@/app/firebase-auth";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import { reportAdvisorFromProfile } from "../neon-life-vs-metlife-oneguard/comparisonReportContent";
import { ContactQrCode } from "../tvorba/ContactQrCode";
import { contactQr, type ContactDetails } from "../tvorba/contactQr";
import { COMPARISON_ICONS, ComparisonIcon } from "./icons";
import { INSURERS, insurerById, normalizeSearch } from "./insurers";
import { productsForInsurer } from "./products";
import { addOffer, appendCoverage, appendTemplate, changeRowCoverage, clientName, comparisonCellText, createDocument, createRow, emptyCell, emptyContact, fileStem, insurerName, moveItem, newId, parseDocument, recommendOffer, removeOffer, TONES, type ComparisonCell, type ComparisonDocument, type ComparisonRow, type Offer } from "./model";
import { INSURANCE_TYPES, type InsuranceType } from "./lifeCoverage";
import { ALL_COVERAGES, coverageEditKey, createCoverageDetails, type CoverageKind } from "./coverage";
import { CatalogCoverageFields } from "./CatalogCoverageFields";
import { CoverageSuggestions } from "./CoverageSuggestions";
import { LifeCoverageFields } from "./LifeCoverageFields";
import { PickerDialog } from "./PickerDialog";
import { StickyOfferHeader } from "./StickyOfferHeader";
import { formatPremium } from "./money";
import type { PdfOrientation } from "./pdf";
import styles from "./comparison.module.css";

type History = { doc: ComparisonDocument; past: ComparisonDocument[]; future: ComparisonDocument[]; editKey?: string; at?: number };
type Action = { type: "edit"; change: (doc: ComparisonDocument) => ComparisonDocument; editKey?: string; at: number } | { type: "undo" | "redo" };
function reducer(state: History, action: Action): History {
  if (action.type === "undo") return state.past.length ? { doc: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.doc, ...state.future] } : state;
  if (action.type === "redo") return state.future.length ? { doc: state.future[0], past: [...state.past, state.doc], future: state.future.slice(1) } : state;
  if (action.type !== "edit") return state;
  const doc = action.change(state.doc);
  if (doc === state.doc) return state;
  const grouped = action.editKey && action.editKey === state.editKey && action.at - (state.at ?? 0) < 1500;
  return { doc, past: grouped ? state.past : [...state.past.slice(-39), state.doc], future: [], editKey: action.editKey, at: action.at };
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    const resize = () => { node.style.height = "auto"; node.style.height = `${Math.max(40, node.scrollHeight)}px`; };
    resize();
    let frame = 0;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width !== lastWidth) { lastWidth = width; cancelAnimationFrame(frame); frame = requestAnimationFrame(resize); }
    }) : null;
    let lastWidth = node.getBoundingClientRect().width;
    observer?.observe(node);
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); };
  }, [props.value]);
  return <textarea ref={ref} rows={1} maxLength={20_000} {...props} />;
}

function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function ComparisonEditor({ user }: { user: User }) {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({ doc: createDocument(), past: [], future: [] }));
  const doc = history.doc;
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [advisor, setAdvisor] = useState<ContactDetails>({ ...emptyContact, fullName: user.displayName || "", email: user.email || "" });
  const [cardUrl, setCardUrl] = useState("");
  const [useOnlineCard, setUseOnlineCard] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [profileRetry, setProfileRetry] = useState(0);
  const advisorEdited = useRef(new Set<keyof ContactDetails>());
  const [picker, setPicker] = useState<{ type: "insurer" | "icon"; id: string } | null>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; blob: Blob; data: Uint8Array; orientation: PdfOrientation } | null>(null);
  const [pendingDocument, setPendingDocument] = useState<ComparisonDocument | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const saved = useRef(JSON.stringify(doc));
  const current = useRef(doc);
  const exporting = useRef(false);
  const pdfRequest = useRef(0);
  useEffect(() => { current.current = doc; }, [doc]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (saved.current === JSON.stringify(current.current)) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, []);
  useEffect(() => {
    let cancelled = false;
    getUserProfileCached(user, { force: profileRetry > 0 }).then(payload => {
      if (cancelled || auth.currentUser?.uid !== user.uid || readAdminImpersonationState()) return;
      const profile = payload.profile || {};
      const identity = reportAdvisorFromProfile(profile, user.email || "", window.location.origin);
      const footer = profile.tvorbaFooterProfile && typeof profile.tvorbaFooterProfile === "object" ? profile.tvorbaFooterProfile as Record<string, unknown> : {};
      const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;
      const loaded: ContactDetails = {
        fullName: text(footer.fullName, identity.fullName || user.displayName || ""), jobTitle: text(footer.jobTitle, identity.title),
        email: text(footer.email, identity.email), phone: text(footer.phone, identity.phone), companyId: text(footer.companyId, identity.ico), officeAddress: text(footer.officeAddress, ""),
      };
      setAdvisor(previous => Object.fromEntries(Object.entries(loaded).map(([key, value]) => [key, advisorEdited.current.has(key as keyof ContactDetails) ? previous[key as keyof ContactDetails] : value])) as ContactDetails);
      setCardUrl(identity.cardUrl); setProfileError("");
    }).catch(() => { if (!cancelled) setProfileError("Vizitku se nepodařilo načíst. Údaje můžeš doplnit ručně."); });
    return () => { cancelled = true; };
  }, [user, profileRetry]);

  const edit = (change: (doc: ComparisonDocument) => ComparisonDocument, editKey?: string) => {
    dispatch({ type: "edit", change, editKey, at: Date.now() }); setNotice(""); setError("");
  };
  const field = (key: "title" | "firstName" | "lastName" | "date" | "introduction" | "notesTitle" | "notes", value: string) => edit(doc => ({ ...doc, [key]: value }), key);
  const patchOffer = (id: string, patch: Partial<Offer>, key?: string) => edit(doc => ({ ...doc, offers: doc.offers.map(offer => offer.id === id ? { ...offer, ...patch } : offer) }), key ? `${id}:${key}` : undefined);
  const chooseInsurer = (id: string, insurerId: string) => {
    edit(doc => ({ ...doc, offers: doc.offers.map(offer => offer.id === id ? {
      ...offer, insurerId, product: offer.insurerId && offer.insurerId !== insurerId ? "" : offer.product,
    } : offer) }));
    setPicker(null);
  };
  const patchRow = (id: string, patch: Partial<ComparisonRow>, key?: string) => edit(doc => ({ ...doc, rows: doc.rows.map(row => row.id === id ? { ...row, ...patch } : row) }), key ? `${id}:${key}` : undefined);
  const patchCell = (rowId: string, offerId: string, patch: Partial<ComparisonCell>) => {
    const detailKey = patch.details ? coverageEditKey(doc.rows.find(row => row.id === rowId)?.cells[offerId]?.details, patch.details) : undefined;
    edit(doc => ({ ...doc, rows: doc.rows.map(row => row.id === rowId ? { ...row, cells: { ...row.cells, [offerId]: { ...row.cells[offerId], ...patch } } } : row) }), "text" in patch ? `${rowId}:${offerId}:text` : detailKey ? `${rowId}:${offerId}:${detailKey}` : undefined);
  };
  const qr = contactQr(advisor, useOnlineCard ? cardUrl : "");
  const pickerOffer = picker ? doc.offers.find(offer => offer.id === picker.id) : undefined;
  const validOwner = () => alive.current && auth.currentUser?.uid === user.uid && !readAdminImpersonationState();

  const save = () => {
    if (!validOwner()) return;
    downloadFile(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }), `${fileStem(doc)}.bohemika.json`);
    saved.current = JSON.stringify(doc); setNotice("Koncept je připravený ke stažení. Později ho otevřeš přes Otevřít koncept.");
  };
  const exportPdf = async (showPreview: boolean, orientation: PdfOrientation = pdfOrientation ?? (doc.offers.length === 2 ? "portrait" : "landscape")) => {
    if (exporting.current || !validOwner()) return;
    if (!doc.firstName.trim() || !doc.lastName.trim()) { setError("Doplň jméno a příjmení klienta pro hlavičku PDF."); return; }
    if (doc.offers.some(offer => !offer.insurerId || (offer.insurerId === "custom" && !offer.customInsurer.trim()))) { setError("Vyber pojišťovnu u každé smlouvy a nabídky."); return; }
    if (!doc.rows.some(row => row.kind === "item" && (row.label.trim() || Object.values(row.cells).some(cell => comparisonCellText(cell))))) { setError("Přidej alespoň jednu položku srovnání."); return; }
    if (!qr) { setError("Doplň kontakt poradce v části Moje vizitka, aby PDF obsahovalo QR kód."); return; }
    exporting.current = true; setBusy(true); setError(""); setProgress("Připravuji PDF…");
    const request = ++pdfRequest.current;
    const validExport = () => validOwner() && pdfRequest.current === request;
    try {
      const { createComparisonPdf } = await import("./pdf");
      const blob = await createComparisonPdf({ doc, advisor, contact: qr, orientation, onProgress: message => { if (validExport()) setProgress(message); } });
      if (!validExport()) return;
      const name = `${fileStem(doc)}.pdf`;
      if (showPreview) {
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!validExport()) return;
        setPreview({ url: URL.createObjectURL(blob), name, blob, data, orientation });
      }
      else { downloadFile(blob, name); setNotice("PDF je připravené ke stažení."); }
    } catch (cause) {
      if (validExport()) {
        if (preview) setPdfOrientation(preview.orientation);
        setError(cause instanceof Error ? cause.message : "PDF se nepodařilo vytvořit. Zkus to znovu.");
      }
    } finally { exporting.current = false; if (alive.current) { setBusy(false); setProgress(""); } }
  };

  return <>
    <header className={styles.hero}>
      <div><div className={styles.eyebrow}><ArrowLeftRight size={14} /> PROSTOR PRO LEPŠÍ SROVNÁNÍ</div><h1>Srovnání <span>nabídek.</span></h1><p>Současná smlouva a tvoje návrhy. Přehledně, vedle sebe, podle tebe.</p></div>
      <div className={styles.heroArt} aria-hidden="true"><div><span>NYNÍ</span><i /><i /><i /></div><div><span>NOVÁ NABÍDKA</span><Check size={22} /><i /><i /></div><span className={styles.artBadge}><Sparkles size={16} /></span></div>
    </header>

    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <button type="button" className={styles.secondary} onClick={save}><Save size={16} /><span>Uložit koncept</span></button>
        <button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}><FileUp size={16} /><span>Otevřít koncept</span></button>
        <button type="button" className={styles.iconButton} title="Nové srovnání" aria-label="Nové srovnání" onClick={() => setConfirmNew(true)}><FilePlus2 size={18} /></button>
        <span className={styles.divider} />
        <button type="button" className={styles.iconButton} disabled={!history.past.length} aria-label="Vrátit změnu" title="Vrátit změnu" onClick={() => dispatch({ type: "undo" })}><Undo2 size={18} /></button>
        <button type="button" className={styles.iconButton} disabled={!history.future.length} aria-label="Zopakovat změnu" title="Zopakovat změnu" onClick={() => dispatch({ type: "redo" })}><Redo2 size={18} /></button>
      </div>
      <div className={styles.toolbarGroup}><button type="button" className={styles.secondary} disabled={busy} onClick={() => void exportPdf(true)}><Eye size={17} />Náhled PDF</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void exportPdf(false)}>{busy ? <LoaderCircle size={17} className={styles.spin} /> : <Download size={17} />}{busy ? "Připravuji…" : "Stáhnout PDF"}</button></div>
    </div>
    <input ref={fileInput} type="file" hidden accept=".json,application/json" aria-label="Soubor konceptu" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      try {
        if (file.size > 5_000_000) throw new Error("Soubor je příliš velký. Maximum je 5 MB.");
        const imported = parseDocument(await file.text()); if (!validOwner()) return;
        if (saved.current !== JSON.stringify(current.current)) setPendingDocument(imported);
        else { edit(() => imported); saved.current = JSON.stringify(imported); setNotice("Koncept je otevřený. Můžeš pokračovat v úpravách."); }
      } catch (cause) { if (validOwner()) setError(cause instanceof Error ? cause.message : "Soubor nelze otevřít."); }
    }} />
    {error && !preview && <div className={styles.error} role="alert">{error}</div>}
    {(notice || progress) && <div className={styles.notice} role="status">{progress || notice}</div>}

    <section className={styles.clientCard} aria-labelledby="client-heading">
      <div className={styles.sectionHeading}><span className={styles.sectionIcon}><UserRound size={19} /></span><div><h2 id="client-heading">Pro koho srovnání připravuješ?</h2><p>Tyto údaje se objeví v hlavičce dokumentu.</p></div></div>
      <div className={styles.clientFields}>
        <label>Jméno klienta<input value={doc.firstName} maxLength={100} autoComplete="off" placeholder="Jméno" onChange={event => field("firstName", event.target.value)} /></label>
        <label>Příjmení klienta<input value={doc.lastName} maxLength={100} autoComplete="off" placeholder="Příjmení" onChange={event => field("lastName", event.target.value)} /></label>
        <label>Název dokumentu<input value={doc.title} maxLength={120} onChange={event => field("title", event.target.value)} /></label>
        <label>Datum<input type="date" value={doc.date} onChange={event => field("date", event.target.value)} /></label>
      </div>
      <label className={styles.introduction}>Úvodní text <span>volitelné</span><Textarea placeholder="Např. Připravil jsem pro vás srovnání současného pojištění a navrhované úpravy…" value={doc.introduction} onChange={event => field("introduction", event.target.value)} /></label>
    </section>

    <section className={styles.editorCard} aria-labelledby="comparison-heading">
      <div className={styles.editorHeading}><div><span className={styles.eyebrow}>TVÉ VLASTNÍ SROVNÁNÍ</span><h2 id="comparison-heading">Vše podstatné na jednom místě</h2></div><button type="button" className={styles.secondary} onClick={() => edit(addOffer)}><Plus size={16} />Přidat nabídku</button></div>
      <div className={styles.insuranceTypeBar}>
        <label>Co srovnáváme?<select value={doc.insuranceType} aria-label="Druh pojištění" onChange={event => edit(doc => ({ ...doc, insuranceType: event.target.value as InsuranceType }))}>
          <option value="">Vyber druh pojištění</option>
          {INSURANCE_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select></label>
        <p>{doc.insuranceType === "life" ? "Vyber riziko a pro každou smlouvu vyplň jeho parametry." : "Vlastní položky můžeš přidávat a upravovat podle potřeby."}<span>Změna druhu pojištění zachová rozepsané položky.</span></p>
      </div>
      {(doc.insuranceType === "life" || doc.insuranceType === "auto") && <CoverageSuggestions key={doc.insuranceType} category={doc.insuranceType} onAdd={kind => edit(doc => appendCoverage(doc, kind))} onTemplate={() => edit(doc => appendTemplate(doc, doc.insuranceType))} />}
      {doc.insuranceType === "property" && <div className={styles.templateBar}><button type="button" onClick={() => edit(doc => appendTemplate(doc, "property"))}><Layers3 size={15} />Přidat základní položky</button></div>}
      {doc.rows.some(row => row.coverage) && <div className={styles.parametersBar}>
        <span>Zobrazení tabulky</span>
        <button type="button" onClick={() => setCollapsedRows(new Set(doc.rows.filter(row => row.coverage).map(row => row.id)))}><Eye size={14} />Stručný přehled</button>
        <button type="button" onClick={() => setCollapsedRows(new Set())}><Settings2 size={14} />Upravit parametry</button>
      </div>}
      <StickyOfferHeader offers={doc.offers} recommendedOfferId={doc.recommendedOfferId} scrollRef={tableScrollRef} />
      <div ref={tableScrollRef} className={styles.tableScroll} role="region" aria-label="Editor srovnání smluv — posunutím zobrazíš další nabídky" tabIndex={0}>
        <table className={styles.table} style={{ "--offer-count": doc.offers.length } as CSSProperties}>
          <colgroup><col className={styles.labelColumn} />{doc.offers.map(offer => <col key={offer.id} />)}</colgroup>
          <thead><tr><th scope="col" className={styles.corner}><span>CO POROVNÁVÁME</span><h3>Krytí, limity<br />a vše ostatní.</h3><p>Řádky si pojmenuj po svém. Do hodnot můžeš psát částky i libovolný text.</p><span className={styles.rowCount}>{doc.rows.filter(row => row.kind === "item").length} položek · {doc.offers.length} smlouvy / nabídky</span></th>
            {doc.offers.map((offer, index) => <th scope="col" key={offer.id} className={styles.offerHeader} data-current={index === 0} data-recommended={doc.recommendedOfferId === offer.id}>
              <div className={styles.offerTop}><span className={styles.offerBadge}>{doc.recommendedOfferId === offer.id ? <><span className={styles.recommendedCheck}><Check size={13} strokeWidth={3} aria-hidden="true" /></span>DOPORUČENO</> : index === 0 ? "SOUČASNÁ SMLOUVA" : `NABÍDKA ${index}`}</span><div className={styles.smallActions}>
                {index > 0 && <><button type="button" className={styles.iconButton} disabled={index === 1} title="Posunout nabídku doleva" aria-label={`Posunout nabídku ${index} doleva`} onClick={() => edit(doc => ({ ...doc, offers: moveItem(doc.offers, index, -1) }))}><ArrowLeft size={14} /></button><button type="button" className={styles.iconButton} disabled={index === doc.offers.length - 1} title="Posunout nabídku doprava" aria-label={`Posunout nabídku ${index} doprava`} onClick={() => edit(doc => ({ ...doc, offers: moveItem(doc.offers, index, 1) }))}><ArrowRight size={14} /></button><button type="button" className={styles.iconButton} disabled={doc.offers.length <= 2} title="Odebrat nabídku" aria-label={`Odebrat nabídku ${index}`} onClick={() => edit(doc => removeOffer(doc, offer.id))}><Trash2 size={14} /></button></>}
              </div></div>
              <input className={styles.offerTitle} aria-label={`Popisek sloupce ${index + 1}`} maxLength={80} value={offer.label} placeholder="Název sloupce" onChange={event => patchOffer(offer.id, { label: event.target.value }, "label")} />
              <button type="button" className={styles.insurerButton} data-comparison-offer-identity onClick={() => { setSearch(""); setPicker({ type: "insurer", id: offer.id }); }} aria-label={`Vybrat pojišťovnu: ${offer.label}`}>
                {insurerById(offer.insurerId) ? <Image src={insurerById(offer.insurerId)!.logo} width={85} height={39} alt="" unoptimized /> : <span className={styles.insurerPlaceholder}><ComparisonIcon name="shield" size={26} /></span>}
                <span>{offer.insurerId ? insurerName(offer) : "Vybrat pojišťovnu"}<small>Logo a název</small></span><ChevronDown size={16} />
              </button>
              {offer.insurerId === "custom" && <label>Název pojišťovny<input maxLength={120} value={offer.customInsurer} placeholder="Vlastní pojišťovna" onChange={event => patchOffer(offer.id, { customInsurer: event.target.value }, "customInsurer")} /></label>}
              {productsForInsurer(offer.insurerId, doc.insuranceType).length > 0 && <label>Produkt<select aria-label={`Vybrat produkt: ${offer.label}`} value={productsForInsurer(offer.insurerId, doc.insuranceType).includes(offer.product) ? offer.product : ""} onChange={event => patchOffer(offer.id, { product: event.target.value })}>
                <option value="">Vybrat / vlastní produkt…</option>
                {productsForInsurer(offer.insurerId, doc.insuranceType).map(product => <option key={product} value={product}>{product}</option>)}
              </select></label>}
              <label>Název produktu<input maxLength={160} value={offer.product} aria-label={`Produkt: ${offer.label}`} placeholder="Vlastní název nebo úprava produktu" onChange={event => patchOffer(offer.id, { product: event.target.value }, "product")} /></label>
              <div className={styles.offerFields}><label>Ročník / verze<input maxLength={40} value={offer.year} placeholder="Např. 2024" aria-label={`Ročník: ${offer.label}`} onChange={event => patchOffer(offer.id, { year: event.target.value }, "year")} /></label><label>Pojistné<input maxLength={100} value={offer.premium} placeholder="Např. 850 Kč / měs." aria-label={`Pojistné: ${offer.label}`} onChange={event => patchOffer(offer.id, { premium: event.target.value }, "premium")} onBlur={event => { const premium = formatPremium(event.target.value); if (premium !== offer.premium) patchOffer(offer.id, { premium }, "premium"); }} /></label></div>
              {index > 0 && <button type="button" className={styles.recommendButton} aria-pressed={doc.recommendedOfferId === offer.id} aria-label={`${doc.recommendedOfferId === offer.id ? "Zrušit doporučení" : "Doporučit nabídku"}: ${offer.label}`} onClick={() => edit(doc => recommendOffer(doc, doc.recommendedOfferId === offer.id ? undefined : offer.id))}><Check size={14} aria-hidden="true" />{doc.recommendedOfferId === offer.id ? "Zrušit doporučení" : "Označit jako doporučené"}</button>}
            </th>)}
          </tr></thead>
          <tbody>{doc.rows.map((row, rowIndex) => <tr key={row.id} data-section={row.kind === "section"}>
            <th scope="row" colSpan={row.kind === "section" ? doc.offers.length + 1 : 1}>
              {row.kind === "item" && (doc.insuranceType === "life" || doc.insuranceType === "auto" || row.coverage) && <label className={styles.rowTypeLabel}>Co je pojištěno<select aria-label={`Typ položky ${rowIndex + 1}`} value={row.coverage || "custom"} onChange={event => edit(doc => ({ ...doc, rows: doc.rows.map(item => item.id === row.id ? changeRowCoverage(item, event.target.value === "custom" ? undefined : event.target.value as CoverageKind) : item) }))}>
                <option value="custom">Vlastní položka</option>{ALL_COVERAGES.filter(coverage => coverage.category === doc.insuranceType || coverage.id === row.coverage).map(coverage => <option key={coverage.id} value={coverage.id}>{coverage.label}</option>)}
              </select></label>}
              <div className={styles.rowLabel}><button type="button" className={styles.rowIcon} aria-label={`Vybrat ikonu řádku ${rowIndex + 1}`} title="Vybrat ikonu" onClick={() => setPicker({ type: "icon", id: row.id })}>{row.icon === "none" ? <Plus size={15} /> : <ComparisonIcon name={row.icon} />}</button><Textarea maxLength={2000} value={row.label} aria-label={`${row.kind === "section" ? "Název skupiny" : "Název položky"} ${rowIndex + 1}`} placeholder={row.kind === "section" ? "Název skupiny…" : "Co je pojištěno…"} onChange={event => patchRow(row.id, { label: event.target.value }, "label")} /></div>
              {row.coverage && <button type="button" className={styles.rowToggle} aria-label={`${collapsedRows.has(row.id) ? "Rozbalit" : "Sbalit"} parametry řádku ${rowIndex + 1}`} aria-expanded={!collapsedRows.has(row.id)} onClick={() => setCollapsedRows(previous => { const next = new Set(previous); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })}><ChevronDown size={13} />{collapsedRows.has(row.id) ? "Upravit parametry" : "Sbalit parametry"}</button>}
              <div className={styles.rowActions}><span>{row.kind === "section" ? "SKUPINA" : String(rowIndex + 1).padStart(2, "0")}</span><button type="button" aria-label={`Posunout řádek ${rowIndex + 1} nahoru`} disabled={rowIndex === 0} onClick={() => edit(doc => ({ ...doc, rows: moveItem(doc.rows, rowIndex, -1) }))}><ArrowUp size={13} /></button><button type="button" aria-label={`Posunout řádek ${rowIndex + 1} dolů`} disabled={rowIndex === doc.rows.length - 1} onClick={() => edit(doc => ({ ...doc, rows: moveItem(doc.rows, rowIndex, 1) }))}><ArrowDown size={13} /></button><button type="button" aria-label={`Duplikovat řádek ${rowIndex + 1}`} title="Duplikovat řádek" onClick={() => edit(doc => ({ ...doc, rows: [...doc.rows.slice(0, rowIndex + 1), { ...row, id: newId(), cells: structuredClone(row.cells) }, ...doc.rows.slice(rowIndex + 1)] }))}><Copy size={13} /></button><button type="button" aria-label={`Smazat řádek ${rowIndex + 1}`} title="Smazat řádek" onClick={() => edit(doc => ({ ...doc, rows: doc.rows.filter(item => item.id !== row.id) }))}><Trash2 size={13} /></button></div>
            </th>
            {row.kind === "item" && doc.offers.map(offer => { const cell = row.cells[offer.id] || emptyCell(); const tone = TONES.find(tone => tone.id === cell.tone)!; return <td key={offer.id} data-tone={cell.tone}>
              {row.coverage && <div className={styles.cellContext}>{offer.label || "Nabídka"}{offer.insurerId && <span> · {insurerName(offer)}</span>}</div>}
              {row.coverage && collapsedRows.has(row.id) ? <div className={styles.cellSummary}>{comparisonCellText(cell) || "Parametry zatím nejsou vyplněné."}</div> : <>
              {row.coverage && (() => {
                const details = cell.details || createCoverageDetails(row.coverage);
                const context = `${row.label} — ${offer.label}`;
                return "values" in details
                  ? <CatalogCoverageFields value={details} context={context} onChange={details => patchCell(row.id, offer.id, { details })} />
                  : <LifeCoverageFields value={details} context={context} onChange={details => patchCell(row.id, offer.id, { details })} />;
              })()}
              <div className={styles.cellValue}>{tone.icon !== "none" && <ComparisonIcon name={tone.icon} size={16} />}<Textarea value={cell.text} aria-label={`${row.coverage ? "Poznámka — " : ""}${row.label || `Položka ${rowIndex + 1}`} — ${offer.label}`} placeholder={row.coverage ? "Vlastní poznámka k této položce…" : "Částka, limit, podmínky…"} onChange={event => patchCell(row.id, offer.id, { text: event.target.value })} /></div>
              </>}
              <div className={styles.tonePicker} role="group" aria-label={`Zvýraznění: ${row.label || rowIndex + 1} — ${offer.label}`}>{TONES.map(tone => <button type="button" key={tone.id} data-tone={tone.id} aria-label={tone.label} title={tone.label} aria-pressed={cell.tone === tone.id} onClick={() => patchCell(row.id, offer.id, { tone: tone.id })}>{tone.icon === "none" ? <span className={styles.neutralDot} /> : <ComparisonIcon name={tone.icon} size={12} />}</button>)}</div>
            </td>; })}
          </tr>)}
          {!doc.rows.length && <tr><td colSpan={doc.offers.length + 1} className={styles.empty}>Začni vlastní položkou nebo si nahoře vyber sadu pro konkrétní pojištění.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={styles.addRowBar}><button type="button" className={styles.secondary} onClick={() => edit(doc => ({ ...doc, rows: [...doc.rows, createRow(doc.offers)] }))}><Plus size={16} />Přidat položku</button><button type="button" className={styles.textButton} onClick={() => edit(doc => ({ ...doc, rows: [...doc.rows, createRow(doc.offers, "", "shield", "section")] }))}><Layers3 size={16} />Přidat skupinu</button><span>Ikony i barevné zvýraznění se přenesou do PDF.</span></div>
    </section>

    <div className={styles.bottomGrid}>
      <section className={styles.notesCard} aria-label="Poznámky ke srovnání"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><ComparisonIcon name="info" /></span><div><h2>Prostor pro souvislosti</h2><p>Co by měl klient vědět, než se rozhodne.</p></div></div>
        <label>Nadpis poznámek<input maxLength={120} value={doc.notesTitle} onChange={event => field("notesTitle", event.target.value)} /></label><label>Poznámky a doporučení<Textarea className={styles.notesArea} placeholder="Doplň rozdíly v podmínkách, důležité výluky, důvody doporučení nebo další postup…" value={doc.notes} onChange={event => field("notes", event.target.value)} /></label>
        <details className={styles.details}><summary>Poznámky k jednotlivým nabídkám<ChevronDown size={16} /></summary><div>{doc.offers.map(offer => <label key={offer.id}>{offer.label}<Textarea value={offer.note} placeholder="Doplňující informace k této variantě…" onChange={event => patchOffer(offer.id, { note: event.target.value }, "note")} /></label>)}</div></details>
      </section>
      <section className={styles.contactCard} aria-labelledby="advisor-heading"><div className={styles.sectionHeading}><span className={styles.sectionIcon}><UserRound size={19} /></span><div><h2 id="advisor-heading">Moje vizitka</h2><p>Kontakt a QR v patičce poslední strany PDF.</p></div></div>
        <div className={styles.contactPreview}><div><span className={styles.eyebrow}>JSEM TU PRO VÁS</span><strong>{advisor.fullName || "Tvoje jméno"}</strong><span>{advisor.jobTitle}</span><span>{[advisor.phone, advisor.email].filter(Boolean).join(" · ")}</span></div>{qr && <div className={styles.qrPreview}><ContactQrCode payload={qr.payload} /><small>{qr.label}</small></div>}</div>
        {profileError && <p className={styles.profileError} role="status">{profileError} <button type="button" onClick={() => setProfileRetry(value => value + 1)}>Zkusit znovu</button></p>}
        <details className={styles.details}><summary><span><Settings2 size={15} />Upravit údaje vizitky</span><ChevronDown size={16} /></summary><div className={styles.advisorFields}>{([
          ["fullName", "Jméno poradce"], ["jobTitle", "Pozice"], ["phone", "Telefon"], ["email", "E-mail"], ["companyId", "IČO"], ["officeAddress", "Adresa kanceláře"],
        ] as const).map(([key, label]) => <label key={key}>{label}<input type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} maxLength={key === "officeAddress" ? 220 : 120} value={advisor[key]} onChange={event => { advisorEdited.current.add(key); setAdvisor(previous => ({ ...previous, [key]: event.target.value })); }} /></label>)}</div></details>
        {cardUrl ? <label className={styles.checkbox}><input type="checkbox" checked={useOnlineCard} onChange={event => setUseOnlineCard(event.target.checked)} />QR otevře moji online vizitku</label> : <p className={styles.hint}>QR umožní klientovi uložit tvůj kontakt do telefonu.</p>}
      </section>
    </div>
    <p className={styles.footnote}>Rozpracované srovnání si ulož přes Uložit koncept. Soubor můžeš kdykoliv znovu otevřít a upravit.</p>

    {picker && <PickerDialog title={picker.type === "insurer" ? "Vyber pojišťovnu" : "Vyber ikonu"} onClose={() => setPicker(null)}>
      {picker.type === "insurer" ? <><div className={styles.search}><Search size={17} /><input autoFocus aria-label="Hledat pojišťovnu" placeholder="Název pojišťovny…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className={styles.insurerGrid}>
        {INSURERS.filter(insurer => normalizeSearch(insurer.name).includes(normalizeSearch(search))).map(insurer => <button type="button" key={insurer.id} aria-pressed={pickerOffer?.insurerId === insurer.id} onClick={() => chooseInsurer(picker.id, insurer.id)}><Image src={insurer.logo} width={85} height={39} alt="" unoptimized /><span>{insurer.name}</span></button>)}
        <button type="button" onClick={() => chooseInsurer(picker.id, "custom")}><ComparisonIcon name="shield" size={29} /><span>Jiná pojišťovna</span></button>
      </div></> : <div className={styles.iconGrid}>{COMPARISON_ICONS.map(icon => <button type="button" key={icon.id} aria-pressed={doc.rows.find(row => row.id === picker.id)?.icon === icon.id} onClick={() => { patchRow(picker.id, { icon: icon.id }); setPicker(null); }}><ComparisonIcon name={icon.id} size={25} /><span>{icon.label}</span></button>)}</div>}
    </PickerDialog>}
    {preview && <PickerDialog title={`Náhled · ${clientName(doc)}`} wide onClose={() => { pdfRequest.current++; setPreview(null); }}>
      <div className={styles.pdfActions}>
        <label className={styles.pdfOrientation}>Orientace PDF<select aria-label="Orientace PDF" value={pdfOrientation ?? preview.orientation} disabled={busy} onChange={event => {
          const orientation = event.target.value as PdfOrientation;
          setPdfOrientation(orientation); void exportPdf(true, orientation);
        }}><option value="portrait">Na výšku</option><option value="landscape">Na šířku</option></select></label>
        <p>Hotové PDF s vizitkou a QR kódem na poslední stránce.</p>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => downloadFile(preview.blob, preview.name)}><Download size={16} />Stáhnout PDF</button>
        {!busy && <a href={preview.url} target="_blank" rel="noopener noreferrer">Otevřít samostatně</a>}
      </div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.pdfPreview} role="region" aria-label="Náhled srovnání v PDF" aria-busy={busy} tabIndex={0}>
        {busy ? <div className={styles.pdfLoading} role="status"><LoaderCircle size={22} className={styles.spin} />{progress || "Připravuji náhled…"}</div> : <PdfDocumentPreview pdfData={preview.data} name={preview.name} />}
      </div>
    </PickerDialog>}
    {(confirmNew || pendingDocument) && <PickerDialog title={pendingDocument ? "Otevřít jiné srovnání?" : "Začít nové srovnání?"} onClose={() => { setConfirmNew(false); setPendingDocument(null); }}><p className={styles.confirmText}>Před pokračováním si můžeš stáhnout současný koncept. Nahrazení také můžeš vrátit tlačítkem Vrátit změnu.</p><div className={styles.confirmActions}><button type="button" className={styles.secondary} onClick={save}><Save size={16} />Uložit současný koncept</button><button type="button" className={styles.primary} onClick={() => { const next = pendingDocument || createDocument(); edit(() => next); saved.current = JSON.stringify(next); setPendingDocument(null); setConfirmNew(false); }}>{pendingDocument ? "Otevřít vybraný koncept" : "Vytvořit prázdné srovnání"}</button></div></PickerDialog>}
  </>;
}
