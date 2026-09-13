"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Position } from "@/app/types/domain";
import { positionLabel } from "@/app/lib/formatters";
import { Check, SlidersHorizontal, Search, X, RotateCcw, FileText, WalletCards, UsersRound, CalendarDays, ArrowDownUp } from "lucide-react";
import { CATEGORY_DEFS, INSTITUTION_DEFS, INSTITUTION_LOGO_BY_ID } from "./contractsPageFilters";
import { COMMISSION_AUDIT_MODE_DEFS, COMMISSION_AUDIT_CODE_DEFS } from "./contractFilterOptions";
import { normalizeSearchValue } from "./contractsPageStorage";
import {
  contractFilterCount, emptyContractFilterSelection, setCommissionFilterMode,
  setContractFilterMode, toggleContractStatus, toggleFilterValue, toggleUnpaidFilter,
  type ContractFilterSelection,
} from "./contractFilterSelection";
import styles from "./contractFilters.module.css";

type Adviser = { email: string; label: string };
type FilterTab = "contracts" | "commissions" | "advisers";

function Choice({ checked, onChange, children, name, radio = false, description }: {
  checked: boolean; onChange: () => void; children: ReactNode; name?: string; radio?: boolean; description?: string;
}) {
  return <label className={styles.choice} data-checked={checked}>
    <input type={radio ? "radio" : "checkbox"} name={name} checked={checked} onChange={onChange} />
    <span className={styles.check} data-radio={radio} aria-hidden="true">{checked && <Check size={12} strokeWidth={2.8} />}</span>
    <span className={styles.choiceText}><span>{children}</span>{description && <small>{description}</small>}</span>
  </label>;
}

