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
    ? "relative overflow-hidden rounded-3xl border border-amber-300/30 bg-slate-900 px-4 py-3 sm:px-5 sm:py-3 w-full"
    : "relative overflow-hidden rounded-3xl border border-amber-300/35 bg-gradient-to-r from-amber-500/20 via-slate-950/80 to-emerald-500/15 px-4 py-3 sm:px-5 sm:py-3 shadow-[0_18px_50px_rgba(0,0,0,0.75)] w-full";

  return (
    <section className={goldCardClass}>
      <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_18%_18%,rgba(248,250,252,0.14),transparent_42%),radial-gradient(circle_at_82%_28%,rgba(16,185,129,0.2),transparent_45%),radial-gradient(circle_at_58%_82%,rgba(251,191,36,0.22),transparent_45%)]" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <Image
            src="/icons/gold1.png"
            alt="Zlatá cihla"
            width={96}
            height={96}
            className="h-[88px] w-[88px] sm:h-[96px] sm:w-[96px] object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.35)]"
            priority
          />
          <div className="flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-200/90">
              Aktuální cena zlata / 1 oz
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
              {goldLoading ? "Načítám…" : goldData ? formatMoney(goldData.czkPerOz) : "—"}
            </div>
            <div className="text-[11px] text-slate-300">
              {goldData?.ts
                ? `Aktualizace ${new Date(goldData.ts).toLocaleTimeString("cs-CZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Čas zatím neznám"}
            </div>
            <div
              className={`inline-flex self-start items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold mt-1.5 ${
                goldDir === "up"
                  ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-50"
                  : goldDir === "down"
                    ? "border-rose-300/60 bg-rose-500/20 text-rose-50"
                    : "border-white/20 bg-white/5 text-slate-100"
              }`}
            >
              <span className="text-base">
                {goldDir === "up" ? "▲" : goldDir === "down" ? "▼" : "—"}
              </span>
              <span>
                {goldChangePct == null
                  ? "Bez změny"
                  : `${goldChangePct > 0 ? "+" : ""}${goldChangePct.toFixed(2)} %`}
              </span>
              {goldChangeAbs != null ? (
                <span className="text-slate-200/90">
                  ({goldChangeAbs > 0 ? "+" : ""}
                  {formatMoney(Math.abs(goldChangeAbs))})
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-2 sm:gap-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-200">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-semibold hover:border-white/30 hover:bg-white/10 transition"
            >
              Obnovit
            </button>
            {goldError ? <span className="text-rose-200">{goldError}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
