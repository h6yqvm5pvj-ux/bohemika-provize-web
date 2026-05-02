import Image from "next/image";

import { formatMoney } from "../homeUtils";

type Props = {
  isLiteUI: boolean;
  goldLoading: boolean;
  goldData: { czkPerOz: number; ts: number; changePct: number | null } | null;
  goldChangePct: number | null;
  goldChangeAbs: number | null;
  goldDir: "up" | "down" | "flat";
  goldError: string | null;
  onRefresh: () => void;
};

export function GoldWidget({
  isLiteUI,
  goldLoading,
  goldData,
  goldChangePct,
  goldChangeAbs,
  goldDir,
  goldError,
  onRefresh,
}: Props) {
  const goldCardClass = isLiteUI
    ? "relative w-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-4 transition-[border-color,box-shadow] duration-200 hover:border-slate-300 focus-within:border-slate-300 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.35)] sm:px-6 sm:py-5"
    : "relative w-full overflow-hidden rounded-[26px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.07)] transition-[border-color,box-shadow] duration-200 hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.11)] focus-within:border-slate-300 focus-within:shadow-[0_14px_32px_rgba(15,23,42,0.11),0_0_0_1px_rgba(148,163,184,0.35)] sm:px-6 sm:py-5";

  const trendClass =
    goldDir === "up"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : goldDir === "down"
        ? "border-rose-300 bg-rose-50 text-rose-700"
        : "border-slate-300 bg-slate-100 text-slate-700";

  const trendAbsClass =
    goldDir === "up"
      ? "text-emerald-700"
      : goldDir === "down"
        ? "text-rose-700"
        : "text-slate-700";

  return (
    <section className={goldCardClass}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(245,158,11,0.16),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_4%_100%,rgba(15,23,42,0.07),transparent_44%)]" />

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="shrink-0">
              <Image
                src="/icons/1oZpredni.png"
                alt="Zlatá mince 1 oz"
                width={1000}
                height={1000}
                className="h-[108px] w-auto object-contain sm:h-[122px]"
                priority
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Aktuální cena zlata / 1 oz
              </div>
              <div className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[3rem]">
                {goldLoading ? "Načítám…" : goldData ? formatMoney(goldData.czkPerOz) : "—"}
              </div>
              <div className="text-[12px] text-slate-500">
                {goldData?.ts
                  ? `Aktualizace ${new Date(goldData.ts).toLocaleTimeString("cs-CZ", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Čas zatím neznám"}
              </div>
              <div className="mt-1 inline-flex w-fit items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  Denní pohyb
                </span>
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${trendClass}`}
                >
                  <span className="text-sm">
                    {goldDir === "up" ? "▲" : goldDir === "down" ? "▼" : "—"}
                  </span>
                  <span>
                    {goldChangePct == null
                      ? "Bez změny"
                      : `${goldChangePct > 0 ? "+" : ""}${goldChangePct.toFixed(2)} %`}
                  </span>
                  {goldChangeAbs != null ? (
                    <span className={trendAbsClass}>
                      ({goldChangeAbs > 0 ? "+" : ""}
                      {formatMoney(Math.abs(goldChangeAbs))})
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={onRefresh}
              disabled={goldLoading}
              aria-label="Obnovit cenu zlata"
              title="Obnovit cenu zlata"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-900 bg-slate-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={`h-4 w-4 ${goldLoading ? "animate-spin" : ""}`}
              >
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {goldError ? <span className="text-xs text-rose-600">{goldError}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
