"use client";

import { useId } from "react";
import { BarChart3, Gauge, RefreshCw, SlidersHorizontal, Target, Trophy, WalletCards, X, Zap } from "lucide-react";
import type { HomeWidgets, PerformanceMode } from "../types";
import styles from "./HomeCustomizationPanel.module.css";

type Props = {
  id?: string;
  title: string;
  closeLabel: string;
  widgetLabels: Record<keyof HomeWidgets, string>;
  managerOnlyNote: string;
  performance: {
    title: string;
    liteDescription: string;
    defaultDescription: string;
    liteLabel: string;
    defaultLabel: string;
  };
  widgets: HomeWidgets;
  showTeamBox: boolean;
  performanceMode: PerformanceMode;
  onClose: () => void;
  onToggleWidget: (key: keyof HomeWidgets) => void;
  onPerformanceModeChange: (mode: PerformanceMode) => void;
};

const WIDGET_OPTIONS = [
  { key: "productionSummary", icon: BarChart3 },
  { key: "expectedPayout", icon: WalletCards },
  { key: "monthlyGoal", icon: Target },
  { key: "teamLeaderboard", icon: Trophy },
  { key: "quickActions", icon: Zap },
] as const;

function SwitchTrack({ checked }: { checked: boolean }) {
  return <span className={styles.switchTrack} data-checked={checked} aria-hidden="true"><span /></span>;
}

export function HomeCustomizationPanel({
  id, title, closeLabel, widgetLabels, managerOnlyNote, performance, widgets,
  showTeamBox, performanceMode, onClose, onToggleWidget, onPerformanceModeChange,
}: Props) {
  const labelId = useId();
  const teamNoteId = useId();
  const fullEffects = performanceMode === "default";

  return (
    <section id={id} className={styles.panel} aria-labelledby={labelId}>
      <div className={styles.surface}>
        <div className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.headerIcon}><SlidersHorizontal size={19} aria-hidden="true" /></span>
            <h2 id={labelId}>{title}</h2>
          </div>
          <button type="button" onClick={onClose} className={styles.close} aria-label={closeLabel}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <p className={styles.sectionLabel}>Zobrazené karty</p>
        <div className={styles.widgetList}>
          {WIDGET_OPTIONS.map(({ key, icon: Icon }) => {
            const disabled = key === "teamLeaderboard" && !showTeamBox;
            return (
              <button key={key} type="button" role="switch" aria-checked={widgets[key]}
                aria-label={widgetLabels[key]} aria-describedby={disabled ? teamNoteId : undefined}
                disabled={disabled} onClick={() => onToggleWidget(key)} className={styles.widget}>
                <span className={styles.icon}><Icon size={17} aria-hidden="true" /></span>
                <span className={styles.widgetText}>
                  <span className={styles.widgetLabel}>{widgetLabels[key]}</span>
                  {disabled && <span id={teamNoteId} className={styles.note}>{managerOnlyNote}</span>}
                </span>
                <SwitchTrack checked={widgets[key]} />
              </button>
            );
          })}
        </div>

        <button type="button" role="switch" aria-checked={fullEffects}
          onClick={() => onPerformanceModeChange(fullEffects ? "lite" : "default")}
          className={styles.performance}>
          <span className={styles.icon}><Gauge size={18} aria-hidden="true" /></span>
          <span className={styles.widgetText}>
            <span className={styles.widgetLabel}>{performance.title}</span>
            <span className={styles.note}>{fullEffects ? performance.defaultDescription : performance.liteDescription}</span>
          </span>
          <span className={styles.performanceState}>
            <span className={styles.mode}>{fullEffects ? performance.defaultLabel : performance.liteLabel}</span>
            <SwitchTrack checked={fullEffects} />
          </span>
        </button>

        <p className={styles.syncNote}><RefreshCw size={13} aria-hidden="true" /><span>Nastavení domova se synchronizuje na všech tvých zařízeních.</span></p>
      </div>
    </section>
  );
}
