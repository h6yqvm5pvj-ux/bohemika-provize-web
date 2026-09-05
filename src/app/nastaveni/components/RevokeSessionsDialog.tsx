"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";

export function RevokeSessionsDialog({ mfaEnabled, busy, error, onClose, onConfirm }: {
  mfaEnabled: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (password: string, code: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => { dialog.current?.showModal(); passwordInput.current?.focus(); }, []);

  return (
    <dialog ref={dialog} aria-labelledby="revoke-sessions-title" aria-describedby="revoke-sessions-description"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (await onConfirm(password, code)) { setPassword(""); setCode(""); onClose(); }
      }} className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <ShieldCheck size={24} className="mb-3 text-violet-600" aria-hidden="true" />
            <h2 id="revoke-sessions-title" className="text-xl font-semibold">Odhlásit ostatní zařízení</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Zavřít" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
        </div>
        <p id="revoke-sessions-description" className="text-sm leading-6 text-slate-600">
          Potvrď svou totožnost. Ostatní zařízení se odhlásí a na tomto zůstaneš přihlášený.
        </p>
        <label className="block text-sm font-medium">
          Aktuální heslo
          <input ref={passwordInput} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-60" />
        </label>
        {mfaEnabled && <label className="block text-sm font-medium">
          Kód z ověřovací aplikace
          <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base tracking-widest outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-60" />
        </label>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-50">Zrušit</button>
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Ověřuji a odhlašuji…" : "Ověřit a odhlásit"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
