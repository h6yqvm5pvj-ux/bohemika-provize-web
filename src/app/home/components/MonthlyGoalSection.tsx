import { useEffect, useState } from "react";
import { Pencil, Target } from "lucide-react";
import Image from "next/image";

import { type AppLanguage } from "@/lib/appLanguage";
import { formatMoney } from "../homeUtils";

type Props = {
  language: AppLanguage;
  monthlyGoal: number | null;
  progress: number;
  progressTone: string;
  loading: boolean;
  isLiteUI: boolean;
  onSaveGoal: (value: number) => Promise<void>;
};

const MONTHLY_GOAL_COPY: Record<
  AppLanguage,
  {
    notSet: string;
    invalidAmount: string;
    saveFailed: string;
    editTitle: string;
    editDescription: string;
    placeholder: string;
    cancel: string;
    saving: string;
    save: string;
    monthlyGoal: string;
    completed: string;
    loading: string;
    editGoal: string;
  }
> = {
  cs: {
    notSet: "Není nastaven",
    invalidAmount: "Zadej částku 0 nebo víc.",
    saveFailed: "Uložení se nepodařilo. Zkus to znovu.",
    editTitle: "Upravit měsíční cíl",
    editDescription: "Zadej částku provize, kterou chceš tento měsíc dosáhnout.",
    placeholder: "Např. 50000",
    cancel: "Zrušit",
    saving: "Ukládám…",
    save: "Uložit",
    monthlyGoal: "Měsíční cíl",
    completed: "Splněno",
    loading: "Načítám…",
    editGoal: "Upravit cíl",
  },
};

export function MonthlyGoalSection({
  language,
  monthlyGoal,
  progress,
  progressTone,
  loading,
  isLiteUI,
  onSaveGoal,
}: Props) {
  const copy = MONTHLY_GOAL_COPY[language];
  const [editOpen, setEditOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawProgress = Math.max(0, Number(progress) || 0);
  const progressForBar = Math.min(100, rawProgress);
  const progressLabel = new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 1,
  }).format(rawProgress);
  const progressFillClass = progressTone?.trim()
    ? `bg-gradient-to-r ${progressTone}`
    : rawProgress >= 51
      ? "bg-emerald-600"
      : "bg-rose-600";
  const goalDisplayValue = monthlyGoal ? formatMoney(monthlyGoal) : copy.notSet;

  useEffect(() => {
    setInputValue(
      monthlyGoal != null && Number.isFinite(monthlyGoal) ? String(monthlyGoal) : ""
    );
  }, [monthlyGoal]);

  const handleSave = async () => {
    const raw = (inputValue ?? "").toString().replace(/\s+/g, "");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(copy.invalidAmount);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSaveGoal(parsed);
      setEditOpen(false);
    } catch (err) {
      console.error("Uložení měsíčního cíle selhalo", err);
      setError(copy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const goalCardClass = isLiteUI
    ? "relative min-w-0 h-full overflow-hidden rounded-[30px] border border-rose-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(244,63,94,0.24),transparent_42%),linear-gradient(165deg,#271347_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white transition-[border-color,box-shadow] duration-200 hover:border-rose-200/60 focus-within:border-rose-200/60 focus-within:shadow-[0_0_0_1px_rgba(254,205,211,0.25)] sm:px-7 sm:py-6"
    : "relative min-w-0 h-full overflow-hidden rounded-[30px] border border-rose-300/35 bg-[radial-gradient(circle_at_14%_0%,rgba(244,63,94,0.24),transparent_42%),linear-gradient(165deg,#271347_0%,#160934_58%,#0d0521_100%)] px-5 py-5 text-white shadow-[0_20px_44px_rgba(11,3,33,0.5)] transition-[border-color,box-shadow] duration-200 hover:border-rose-200/60 hover:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(254,205,211,0.2)] focus-within:border-rose-200/60 focus-within:shadow-[0_26px_54px_rgba(11,3,33,0.56),0_0_0_1px_rgba(254,205,211,0.25)] sm:px-7 sm:py-6";

  return (
    <section className={`monthly-goal-card ${goalCardClass}`}>
      <Image
        src="/icons/cilmesice.webp"
        alt=""
        width={3000}
        height={3000}
        quality={100}
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -right-12 z-0 w-[210px] select-none object-contain opacity-[0.2] saturate-75 sm:-bottom-20 sm:-right-10 sm:w-[275px]"
      />
      {editOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h3 className="text-base font-semibold text-slate-900">{copy.editTitle}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {copy.editDescription}
            </p>
            <div className="mt-3 space-y-2">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10"
                placeholder={copy.placeholder}
                autoFocus
                min={0}
              />
              {error ? <div className="text-xs font-medium text-rose-600">{error}</div> : null}
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
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? copy.saving : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="relative z-10 flex flex-col gap-5">
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_180px] 2xl:items-start 2xl:gap-5">
          <div className="min-w-0">
            <h2 className="flex max-w-full items-center gap-3 text-2xl font-extrabold leading-tight tracking-[-0.02em] text-rose-50 sm:text-3xl">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-100/45 bg-rose-300/15">
                <Target className="h-4.5 w-4.5 text-rose-200" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="min-w-0">{copy.monthlyGoal}</span>
            </h2>
            <p className="mt-4 whitespace-nowrap text-[2.4rem] font-black leading-[0.96] tracking-[-0.03em] text-rose-200 sm:text-[2.95rem]">
              {goalDisplayValue}
            </p>
          </div>

          <div className="self-start 2xl:justify-self-end 2xl:text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-100/65">{copy.completed}</div>
            <div className="text-3xl font-black tracking-[-0.03em] text-rose-50">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-base font-medium text-rose-100/70">
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-rose-100/30 border-t-rose-100"
                    aria-hidden="true"
                  />
                  <span>{copy.loading}</span>
                </span>
              ) : (
                `${progressLabel}%`
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="mt-2 inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border border-rose-100/40 bg-rose-300/15 px-3 py-1.5 text-[11px] font-semibold text-rose-50 transition hover:border-rose-100/65 hover:bg-rose-300/25 sm:mt-3"
            >
              <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              {copy.editGoal}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-rose-100/20 bg-white/[0.08]">
            <div
              className={`h-full rounded-full ${progressFillClass}`}
              style={{ width: `${loading ? 0 : progressForBar}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100/55">
            <span>0 %</span>
            <span>100 %</span>
          </div>
        </div>
      </div>
    </section>
  );
}
