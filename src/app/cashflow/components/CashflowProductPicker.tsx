import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  BriefcaseBusiness, CarFront, Check, ChevronDown, Coins, CreditCard,
  Globe2, HeartPulse, House, Landmark, Plane, Sparkles, Tag,
  type LucideIcon,
} from "lucide-react";
import type { ProductFilter } from "../types";
import styles from "../cashflowToolbar.module.css";

export type CashflowProductOption = { value: ProductFilter; label: string };

const PRODUCT_ICONS: Record<ProductFilter, LucideIcon> = {
  all: Sparkles, tip: Tag, subscription: CreditCard, life: HeartPulse,
  auto: CarFront, property: House, entrepreneurs: BriefcaseBusiness,
  travel: Plane, foreigners: Globe2, gold: Coins, pension: Landmark,
};

const searchLabel = (value: string) => value.toLocaleLowerCase("cs")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function CashflowProductPicker({ id, options, value, onChange }: {
  id: string;
  options: readonly CashflowProductOption[];
  value: ProductFilter;
  onChange: (value: ProductFilter) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ text: "", at: 0 });
  const selected = options.find(option => option.value === value) ?? options[0];
  const active = options.find(option => option.value === activeValue) ?? selected;
  const activeIndex = options.indexOf(active);
  const SelectedIcon = PRODUCT_ICONS[selected.value];

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = triggerRef.current;
      if (!trigger?.getClientRects().length) { setOpen(false); return; }
      const rect = trigger.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) { setOpen(false); return; }
      const margin = 10;
      const gap = 7;
      const below = window.innerHeight - rect.bottom - margin - gap;
      const above = rect.top - margin - gap;
      const placeBelow = below >= 300 || below >= above;
      const width = Math.min(rect.width, window.innerWidth - margin * 2);
      setPosition({
        width,
        fontFamily: getComputedStyle(trigger).fontFamily,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
        ...(placeBelow ? { top: rect.bottom + gap } : { bottom: window.innerHeight - rect.top + gap }),
        maxHeight: Math.max(0, Math.min(384, placeBelow ? below : above)),
      });
    };
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node && listRef.current?.contains(event.target))) reposition();
    };
    reposition();
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-value="${active.value}"]`);
    if (!list || !option) return;
    // Scroll only this list, after its final viewport height is applied.
    // Moving an option into view must not scroll the page or its other panels.
    const bounds = list.getBoundingClientRect();
    const optionBounds = option.getBoundingClientRect();
    const inset = 6;
    if (optionBounds.top < bounds.top + inset) list.scrollTop += optionBounds.top - bounds.top - inset;
    else if (optionBounds.bottom > bounds.bottom - inset) list.scrollTop += optionBounds.bottom - bounds.bottom + inset;
  }, [open, active.value, position]);

  const openPicker = (option = selected) => {
    searchRef.current = { text: "", at: 0 };
    setActiveValue(option.value);
    setOpen(true);
  };
  const choose = (option: CashflowProductOption, restoreFocus = true) => {
    onChange(option.value);
    setOpen(false);
    searchRef.current = { text: "", at: 0 };
    if (restoreFocus) triggerRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Tab") {
      if (open) choose(active, false);
      return;
    }
    if (event.altKey && event.key === "ArrowUp" && open) {
      event.preventDefault();
      choose(active);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        openPicker(event.key === "Home" || event.key === "ArrowUp" ? options[0]
          : event.key === "End" ? options[options.length - 1] : selected);
      } else if (!event.altKey) {
        const step = event.key === "PageDown" ? 10 : event.key === "PageUp" ? -10
          : event.key === "ArrowDown" ? 1 : -1;
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
          : Math.max(0, Math.min(options.length - 1, activeIndex + step));
        setActiveValue(options[next].value);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else openPicker();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const previous = open && now - searchRef.current.at < 700 ? searchRef.current.text : "";
      const character = searchLabel(event.key);
      const cycle = previous.length > 0 && [...previous].every(letter => letter === character);
      const text = cycle ? character : previous + character;
      searchRef.current = { text, at: now };
      const currentIndex = open ? activeIndex : options.indexOf(selected);
      const start = previous && !cycle ? currentIndex : (currentIndex + 1) % options.length;
      for (let offset = 0; offset < options.length; offset++) {
        const option = options[(start + offset) % options.length];
        if (searchLabel(option.label).startsWith(text)) {
          event.preventDefault();
          setActiveValue(option.value);
          setOpen(true);
          break;
        }
      }
    }
  };

  return <>
    <span id={`${id}-label`} className={styles.srOnly}>Produkt</span>
    <button ref={triggerRef} id={id} type="button" role="combobox"
      className={styles.productPickerTrigger} data-value={value}
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${active.value}` : undefined}
      onClick={() => { if (open) setOpen(false); else openPicker(); }} onKeyDown={handleKeyDown}>
      <SelectedIcon size={16} strokeWidth={1.8} className={styles.productPickerIcon} aria-hidden="true" />
      <span id={`${id}-value`} className={styles.productPickerValue}>{selected.label}</span>
      <ChevronDown size={15} className={styles.productPickerChevron} aria-hidden="true" />
    </button>
    <div className={`${styles.productSelect} ${styles.productNative}`}>
      <label htmlFor={`${id}-native`} className={styles.srOnly}>Produkt</label>
      <select id={`${id}-native`} value={value} onChange={event => {
        const option = options.find(option => option.value === event.currentTarget.value);
        if (option) onChange(option.value);
      }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </div>
    {open && createPortal(
      <div ref={listRef} id={listId} role="listbox" aria-label="Produkt"
        className={styles.productPickerMenu} style={position}>
        {options.map(option => {
          const Icon = PRODUCT_ICONS[option.value];
          return <button key={option.value} id={`${listId}-${option.value}`} type="button" role="option"
            tabIndex={-1} aria-selected={option.value === value}
            data-value={option.value} data-active={option.value === active.value}
            className={styles.productPickerOption}
            onPointerMove={() => setActiveValue(option.value)}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{option.label}</span>
            {option.value === value && <Check size={15} strokeWidth={2.3} className={styles.productPickerCheck} aria-hidden="true" />}
          </button>;
        })}
      </div>, document.body,
    )}
  </>;
}
