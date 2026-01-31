import { useEffect, useState } from "react";

import { formatMoney } from "../homeUtils";

type Props = {
  monthlyGoal: number | null;
  progress: number;
  progressTone: string;
  isLiteUI: boolean;
  onSaveGoal: (value: number) => Promise<void>;
};

export function MonthlyGoalSection({
  monthlyGoal,
  progress,
  progressTone,
  isLiteUI,
  onSaveGoal,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(
      monthlyGoal != null && Number.isFinite(monthlyGoal) ? String(monthlyGoal) : ""
    );
  }, [monthlyGoal]);

  const handleSave = async () => {
    const raw = (inputValue ?? "").toString().replace(/\s+/g, "");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Zadej částku 0 nebo víc.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSaveGoal(parsed);
      setEditOpen(false);
    } catch (err) {
      console.error("Uložení měsíčního cíle selhalo", err);
      setError("Uložení se nepodařilo. Zkus to znovu.");
    } finally {
      setSaving(false);
    }
  };

  const goalCardClass = isLiteUI
    ? "relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900 px-4 py-5 sm:px-10 sm:py-7 h-full min-w-0"
    : "relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/80 backdrop-blur-2xl px-4 py-5 sm:px-10 sm:py-7 shadow-[0_24px_80px_rgba(0,0,0,0.85)] h-full min-w-0";

  return (
    <section className={goalCardClass}>
      {editOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900/95 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
            <h3 className="text-base font-semibold text-white">Upravit měsíční cíl</h3>
            <p className="mt-1 text-sm text-slate-300">
              Zadej částku provize, kterou chceš tento měsíc dosáhnout.
            </p>
            <div className="mt-3 space-y-2">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-800/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400"
                placeholder="Např. 50000"
                autoFocus
                min={0}
              />
              {error ? <div className="text-xs text-rose-300">{error}</div> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setEditOpen(false);
                }}
                className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 transition"
                disabled={saving}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl border border-emerald-300/70 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/30 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? "Ukládám…" : "Uložit"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(125,211,252,0.18),transparent_45%),radial-gradient(circle_at_88%_8%,rgba(74,222,128,0.12),transparent_55%)]" />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-white">Měsíční cíl</h2>
            <p className="text-sm text-slate-300">
              Cíl na měsíc{" "}
              <span className="font-semibold text-white">
                {monthlyGoal ? formatMoney(monthlyGoal) : "Není nastaven"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Splněno</div>
              <div className="text-3xl font-semibold text-white">{progress}%</div>
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition"
            >
              Upravit cíl
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative h-3.5 w-full rounded-full bg-white/5 border border-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${progressTone}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>0 %</span>
            <span>100 %</span>
          </div>
        </div>
      </div>
    </section>
  );
}
