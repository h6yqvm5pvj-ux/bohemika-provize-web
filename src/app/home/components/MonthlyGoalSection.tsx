import { useEffect, useId, useRef, useState } from "react";
import { Pencil, Target } from "lucide-react";
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
  unavailable?: boolean;
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
  unavailable = false,
  isLiteUI,
  onSaveGoal,
}: Props) {
  const copy = MONTHLY_GOAL_COPY[language];
  const ringId = useId().replace(/:/g, "");
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

  const hasGoal = monthlyGoal != null && Number.isFinite(monthlyGoal) && monthlyGoal > 0;
  const rawProgress = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const progressForRing = Math.min(100, rawProgress);
  const showProgress = hasGoal && !loading && !unavailable;
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
    <section className={`monthly-goal-card ${styles.card} ${styles.goal} ${isLiteUI ? "" : styles.elevated}`} data-lite={isLiteUI}>
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
      <div className={`${styles.content} ${styles.goalLayout}`}>
        <div className={styles.goalHeader}>
          <h2 className={styles.title}><span className={styles.icon}><Target aria-hidden="true" /></span>{copy.monthlyGoal}</h2>
          <button type="button" onClick={() => setEditOpen(true)} className={styles.goalEdit} aria-label={copy.editGoal} title={copy.editGoal} aria-haspopup="dialog" aria-expanded={editOpen}>
            <Pencil size={15} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.goalAmount}>
          <p className={styles.amount}>{goalDisplayValue}</p>
          <p className={styles.goalHint}>{!hasGoal ? "Nastav si cíl pro tento měsíc." : showProgress && rawProgress >= 100 ? "Měsíční cíl je splněný." : "Cílová provize tento měsíc"}</p>
        </div>
        <div className={styles.goalRing} data-complete={showProgress && rawProgress >= 100} role="progressbar" aria-label="Plnění měsíčního cíle" aria-valuemin={0} aria-valuemax={100} aria-valuenow={showProgress ? progressForRing : undefined} aria-valuetext={loading ? copy.loading : unavailable ? "Plnění není k dispozici" : !hasGoal ? copy.notSet : `${progressLabel} %`}>
          <svg viewBox="0 0 144 144" aria-hidden="true" className={styles.goalRingSvg}>
            <defs>
              <radialGradient id={`${ringId}-rim`}>
                <stop offset="78%" stopColor="#edf4ef" />
                <stop offset="91%" stopColor="#dce9e1" />
                <stop offset="98%" stopColor="#f8fcfa" />
                <stop offset="100%" stopColor="#dce7e1" />
              </radialGradient>
              <radialGradient id={`${ringId}-track`}>
                <stop offset="75%" stopColor="#c2d7ca" />
                <stop offset="84%" stopColor="#e2ede6" />
                <stop offset="92%" stopColor="#edf5f0" />
                <stop offset="100%" stopColor="#c8ddcf" />
              </radialGradient>
              <radialGradient id={`${ringId}-face`} cx="40%" cy="30%" r="75%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="75%" stopColor="#f7faf8" />
                <stop offset="100%" stopColor="#e7f0ea" />
              </radialGradient>
              <linearGradient id={`${ringId}-green`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#249466" />
                <stop offset="40%" stopColor="#59ce96" />
                <stop offset="70%" stopColor="#3cb57f" />
                <stop offset="100%" stopColor="#218b5d" />
              </linearGradient>
            </defs>
            <circle cx="72" cy="72" r="68" fill={`url(#${ringId}-rim)`} stroke="#f7fbf9" strokeWidth="1" />
            <circle cx="72" cy="72" r="61" fill={`url(#${ringId}-track)`} />
            <circle cx="72" cy="72" r="44" fill={`url(#${ringId}-face)`} stroke="#ffffff" strokeWidth="1.5" />
            <circle cx="72" cy="72" r="55" pathLength="100" transform="rotate(-90 72 72)" stroke={`url(#${ringId}-green)`} className={styles.goalRingFill} strokeDasharray="100 100" style={{ strokeDashoffset: 100 - (showProgress ? progressForRing : 0), opacity: showProgress && progressForRing > 0 ? 1 : 0 }} />
          </svg>
          <div className={styles.goalRingLabel}>
            {loading ? <span className={styles.goalRingStatus} role="status"><span className={styles.spinner} aria-hidden="true" />{copy.loading}</span>
              : unavailable ? <span className={styles.goalRingStatus} role="status">Plnění není<br />k dispozici</span>
              : !hasGoal ? <><strong>—</strong><span>Bez cíle</span></>
              : <><strong>{progressLabel}<small> %</small></strong><span>{copy.completed}</span></>}
          </div>
        </div>
      </div>
    </section>
  );
}
