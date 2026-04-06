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
    ? "relative w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white px-4 py-3 transition-[border-color,box-shadow] duration-200 hover:border-slate-300 focus-within:border-slate-300 focus-within:shadow-[0_0_0_1px_rgba(148,163,184,0.35)] sm:px-5 sm:py-3"
    : "relative w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)] focus-within:border-slate-300 focus-within:shadow-[0_12px_28px_rgba(15,23,42,0.1),0_0_0_1px_rgba(148,163,184,0.35)] sm:px-5 sm:py-3";

  return (
    <section className={goldCardClass}>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <Image
            src="/icons/gold1.png"
            alt="Zlatá cihla"
            width={96}
            height={96}
            className="h-[88px] w-[88px] object-contain sm:h-[96px] sm:w-[96px]"
            priority
          />
          <div className="flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Aktuální cena zlata / 1 oz
            </div>
            <div className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              {goldLoading ? "Načítám…" : goldData ? formatMoney(goldData.czkPerOz) : "—"}
            </div>
            <div className="text-[11px] text-slate-500">
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
                  ? "border-slate-900 bg-slate-900 text-white"
                  : goldDir === "down"
                    ? "border-rose-400 bg-rose-100 text-rose-700"
                    : "border-slate-900 bg-white text-slate-700"
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
                <span className={goldDir === "down" ? "text-rose-700" : goldDir === "up" ? "text-white" : "text-slate-700"}>
                  ({goldChangeAbs > 0 ? "+" : ""}
                  {formatMoney(Math.abs(goldChangeAbs))})
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-2 sm:gap-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1 font-semibold text-white transition hover:bg-black"
            >
              Obnovit
            </button>
            {goldError ? <span className="text-rose-600">{goldError}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
