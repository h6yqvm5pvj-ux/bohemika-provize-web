"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Loader2, Plus, Sparkles, X } from "lucide-react";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { CLIENT_NEEDS, CLIENT_AI_WAIT_MS, CLIENT_QUERY_LIMIT, detectClientNeeds, normalizeClientQuery, parseAiClientNeeds, type ClientNeedId } from "./clientNeeds";
import styles from "./clientNeeds.module.css";

const EXAMPLE = "Klient bydlí v nájmu, má dvě děti a jezdí na elektrokole.";
type Status = "idle" | "thinking" | "ready" | "fallback";

export function ClientNeedsAssistant({ applied, canCompare = true, onApply, embedded = false, compact = false }: { applied: ClientNeedId[]; canCompare?: boolean; onApply: (needs: ClientNeedId[]) => void; embedded?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [needs, setNeeds] = useState<ClientNeedId[]>(applied);
  const [analyzed, setAnalyzed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [manualOpen, setManualOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const cache = useRef(new Map<string, ClientNeedId[]>());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const summaryRef = useRef<HTMLButtonElement>(null);

  const cancel = () => { generation.current++; request.current?.abort(); request.current = null; };
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);

  function editQuery(value: string) {
    cancel(); setQuery(value); setAnalyzed(false); setStatus("idle"); setNeeds([]);
  }

  async function analyze(event: FormEvent) {
    event.preventDefault(); cancel();
    const text = query.trim();
    if (!text) { inputRef.current?.focus(); return; }
    const local = detectClientNeeds(text).matches.map(match => match.id);
    setNeeds(local); setAnalyzed(true);
    const user = auth.currentUser;
    if (!user) { setStatus("fallback"); return; }
    const cacheKey = `${user.uid}:${normalizeClientQuery(text)}`;
    const cached = cache.current.get(cacheKey);
    if (cached) { setNeeds(cached); setStatus("ready"); return; }
    const controller = new AbortController(); request.current = controller;
    const current = generation.current;
    setStatus("thinking");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Časový limit zahrnuje i získání přihlašovacího tokenu, nejen samotný fetch.
      const payload = await Promise.race([
        fetchAuthedJsonOrThrow<{ ok: boolean; source: string; needs: unknown[] }>(user, "/api/liability-profile", {
          method: "POST", body: JSON.stringify({ query: text }), signal: controller.signal,
        }),
        new Promise<null>(resolve => { timeout = setTimeout(() => { controller.abort(); resolve(null); }, CLIENT_AI_WAIT_MS); }),
      ]);
      if (current !== generation.current || auth.currentUser?.uid !== user.uid) return;
      const suggestions = payload?.ok && payload.source === "ai" ? parseAiClientNeeds({ needs: payload.needs }, text) : null;
      if (suggestions) {
        const combined = [...new Set([...local, ...suggestions.map(match => match.id)])];
        setNeeds(combined); setStatus("ready");
        if (cache.current.size >= 10) cache.current.clear();
        cache.current.set(cacheKey, combined);
      } else setStatus("fallback");
    } catch { if (current === generation.current) setStatus("fallback"); }
    finally { clearTimeout(timeout); if (current === generation.current) { request.current = null; setStatus(value => value === "thinking" ? "fallback" : value); } }
  }

  function toggleNeed(id: ClientNeedId) {
    cancel(); setStatus("idle"); setAnalyzed(true);
    setNeeds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  function apply() {
    cancel(); setStatus("idle"); setOpen(false); setManualOpen(false);
    onApply(needs); summaryRef.current?.focus();
  }

  return <section className={styles.assistant} data-embedded={embedded} data-compact={compact} data-open={open} aria-label="Porovnání podle potřeb klienta">
    <div className={styles.summary}>
      <button type="button" ref={summaryRef} aria-expanded={open} aria-controls="client-needs-panel"
        onClick={() => { cancel(); setStatus("idle"); setOpen(!open); setManualOpen(false); if (!open) { setNeeds(applied); setAnalyzed(applied.length > 0); } }}>
        <Sparkles size={16} aria-hidden="true" />
        <span><strong>{applied.length ? "Profil klienta" : embedded ? "Popsat situaci klienta" : "Popsat klienta vlastními slovy"}</strong>
          {embedded && !applied.length && <small>Bydlení, rodina, koníčky — porovnejte to, na čem záleží.</small>}
          {applied.length > 0 && <small>{CLIENT_NEEDS.filter(need => applied.includes(need.id)).map(need => need.label).join(" · ")}</small>}</span>
        <span className={styles.openLabel}>{open ? "Skrýt" : applied.length ? "Upravit" : "Vyzkoušet"}<ChevronDown size={14} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} /></span>
      </button>
      {applied.length > 0 && <button type="button" className={styles.reset} aria-label="Zrušit profil klienta" onClick={() => { cancel(); setNeeds([]); setStatus("idle"); setAnalyzed(false); onApply([]); }}><X size={16} aria-hidden="true" /></button>}
    </div>
    <div id="client-needs-panel" hidden={!open} className={styles.panel}>
      <form onSubmit={event => void analyze(event)}>
        <label htmlFor="client-description">Co klient potřebuje pojistit?</label>
        <p id="client-description-help">Popiš bydlení, rodinu a aktivity. Rozpoznané potřeby zkontroluješ před porovnáním.</p>
        <textarea ref={inputRef} id="client-description" value={query} maxLength={CLIENT_QUERY_LIMIT} rows={2} placeholder={EXAMPLE}
          aria-describedby="client-description-help" onChange={event => editQuery(event.target.value)} />
        <div className={styles.formActions}>
          <button type="button" className={styles.example} onClick={() => { editQuery(EXAMPLE); inputRef.current?.focus(); }}>Použít příklad</button>
          <small>{query.length} / {CLIENT_QUERY_LIMIT}</small>
          <button type="submit" className={styles.primary} disabled={!query.trim() || status === "thinking"}>
            {status === "thinking" ? <Loader2 size={14} className={styles.spinner} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {status === "thinking" ? "Upřesňuji potřeby…" : "Připravit profil"}
          </button>
        </div>
      </form>
      <p role="status" className={styles.status}>{status === "thinking" ? "Základní profil je připravený. AI ho krátce upřesňuje; porovnat můžeš už teď."
        : status === "fallback" ? "Můžeš pokračovat s rychle rozpoznanými potřebami nebo výběr upravit. AI je nyní neupřesnila."
          : analyzed ? needs.length ? "Zkontroluj vybrané potřeby a případně je uprav." : "Z popisu se nepodařilo určit potřeby. Vyber je ručně nebo popis upřesni." : ""}</p>
      {needs.length > 0 && <div className={styles.selected} aria-label="Vybrané potřeby">{CLIENT_NEEDS.filter(need => needs.includes(need.id)).map(need =>
        <button type="button" key={need.id} onClick={() => toggleNeed(need.id)} aria-label={`Odebrat potřebu: ${need.label}`}><Check size={13} aria-hidden="true" />{need.label}<X size={12} aria-hidden="true" /></button>)}</div>}
      <button type="button" className={styles.manualToggle} aria-expanded={manualOpen} aria-controls="client-needs-options" onClick={() => setManualOpen(!manualOpen)}><Plus size={14} aria-hidden="true" />{manualOpen ? "Skrýt výběr potřeb" : "Upravit potřeby ručně"}</button>
      <div id="client-needs-options" hidden={!manualOpen} className={styles.options}>{CLIENT_NEEDS.map(need =>
        <label key={need.id}><input type="checkbox" checked={needs.includes(need.id)} onChange={() => toggleNeed(need.id)} /><span><strong>{need.label}</strong><small>{need.explanation}</small></span></label>)}</div>
      <div className={styles.applyRow}><p>{canCompare ? "Porovnání použije uložené údaje jednotlivých verzí produktů. Obecné podmínky zůstanou zahrnuté." : "Nejdřív vyber alespoň jeden produkt k porovnání."}</p>
        <button type="button" className={styles.primary} disabled={!needs.length || !canCompare} onClick={apply}>Použít profil a porovnat</button></div>
    </div>
  </section>;
}
