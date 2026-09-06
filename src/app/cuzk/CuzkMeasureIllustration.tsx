import { CuzkHouse } from "./CuzkHouse";
import type { PropertyMeasure } from "./cuzkResultData";

const FOOTPRINT = "m166 216 66-38 66 38-66 38Z";
const PLOT = "m81 174 132-77 143 83-134 78Z";

export function CuzkMeasureIllustration({ kind, className }: { kind: PropertyMeasure; className?: string }) {
  const ghost = kind === "footprint" || kind === "floors";
  return (
    <svg viewBox="60 65 315 220" className={className} fill="none" aria-hidden="true" data-measure={kind}>
      <path d={PLOT} fill={kind === "land" ? "#dcf1e8" : "#f5f2f8"} stroke={kind === "land" ? "#55a48a" : "#e1dbe9"} strokeWidth={kind === "land" ? "2" : "1"} />
      <path d={FOOTPRINT} fill={kind === "footprint" ? "#bca0e4" : "#ded5ec"} fillOpacity={kind === "footprint" ? ".75" : ".35"} />
      {kind === "land" && <><path d={PLOT} stroke="#328b70" strokeWidth="2" strokeDasharray="5 4" /><g fill="#fff" stroke="#499b82" strokeWidth="2"><circle cx="81" cy="174" r="3.5" /><circle cx="213" cy="97" r="3.5" /><circle cx="356" cy="180" r="3.5" /><circle cx="222" cy="258" r="3.5" /></g></>}
      <g opacity={ghost ? ".2" : ".85"}><CuzkHouse /></g>
      {kind === "footprint" && <>
        <path d={FOOTPRINT} fill="#a77bd8" fillOpacity=".45" stroke="#7e4dbb" strokeWidth="2.5" />
        <path d="m155 225 77 44 77-44M152 230l6-10m71 54 6-10m71-34-6-10" stroke="#8d64bf" strokeWidth="1.5" />
        <path d="m166 216-11 9m77 29v15m66-53 11 9" stroke="#b699d5" strokeDasharray="3 3" />
      </>}
      {kind === "floors" && <>
        <path d="m166 191 66-38 66 38-66 38Z" fill="#e8d5ef" fillOpacity=".45" stroke="#a479b7" strokeWidth="2" />
        <path d={FOOTPRINT} fill="#d0acd9" fillOpacity=".4" stroke="#a479b7" strokeWidth="2" />
        <path d="M318 164v70m-5-70h10m-10 35h10m-10 35h10" stroke="#a479b7" strokeWidth="1.5" />
        <path d="m166 166 66 38 66-38" stroke="#a479b7" strokeWidth="1.5" strokeDasharray="3 3" />
      </>}
      {kind === "apartments" && <>
        <path d="m179 184 16 9v18l-16-9Z" fill="#f5d697" stroke="#b98a46" strokeWidth="1.8" />
        <path d="m249 207 13-8v16l-13 8Z" fill="#f5d697" stroke="#b98a46" strokeWidth="1.8" />
        <path d="m277 191 12-7v16l-12 7Z" fill="#f5d697" stroke="#b98a46" strokeWidth="1.8" />
        <path d="m192 231 9 5m43 2 15-9m11-6 14-8" stroke="#c6a068" strokeWidth="1.4" strokeLinecap="round" />
      </>}
    </svg>
  );
}
