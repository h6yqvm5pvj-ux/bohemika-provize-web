import { useEffect, useRef, useState } from "react";
import { Pencil, Target } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";
import styles from "./homeWidgets.module.css";

import { type AppLanguage } from "@/lib/appLanguage";
import { formatMoney } from "../homeUtils";

type Props = {
  language: AppLanguage;
  monthlyGoal: number | null;
  progress: number;
  progressTone: string;
  loading: boolean;
  isLiteUI: boolean;
  onSaveGoal: (value: number) => Promise<void>;
};

const MONTHLY_GOAL_COPY: Record<
  AppLanguage,
  {
    notSet: string;
    invalidAmount: string;
    saveFailed: string;
    editTitle: string;
    editDescription: string;
    placeholder: string;
    cancel: string;
    saving: string;
    save: string;
    monthlyGoal: string;
    completed: string;
    loading: string;
    editGoal: string;
  }
> = {
  cs: {
    notSet: "Není nastaven",
    invalidAmount: "Zadej částku 0 nebo víc.",
    saveFailed: "Uložení se nepodařilo. Zkus to znovu.",
    editTitle: "Upravit měsíční cíl",
    editDescription: "Zadej částku provize, kterou chceš tento měsíc dosáhnout.",
    placeholder: "Např. 50000",
    cancel: "Zrušit",
    saving: "Ukládám…",
    save: "Uložit",
    monthlyGoal: "Měsíční cíl",
    completed: "Splněno",
    loading: "Načítám…",
    editGoal: "Upravit cíl",
  },
};

export function MonthlyGoalSection({
  language,
  monthlyGoal,
  progress,
  loading,
  isLiteUI,
  onSaveGoal,
}: Props) {
  const copy = MONTHLY_GOAL_COPY[language];
  const [editOpen, setEditOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.querySelector("input")?.focus();
    return () => { document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, [editOpen]);

  const rawProgress = Math.max(0, Number(progress) || 0);
  const progressForBar = Math.min(100, rawProgress);
  const progressLabel = new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 1,
  }).format(rawProgress);
  const goalDisplayValue = monthlyGoal ? formatMoney(monthlyGoal) : copy.notSet;

  useEffect(() => {
    setInputValue(
      monthlyGoal != null && Number.isFinite(monthlyGoal) ? String(monthlyGoal) : ""
    );
  }, [monthlyGoal]);

  const handleSave = async () => {
    const raw = (inputValue ?? "").toString().replace(/\s+/g, "");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(copy.invalidAmount);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSaveGoal(parsed);
      setEditOpen(false);
    } catch (err) {
      console.error("Uložení měsíčního cíle selhalo", err);
      setError(copy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`monthly-goal-card ${styles.card} ${isLiteUI ? "" : styles.elevated}`}>
      <Image src="/icons/cilmesice.webp" alt="" width={3000} height={3000} quality={100} aria-hidden="true" className={`${styles.ghost} ${styles.goalGhost}`} />
      {editOpen && createPortal(
        <div className={styles.modalBackdrop}>
          <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="monthly-goal-title"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !saving) { setError(null); setEditOpen(false); }
              if (event.key === "Tab") {
                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
                const first = controls[0]; const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
              }
            }}>
            <h3 id="monthly-goal-title">{copy.editTitle}</h3>
            <p>{copy.editDescription}</p>
            <label htmlFor="monthly-goal-amount">Měsíční cíl v Kč</label>
            <input id="monthly-goal-amount" type="number" value={inputValue} min={0}
              onChange={event => setInputValue(event.target.value)} placeholder={copy.placeholder}
              aria-invalid={Boolean(error)} aria-describedby={error ? "monthly-goal-error" : undefined} />
            {error && <div id="monthly-goal-error" role="alert" className={styles.error}>{error}</div>}
            <div className={styles.modalActions}>
              <button type="button" onClick={() => { setError(null); setEditOpen(false); }} disabled={saving} className={styles.button}>{copy.cancel}</button>
              <button type="button" onClick={handleSave} disabled={saving} className={`${styles.button} ${styles.primary}`}>{saving ? copy.saving : copy.save}</button>
            </div>
          </div>
        </div>, document.body
      )}
      <div className={styles.content}>
        <div className={styles.goalHeader}>
          <h2 className={styles.title}><span className={styles.icon}><Target aria-hidden="true" /></span>{copy.monthlyGoal}</h2>
          <button type="button" onClick={() => setEditOpen(true)} className={styles.button}><Pencil size={12} aria-hidden="true" />{copy.editGoal}</button>
        </div>
        <div className={styles.goalNumbers}>
          <p className={styles.amount}>{goalDisplayValue}</p>
          <div className={styles.goalPercent}>
            <span className={styles.label}>{copy.completed}</span>
            {loading ? <span className={styles.loading} role="status"><span className={styles.spinner} aria-hidden="true" />{copy.loading}</span> : <strong>{progressLabel} %</strong>}
          </div>
        </div>
        <div className={styles.progress} data-complete={rawProgress >= 100} role="progressbar" aria-label="Plnění měsíčního cíle" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading ? undefined : progressForBar} aria-valuetext={loading ? copy.loading : `${progressLabel} %`}>
          <div className={styles.progressFill} style={{ width: `${loading ? 0 : progressForBar}%` }} />
        </div>
        <div className={styles.scale}><span>0 %</span><span>100 %</span></div>
      </div>
    </section>
  );
}
