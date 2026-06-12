import { Check, LoaderCircle } from "lucide-react";
import { type AppLanguage } from "@/lib/appLanguage";

type Props = {
  language: AppLanguage;
  title: string;
  stage: string;
  progress: number;
  accentLabel: string;
};

const LOADING_PROGRESS_COPY: Record<
  AppLanguage,
  {
    phases: string[];
    ready: string;
  }
> = {
  cs: {
    phases: ["Sběr dat", "Výpočty", "Finalizace"],
    ready: "připraveno",
  },
};

export function LoadingProgressPanel({
  language,
  title,
  stage,
  progress,
  accentLabel,
}: Props) {
  const copy = LOADING_PROGRESS_COPY[language];
  const safeProgress = Math.max(8, Math.min(97, progress));
  const activePhaseIndex =
    safeProgress < 35 ? 0 : safeProgress < 72 ? 1 : 2;

  return (
    <div className="relative w-full overflow-hidden rounded-[24px] border border-violet-100/32 bg-[linear-gradient(145deg,rgba(54,26,102,0.68)_0%,rgba(30,11,70,0.78)_58%,rgba(17,7,46,0.9)_100%)] px-4 py-4 sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(196,181,253,0.28),transparent_42%)]" />
      <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-fuchsia-300/22 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-100/35 bg-violet-200/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-50/90">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-emerald-300/85 animate-ping" />
              <span className="relative rounded-full bg-emerald-200 h-2.5 w-2.5" />
            </span>
            {accentLabel}
          </div>

          <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-violet-50 sm:text-base">
            <LoaderCircle className="h-4 w-4 animate-spin text-violet-100/90" />
            {title}
          </div>
          <div className="mt-2 text-sm text-violet-100/80">{stage}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-violet-100/75">
            {safeProgress}% {copy.ready}
          </div>
        </div>

        <div className="relative h-16 w-16 shrink-0">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from -90deg, rgba(244,232,255,0.95) 0deg ${safeProgress * 3.6}deg, rgba(196,181,253,0.24) ${safeProgress * 3.6}deg 360deg)`,
            }}
          />
          <div className="absolute inset-[5px] rounded-full bg-violet-950/92" />
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-violet-100">
            {safeProgress}%
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
        {copy.phases.map((phase, index) => {
          const state =
            index < activePhaseIndex
              ? "done"
              : index === activePhaseIndex
                ? "active"
                : "idle";

          return (
            <div
              key={phase}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                state === "done"
                  ? "border-emerald-300/45 bg-emerald-300/14 text-emerald-100"
                  : state === "active"
                    ? "border-violet-100/55 bg-violet-200/20 text-violet-50"
                    : "border-violet-100/25 bg-violet-200/8 text-violet-100/65"
              }`}
            >
              {state === "done" ? <Check className="h-3 w-3" /> : null}
              <span>{phase}</span>
            </div>
          );
        })}
      </div>

      <div className="relative z-10 mt-3 h-2.5 overflow-hidden rounded-full bg-violet-100/18">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-violet-300 via-fuchsia-300 to-indigo-200 transition-[width] duration-300 ease-out"
          style={{ width: `${safeProgress}%` }}
        >
          <span className="absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-80 animate-pulse" />
        </div>
      </div>

      <div className="relative z-10 mt-4 space-y-2">
        <div className="h-2 w-[82%] animate-pulse rounded-full bg-violet-100/30" />
        <div className="h-2 w-[66%] animate-pulse rounded-full bg-violet-100/22 [animation-delay:140ms]" />
        <div className="h-2 w-[54%] animate-pulse rounded-full bg-violet-100/16 [animation-delay:240ms]" />
      </div>
    </div>
  );
}
