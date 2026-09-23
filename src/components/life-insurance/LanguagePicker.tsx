"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ONLINE_CARD_LANGUAGE_OPTIONS, onlineCardLanguageMeta, type OnlineCardLocale } from "@/lib/onlineCardI18n";
import styles from "./languagePicker.module.css";

function LanguageFlag({ locale }: { locale: OnlineCardLocale }) {
  return <svg className={styles.flag} viewBox={locale === "en" ? "0 0 60 30" : "0 0 30 20"} aria-hidden="true" focusable="false">
    {locale === "cs" ? <>
      <path fill="#fff" d="M0 0h30v20H0z" />
      <path fill="#d7141a" d="M0 10h30v10H0z" />
      <path fill="#11457e" d="m0 0 15 10L0 20z" />
    </> : locale === "uk" ? <>
      <path fill="#0057b7" d="M0 0h30v20H0z" />
      <path fill="#ffd700" d="M0 10h30v10H0z" />
    </> : <>
      <path fill="#012169" d="M0 0h60v30H0z" />
      <path stroke="#fff" strokeWidth="6" d="m0 0 60 30m0-30L0 30" />
      <path fill="#c8102e" d="M0 0v2l26 13h4L0 0Zm60 0h-4L30 13v2L60 0ZM0 30h4l26-13v-2L0 30Zm60 0v-2L34 15h-4l30 15Z" />
      <path stroke="#fff" strokeWidth="10" d="M30 0v30M0 15h60" />
      <path stroke="#c8102e" strokeWidth="6" d="M30 0v30M0 15h60" />
    </>}
  </svg>;
}

export function LanguagePicker({ locale, label, onChange }: {
  locale: OnlineCardLocale; label: string; onChange: (locale: OnlineCardLocale) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const current = onlineCardLanguageMeta(locale);

  useEffect(() => {
    if (!open) return;
    options.current[ONLINE_CARD_LANGUAGE_OPTIONS.findIndex(option => option.id === locale)]?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, locale]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const navigate = (event: KeyboardEvent, index: number) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const count = ONLINE_CARD_LANGUAGE_OPTIONS.length;
      const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
      options.current[next]?.focus();
    }
  };

  return <div ref={root} className={styles.picker} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={`${label}: ${current.label}`}
      title={current.label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
      }}>
      <LanguageFlag locale={locale} /><span>{current.shortLabel}</span><ChevronDown className={styles.chevron} aria-hidden="true" />
    </button>
    {open && <div id={menuId} role="menu" aria-label={label} className={styles.menu}>
      {ONLINE_CARD_LANGUAGE_OPTIONS.map((option, index) => <button key={option.id}
        ref={element => { options.current[index] = element; }} type="button" role="menuitemradio"
        aria-checked={option.id === locale} lang={option.htmlLang} tabIndex={-1} className={styles.option}
        onKeyDown={event => navigate(event, index)} onClick={() => { onChange(option.id); close(); }}>
        <LanguageFlag locale={option.id} /><span>{option.label}</span>
        {option.id === locale && <Check className={styles.check} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
