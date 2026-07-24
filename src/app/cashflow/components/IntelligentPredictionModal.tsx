import {
  BrainCircuit,
  CarFront,
  CheckCircle2,
  HeartPulse,
  Home,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";

import { INTELLIGENT_PREDICTION_CONFIG } from "../helpers";

type IntelligentPredictionModalProps = {
  open: boolean;
  enabled: boolean;
  onClose: () => void;
  onToggle: () => void;
};

const percentLabel = (value: number): string =>
  `${Math.round(value * 1000) / 10} %`;

export function IntelligentPredictionModal({
  open,
  enabled,
  onClose,
  onToggle,
}: IntelligentPredictionModalProps) {
  if (!open) return null;

  const autoRate = percentLabel(INTELLIGENT_PREDICTION_CONFIG.autoAnnualIncreaseRate);
  const autoRangeMin = percentLabel(INTELLIGENT_PREDICTION_CONFIG.autoMarketRangeMin);
  const autoRangeMax = percentLabel(INTELLIGENT_PREDICTION_CONFIG.autoMarketRangeMax);
  const propertyRate = percentLabel(INTELLIGENT_PREDICTION_CONFIG.propertyReviewIncreaseRate);
  const propertyAnnualRate = percentLabel(
    INTELLIGENT_PREDICTION_CONFIG.propertyAnnualPlanningRate
  );
  const lifeNeedGrowthRate = percentLabel(
    INTELLIGENT_PREDICTION_CONFIG.lifeAnnualNeedGrowthRate
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#08030f]/76 px-3 py-5 backdrop-blur-[8px]"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-[min(860px,96vw)] flex-col overflow-hidden rounded-[28px] border border-[#e7d7fb] bg-white text-slate-950 shadow-[0_34px_92px_rgba(2,6,23,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#0f0718_0%,#7e22ce_52%,#d946ef_100%)]"
          aria-hidden="true"
        />

        <div className="flex items-start justify-between gap-4 border-b border-[#eadcf9] px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e6cdfc] bg-[#fbf7ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#7e22ce]">
              <BrainCircuit className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
              Inteligentní predikce
            </span>
            <h3 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Realističtější cashflow na 10 let
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Model upraví pouze budoucí predikované položky. Vyplacené provize z
              výpisů, storna, TIPy a předplatné zůstávají v reálných částkách.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-950"
            aria-label="Zavřít inteligentní predikci"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-[20px] border border-[#e7d7fb] bg-[#fbf7ff] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d8b4fe] bg-white text-[#7e22ce]">
                  <CarFront className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7e22ce]">
                    Auto
                  </p>
                  <h4 className="text-lg font-bold text-slate-950">Růst pojistného</h4>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Budoucí auto provize se počítají se středovým scénářem{" "}
                <span className="font-semibold text-slate-950">{autoRate} ročně</span>.
                Model stojí mezi konzervativním intervalem {autoRangeMin}-{autoRangeMax},
                protože autopojištění typicky zdražuje přes škodní inflaci, náhradní
                díly, práci servisů a vyšší cenu vozidel.
              </p>
            </article>

            <article className="rounded-[20px] border border-[#e7d7fb] bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d8b4fe] bg-[#fbf7ff] text-[#7e22ce]">
                  <Home className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7e22ce]">
                    Majetek a odpovědnost
                  </p>
                  <h4 className="text-lg font-bold text-slate-950">Revize pojistných částek</h4>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Majetek se automaticky nemusí zdražovat, proto model pracuje s obchodní
                revizí každé {INTELLIGENT_PREDICTION_CONFIG.propertyReviewIntervalYears} roky.
                Při revizi počítá s navýšením provize o{" "}
                <span className="font-semibold text-slate-950">{propertyRate}</span>, což
                odpovídá zhruba {propertyAnnualRate} ročně kumulovaně.
              </p>
            </article>

            <article className="rounded-[20px] border border-[#e7d7fb] bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d8b4fe] bg-[#fbf7ff] text-[#7e22ce]">
                  <HeartPulse className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7e22ce]">
                    Život
                  </p>
                  <h4 className="text-lg font-bold text-slate-950">Revize po 3 letech</h4>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Model plánuje kontrolu smlouvy každé 3 roky a počítá s navýšením
                pojistného v pásmu{" "}
                <span className="font-semibold text-slate-950">200-500 Kč měsíčně</span>.
                U NEONu používá refresh základnu, u FLEXI jen provizi z navýšení.
              </p>
            </article>
          </div>

          <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <TrendingUp className="h-4.5 w-4.5 text-[#7e22ce]" strokeWidth={2.2} />
              Datová opora modelu
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                Povinné ručení v roce 2025 vychází podle tržních srovnávačů zhruba
                v pásmu 5-7 %, část trhu uvádí scénáře až kolem 10 %.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                ČSÚ za rok 2025 ukazuje růst cen domů o 6,7 % a bytů o 10,6 %.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                U majetku je hlavní riziko podpojištění, proto model řeší aktualizaci
                pojistných částek a ne jen čekání na automatickou indexaci.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                U životního pojištění model počítá s růstem potřeb zhruba{" "}
                {lifeNeedGrowthRate} ročně, ale výslednou změnu drží v praktickém
                obchodním rozmezí 200-500 Kč měsíčně na pojistném.
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex gap-2 rounded-2xl border border-[#e7d7fb] bg-white px-3 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#7e22ce]" />
              <span>Auto se přepočítává každým budoucím rokem o {autoRate}.</span>
            </div>
            <div className="flex gap-2 rounded-2xl border border-[#e7d7fb] bg-white px-3 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#7e22ce]" />
              <span>Majetek, odpovědnost i podnikatelé se revidují v tříletém cyklu.</span>
            </div>
            <div className="flex gap-2 rounded-2xl border border-[#e7d7fb] bg-white px-3 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#7e22ce]" />
              <span>Životky používají aktuální pozici v den predikované úpravy.</span>
            </div>
            <div className="flex gap-2 rounded-2xl border border-[#e7d7fb] bg-white px-3 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#7e22ce]" />
              <span>Výsledek je plánovací scénář, ne garance vyplacené provize.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#eadcf9] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-sm text-slate-500">
            {enabled
              ? "Predikce je zapnutá a součty už pracují s navýšenými scénáři."
              : "Po zapnutí se přepočítá horní součet, roky, měsíce i detail položek."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="ui-focus inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
            >
              Zavřít
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="ui-focus inline-flex items-center justify-center rounded-full border border-[#21142f] bg-[#13091f] px-4 py-2.5 text-sm font-semibold !text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1d0f2c]"
            >
              {enabled ? "Vypnout predikci" : "Zapnout predikci"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
