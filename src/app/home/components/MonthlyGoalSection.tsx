import { useEffect, useState } from "react";

import { type CommissionMode, type Position } from "@/app/types/domain";
import { formatMoney } from "../homeUtils";
import {
  generateMonthlyGoalPlan,
  type GoalSuggestionPlan,
} from "../monthlyGoalPlan";

type Props = {
  monthlyGoal: number | null;
  progress: number;
  progressTone: string;
  loading: boolean;
  isLiteUI: boolean;
  remainingToGoal: number;
  position?: Position | null;
  commissionMode?: CommissionMode | null;
  onSaveGoal: (value: number) => Promise<void>;
};

export function MonthlyGoalSection({
  monthlyGoal,
  progress,
  progressTone,
  loading,
  isLiteUI,
  remainingToGoal,
  position,
  commissionMode,
  onSaveGoal,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<GoalSuggestionPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);

  const hasGoal = monthlyGoal != null && monthlyGoal > 0;
  const remainingImmediate = Math.max(0, Number(remainingToGoal) || 0);
  const canGeneratePlan = hasGoal && remainingImmediate > 0 && !!position;
  const normalizedProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const progressFillClass = normalizedProgress >= 51 ? "bg-emerald-600" : "bg-rose-600";

  useEffect(() => {
    setInputValue(
      monthlyGoal != null && Number.isFinite(monthlyGoal) ? String(monthlyGoal) : ""
    );
  }, [monthlyGoal]);

  useEffect(() => {
    if (!hasGoal || remainingImmediate <= 0) {
      setPlan(null);
      setPlanError(null);
    }
  }, [hasGoal, remainingImmediate]);

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

  const handleGeneratePlan = () => {
    setPlanError(null);
    if (!hasGoal) {
      setPlan(null);
      setPlanError("Nejdřív si nastav měsíční cíl.");
      return;
    }
    if (remainingImmediate <= 0) {
      setPlan(null);
      return;
    }
    if (!position) {
      setPlan(null);
      setPlanError("Abych spočítal návrh, je potřeba mít nastavenou pozici v Nastavení.");
      return;
    }

    setPlanning(true);
    try {
      const generated = generateMonthlyGoalPlan({
        remainingImmediate,
        position,
        mode: commissionMode ?? "accelerated",
      });
      if (generated.items.length === 0) {
        setPlan(null);
        setPlanError("Nepodařilo se sestavit návrh. Zkus to prosím znovu.");
        return;
      }
      setPlan(generated);
    } catch (err) {
      console.error("Generování návrhu pro měsíční cíl selhalo", err);
      setPlan(null);
      setPlanError("Návrh se nepodařilo spočítat. Zkus to prosím znovu.");
    } finally {
      setPlanning(false);
    }
  };

  const handleHidePlan = () => {
    setPlan(null);
    setPlanError(null);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Měsíční cíl:{" "}
              <span className="font-semibold text-slate-900">
                {monthlyGoal ? formatMoney(monthlyGoal) : "Není nastaven"}
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex flex-col items-end gap-2 sm:gap-3">
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Splněno</div>
                <div className="text-3xl font-semibold text-slate-900">
                  {loading ? "Načítám…" : `${normalizedProgress}%`}
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleGeneratePlan}
                  disabled={!canGeneratePlan || planning}
                  className="whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {planning ? "Počítám…" : "Náhodný plán do 100 %"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="whitespace-nowrap rounded-full border border-slate-900 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  Upravit cíl
                </button>
              </div>
            </div>
          </div>
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

        {hasGoal ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                {remainingImmediate > 0 ? (
                  <>
                    Do cíle chybí{" "}
                    <span className="font-semibold text-slate-900">{formatMoney(remainingImmediate)}</span>{" "}
                    okamžité provize.
                  </>
                ) : (
                  <span className="font-semibold text-slate-900">Cíl je splněný.</span>
                )}
              </p>
              {plan ? (
                <button
                  type="button"
                  onClick={handleGeneratePlan}
                  disabled={planning || !canGeneratePlan}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Přegenerovat
                </button>
              ) : null}
            </div>

            {planError ? <p className="mt-2 text-xs text-rose-300">{planError}</p> : null}

            {plan && plan.items.length > 0 ? (
              <div className="mt-3 space-y-2">
                {plan.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {idx + 1}. {item.productLabel}
                        </div>
                        <div className="text-xs text-slate-500">
                          Pojistné {formatMoney(item.premium)}{" "}
                          {item.premiumUnit === "monthly" ? "/ měsíc" : "/ rok"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                          Okamžitá
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          +{formatMoney(item.immediate)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-xs text-white">
                  <div>
                    Součet návrhu:{" "}
                    <span className="font-semibold">{formatMoney(plan.totalImmediate)}</span>
                  </div>
                  {plan.overshoot > 0 ? (
                    <div>
                      Přesah nad cíl:{" "}
                      <span className="font-semibold">{formatMoney(plan.overshoot)}</span>
                    </div>
                  ) : null}
                  {plan.missingAfterPlan > 0 ? (
                    <div>
                      Po návrhu ještě chybí:{" "}
                      <span className="font-semibold">{formatMoney(plan.missingAfterPlan)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleHidePlan}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Skrýt náhodný plán
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