export function ContractFiltersDialog({ value, advisers, availablePositions, canShowTeam, onApply, onClose }: {
  value: ContractFilterSelection;
  advisers: Adviser[];
  availablePositions: Position[];
  canShowTeam: boolean;
  onApply: (value: ContractFilterSelection) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ContractFilterSelection>(() => ({ ...value,
    selectedCategories: [...value.selectedCategories], selectedInstitutions: [...value.selectedInstitutions],
    selectedPositions: [...value.selectedPositions],
    selectedSubordinates: canShowTeam ? [...value.selectedSubordinates] : [],
  }));
  const [tab, setTab] = useState<FilterTab>("contracts");
  const [search, setSearch] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  const id = useId();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])') ?? [])]
        .filter(control => !control.closest("[hidden]") && control.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, []);

  const change = (patch: Partial<ContractFilterSelection>) => setDraft(current => ({ ...current, ...patch }));
  const count = contractFilterCount(draft);
  const normalizedSearch = normalizeSearchValue(search);
  const visibleAdvisers = advisers.filter(member => normalizeSearchValue(`${member.label} ${member.email}`).includes(normalizedSearch));
  const selectedVisible = visibleAdvisers.filter(member => draft.selectedSubordinates.includes(member.email)).length;
  const allVisibleSelected = visibleAdvisers.length > 0 && selectedVisible === visibleAdvisers.length;
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (draft.filterMode === "anniversary") chips.push({ key: "anniversary", label: "Výročí do 90 dnů", remove: () => change({ filterMode: "latest" }) });
  for (const [key, label] of [["showActiveOnly", "Aktivní"], ["showStornoOnly", "Stornované"], ["showMaturedOnly", "Dožité"], ["showUnpaidOnly", "Nezaplacené"], ["showRefreshOnly", "Refresh / náhrada"]] as const) {
    if (draft[key]) chips.push({ key, label, remove: () => change({ [key]: false }) });
  }
  for (const item of CATEGORY_DEFS) if (draft.selectedCategories.includes(item.id)) chips.push({ key: `category-${item.id}`, label: item.label, remove: () => change({ selectedCategories: draft.selectedCategories.filter(key => key !== item.id) }) });
  for (const item of INSTITUTION_DEFS) if (draft.selectedInstitutions.includes(item.id)) chips.push({ key: `institution-${item.id}`, label: item.label, remove: () => change({ selectedInstitutions: draft.selectedInstitutions.filter(key => key !== item.id) }) });
  for (const position of draft.selectedPositions) chips.push({ key: `position-${position}`, label: positionLabel(position), remove: () => change({ selectedPositions: draft.selectedPositions.filter(key => key !== position) }) });
  if (draft.commissionAuditMode !== "off") {
    chips.push({ key: "commission", label: COMMISSION_AUDIT_MODE_DEFS.find(item => item.id === draft.commissionAuditMode)?.label ?? "Provize", remove: () => setDraft(current => setCommissionFilterMode(current, "off")) });
    if (draft.commissionAuditCodeFilter !== "all") chips.push({ key: "code", label: COMMISSION_AUDIT_CODE_DEFS.find(item => item.id === draft.commissionAuditCodeFilter)?.label ?? "Kód provize", remove: () => change({ commissionAuditCodeFilter: "all" }) });
  }
  for (const email of draft.selectedSubordinates) chips.push({ key: email, label: advisers.find(member => member.email === email)?.label ?? email, remove: () => change({ selectedSubordinates: draft.selectedSubordinates.filter(value => value !== email) }) });
  const commissionCount = draft.commissionAuditMode === "off" ? 0 : 1 + Number(draft.commissionAuditCodeFilter !== "all");
  const tabs = [
    { key: "contracts" as const, label: "Smlouvy", icon: FileText, count: count - commissionCount - draft.selectedSubordinates.length },
    { key: "commissions" as const, label: "Provize", icon: WalletCards, count: commissionCount },
    ...(canShowTeam ? [{ key: "advisers" as const, label: "Poradci", icon: UsersRound, count: draft.selectedSubordinates.length }] : []),
  ];

  return <div className={styles.overlay}>
    <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
    <form ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onSubmit={event => { event.preventDefault(); onApply(draft); }}>
      <header className={styles.header}>
        <span className={styles.headerIcon}><SlidersHorizontal size={21} aria-hidden="true" /></span>
        <div><h2 id={`${id}-title`}>Filtry smluv</h2><p id={`${id}-description`}>Najdi přesně ty smlouvy, které potřebuješ.</p></div>
        <button type="button" className={styles.close} aria-label="Zavřít filtry" onClick={onClose}><X size={19} /></button>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Skupiny filtrů">
        {tabs.map(({ key, label, icon: Icon, count }) => <button type="button" key={key} id={`${id}-${key}-tab`} role="tab" aria-selected={tab === key} aria-controls={`${id}-${key}`} tabIndex={tab === key ? 0 : -1}
          onClick={() => setTab(key)} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = tabs.findIndex(item => item.key === tab);
            const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
            setTab(next.key); document.getElementById(`${id}-${next.key}-tab`)?.focus();
          }}><Icon size={16} aria-hidden="true" />{label}{count > 0 && <span className={styles.count}>{count}</span>}</button>)}
      </div>
      <div className={styles.body}>
        <div id={`${id}-contracts`} role="tabpanel" aria-labelledby={`${id}-contracts-tab`} hidden={tab !== "contracts"}>
          <div className={styles.contractSections}>
            <section className={styles.fullWidth}>
              <h3>Zobrazení smluv</h3>
              <div className={styles.modes}>
                <Choice radio name={`${id}-mode`} checked={draft.filterMode === "latest"} onChange={() => setDraft(current => setContractFilterMode(current, "latest"))}><ArrowDownUp size={15} aria-hidden="true" /> Nejnovější</Choice>
                <Choice radio name={`${id}-mode`} checked={draft.filterMode === "anniversary"} onChange={() => setDraft(current => setContractFilterMode(current, "anniversary"))}><CalendarDays size={15} aria-hidden="true" /> Výročí do 90 dnů</Choice>
              </div>
              <p className={styles.hint}>{draft.filterMode === "anniversary" ? "Aktivní smlouvy s blížícím se výročím. Cestovní pojištění se nezahrnuje." : "Smlouvy seřazené od nejnovějšího sjednání nebo dodatku."}</p>
            </section>
            <section>
              <h3>Stav smlouvy</h3>
              <div className={styles.choices}>
                <button type="button" className={styles.allChoice} aria-pressed={!draft.showActiveOnly && !draft.showStornoOnly && !draft.showMaturedOnly} onClick={() => change({ showActiveOnly: false, showStornoOnly: false, showMaturedOnly: false })}>Všechny</button>
                {([["showActiveOnly", "Aktivní"], ["showStornoOnly", "Stornované"], ["showMaturedOnly", "Dožité"]] as const).map(([key, label]) => <Choice key={key} checked={draft[key]} onChange={() => setDraft(current => toggleContractStatus(current, key))}>{label}</Choice>)}
              </div>
            </section>
            <section>
              <h3>Další podmínky</h3>
              <div className={styles.choices}>
                <Choice checked={draft.showUnpaidOnly} onChange={() => setDraft(toggleUnpaidFilter)}>Nezaplacené</Choice>
                <Choice checked={draft.showRefreshOnly} onChange={() => change({ showRefreshOnly: !draft.showRefreshOnly })}>Refresh / náhrada</Choice>
              </div>
              <p className={styles.hint}>Nezaplacené zahrnují aktivní smlouvy bez označené úhrady.</p>
            </section>
            <section className={`${styles.fullWidth} ${styles.divided}`}>
              <h3>Sjednaná pozice <span>Lze vybrat více</span></h3>
              <div className={styles.choices}>
                {availablePositions.map(position => <Choice key={position} checked={draft.selectedPositions.includes(position)} onChange={() => change({ selectedPositions: toggleFilterValue(draft.selectedPositions, position) })}>{positionLabel(position)}</Choice>)}
              </div>
              <p className={styles.hint}>{availablePositions.length ? "Pozice při sjednání smlouvy. V nabídce jsou jen pozice z tvé dosavadní kariéry." : "V historii kariéry zatím nejsou evidované žádné pozice."}</p>
            </section>
            <section className={styles.divided}>
              <h3>Produkt <span>Lze vybrat více</span></h3>
              <div className={styles.categoryGrid}>{CATEGORY_DEFS.map(item => <Choice key={item.id} checked={draft.selectedCategories.includes(item.id)} onChange={() => change({ selectedCategories: toggleFilterValue(draft.selectedCategories, item.id) })}>{item.label}</Choice>)}</div>
            </section>
            <section className={styles.divided}>
              <h3>Pojišťovna / instituce <span>Lze vybrat více</span></h3>
              <div className={styles.institutions}>{INSTITUTION_DEFS.map(item => <Choice key={item.id} checked={draft.selectedInstitutions.includes(item.id)} onChange={() => change({ selectedInstitutions: toggleFilterValue(draft.selectedInstitutions, item.id) })}>
                <span className={styles.institutionLogo}>{INSTITUTION_LOGO_BY_ID[item.id] && <Image src={INSTITUTION_LOGO_BY_ID[item.id]!} alt="" fill sizes="36px" />}</span><span>{item.label}</span>
              </Choice>)}</div>
            </section>
          </div>
        </div>
        <div id={`${id}-commissions`} role="tabpanel" aria-labelledby={`${id}-commissions-tab`} hidden={tab !== "commissions"}>
          <h3>Kontrola provizí</h3><p className={styles.intro}>Vyber, co chceš zkontrolovat. Výběr můžeš zúžit na konkrétní kód provize.</p>
          <div className={styles.commissionGrid}>
            <Choice radio name={`${id}-commission`} checked={draft.commissionAuditMode === "off"} onChange={() => setDraft(current => setCommissionFilterMode(current, "off"))} description="Zobrazit smlouvy bez kontroly provizí.">Vypnuto</Choice>
            {COMMISSION_AUDIT_MODE_DEFS.map(item => <Choice radio key={item.id} name={`${id}-commission`} checked={draft.commissionAuditMode === item.id} onChange={() => setDraft(current => setCommissionFilterMode(current, item.id))} description={item.description}><item.icon size={16} aria-hidden="true" />{item.label}</Choice>)}
          </div>
          <label className={styles.codeLabel} htmlFor={`${id}-code`}>Kód provize</label>
          <select id={`${id}-code`} className={styles.select} disabled={draft.commissionAuditMode === "off"} value={draft.commissionAuditCodeFilter} onChange={event => change({ commissionAuditCodeFilter: event.target.value as ContractFilterSelection["commissionAuditCodeFilter"] })}>
            {COMMISSION_AUDIT_CODE_DEFS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {draft.commissionAuditMode === "off" && <p className={styles.hint}>Nejdřív vyber druh kontroly provizí.</p>}
        </div>
        {canShowTeam && <div id={`${id}-advisers`} role="tabpanel" aria-labelledby={`${id}-advisers-tab`} hidden={tab !== "advisers"}>
          <h3>Poradci v týmu</h3><p className={styles.intro}>Vyber jednoho nebo více poradců. Po použití se zobrazí jejich týmové smlouvy.</p>
          <label className={styles.search}><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Hledat jméno nebo e-mail" aria-label="Hledat poradce" /></label>
          {visibleAdvisers.length > 0 && <div className={styles.adviserTools}><button type="button" onClick={() => change({ selectedSubordinates: allVisibleSelected ? draft.selectedSubordinates.filter(email => !visibleAdvisers.some(member => member.email === email)) : [...new Set([...draft.selectedSubordinates, ...visibleAdvisers.map(member => member.email)])] })}>{allVisibleSelected ? "Zrušit výběr zobrazených" : "Vybrat všechny zobrazené"}</button><span>{selectedVisible} / {visibleAdvisers.length}</span></div>}
          <div className={styles.adviserGrid}>{visibleAdvisers.map(member => <Choice key={member.email} checked={draft.selectedSubordinates.includes(member.email)} onChange={() => change({ selectedSubordinates: toggleFilterValue(draft.selectedSubordinates, member.email) })} description={member.email}>{member.label}</Choice>)}</div>
          {visibleAdvisers.length === 0 && <p className={styles.empty}>{advisers.length === 0 ? "Zatím nejsou dostupní žádní poradci pro filtrování." : "Pro tento výraz jsme nikoho nenašli."}</p>}
        </div>}
      </div>
      <div className={styles.summary} aria-label="Vybrané filtry"><span className={styles.summaryLabel}>{count ? `Vybráno ${count}` : "Bez omezení"}</span>
        {count ? <div className={styles.chips}>{chips.map(chip => <button key={chip.key} type="button" onClick={chip.remove} aria-label={`Odebrat filtr: ${chip.label}`}><span>{chip.label}</span><X size={11} aria-hidden="true" /></button>)}</div> : <span className={styles.summaryEmpty}>Vyber podmínky a potvrď tlačítkem Použít.</span>}
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.reset} disabled={count === 0} onClick={() => { setDraft(emptyContractFilterSelection()); setSearch(""); }}><RotateCcw size={15} aria-hidden="true" />Vymazat filtry</button>
        <div><button type="button" className={styles.cancel} onClick={onClose}>Zrušit</button><button type="submit" className={styles.apply}><Check size={16} aria-hidden="true" />Použít{count > 0 && <span>{count}</span>}</button></div>
      </footer>
    </form>
  </div>;
}
