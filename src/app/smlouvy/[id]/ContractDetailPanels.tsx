import dynamic from "next/dynamic";

const DetailFallback = () => (
  <div className="text-xs text-slate-400">Načítám detail produktu…</div>
);

export const AutoDetailPanel = dynamic(
  () => import("../components/AutoDetailPanel").then((mod) => mod.AutoDetailPanel),
  { ssr: false, loading: DetailFallback }
);

export const NeonDetailPanel = dynamic(
  () => import("../components/NeonDetailPanel").then((mod) => mod.NeonDetailPanel),
  { ssr: false, loading: DetailFallback }
);

export const DomexDetailPanel = dynamic(
  () => import("../components/DomexDetailPanel").then((mod) => mod.DomexDetailPanel),
  { ssr: false, loading: DetailFallback }
);

export const FlexiDetailPanel = dynamic(
  () => import("../components/FlexiDetailPanel").then((mod) => mod.FlexiDetailPanel),
  { ssr: false, loading: DetailFallback }
);
