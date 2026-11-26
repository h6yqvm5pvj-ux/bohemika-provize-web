"use client";

import { useState, type FormEvent } from "react";
import { FLEXI_RENOVATION_MISSING_BASE_LABEL, type FlexiRenovationGuaranteeStatus } from "@/app/lib/flexiRenovation";

type ConfirmedGuaranteeStatus = Exclude<FlexiRenovationGuaranteeStatus, "unknown">;

export function FlexiRenovationBaseReview({ onResolve }: {
  onResolve?: (originalMonthlyPremium: number, guaranteeStatus: ConfirmedGuaranteeStatus) => Promise<void>;
}) {
  const [premium, setPremium] = useState("");
  const [guarantee, setGuarantee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onResolve || saving || !premium || (guarantee !== "inside" && guarantee !== "outside")) return;
    setSaving(true);
    setError(null);
    try {
      await onResolve(Number(premium), guarantee);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Podklady se nepodařilo uložit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="font-semibold text-amber-900">{FLEXI_RENOVATION_MISSING_BASE_LABEL}</p>
      {onResolve && (
        <details>
          <summary className="cursor-pointer font-semibold text-violet-800">Doplnit ověřené podklady</summary>
          <form onSubmit={submit} className="mt-2 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                Původní měsíční pojistné (Kč)
                <input type="number" min="0.01" step="0.01" required value={premium}
                  onChange={event => setPremium(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" />
              </label>
              <label className="grid gap-1">
                Ručení původní smlouvy
                <select required value={guarantee} onChange={event => setGuarantee(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                  <option value="">Vyber ověřený stav</option>
                  <option value="outside">Po ručení</option>
                  <option value="inside">V ručení</option>
                </select>
              </label>
            </div>
            {error && <p role="alert" className="text-rose-800">{error}</p>}
            <button type="submit" disabled={saving}
              className="rounded-lg bg-violet-800 px-3 py-1.5 font-semibold text-white disabled:opacity-60">
              {saving ? "Ukládám…" : "Uložit a vypočítat provizi"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
