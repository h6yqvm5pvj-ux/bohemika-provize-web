import { useEffect, useRef } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { type AppLanguage } from "@/lib/appLanguage";

type Props = {
  language: AppLanguage;
  title: string;
  stage: string;
  progress: number;
  accentLabel: string;
  visual?: "progress" | "money";
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
  visual = "progress",
}: Props) {
  const copy = LOADING_PROGRESS_COPY[language];
  const safeProgress = Math.max(8, Math.min(97, progress));
  const activePhaseIndex =
    safeProgress < 35 ? 0 : safeProgress < 72 ? 1 : 2;
  const moneyFloatRef = useRef<HTMLDivElement | null>(null);
  const moneyBillRef = useRef<HTMLSpanElement | null>(null);
  const moneyTrailOneRef = useRef<HTMLSpanElement | null>(null);
  const moneyTrailTwoRef = useRef<HTMLSpanElement | null>(null);
  const moneySweepRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (visual !== "money") return undefined;

    let frame = 0;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const seconds = (now - startedAt) / 1000;
      const spinDegrees = seconds * 430;
      const floatY = Math.sin(seconds * 3.2) * -7;
      const tilt = Math.sin(seconds * 2.4) * 10;
      const scale = 1 + Math.sin(seconds * 5.4) * 0.045;
      const trailScale = 0.82 + Math.sin(seconds * 4) * 0.08;
      const sweepX = ((seconds * 95) % 280) - 170;

      if (moneyFloatRef.current) {
        moneyFloatRef.current.style.transform = `translate3d(0, ${floatY}px, 0) rotate(${tilt}deg)`;
      }
      if (moneyBillRef.current) {
        moneyBillRef.current.style.transform = `rotate(${spinDegrees}deg) scale(${scale})`;
        moneyBillRef.current.style.filter = `drop-shadow(0 18px 22px rgba(6, 182, 212, ${0.22 + Math.abs(Math.sin(seconds * 2.5)) * 0.18}))`;
      }
      if (moneyTrailOneRef.current) {
        moneyTrailOneRef.current.style.transform = `rotate(${spinDegrees * 0.72 - 28}deg) scale(${trailScale})`;
        moneyTrailOneRef.current.style.opacity = `${0.2 + Math.abs(Math.sin(seconds * 2.2)) * 0.22}`;
      }
      if (moneyTrailTwoRef.current) {
        moneyTrailTwoRef.current.style.transform = `rotate(${spinDegrees * 0.58 + 34}deg) scale(${0.72 + Math.abs(Math.cos(seconds * 2.4)) * 0.16})`;
        moneyTrailTwoRef.current.style.opacity = `${0.18 + Math.abs(Math.cos(seconds * 2.1)) * 0.22}`;
      }
      if (moneySweepRef.current) {
        moneySweepRef.current.style.transform = `translateX(${sweepX}%) translateY(-50%) rotate(-18deg)`;
      }

      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [visual]);

  return (
    <div className="relative w-full overflow-hidden rounded-[24px] border border-violet-100/32 bg-[linear-gradient(145deg,rgba(54,26,102,0.68)_0%,rgba(30,11,70,0.78)_58%,rgba(17,7,46,0.9)_100%)] px-4 py-4 sm:px-6 sm:py-5">
      <style jsx>{`
        .payout-scene {
          perspective: 680px;
          transform-style: preserve-3d;
        }

        .payout-emoji-bill {
          display: block;
          transform-style: preserve-3d;
          transform-origin: center;
          will-change: transform, filter;
        }

        .payout-emoji-trail {
          display: block;
          filter: blur(0.5px);
          transform-style: preserve-3d;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(196,181,253,0.28),transparent_42%)]" />
      <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-fuchsia-300/22 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />

      {visual === "money" ? (
        <div className="relative z-10 flex min-h-[148px] items-center justify-center px-2 py-1 sm:min-h-[164px]">
          <div className="payout-scene relative h-[8.5rem] w-[11.5rem] shrink-0 sm:h-[10rem] sm:w-[13rem]" aria-label={`${safeProgress}% ${copy.ready}`}>
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(167,243,208,0.2),transparent_64%)] blur-2xl" />
            <div className="absolute left-1/2 top-1/2 h-28 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/18 bg-violet-100/6 shadow-[0_0_46px_rgba(52,211,153,0.18)] sm:h-32 sm:w-48" />
            <div className="absolute left-1/2 top-[44%] h-28 w-40 -translate-x-1/2 -translate-y-1/2 sm:h-[8.5rem] sm:w-48">
              <div ref={moneyFloatRef} className="relative flex h-full w-full items-center justify-center">
                <span
                  ref={moneyTrailOneRef}
                  className="payout-emoji-trail absolute left-1 top-7 text-4xl opacity-30 sm:left-2 sm:top-8 sm:text-5xl"
                >
                  💸
                </span>
                <span
                  ref={moneyTrailTwoRef}
                  className="payout-emoji-trail absolute right-2 top-8 text-3xl opacity-25 sm:right-3 sm:top-9 sm:text-4xl"
                >
                  💸
                </span>
                <span
                  ref={moneyBillRef}
                  className="payout-emoji-bill relative z-10 inline-flex h-24 w-24 items-center justify-center text-8xl leading-none sm:h-28 sm:w-28 sm:text-9xl"
                >
                  💸
                </span>
                <span
                  ref={moneySweepRef}
                  className="payout-sweep pointer-events-none absolute -inset-x-10 top-1/2 h-7 rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)] blur-md"
                />
              </div>
            </div>
            <div className="absolute bottom-0 left-1/2 flex h-8 min-w-[4.5rem] -translate-x-1/2 items-center justify-center rounded-full border border-violet-100/40 bg-violet-950/82 px-4 text-base font-extrabold text-violet-50 shadow-[0_12px_24px_rgba(10,5,35,0.32)]">
              {safeProgress}%
            </div>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
