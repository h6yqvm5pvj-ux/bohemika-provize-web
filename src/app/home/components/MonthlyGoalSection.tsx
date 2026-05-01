import { useEffect, useState } from "react";
import { Pencil, Target } from "lucide-react";

import { formatMoney } from "../homeUtils";

type Props = {
  monthlyGoal: number | null;
  progress: number;
  progressTone: string;
  loading: boolean;
  isLiteUI: boolean;
  onSaveGoal: (value: number) => Promise<void>;
};

export function MonthlyGoalSection({
  monthlyGoal,
  progress,
  progressTone,
  loading,
  isLiteUI,
  onSaveGoal,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const progressFillClass = normalizedProgress >= 51 ? "bg-emerald-600" : "bg-rose-600";
  const goalDisplayValue = monthlyGoal ? formatMoney(monthlyGoal) : "Není nastaven";

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
    ? "relative min-w-0 h-full overflow-hidden rounded-[24px] border border-slate-200 bg-white px-4 py-5 transition-[border-color,box-shadow] duration-200 hover:border-slate-300 focus-within:border-slate-300 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.35)] sm:px-10 sm:py-7"
    : "relative min-w-0 h-full overflow-hidden rounded-[24px] border border-slate-200 bg-white px-4 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)] focus-within:border-slate-300 focus-within:shadow-[0_12px_28px_rgba(15,23,42,0.1),0_0_0_1px_rgba(148,163,184,0.35)] sm:px-10 sm:py-7";

  return (
    <section className={goalCardClass}>
      {editOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h3 className="text-base font-semibold text-slate-900">Upravit měsíční cíl</h3>
            <p className="mt-1 text-sm text-slate-600">
              Zadej částku provize, kterou chceš tento měsíc dosáhnout.
            </p>
            <div className="mt-3 space-y-2">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10"
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
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                disabled={saving}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Ukládám…" : "Uložit"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Target className="h-6 w-6 text-slate-700" strokeWidth={2} aria-hidden="true" />
              <span>Měsíční cíl:</span>
            </div>
            <div className="mt-1 text-[2.5rem] leading-[1] font-semibold tracking-tight text-slate-900 sm:text-[3rem]">
              {goalDisplayValue}
            </div>
          </div>
          <div className="self-start sm:self-auto sm:text-right">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Splněno</div>
            <div className="text-3xl font-semibold text-slate-900">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-base font-medium text-slate-500">
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
                    aria-hidden="true"
                  />
                  <span>Načítám…</span>
                </span>
              ) : (
                `${normalizedProgress}%`
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="whitespace-nowrap inline-flex items-center gap-2 rounded-full border border-slate-900 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Upravit cíl
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative h-3.5 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-50">
            <div
              className={`h-full rounded-full ${progressFillClass}`}
              style={{ width: `${loading ? 0 : normalizedProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>0 %</span>
            <span>100 %</span>
          </div>
        </div>
      </div>
    </section>
  );
}
