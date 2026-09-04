import {
  Briefcase,
  Car,
  Coins,
  Globe2,
  HeartPulse,
  House,
  Plane,
  Shapes,
  type LucideIcon,
} from "lucide-react";

import type { Category } from "@/app/api/team-overview/teamOverview.types";

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  life: HeartPulse,
  auto: Car,
  property: House,
  business: Briefcase,
  travel: Plane,
  foreigners: Globe2,
  comfort: Coins,
  other: Shapes,
};

const CATEGORY_ICON_COLORS: Record<Category, string> = {
  life: "bg-rose-50 text-rose-600",
  auto: "bg-sky-50 text-sky-600",
  property: "bg-amber-50 text-amber-700",
  business: "bg-indigo-50 text-indigo-600",
  travel: "bg-cyan-50 text-cyan-600",
  foreigners: "bg-teal-50 text-teal-600",
  comfort: "bg-yellow-50 text-yellow-700",
  other: "bg-slate-100 text-slate-600",
};

export function GoalCategoryIcon({ category }: { category: Category }) {
  const Icon = CATEGORY_ICONS[category];

  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CATEGORY_ICON_COLORS[category]}`}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" strokeWidth={2.2} />
    </span>
  );
}
