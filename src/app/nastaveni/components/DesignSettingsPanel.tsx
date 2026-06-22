"use client";

import { FONT_THEME_OPTIONS, type FontTheme } from "@/lib/fontTheme";

type DesignSettingsPanelProps = {
  className: string;
  fontTheme: FontTheme;
  reduceMotion: boolean;
  toggleOffClass: string;
  onFontThemeChange: (theme: FontTheme) => void;
  onReduceMotionChange: (value: boolean) => void;
};

export function DesignSettingsPanel({
  className,
  fontTheme,
  reduceMotion,
  toggleOffClass,
  onFontThemeChange,
  onReduceMotionChange,
}: DesignSettingsPanelProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
      <div className="space-y-2.5">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              Animace rozhraní
            </h2>
            <p className="text-xs text-slate-500">
              Přepíná pohybové efekty v aplikaci.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Animace
            </span>
            <button
              type="button"
              onClick={() => onReduceMotionChange(!reduceMotion)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                reduceMotion ? "border-slate-900 bg-slate-900 text-white" : toggleOffClass
              }`}
              aria-pressed={reduceMotion}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  reduceMotion ? "bg-white" : "bg-slate-400"
                }`}
                aria-hidden="true"
              />
              {reduceMotion ? "Animace vypnuté" : "Animace zapnuté"}
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              Písmo napříč webem
            </h3>
            <p className="text-xs text-slate-500">
              Přepne hlavní font pro celý web včetně panelů a detailů.
            </p>
          </div>

          <div className="grid max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2">
            {FONT_THEME_OPTIONS.map((opt) => {
              const isActive = fontTheme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onFontThemeChange(opt.id)}
                  aria-pressed={isActive}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    isActive
                      ? "border-slate-900 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.1)]"
                      : "border-slate-300 bg-white hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {opt.label}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isActive ? "Aktivní" : "Vybrat"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {opt.description}
                  </p>
                  <span
                    className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-base text-slate-900"
                    style={{ fontFamily: opt.previewFamily }}
                  >
                    {opt.previewText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
