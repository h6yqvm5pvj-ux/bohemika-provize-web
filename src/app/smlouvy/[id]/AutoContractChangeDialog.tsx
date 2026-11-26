"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/app/types/domain";
import type { ContractDoc } from "./contractDetailTypes";
import { ContractFrequencyChangeDialog } from "./ContractFrequencyChangeDialog";
import styles from "./contractManagement.module.css";

type Request = (url: string, init?: RequestInit) => Promise<unknown>;
export function AutoContractChangeDialog({ contract: initialContract, entryId: initialId, ownerEmail, product, contractNumber = "", request, onClose, onSaved, onClientLoaded }: {
  contract?: ContractDoc; entryId?: string; ownerEmail: string; product?: Product; contractNumber?: string;
  request: Request; onClose: () => void; onSaved: () => Promise<void>; onClientLoaded?: (name: string) => void;
}) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [contract, setContract] = useState(initialContract);
  const [entryId, setEntryId] = useState(initialId);
  const [number, setNumber] = useState(contractNumber);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [committed, setCommitted] = useState(false);
  const uploaded = useRef(false);
  const savedId = useRef<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const lookupLock = useRef(false);
  useEffect(() => { if (!contract) dialog.current?.showModal(); }, [contract]);

  async function lookup(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (lookupLock.current) return;
    lookupLock.current = true; setLookupBusy(true); setError(null);
    try {
      const result = await request("/api/contracts/auto-change-lookup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerEmail, contractNumber: number.trim(), productKey: product }) }) as { entryId?: string };
      if (!result.entryId) throw new Error("Smlouva nebyla nalezena.");
      const id = result.entryId;
      const detail = await request(`/api/contracts/detail?${new URLSearchParams({ ownerEmail, entryId: id })}`) as { contract?: ContractDoc; canManageContract?: boolean };
      if (!detail.contract || !detail.canManageContract) throw new Error("Nemáš oprávnění změnit tuto smlouvu.");
      if (!active.current) return;
      onClientLoaded?.(detail.contract.clientName ?? "");
      dialog.current?.close(); setEntryId(id); setContract(detail.contract);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Smlouvu nelze načíst."); }
    finally { lookupLock.current = false; setLookupBusy(false); }
  }
  if (!contract || !entryId) return <dialog ref={dialog} className={styles.dialog} onCancel={event => { event.preventDefault(); if (!lookupBusy) onClose(); }} aria-label="Změna na smlouvě auta">
    <header className={styles.header}><div><h2>Změna na smlouvě auta</h2></div></header>
    <form className={styles.form} onSubmit={lookup}><div className={styles.content}>
      <label className={styles.field}><span>Číslo smlouvy</span><input autoFocus required maxLength={100} value={number} onBlur={event => { if (event.relatedTarget instanceof HTMLButtonElement && event.relatedTarget.type === "button") return; if (number.trim()) void lookup({ preventDefault() {} }); }} disabled={lookupBusy} onChange={event => setNumber(event.target.value)} /></label>
      <p className="text-sm">Po vyhledání se automaticky doplní klient a parametry smlouvy.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div><footer className={styles.footer}><button type="button" disabled={lookupBusy} className={styles.back} onClick={onClose}>Zrušit</button><button className={styles.primary} disabled={lookupBusy || !number.trim()}>{lookupBusy ? "Načítám…" : "Načíst smlouvu"}</button></footer></form>
  </dialog>;
  return <ContractFrequencyChangeDialog contract={contract} includePremium committed={committed} onClose={() => { if (savedId.current) void onSaved().catch(onClose); else onClose(); }} onSave={async (frequency, effectiveDate, annualPremium, file) => {
    if (!savedId.current) {
      const result = await request("/api/contracts/payment-frequency", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerEmail, entryId, frequency, effectiveDate, annualPremium, revision: contract.paymentFrequencyChanges?.length ?? 0 }) }) as { endorsementId?: string };
      if (!result.endorsementId) throw new Error("Výsledek změny nelze potvrdit. Obnov detail smlouvy.");
      savedId.current = result.endorsementId;
      if (!active.current) return;
      setCommitted(true);
      try { localStorage.setItem("contracts_last_updated", String(Date.now())); } catch { /* Optional invalidation. */ }
      if (window.parent !== window && contract.contractNumber) {
        window.parent.postMessage({ type: "bohemka:statement-contract-saved", contractNumber: contract.contractNumber }, window.location.origin);
      }
    }
    if (file && !uploaded.current) {
      const form = new FormData(); form.set("ownerEmail", ownerEmail); form.set("entryId", savedId.current); form.set("file", file); form.set("onlyIfMissing", "1");
      try { await request("/api/contracts/attachment", { method: "POST", body: form }); uploaded.current = true; }
      catch { throw new Error("Dodatek a změna výpočtu jsou uložené, ale PDF se nepodařilo připojit. Ověř, že jde o bezpečné PDF bez skriptů a vložených souborů (nejvýše 12 MB). Opakuj uložení pro připojení PDF, nebo ho odeber a dokonči bez přílohy."); }
    }
    if (active.current) await onSaved();
  }} />;
}
