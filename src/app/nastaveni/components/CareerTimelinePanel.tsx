"use client";

import {
  ArrowRight, BriefcaseBusiness, CalendarDays, Check, CirclePlay,
  LockKeyhole, Pencil, Plus, Save, Sparkles, Trash2,
} from "lucide-react";
import type { Position } from "../../types/domain";
import type { ImportedCareerPeriod } from "@/app/lib/careerTimelineImport";
import { CareerTimelineImport } from "@/components/career/CareerTimelineImport";
import { CareerImportHelpDialog } from "@/components/career/CareerImportHelpDialog";
import styles from "./careerTimelinePanel.module.css";

type CareerTimelineRow = { id: string; position: Position; validFrom: string; validTo: string };
type CareerTimelinePanelProps = {
  positions: { id: Position; label: string }[];
  rows: CareerTimelineRow[];
  fieldClass: string;
  locked: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  helpOpen: boolean;
  onHelpOpen: () => void;
  onHelpClose: () => void;
  onAddRow: () => void;
  onPrependRow: () => void;
  onUnlock: () => void;
  onUpdateRow: (rowId: string, patch: Partial<CareerTimelineRow>) => void;
  onRemoveRow: (rowId: string) => void;
  onImport: (rows: ImportedCareerPeriod[]) => void;
  onSave: () => void | Promise<void>;
};

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDay = (value: string): boolean => ISO_DAY_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
const hasInvalidRangeOrder = (from: string, to: string): boolean => Boolean(from && to && isIsoDay(from) && isIsoDay(to) && to < from);
const dayLabel = (value: string) => ISO_DAY_RE.test(value) ? value.split("-").reverse().join(".") : "Nevyplněno";

