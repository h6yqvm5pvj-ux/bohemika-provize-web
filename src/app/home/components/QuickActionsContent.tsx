import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight, ArrowUpRight, BarChart3, BriefcaseMedical, Calculator,
  CarFront, ChartNoAxesCombined, ClipboardPen, Coins, FileDown, FolderOpen,
  HeartPulse, House, MapPinned, MessageCircle, Plus, Target, X, Zap,
  type LucideIcon,
} from "lucide-react";
import { type QuickAction } from "../types";
import styles from "./homeWidgets.module.css";

type Props = {
  actions: QuickAction[];
  availableActions: QuickAction[];
  copy: {
    title: string;
    add: string;
    pickerTitle: string;
    allAdded: string;
    categoryFallback: string;
    empty: string;
    removeAriaPrefix: string;
  };
  onAdd: (action: QuickAction) => void;
  onRemove: (key: string) => void;
};

const ACTION_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  argumenty: { icon: MessageCircle, tone: "violet" },
  dokumenty: { icon: FolderOpen, tone: "blue" },
  zaznam: { icon: ClipboardPen, tone: "violet" },
  "nahrada-smlouvy": { icon: ArrowLeftRight, tone: "blue" },
  tvorba: { icon: Calculator, tone: "violet" },
  "hypoteka-vlastni-zdroje": { icon: House, tone: "mint" },
  statistika: { icon: BarChart3, tone: "blue" },
  "export-produkce": { icon: FileDown, tone: "blue" },
  "plan-produkce": { icon: Target, tone: "violet" },
  zlato: { icon: Coins, tone: "gold" },
  katastr: { icon: MapPinned, tone: "mint" },
  "proklepka-vozidla": { icon: CarFront, tone: "mint" },
  "projekce-vykonu": { icon: ChartNoAxesCombined, tone: "blue" },
  "pracovni-neschopenka": { icon: BriefcaseMedical, tone: "rose" },
  invalidita: { icon: HeartPulse, tone: "rose" },
};

function ActionIcon({ actionKey }: { actionKey: string }) {
  const { icon: Icon, tone } = ACTION_ICONS[actionKey] ?? { icon: Zap, tone: "violet" };
  return <span className={styles.quickActionIcon} data-tone={tone}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>;
}

export function QuickActionsContent({ actions, availableActions, copy, onAdd, onRemove }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerId = useId();

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPickerOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  const closePicker = () => { setPickerOpen(false); buttonRef.current?.focus(); };

  return (
    <>
      <div className={styles.quickHeader}>
        <h2 className={styles.title}><span className={styles.icon}><Zap aria-hidden="true" /></span>{copy.title}</h2>
        <div className={styles.quickPickerAnchor} ref={pickerRef}>
          <button ref={buttonRef} type="button" className={styles.quickAdd} onClick={() => setPickerOpen(open => !open)} aria-label={copy.add} title={copy.add} aria-expanded={pickerOpen} aria-controls={pickerOpen ? pickerId : undefined}>
            <Plus size={18} aria-hidden="true" />
          </button>
          {pickerOpen && <div id={pickerId} className={styles.quickPicker}>
            <div className={styles.quickPickerHeader}><span>{copy.pickerTitle}</span><button type="button" onClick={closePicker} aria-label="Zavřít výběr pomůcek"><X size={15} aria-hidden="true" /></button></div>
            {availableActions.length === 0 ? <p className={styles.quickEmpty}>{copy.allAdded}</p> : availableActions.map(action => (
              <button key={action.key} type="button" className={styles.quickPickerOption} onClick={() => { onAdd(action); closePicker(); }}>
                <ActionIcon actionKey={action.key} />
                <span className={styles.quickActionText}><strong>{action.title}</strong><small>{action.category ?? copy.categoryFallback}</small></span>
                <Plus size={14} aria-hidden="true" />
              </button>
            ))}
          </div>}
        </div>
      </div>
      {actions.length === 0 ? <p className={styles.quickEmpty}>{copy.empty}</p> : <div className={styles.quickList}>
        {actions.map(action => <div key={action.key} className={styles.quickTile}>
          <Link href={action.href} className={styles.quickLink}>
            <ActionIcon actionKey={action.key} />
            <span className={styles.quickActionText}><strong>{action.title}</strong><small>{action.category ?? copy.categoryFallback}</small></span>
            <ArrowUpRight className={styles.quickArrow} size={13} aria-hidden="true" />
          </Link>
          <button type="button" className={styles.quickRemove} onClick={() => onRemove(action.key)} aria-label={`${copy.removeAriaPrefix} ${action.title}`} title={`${copy.removeAriaPrefix} ${action.title}`}><X size={12} aria-hidden="true" /></button>
        </div>)}
      </div>}
    </>
  );
}
