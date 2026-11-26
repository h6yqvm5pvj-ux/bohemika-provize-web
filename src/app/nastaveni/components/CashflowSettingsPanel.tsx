"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

export function CashflowSettingsPanel({ initialEnabled, onSave }: {
  initialEnabled: boolean;
  onSave: (enabled: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setEnabled(initialEnabled); }, [initialEnabled]);

  async function toggle() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(!enabled);
      if (result.ok) setEnabled(!enabled);
      else setError(result.error);
    } catch {
      setError("Nastavení se nepodařilo uložit. Zkus to prosím znovu.");
    } finally { setSaving(false); }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="cashflow-settings-title">
    <div className="mb-6 flex items-center gap-3">
      <Building2 className="text-violet-600" size={24} aria-hidden="true" />
      <h2 id="cashflow-settings-title" className="text-xl font-bold text-slate-900">Cashflow</h2>
    </div>
    <div className="flex items-start justify-between gap-5">
      <div>
        <h3 id="office-contribution-label" className="font-semibold text-slate-900">Pobírám příspěvek 10.000 Kč na kancelář</h3>
        <p id="office-contribution-description" className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Do budoucího cashflow přidá odhad 10.000 Kč měsíčně v kategorii Ostatní platby.
          Zapni jen tehdy, pokud příspěvek pobíráš. Výplata závisí na splnění podmínek.
          Po nahrání výpisu se odhad nahradí skutečností. Vyplacený příspěvek se zobrazuje i při vypnuté funkci.
        </p>
      </div>
      <button type="button" role="switch" aria-checked={enabled} aria-labelledby="office-contribution-label"
        aria-describedby="office-contribution-description" disabled={saving} onClick={toggle}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-600 disabled:opacity-60 ${enabled ? "bg-violet-600" : "bg-slate-300"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "left-1 translate-x-5" : "left-1"}`} />
      </button>
    </div>
    <p role="status" className="mt-4 text-sm text-slate-600">{saving ? "Ukládám…" : enabled ? "Predikce příspěvku je zapnutá." : "Predikce příspěvku je vypnutá."}</p>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
  </section>;
}