export function CareerTimelinePanel({
  positions, rows, fieldClass, locked, saving, saved, error, helpOpen,
  onHelpOpen, onHelpClose, onAddRow, onPrependRow, onUnlock,
  onUpdateRow, onRemoveRow, onImport, onSave,
}: CareerTimelinePanelProps) {
  return (
    <section id="timeline-kariery" className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <span className={styles.headingIcon}><BriefcaseBusiness size={23} strokeWidth={1.8} aria-hidden="true" /></span>
          <div>
            <div className={styles.eyebrow}>Tvoje kariérní cesta {rows.length > 0 && <span className={styles.count}>{rows.length} období</span>}</div>
            <h2>Historie kariéry</h2>
            <p>Správná pozice v každém období. Přesné provize u každé smlouvy.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={onHelpOpen} className={styles.helpButton}><CirclePlay size={16} aria-hidden="true" /> Nápověda s ukázkou</button>
          {locked && <button type="button" onClick={onUnlock} className={styles.editButton}><Pencil size={14} aria-hidden="true" /> Upravit</button>}
        </div>
      </header>

      {helpOpen && <CareerImportHelpDialog onClose={onHelpClose} />}
      <div className={styles.body}>
        {!locked && <CareerTimelineImport disabled={saving} onImport={onImport} onHelp={onHelpOpen} />}
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIllustration} aria-hidden="true"><span /><span /><Sparkles size={23} /></div>
            <h3>Každá kariéra někde začíná</h3>
            <p>Vlož tabulku z Maxxu nebo přidej první pozici ručně.<br />Od nejstaršího období až po to současné.</p>
            {!locked && <button type="button" onClick={onAddRow} disabled={saving} className={styles.addFirstButton}><Plus size={15} aria-hidden="true" /> Přidat první pozici <ArrowRight size={14} aria-hidden="true" /></button>}
          </div>
        ) : (
          <div className={styles.history}>
            <div className={styles.historyHeader}>
              <div><h3>Průběh kariéry</h3><p>Od nejstarší pozice po současnou</p></div>
              {!locked && <button type="button" onClick={onPrependRow} disabled={saving} className={styles.prependButton}><Plus size={14} aria-hidden="true" /> Přidat na začátek</button>}
              {locked && <span className={styles.lockedBadge}><LockKeyhole size={12} aria-hidden="true" /> Uložená historie</span>}
            </div>
            <ol className={styles.timeline}>
              {rows.map((row, index) => {
                const rangeError = hasInvalidRangeOrder(row.validFrom.trim(), row.validTo.trim());
                const last = index === rows.length - 1;
                const current = last && !row.validTo.trim();
                const openEndedNotLast = !row.validTo.trim() && !last;
                const rowError = rangeError || openEndedNotLast;
                const number = String(index + 1).padStart(2, "0");
                const errorId = `career-error-${row.id}`;
                const label = positions.find(position => position.id === row.position)?.label ?? row.position;
                return (
                  <li key={row.id} className={styles.timelineItem}>
                    <span className={`${styles.timelineDot} ${current ? styles.currentDot : ""} ${rowError ? styles.errorDot : ""}`} aria-hidden="true">{current ? <Check size={13} strokeWidth={2.8} /> : number}</span>
                    <div className={`${styles.card} ${current ? styles.currentCard : ""} ${rowError ? styles.errorCard : ""}`}>
                      {locked ? (
                        <div className={styles.readOnlyRow}>
                          <div><span className={styles.periodLabel}>Období {number}</span><h4>{label}</h4></div>
                          <div className={styles.readOnlyDates}>
                            {current && <span className={styles.currentBadge}><span /> Současná pozice</span>}
                            <span><CalendarDays size={14} aria-hidden="true" /> {dayLabel(row.validFrom)} <span className={styles.dateDash}>—</span> {row.validTo ? dayLabel(row.validTo) : "současnost"}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={styles.cardHeader}>
                            <span className={styles.periodLabel}>Období {number}</span>
                            <div className={styles.cardActions}>
                              {current && <span className={styles.currentBadge}><span /> Současná pozice</span>}
                              <button type="button" onClick={() => onRemoveRow(row.id)} disabled={saving} className={styles.removeButton} aria-label={`Smazat období ${index + 1}`}><Trash2 size={13} aria-hidden="true" /><span>Smazat</span></button>
                            </div>
                          </div>
                          <div className={styles.fields}>
                            <label className={styles.positionField} htmlFor={`career-position-${row.id}`}>
                              <span>Pozice</span>
                              <select id={`career-position-${row.id}`} value={row.position} onChange={event => onUpdateRow(row.id, { position: event.target.value as Position })} disabled={saving} className={`${fieldClass} ${styles.field}`}>
                                {positions.map(position => <option key={position.id} value={position.id}>{position.label}</option>)}
                              </select>
                            </label>
                            <label htmlFor={`career-from-${row.id}`}>
                              <span>Platí od</span>
                              <input id={`career-from-${row.id}`} type="date" value={row.validFrom} onChange={event => onUpdateRow(row.id, { validFrom: event.target.value })} disabled={saving} aria-invalid={rangeError} aria-describedby={rowError ? errorId : undefined} className={`${fieldClass} ${styles.field}`} />
                            </label>
                            <div className={styles.endField}>
                              <label htmlFor={`career-to-${row.id}`}>Platí do</label>
                              <div className={styles.endControls}>
                                <input id={`career-to-${row.id}`} type="date" value={row.validTo} onChange={event => onUpdateRow(row.id, { validTo: event.target.value })} disabled={saving} aria-invalid={rowError} aria-describedby={rowError ? errorId : undefined} className={`${fieldClass} ${styles.field}`} />
                                {last && <button type="button" onClick={() => onUpdateRow(row.id, { validTo: "" })} disabled={saving} aria-pressed={current} className={`${styles.ongoingButton} ${current ? styles.ongoingActive : ""}`}>{current && <Check size={13} aria-hidden="true" />} Do současnosti</button>}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                      {rowError && <p id={errorId} className={styles.rowError}>{rangeError ? "Datum Do nemůže být dříve než datum Od." : "Současnost (prázdné Do) může být jen u posledního období."}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <footer className={styles.footer}>
          {locked ? <p className={styles.footerNote}><LockKeyhole size={15} aria-hidden="true" /> Historie je uložená. Změny zpřístupní tlačítko Upravit.</p> : (
            <>
              {rows.length > 0 ? <button type="button" onClick={onAddRow} disabled={saving} className={styles.addButton}><Plus size={15} aria-hidden="true" /> Přidat pozici</button> : <p className={styles.footerNote}><Sparkles size={15} aria-hidden="true" /> Pozice se automaticky použijí v kalkulačce.</p>}
              <div className={styles.saveActions}>
                {saved && <span className={styles.saved}><Check size={14} aria-hidden="true" /> Uloženo</span>}
                <button type="button" onClick={() => void onSave()} disabled={saving || rows.length === 0} className={styles.saveButton}><Save size={15} aria-hidden="true" /> {saving ? "Ukládám…" : "Uložit historii"}</button>
              </div>
            </>
          )}
        </footer>
      </div>
    </section>
  );
}
