"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { BriefcaseBusiness, Check, ChevronDown, GraduationCap, LockKeyhole, MousePointerClick, Shield } from "lucide-react";
import type { MinimumMode } from "./pensionCalculation";
import styles from "./pension.module.css";

const OPTIONS = [
  { value: "ordinary", label: "Bez zvýšeného minima", description: "Použít běžné zákonné minimum.", icon: Shield },
  { value: "insured15", label: "Alespoň 15 let pojištění", description: "Získaná doba bez náhradních a budoucích dob.", icon: BriefcaseBusiness },
  { value: "under28", label: "Mladší 28 let – splněné podmínky", description: "Ověřený nárok a průběh pojištění od 18 let.", icon: GraduationCap },
] as const;

export function PensionMinimumPicker({ value, onChange, clientAge, invalid, describedBy }: {
  value: MinimumMode | "";
  onChange: (value: MinimumMode) => void;
  clientAge?: number;
  invalid: boolean;
  describedBy: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ text: "", at: 0 });
  const listId = useId();
  const selectedIndex = OPTIONS.findIndex(option => option.value === value);
  const selected = OPTIONS[selectedIndex];
  const SelectedIcon = selected?.icon ?? MousePointerClick;
  const isDisabled = (index: number) => OPTIONS[index].value === "under28" && clientAge !== undefined && clientAge >= 28;

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 10;
      const gap = 7;
      const below = window.innerHeight - rect.bottom - margin - gap;
      const above = rect.top - margin - gap;
      const placeBelow = below >= 275 || below >= above;
      const width = Math.min(rect.width, window.innerWidth - margin * 2);
      setPosition({
        width,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
        ...(placeBelow ? { top: rect.bottom + gap } : { bottom: window.innerHeight - rect.top + gap }),
        maxHeight: Math.max(0, Math.min(370, placeBelow ? below : above)),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  const openPicker = () => {
    setActiveIndex(selectedIndex < 0 || isDisabled(selectedIndex) ? 0 : selectedIndex);
    searchRef.current = { text: "", at: 0 };
    setOpen(true);
  };
  const choose = (index: number) => {
    if (isDisabled(index)) return;
    onChange(OPTIONS[index].value);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const available = OPTIONS.map((_, index) => index).filter(index => !isDisabled(index));
      if (!open) {
        openPicker();
        if (event.key === "Home") setActiveIndex(available[0]);
        if (event.key === "End") setActiveIndex(available[available.length - 1]);
        return;
      }
      const current = available.indexOf(activeIndex);
      const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + available.length) % available.length;
      setActiveIndex(available[next]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex); else openPicker();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text = (now - searchRef.current.at < 700 ? searchRef.current.text : "") + event.key.toLocaleLowerCase("cs");
      searchRef.current = { text, at: now };
      const index = OPTIONS.findIndex((option, index) => !isDisabled(index) && option.label.toLocaleLowerCase("cs").startsWith(text));
      if (index >= 0) { event.preventDefault(); setActiveIndex(index); setOpen(true); }
    }
  };

  return <>
    <button
      ref={triggerRef} id="pension-minimum" type="button" role="combobox"
      aria-labelledby="pension-minimum-label" aria-describedby={describedBy} aria-invalid={invalid} aria-required="true"
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
      data-value={value} data-empty={!selected} className={styles.minimumPickerTrigger}
      onClick={() => { if (open) setOpen(false); else openPicker(); }} onKeyDown={handleKeyDown}
    >
      <span className={styles.minimumPickerIcon}><SelectedIcon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
      <span className={styles.minimumPickerValue}>{selected?.label ?? "Kliknutím vyber"}</span>
      <ChevronDown size={17} strokeWidth={1.8} className={styles.minimumPickerChevron} aria-hidden="true" />
    </button>
    {open && createPortal(
      <div ref={listRef} id={listId} role="listbox" aria-labelledby="pension-minimum-label" className={styles.minimumPickerMenu} style={position}>
        {OPTIONS.map((option, index) => {
          const disabled = isDisabled(index);
          const Icon = option.icon;
          return <div
            key={option.value} id={`${listId}-${index}`} role="option"
            aria-selected={value === option.value} aria-disabled={disabled}
            data-value={option.value} data-index={index} data-active={!disabled && activeIndex === index}
            className={styles.minimumPickerOption}
            onPointerMove={() => { if (!disabled) setActiveIndex(index); }}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}
          >
            <span className={styles.minimumPickerIcon}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className={styles.minimumPickerOptionText}>
              <strong>{option.label}</strong>
              <small>{disabled ? `Pro klienta ve věku ${clientAge} let není tato volba dostupná.` : option.description}</small>
            </span>
            <span className={styles.minimumPickerCheck} aria-hidden="true">
              {disabled ? <LockKeyhole size={15} /> : value === option.value ? <Check size={15} strokeWidth={2.4} /> : null}
            </span>
          </div>;
        })}
      </div>, document.body,
    )}
  </>;
}
