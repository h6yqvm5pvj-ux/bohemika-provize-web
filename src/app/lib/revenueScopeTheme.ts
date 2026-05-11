export type RevenueScopeTone = "own" | "team" | "tip";

type RevenueScopeTheme = {
  activeChipClass: string;
  badgeClass: string;
  iconClass: string;
  valueClass: string;
  headingClass: string;
};

export const REVENUE_SCOPE_THEME: Record<RevenueScopeTone, RevenueScopeTheme> = {
  own: {
    activeChipClass:
      "z-10 border-emerald-500/55 bg-[linear-gradient(135deg,#34d399_0%,#047857_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(4,120,87,0.35)]",
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-700",
    iconClass: "text-emerald-300",
    valueClass: "text-emerald-200",
    headingClass: "text-emerald-100",
  },
  team: {
    activeChipClass:
      "z-10 border-indigo-500/50 bg-[linear-gradient(135deg,#6366f1_0%,#4338ca_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(67,56,202,0.35)]",
    badgeClass: "border-indigo-300 bg-indigo-100 text-indigo-700",
    iconClass: "text-indigo-300",
    valueClass: "text-indigo-200",
    headingClass: "text-indigo-100",
  },
  tip: {
    activeChipClass:
      "z-10 border-fuchsia-500/55 bg-[linear-gradient(135deg,#e879f9_0%,#a21caf_100%)] text-[#f8fafc] shadow-[0_12px_24px_rgba(162,28,175,0.34)]",
    badgeClass: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-700",
    iconClass: "text-fuchsia-300",
    valueClass: "text-fuchsia-200",
    headingClass: "text-fuchsia-100",
  },
};
