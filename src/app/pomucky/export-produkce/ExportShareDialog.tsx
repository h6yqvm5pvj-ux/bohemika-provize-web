"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Check, FileText, Loader2, Search, Send, UserCheck, X } from "lucide-react";
import styles from "./ExportShareDialog.module.css";

type Recipient = { name: string; email: string };

type Props = {
  scopeLabel: string;
  dateRangeLabel: string;
  directManager: Recipient | null;
  recipient: Recipient | null;
  isDirectManager: boolean;
  query: string;
  suggestions: Recipient[];
  searching: boolean;
  message: string;
  submitting: boolean;
  error: string | null;
  onQueryChange: (query: string) => void;
  onSelectRecipient: (recipient: Recipient) => void;
  onSelectManager: () => void;
  onClearRecipient: () => void;
  onMessageChange: (message: string) => void;
  onClose: () => void;
  onSend: () => void;
};

const EMOJIS = ["🙂", "👏", "🔥", "💪", "🚀", "✅", "🎯"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
}

export function ExportShareDialog({
  scopeLabel, dateRangeLabel, directManager, recipient, isDirectManager,
  query, suggestions, searching, message, submitting, error,
  onQueryChange, onSelectRecipient, onSelectManager, onClearRecipient,
  onMessageChange, onClose, onSend,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (recipient) messageRef.current?.focus();
    else searchRef.current?.focus();
  }, [recipient]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="export-share-title"
      aria-describedby="export-share-description"
      onCancel={(event) => { event.preventDefault(); if (!submitting) onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || submitting) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className={styles.header}>
        <span className={styles.headerIcon}><Send size={21} aria-hidden="true" /></span>
        <div className={styles.heading}>
          <h2 id="export-share-title">Odeslat přehled</h2>
          <p id="export-share-description">Sdílejte výsledky v interní poště.</p>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} disabled={submitting} aria-label="Zavřít okno odeslání"><X size={18} aria-hidden="true" /></button>
      </header>

      <div className={styles.body}>
        <div className={styles.report}>
          <span className={styles.reportIcon}><FileText size={22} aria-hidden="true" /></span>
          <div><strong>Export produkce</strong><p>{scopeLabel}<span aria-hidden="true"> · </span>{dateRangeLabel}</p></div>
        </div>

        <div className={styles.field}>
          <label htmlFor={recipient ? undefined : "export-share-recipient"} className={styles.label}>Příjemce{recipient && <span className={styles.selectedLabel}><Check size={12} aria-hidden="true" />Vybráno</span>}</label>
          {recipient ? (
            <div className={styles.selectedRecipient}>
              <span className={styles.avatar} aria-hidden="true">{initials(recipient.name)}</span>
              <div className={styles.person}>
                {isDirectManager && <span className={styles.personCaption}>Přímý nadřízený</span>}
                <strong>{recipient.name}</strong><span>{recipient.email}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={onClearRecipient} disabled={submitting} aria-label="Změnit příjemce"><X size={16} aria-hidden="true" /></button>
            </div>
          ) : (
            <>
              <div className={styles.search}>
                <Search size={17} aria-hidden="true" />
                <input ref={searchRef} id="export-share-recipient" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Hledat jméno nebo e-mail" autoComplete="off" disabled={submitting} aria-controls={suggestions.length > 0 ? "export-share-results" : undefined} />
                {searching && <Loader2 size={16} className="animate-spin" aria-label="Hledání příjemců" />}
              </div>
              {suggestions.length > 0 && (
                <ul id="export-share-results" className={styles.suggestions} aria-label="Nalezení uživatelé">
                  {suggestions.map((option) => (
                    <li key={option.email}><button type="button" onClick={() => onSelectRecipient(option)} disabled={submitting}>
                      <span className={styles.suggestionAvatar} aria-hidden="true">{initials(option.name)}</span>
                      <span className={styles.person}><strong>{option.name}</strong><span>{option.email}</span></span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button></li>
                  ))}
                </ul>
              )}
              {!searching && query.trim().length >= 2 && suggestions.length === 0 && <p className={styles.searchHint} role="status">Zkuste jiné jméno nebo celý e-mail.</p>}
              {directManager && !query.trim() && (
                <button type="button" className={styles.manager} onClick={onSelectManager} disabled={submitting}>
                  <span className={styles.managerIcon}><UserCheck size={19} aria-hidden="true" /></span>
                  <span className={styles.person}><span className={styles.personCaption}>Přímý nadřízený</span><strong>{directManager.name}</strong><span>{directManager.email}</span></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="export-share-message" className={styles.label}>Zpráva<span>Volitelné</span></label>
          <div className={styles.composer}>
            <textarea ref={messageRef} id="export-share-message" value={message} onChange={(event) => onMessageChange(event.target.value)} rows={2} maxLength={240} placeholder="Připojte krátký vzkaz…" disabled={submitting} />
            <div className={styles.composerToolbar}>
              <div className={styles.emojis}>{EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => { onMessageChange(message + emoji); messageRef.current?.focus(); }} disabled={submitting || message.length + emoji.length > 240} aria-label={`Přidat emoji ${emoji}`}>{emoji}</button>)}</div>
              <span className={styles.counter} aria-label={`${message.length} z 240 znaků`}>{message.length}<span> / 240</span></span>
            </div>
          </div>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.cancelButton} onClick={onClose} disabled={submitting}>Zrušit</button>
        <button type="button" className={styles.sendButton} onClick={onSend} disabled={submitting || !recipient}>
          {submitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{submitting ? "Odesílám…" : "Odeslat přehled"}
        </button>
      </footer>
    </dialog>
  );
}
